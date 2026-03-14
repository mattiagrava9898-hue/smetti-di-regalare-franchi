/**
 * Netlify Function — Proxy ESTV Steuerrechner
 * FILE: netlify/functions/tax-proxy.js
 *
 * Endpoint e payload verificati direttamente dal Network tab di
 * swisstaxcalculator.estv.admin.ch — API pubblica governativa svizzera.
 *
 * Endpoint reali:
 *   POST /API_searchLocation       → cerca comune per NPA
 *   POST /API_calculateDetailedTaxes → calcola imposta
 */

const https = require('https');

const ESTV_HOST = 'swisstaxcalculator.estv.admin.ch';
const ESTV_BASE = '/delegate/ost-integration/v1/lg-proxy/operation/c3b67379_ESTV';

const ENDPOINTS = {
    searchLocation:    `${ESTV_BASE}/API_searchLocation`,
    calculateTaxes:    `${ESTV_BASE}/API_calculateDetailedTaxes`,
};

// Confession: 1=Riformata, 3=Cattolica, 5=Nessuna (verificato dal payload ESTV)
// Relationship: 1=Single, 2=Coniugato
// RevenueType: 1=Netto (dopo deduzioni sociali AVS/ALV)

function httpsPost(path, bodyObj) {
    return new Promise((resolve, reject) => {
        const bodyStr = JSON.stringify(bodyObj);
        const options = {
            hostname: ESTV_HOST,
            path,
            method: 'POST',
            headers: {
                'Content-Type':   'application/json',
                'Accept':         'application/json',
                'Content-Length': Buffer.byteLength(bodyStr),
                'Referer':        'https://swisstaxcalculator.estv.admin.ch/',
                'Origin':         'https://swisstaxcalculator.estv.admin.ch',
                'User-Agent':     'Mozilla/5.0 (compatible; Node.js)',
            },
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end',  () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.write(bodyStr);
        req.end();
    });
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    let parsed;
    try {
        parsed = JSON.parse(event.body);
    } catch {
        return { statusCode: 400, body: JSON.stringify({ error: 'JSON non valido' }) };
    }

    const { action, payload } = parsed;
    const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

    // ─── CERCA COMUNE PER NPA ─────────────────────────────────
    if (action === 'searchLocation') {
        const body = {
            Search:   String(payload.npa),
            Language: 3,        // IT
            TaxYear:  2025,
        };
        console.log('[tax-proxy] searchLocation →', JSON.stringify(body));

        let result;
        try {
            result = await httpsPost(ENDPOINTS.searchLocation, body);
        } catch (err) {
            return { statusCode: 502, body: JSON.stringify({ error: err.message }) };
        }

        console.log(`[tax-proxy] searchLocation ← ${result.status}:`, result.body.slice(0, 300));
        return { statusCode: result.status, headers: CORS, body: result.body };
    }

    // ─── CALCOLA IMPOSTA ──────────────────────────────────────
    if (action === 'calculateTaxes') {
        const {
            taxLocationId, relationship, confession1, confession2,
            age1, revenue1, redditoPartner, children,
        } = payload;

        // L'utente inserisce direttamente il netto dal certificato di salario (campo 11 Lohnausweis)
        // Nessuna conversione necessaria — passiamo il valore tal quale all'ESTV
        const body = {
            SimKey:        null,
            TaxYear:       2025,
            TaxLocationID: Number(taxLocationId),
            Relationship:  Number(relationship),
            Confession1:   Number(confession1),
            Confession2:   Number(confession2 ?? 5),
            Age1:          Number(age1 ?? 35),
            Age2:          redditoPartner > 0 ? 32 : 0,
            Budget:        [],
            Children:      Array.isArray(children) ? children : [],
            Fortune:       0,
            Revenue1:      Math.round(revenue1),
            Revenue2:      redditoPartner > 0 ? Math.round(redditoPartner) : 0,
            RevenueType1:  1,
            RevenueType2:  redditoPartner > 0 ? 1 : 0,
        };

        console.log('[tax-proxy] calculateTaxes →', JSON.stringify(body));

        let result;
        try {
            result = await httpsPost(ENDPOINTS.calculateTaxes, body);
        } catch (err) {
            return { statusCode: 502, body: JSON.stringify({ error: err.message }) };
        }

        console.log(`[tax-proxy] calculateTaxes ← ${result.status}:`, result.body.slice(0, 500));

        if (result.status !== 200) {
            return {
                statusCode: result.status,
                headers: CORS,
                body: JSON.stringify({
                    error: `ESTV ha risposto ${result.status}`,
                    raw:   result.body.slice(0, 500),
                }),
            };
        }

        // Passa la risposta grezza — script.js somma i campi che servono
        // _raw incluso per debug: rimuovilo dopo aver verificato i nomi dei campi
        return { statusCode: 200, headers: CORS, body: result.body };
    }

    return { statusCode: 400, body: JSON.stringify({ error: `Azione sconosciuta: ${action}` }) };
};
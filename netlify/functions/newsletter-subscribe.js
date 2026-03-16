/**
 * Netlify Function — newsletter-subscribe.js
 * FILE: netlify/functions/newsletter-subscribe.js
 *
 * Riceve un'email dal form waitlist e la iscrive a Kit (ex ConvertKit)
 * tramite API v4. Crea automaticamente il tag "waitlist-libro" se non esiste.
 *
 * Env var richiesta su Netlify: KIT_API_KEY
 *
 * Formato: exports.handler (coerente con tax-proxy.js e articoli-lista.js)
 * HTTP client: https nativo (coerente con tax-proxy.js)
 */

const https = require('https');

const KIT_API_HOST = 'api.kit.com';
const TAG_NAME = 'waitlist-libro';

// ── Utility: HTTPS request (stessa logica di tax-proxy.js) ──────────
function httpsRequest(method, path, bodyObj, apiKey) {
    return new Promise((resolve, reject) => {
        const bodyStr = bodyObj ? JSON.stringify(bodyObj) : '';
        const options = {
            hostname: KIT_API_HOST,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Kit-Api-Key': apiKey,
            },
        };
        if (bodyStr && method !== 'GET') {
            options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
        }

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        if (bodyStr && method !== 'GET') req.write(bodyStr);
        req.end();
    });
}

// ── Handler ──────────────────────────────────────────────────────────
exports.handler = async (event) => {
    const CORS = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // Leggi API key — process.env (come tax-proxy.js)
    const API_KEY = process.env.KIT_API_KEY;
    console.log('[newsletter] API_KEY presente:', !!API_KEY);

    if (!API_KEY) {
        return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Configurazione mancante' }) };
    }

    // Parse body
    let email;
    try {
        const body = JSON.parse(event.body);
        email = (body.email || '').trim().toLowerCase();
    } catch {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'JSON non valido' }) };
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Email non valida' }) };
    }

    console.log('[newsletter] Iscrizione per:', email);

    try {
        // 1. Crea subscriber
        const subRes = await httpsRequest('POST', '/v4/subscribers', { email_address: email }, API_KEY);
        console.log('[newsletter] Subscriber response:', subRes.status, subRes.body.slice(0, 300));

        if (subRes.status !== 200 && subRes.status !== 201) {
            return {
                statusCode: 502,
                headers: CORS,
                body: JSON.stringify({ error: 'Errore nella registrazione. Riprova tra poco.' }),
            };
        }

        // 2. Trova o crea tag
        const tagId = await getOrCreateTag(API_KEY);
        console.log('[newsletter] Tag ID:', tagId);

        // 3. Tagga subscriber
        if (tagId) {
            const tagRes = await httpsRequest('POST', '/v4/tags/' + tagId + '/subscribers', { email_address: email }, API_KEY);
            console.log('[newsletter] Tag subscriber response:', tagRes.status);
        }

        return {
            statusCode: 200,
            headers: CORS,
            body: JSON.stringify({ ok: true }),
        };

    } catch (err) {
        console.error('[newsletter] Errore:', err.message);
        return {
            statusCode: 502,
            headers: CORS,
            body: JSON.stringify({ error: 'Errore di connessione. Riprova tra poco.' }),
        };
    }
};

// ── Trova o crea il tag ──────────────────────────────────────────────
async function getOrCreateTag(apiKey) {
    try {
        // Lista tag esistenti
        const listRes = await httpsRequest('GET', '/v4/tags', null, apiKey);
        console.log('[newsletter] List tags response:', listRes.status, listRes.body.slice(0, 300));

        if (listRes.status === 200) {
            const data = JSON.parse(listRes.body);
            const tags = data.tags || data.data || [];
            const existing = tags.find(t => t.name === TAG_NAME);
            if (existing) return existing.id;
        }

        // Crea tag
        const createRes = await httpsRequest('POST', '/v4/tags', { name: TAG_NAME }, apiKey);
        console.log('[newsletter] Create tag response:', createRes.status, createRes.body.slice(0, 300));

        if (createRes.status === 200 || createRes.status === 201) {
            const created = JSON.parse(createRes.body);
            const tag = created.tag || created.data || created;
            return tag.id;
        }

        return null;
    } catch (err) {
        console.warn('[newsletter] Tag error:', err.message);
        return null;
    }
}

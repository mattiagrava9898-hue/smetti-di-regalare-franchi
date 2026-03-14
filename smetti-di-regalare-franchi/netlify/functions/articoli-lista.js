/**
 * Netlify Function — articoli-lista.js
 * FILE: netlify/functions/articoli-lista.js
 *
 * Legge la cartella _articoli/ su GitHub e restituisce
 * la lista degli articoli pubblicati con i metadati.
 */

const https = require('https');

const GITHUB_USER   = 'mattiagrava9898-hue';
const GITHUB_REPO   = 'smetti-di-regalare-franchi';
const GITHUB_BRANCH = 'main';

const CATEGORIE = {
    'previdenza':          'Previdenza',
    'risparmio':           'Risparmio',
    'investimenti':        'Investimenti',
    'strategie-di-uscita': 'Strategie di Uscita',
    'frontalieri':         'Frontalieri',
    'imposta-alla-fonte':  'Imposta alla Fonte',
};

function httpsGet(url) {
    return new Promise((resolve, reject) => {
        const parsed  = new URL(url);
        const options = {
            hostname: parsed.hostname,
            path:     parsed.pathname + parsed.search,
            method:   'GET',
            headers:  { 'User-Agent': 'Node.js', 'Accept': 'application/json' },
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.end();
    });
}

function parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};
    const data = {};
    match[1].split('\n').forEach(line => {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) return;
        const key   = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
        data[key] = value;
    });
    return data;
}

exports.handler = async () => {
    const CORS = {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': '*',
    };

    let listaRes;
    try {
        listaRes = await httpsGet(
            `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/_articoli?ref=${GITHUB_BRANCH}`
        );
    } catch (err) {
        return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: err.message }) };
    }

    if (listaRes.status !== 200) {
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ articoli: [] }) };
    }

    const files = JSON.parse(listaRes.body).filter(f => f.name.endsWith('.md'));

    const articoli = await Promise.all(files.map(async (file) => {
        try {
            const res  = await httpsGet(file.download_url);
            if (res.status !== 200) return null;
            const data = parseFrontmatter(res.body);
            if (data.pubblicato === 'false') return null;
            const slug = file.name.replace('.md', '');
            return {
                slug,
                title:       data.title       || slug,
                date:        data.date        || '',
                categoria:   CATEGORIE[data.categoria] || data.categoria || '',
                descrizione: data.descrizione || '',
                immagine:    data.immagine    || '',
                url:         `/.netlify/functions/articolo?slug=${slug}`,
            };
        } catch {
            return null;
        }
    }));

    const risultato = articoli
        .filter(Boolean)
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ articoli: risultato }),
    };
};
/**
 * Netlify Function — articolo.js
 * FILE: netlify/functions/articolo.js
 *
 * Legge un file Markdown da GitHub e lo restituisce come pagina HTML.
 * URL: /.netlify/functions/articolo?slug=nome-articolo
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

function fetchGithubFile(path) {
    return new Promise((resolve, reject) => {
        const url     = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${path}`;
        const parsed  = new URL(url);
        const options = {
            hostname: parsed.hostname,
            path:     parsed.pathname,
            method:   'GET',
            headers:  { 'User-Agent': 'Node.js' },
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
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return { data: {}, body: content };
    const data = {};
    match[1].split('\n').forEach(line => {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) return;
        const key   = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
        data[key] = value;
    });
    return { data, body: match[2].trim() };
}

function markdownToHtml(md) {
    return md
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
        .replace(/^---$/gm, '<hr>')
        .split('\n\n')
        .map(block => {
            block = block.trim();
            if (!block) return '';
            if (block.startsWith('<')) return block;
            return `<p>${block.replace(/\n/g, '<br>')}</p>`;
        })
        .join('\n');
}

exports.handler = async (event) => {
    const slug = event.queryStringParameters?.slug;

    if (!slug) {
        return { statusCode: 400, headers: { 'Content-Type': 'text/html' }, body: paginaErrore('Articolo non specificato.') };
    }

    let file;
    try {
        file = await fetchGithubFile(`_articoli/${slug}.md`);
    } catch (err) {
        return { statusCode: 502, headers: { 'Content-Type': 'text/html' }, body: paginaErrore('Errore nel recupero dell\'articolo.') };
    }

    if (file.status === 404) {
        return { statusCode: 404, headers: { 'Content-Type': 'text/html' }, body: paginaErrore('Articolo non trovato.') };
    }

    const { data, body } = parseFrontmatter(file.body);

    if (data.pubblicato === 'false') {
        return { statusCode: 404, headers: { 'Content-Type': 'text/html' }, body: paginaErrore('Articolo non disponibile.') };
    }

    const html      = markdownToHtml(body);
    const categoria = CATEGORIE[data.categoria] || data.categoria || '';
    const immagine  = data.immagine
        ? `<img src="${data.immagine}" alt="${data.title}" style="width:100%;border-radius:8px;margin-bottom:2rem;">`
        : '';

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: paginaArticolo({ titolo: data.title, data: data.date, categoria, immagine, html }),
    };
};

function paginaArticolo({ titolo, data, categoria, immagine, html }) {
    return `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${titolo} | Smetti di Regalare Franchi</title>
    <link rel="stylesheet" href="/css/style.css">
    <style>
        .articolo-header { padding: 3rem 0 2rem; border-bottom: 1px solid #e5e7eb; margin-bottom: 2rem; }
        .articolo-meta { display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem; }
        .articolo-titolo { font-size: 2.2rem; font-weight: 900; line-height: 1.2; margin-bottom: 1rem; }
        .articolo-body h2 { font-size: 1.5rem; margin: 2rem 0 1rem; }
        .articolo-body h3 { font-size: 1.2rem; margin: 1.5rem 0 0.75rem; }
        .articolo-body p  { margin-bottom: 1.25rem; color: #374151; line-height: 1.8; font-size: 1.05rem; }
        .articolo-body ul { margin: 0 0 1.25rem 1.5rem; }
        .articolo-body li { margin-bottom: 0.5rem; color: #374151; line-height: 1.7; }
        .articolo-body a  { color: #dc2626; text-decoration: underline; }
        .articolo-body hr { border: none; border-top: 1px solid #e5e7eb; margin: 2rem 0; }
        .btn-back { display: inline-flex; align-items: center; gap: 0.5rem; color: #6b7280; font-size: 0.9rem; margin-bottom: 2rem; }
        .btn-back:hover { color: #dc2626; }
    </style>
</head>
<body>
    <header class="navbar">
        <div class="container nav-content">
            <div class="logo">Smetti di Regalare Franchi</div>
            <nav class="menu">
                <a href="/#simulatori">Gli Strumenti</a>
                <a href="/#articoli">Gli Articoli</a>
                <a href="/#libro">Il Libro</a>
                <a href="/#chi-sono">Chi Sono</a>
            </nav>
        </div>
    </header>

    <main class="section">
        <div class="container narrow">
            <a href="/" class="btn-back">← Torna alla homepage</a>
            <div class="articolo-header">
                <div class="articolo-meta">
                    <span class="highlight">${categoria}</span>
                    <span style="color:#9ca3af;font-size:0.85rem;">${data}</span>
                </div>
                <h1 class="articolo-titolo">${titolo}</h1>
            </div>
            ${immagine}
            <div class="articolo-body">${html}</div>
        </div>
    </main>

    <footer>
        <div class="container text-center">
            <p>&copy; 2026 Mattia Grava. Tutti i diritti riservati.</p>
            <p class="disclaimer">Non sono un consulente finanziario. I contenuti di questo sito sono a scopo informativo.</p>
        </div>
    </footer>
</body>
</html>`;
}

function paginaErrore(messaggio) {
    return `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>Errore | Smetti di Regalare Franchi</title>
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <header class="navbar">
        <div class="container nav-content">
            <div class="logo">Smetti di Regalare Franchi</div>
        </div>
    </header>
    <main class="section">
        <div class="container narrow text-center">
            <h2>${messaggio}</h2>
            <a href="/" class="btn-primary" style="display:inline-block;margin-top:2rem;">Torna alla homepage</a>
        </div>
    </main>
</body>
</html>`;
}
/**
 * Netlify Function — newsletter-subscribe.js
 * FILE: netlify/functions/newsletter-subscribe.js
 *
 * Riceve un'email dal form waitlist e la iscrive a Kit (ex ConvertKit)
 * tramite API v4. Crea automaticamente il tag "waitlist-libro" se non esiste.
 *
 * Env vars richieste (su Netlify):
 *   KIT_API_KEY — API Key di Kit (già salvata)
 */

const KIT_API = 'https://api.kit.com/v4';
const TAG_NAME = 'waitlist-libro';

exports.handler = async (event) => {
    const CORS = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Gestisci preflight CORS
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const API_KEY = process.env.KIT_API_KEY;
    if (!API_KEY) {
        console.error('[newsletter] KIT_API_KEY mancante');
        return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Configurazione mancante' }) };
    }

    let email;
    try {
        const body = JSON.parse(event.body);
        email = (body.email || '').trim().toLowerCase();
    } catch {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'JSON non valido' }) };
    }

    // Validazione email basilare
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Email non valida' }) };
    }

    const headers = {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };

    try {
        // 1. Trova o crea il tag "waitlist-libro"
        const tagId = await getOrCreateTag(headers);

        // 2. Crea subscriber
        const subRes = await fetch(`${KIT_API}/subscribers`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ email_address: email }),
        });

        if (!subRes.ok && subRes.status !== 409) {
            const errBody = await subRes.text();
            console.error(`[newsletter] Kit subscriber error ${subRes.status}:`, errBody);
            return {
                statusCode: 502,
                headers: CORS,
                body: JSON.stringify({ error: 'Errore nella registrazione. Riprova tra poco.' }),
            };
        }

        // 3. Tagga il subscriber
        if (tagId) {
            const tagRes = await fetch(`${KIT_API}/tags/${tagId}/subscribers`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ email_address: email }),
            });
            if (!tagRes.ok) {
                console.warn(`[newsletter] Tag fallito:`, await tagRes.text());
            }
        }

        console.log(`[newsletter] Iscritto: ${email}${tagId ? ` (tag: ${TAG_NAME})` : ''}`);
        return {
            statusCode: 200,
            headers: CORS,
            body: JSON.stringify({ ok: true }),
        };

    } catch (err) {
        console.error('[newsletter] Errore:', err);
        return {
            statusCode: 502,
            headers: CORS,
            body: JSON.stringify({ error: 'Errore di connessione. Riprova tra poco.' }),
        };
    }
};

/**
 * Cerca il tag "waitlist-libro" tra i tag esistenti.
 * Se non esiste, lo crea. Restituisce il tag ID.
 */
async function getOrCreateTag(headers) {
    try {
        // Cerca tra i tag esistenti
        const listRes = await fetch(`${KIT_API}/tags`, { headers });
        if (listRes.ok) {
            const data = await listRes.json();
            const tags = data.tags || data.data || [];
            const existing = tags.find(t => t.name === TAG_NAME);
            if (existing) {
                return existing.id;
            }
        }

        // Non trovato — crealo
        const createRes = await fetch(`${KIT_API}/tags`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ name: TAG_NAME }),
        });

        if (createRes.ok) {
            const created = await createRes.json();
            const tag = created.tag || created.data || created;
            console.log(`[newsletter] Tag "${TAG_NAME}" creato con ID: ${tag.id}`);
            return tag.id;
        }

        console.warn('[newsletter] Impossibile creare tag:', await createRes.text());
        return null;

    } catch (err) {
        console.warn('[newsletter] Errore gestione tag:', err.message);
        return null;
    }
}

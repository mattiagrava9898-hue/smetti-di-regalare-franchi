/**
 * Netlify Function — newsletter-subscribe.js
 * FILE: netlify/functions/newsletter-subscribe.js
 *
 * Riceve un'email dal form waitlist e la iscrive a Kit (ex ConvertKit)
 * tramite API v4.
 *
 * Env vars richieste (su Netlify):
 *   KIT_API_KEY   — API Key di Kit (già salvata)
 *   KIT_TAG_ID    — (opzionale) ID del tag per segmentare gli iscritti
 */

const KIT_API = 'https://api.kit.com/v4';

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
        // 1. Crea subscriber
        const subRes = await fetch(`${KIT_API}/subscribers`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ email_address: email }),
        });

        if (!subRes.ok && subRes.status !== 409) {
            // 409 = già iscritto, va bene lo stesso
            const errBody = await subRes.text();
            console.error(`[newsletter] Kit subscriber error ${subRes.status}:`, errBody);
            return {
                statusCode: 502,
                headers: CORS,
                body: JSON.stringify({ error: 'Errore nella registrazione. Riprova tra poco.' }),
            };
        }

        // 2. Se c'è un tag configurato, taggalo
        const TAG_ID = process.env.KIT_TAG_ID;
        if (TAG_ID) {
            const tagRes = await fetch(`${KIT_API}/tags/${TAG_ID}/subscribers`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ email_address: email }),
            });
            if (!tagRes.ok) {
                // Non blocchiamo — il subscriber è già creato
                console.warn(`[newsletter] Tag ${TAG_ID} fallito:`, await tagRes.text());
            }
        }

        console.log(`[newsletter] Iscritto: ${email}`);
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

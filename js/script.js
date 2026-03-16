document.addEventListener('DOMContentLoaded', () => {

    const PROXY       = '/.netlify/functions/tax-proxy';
    const TAX_YEAR    = 2025;
    const formattaCHF = (n) => Math.round(n).toLocaleString('de-CH');

    // Mapping campi form → codici ESTV (verificati dal Network tab)
    const RELATIONSHIP = { 'single': 1, 'coniugato': 2 };
    const CONFESSION   = { 'nessuna': 5, 'cattolica': 3, 'riformata': 1 };

    // ============================================================
    // WAITLIST — Iscrizione newsletter viia Kit
    // ============================================================
    const waitlistForm = document.getElementById('waitlist-form');
    if (waitlistForm) {
        waitlistForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const emailInput = document.getElementById('email-input');
            const btn = waitlistForm.querySelector('button');
            const msg = document.getElementById('form-message');
            const email = emailInput.value.trim();

            if (!email) return;

            // Disabilita il bottone durante l'invio
            btn.disabled = true;
            btn.textContent = 'Un momento...';

            try {
                const res = await fetch('/.netlify/functions/newsletter-subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email }),
                });

                const data = await res.json();

                if (res.ok && data.ok) {
                    waitlistForm.style.display = 'none';
                    msg.textContent = "Ottima scelta. Ti scriverò appena l'anteprima sarà pronta.";
                    msg.style.color = '#16a34a';
                    msg.style.fontWeight = '600';
                    msg.classList.remove('hidden');
                } else {
                    msg.textContent = data.error || 'Qualcosa è andato storto. Riprova.';
                    msg.style.color = '#dc2626';
                    msg.classList.remove('hidden');
                    btn.disabled = false;
                    btn.textContent = 'Voglio l\'anteprima';
                }
            } catch (err) {
                msg.textContent = 'Errore di connessione. Riprova tra poco.';
                msg.style.color = '#dc2626';
                msg.classList.remove('hidden');
                btn.disabled = false;
                btn.textContent = 'Voglio l\'anteprima';
            }
        });
    }

    // ============================================================
    // MODAL
    // ============================================================
    const modal3a = document.getElementById('modal-sim-3a');
    document.getElementById('btn-apri-sim-3a')?.addEventListener('click', () => {
        modal3a.classList.add('active');
        document.body.style.overflow = 'hidden';
    });
    document.getElementById('btn-chiudi-sim-3a')?.addEventListener('click', chiudiModal);
    modal3a?.addEventListener('click', (e) => { if (e.target === modal3a) chiudiModal(); });

    function chiudiModal() {
        modal3a.classList.remove('active');
        document.body.style.overflow = '';
    }

    // ============================================================
    // FORM
    // ============================================================
    const form3a = document.getElementById('form-3a');
    if (!form3a) return;

    // Toggle radio card
    document.querySelectorAll('input[name="tipo_calcolo"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            document.getElementById('input-ordinario').classList.toggle('hidden', e.target.value !== 'ordinario');
            document.getElementById('input-riscatto').classList.toggle('hidden',  e.target.value !== 'riscatto');
            document.getElementById('card-ordinario').className = e.target.value === 'ordinario' ? 'radio-card radio-card-checked' : 'radio-card';
            document.getElementById('card-riscatto').className  = e.target.value === 'riscatto'  ? 'radio-card radio-card-checked' : 'radio-card';
        });
    });

    // Mostra/nascondi sezione partner al cambio stato civile
    document.getElementById('sim-stato-civile').addEventListener('change', (e) => {
        const isConiugato = e.target.value === 'coniugato';
        document.getElementById('sezione-partner').classList.toggle('hidden', !isConiugato);
        // Rendi il reddito partner required solo se coniugato
        const rdPartner = document.getElementById('sim-reddito-partner');
        if (rdPartner) rdPartner.required = isConiugato;
    });

    // Genera dinamicamente i campi età per ogni figlio
    document.getElementById('sim-figli').addEventListener('input', (e) => {
        const n = parseInt(e.target.value) || 0;
        const container = document.getElementById('figli-eta-container');
        const sezione   = document.getElementById('sezione-figli-eta');

        sezione.classList.toggle('hidden', n === 0);
        container.innerHTML = '';

        for (let i = 0; i < n; i++) {
            const div = document.createElement('div');
            div.style.cssText = 'display:flex;align-items:center;gap:1rem;';
            div.innerHTML = `
                <label style="font-size:0.875rem;font-weight:600;color:#374151;white-space:nowrap;min-width:80px;">Figlio ${i + 1}</label>
                <input type="number" id="sim-figlio-eta-${i}" class="form-input" placeholder="età" min="0" max="25" value="10" style="max-width:100px;" required>
                <span style="font-size:0.8rem;color:#6b7280;">anni</span>
            `;
            container.appendChild(div);
        }
    });

    // Autocomplete comune
    const npaInput    = document.getElementById('sim-npa');
    const comuneEl    = document.getElementById('sim-comune-nome');
    const comuneSel_  = document.getElementById('sim-comune-select');
    let   npaDebounce = null;
    let   comuneSel   = null; // { TaxLocationId, Name, Canton }
    let   listaComuni = [];   // tutti i comuni trovati per l'NPA

    npaInput.addEventListener('input', () => {
        clearTimeout(npaDebounce);
        comuneSel  = null;
        listaComuni = [];
        comuneSel_.classList.add('hidden');
        const npa = npaInput.value.trim();
        if (npa.length === 4) {
            comuneEl.textContent = 'Ricerca...';
            comuneEl.style.color = '#6b7280';
            npaDebounce = setTimeout(async () => {
                try {
                    listaComuni = await cercaComune(npa);
                    if (listaComuni.length === 0) {
                        comuneEl.textContent = 'NPA non trovato';
                        comuneEl.style.color = '#dc2626';
                    } else if (listaComuni.length === 1) {
                        // Un solo comune — seleziona automaticamente
                        comuneSel = listaComuni[0];
                        comuneEl.textContent = `✓ ${comuneSel.Name} (${comuneSel.Canton})`;
                        comuneEl.style.color = '#16a34a';
                        comuneSel_.classList.add('hidden');
                    } else {
                        // Più comuni — mostra select
                        comuneEl.textContent = 'Seleziona il tuo comune:';
                        comuneEl.style.color = '#374151';
                        comuneSel_.innerHTML = listaComuni
                            .map((c, i) => `<option value="${i}">${c.Name} (${c.Canton})</option>`)
                            .join('');
                        comuneSel_.classList.remove('hidden');
                        // Pre-seleziona il primo
                        comuneSel = listaComuni[0];
                    }
                } catch (err) {
                    comuneEl.textContent = 'Errore ricerca';
                    comuneEl.style.color = '#dc2626';
                    console.error(err);
                }
            }, 500);
        } else {
            comuneEl.textContent = '';
            comuneSel_.classList.add('hidden');
        }
    });

    // Aggiorna comune selezionato quando si cambia il select
    comuneSel_?.addEventListener('change', (e) => {
        comuneSel = listaComuni[parseInt(e.target.value)];
    });

    // ============================================================
    // SUBMIT
    // ============================================================
    form3a.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btnTesto = document.getElementById('testo-btn-calcola');
        const loader   = document.getElementById('loader-calcola');
        setLoader(true, btnTesto, loader);

        try {
            const npa         = npaInput.value.trim();
            const reddito     = parseFloat(document.getElementById('sim-reddito').value)         || 0;
            const statoCivile = document.getElementById('sim-stato-civile').value;
            const figli       = parseInt(document.getElementById('sim-figli').value)             || 0;
            const religione   = document.getElementById('sim-religione').value;
            const permesso    = document.getElementById('sim-permesso').value;
            const tipoCalcolo = document.querySelector('input[name="tipo_calcolo"]:checked').value;

            // Dati partner (solo se coniugato)
            const redditoPartner   = statoCivile === 'coniugato'
                ? (parseFloat(document.getElementById('sim-reddito-partner').value) || 0)
                : 0;
            const religionePartner = statoCivile === 'coniugato'
                ? (document.getElementById('sim-religione-partner')?.value || 'nessuna')
                : 'nessuna';

            // Età figli dai campi dinamici
            const childrenArr = [];
            for (let i = 0; i < figli; i++) {
                const eta = parseInt(document.getElementById(`sim-figlio-eta-${i}`)?.value) || 10;
                childrenArr.push({ Age: eta });
            }

            if (!npa || npa.length !== 4) throw new Error('Inserisci un NPA svizzero valido (4 cifre).');
            if (reddito <= 0)             throw new Error('Inserisci il reddito lordo annuo.');

            // Risolvi comune se non ancora fatto
            if (!comuneSel) {
                const lista = await cercaComune(npa);
                if (!lista.length) throw new Error(`Nessun comune trovato per NPA ${npa}.`);
                comuneSel = lista[0];
                comuneEl.textContent = `✓ ${comuneSel.Name} (${comuneSel.Canton})`;
                comuneEl.style.color = '#16a34a';
            }

            const importo = tipoCalcolo === 'ordinario'
                ? parseFloat(document.getElementById('sim-versamento').value)     || 0
                : parseFloat(document.getElementById('sim-riscatto-totale').value) || 0;

            if (importo <= 0) throw new Error('Inserisci un importo valido.');

            const params = {
                taxLocationId: comuneSel.TaxLocationId,
                relationship:  RELATIONSHIP[statoCivile] || 1,
                confession1:   CONFESSION[religione]        || 5,
                confession2:   CONFESSION[religionePartner] || 5,
                age1:          35,
                redditoPartner,
                children:      childrenArr,
            };

            // UNA sola chiamata — usiamo MarginalTaxRate restituita dall'ESTV
            // più precisa della doppia chiamata perché calcolata sull'incremento infinitesimale
            const { aliquotaMarginale, nomeComune: nc } = await calcolaAliquota({ ...params, revenue1: reddito });
            const nomeComune = nc;
            const risparmio  = Math.round(importo * aliquotaMarginale);
            const aliqMarg   = (aliquotaMarginale * 100).toFixed(1);

            let testo = `Versando ${formattaCHF(importo)} CHF, risparmi ${formattaCHF(risparmio)} CHF di tasse. Aliquota marginale effettiva: ${aliqMarg}%. Calcolo ufficiale ESTV per ${nomeComune}.`;

            if (tipoCalcolo === 'riscatto' && importo > 15000)
                testo += ' Consiglio: suddividi il riscatto su più anni per massimizzare la progressività.';
            if (permesso === 'B')
                testo += ' Con Permesso B la dichiarazione ordinaria ulteriore è definitiva: valuta bene.';
            else if (permesso === 'F_nuovo')
                testo += ' Frontalieri: deduzione valida solo se quasi-residenti (≥90% del reddito prodotto in CH).';

            mostraRisultato(risparmio, testo);

        } catch (err) {
            mostraRisultato(null, `⚠️ ${err.message}`);
            console.error('[Simulatore 3a]', err);
        } finally {
            setLoader(false, btnTesto, loader);
        }
    });

    // ============================================================
    // CHIAMATE API
    // ============================================================

    async function cercaComune(npa) {
        const res = await fetch(PROXY, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ action: 'searchLocation', payload: { npa } }),
        });
        if (!res.ok) throw new Error(`Ricerca NPA fallita (HTTP ${res.status}).`);
        const data = await res.json();

        // Risposta reale ESTV: { "response": [ { TaxLocationID, City, Canton, ZipCode } ] }
        const arr = data.response || (Array.isArray(data) ? data : []);
        return arr.map(c => ({
            TaxLocationId: c.TaxLocationID,
            Name:          c.City,
            Canton:        c.Canton,
            ZipCode:       c.ZipCode,
        }));
    }

    /**
     * Chiama l'ESTV UNA SOLA VOLTA e restituisce MarginalTaxRate.
     * L'ESTV la calcola internamente con un incremento infinitesimale —
     * è più precisa della doppia chiamata pre/post che attraversa
     * un range di reddito con aliquote variabili.
     */
    async function calcolaAliquota(params) {
        if (params.revenue1 <= 0) return { aliquotaMarginale: 0, nomeComune: '' };

        const res = await fetch(PROXY, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ action: 'calculateTaxes', payload: params }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(`Calcolo ESTV fallito (HTTP ${res.status}). ${err.error || ''}`);
        }
        const data = await res.json();
        const r = data.response || data;

        return {
            aliquotaMarginale: (r.MarginalTaxRate || 0) / 100,
            nomeComune:        `${r.Location?.City || comuneSel.Name} (${r.Location?.Canton || comuneSel.Canton})`,
        };
    }

    // ============================================================
    // UTILITY
    // ============================================================

    function setLoader(on, btnTesto, loader) {
        if (btnTesto) btnTesto.textContent = on ? 'Calcolo in corso...' : 'Calcola il mio Risparmio Fiscale';
        if (loader)   loader.classList.toggle('hidden', !on);
    }

    function mostraRisultato(risparmio, testo) {
        const cifra     = document.getElementById('sim-cifra-risparmio');
        const dettaglio = document.getElementById('sim-dettaglio-risparmio');
        const box       = document.getElementById('sim-risultato');
        if (cifra)     cifra.textContent     = risparmio !== null ? `${formattaCHF(risparmio)} CHF` : '—';
        if (dettaglio) dettaglio.textContent = testo;
        if (box) {
            box.classList.remove('hidden');
            box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

});

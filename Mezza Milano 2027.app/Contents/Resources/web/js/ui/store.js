/* Persistenza: nell'app macOS i dati vanno nel file app/data/db.json tramite il ponte Swift;
   aperta in un browser (sviluppo) usa localStorage. */
var MM = globalThis.MM || (globalThis.MM = {});

MM.store = (function () {
  const native = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.mm);
  const LS_KEY = 'mezza-milano-2027-db';
  let saveTimer = null, pending = null;

  function call(cmd, payload) {
    return window.webkit.messageHandlers.mm.postMessage({ cmd, payload: payload == null ? null : payload });
  }

  async function load() {
    if (native) {
      const txt = await call('load');
      return txt ? JSON.parse(txt) : null;
    }
    try { const t = localStorage.getItem(LS_KEY); return t ? JSON.parse(t) : null; } catch (e) { return null; }
  }

  async function writeNow(db) {
    const json = JSON.stringify(db, null, 1);
    if (native) await call('save', json);
    else localStorage.setItem(LS_KEY, json);
  }

  // Salvataggio con un piccolo ritardo per raggruppare modifiche ravvicinate
  function save(db) {
    pending = db;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { const d = pending; pending = null; writeNow(d).catch(e => console.error(e)); }, 250);
  }
  function flush() {
    if (pending) { clearTimeout(saveTimer); const d = pending; pending = null; return writeNow(d); }
    return Promise.resolve();
  }
  window.addEventListener('beforeunload', () => { if (pending) writeNow(pending); });

  async function exportBackup(db, today) {
    const json = JSON.stringify(db, null, 1);
    const name = 'backup-mezza-milano-' + today + '.json';
    if (native) return call('exportBackup', { name, json });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = name;
    a.click();
    return name;
  }

  // Apre un file di testo (json/csv) e ne restituisce il contenuto
  function openText(ext) {
    if (native) return call('openText', { ext });
    return new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.' + ext;
      inp.onchange = () => {
        const f = inp.files[0];
        if (!f) return resolve(null);
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.readAsText(f);
      };
      inp.click();
    });
  }

  async function scheduleNotifications(list) {
    if (!native) return 'Le notifiche funzionano solo nell\'app per Mac.';
    return call('notify', list);
  }
  async function info() {
    if (!native) return { dataDir: 'localStorage del browser (modalità sviluppo)', native: false };
    const r = await call('info');
    return Object.assign({ native: true }, r);
  }
  function revealData() { if (native) call('reveal'); }

  // Strava (solo nell'app per Mac: le chiamate di rete le fa il guscio Swift)
  const strava = {
    status: () => native ? call('stravaStatus') : Promise.resolve({ available: false }),
    connect: (clientId, clientSecret) => call('stravaConnect', { clientId, clientSecret }),
    sync: after => call('stravaSync', { after }),
    disconnect: () => call('stravaDisconnect'),
    streams: id => call('stravaStreams', { id: String(id) })
  };

  // Apple Intelligence (modello sul Mac): stato e commento a un allenamento
  const ai = {
    status: () => native ? call('aiStatus') : Promise.resolve({ available: false, reason: 'Disponibile solo nell\'app per Mac.' }),
    comment: (instructions, prompt) => call('aiComment', { instructions, prompt })
  };

  // App Promemoria di Apple: sostituisce i promemoria futuri dell'app con quelli indicati
  function syncReminders(items) {
    if (!native) return Promise.reject(new Error('Disponibile solo nell\'app per Mac.'));
    return call('reminders', { list: 'Mezza Milano 2027', items });
  }

  return { native, load, save, flush, syncReminders, exportBackup, openText, scheduleNotifications, info, revealData, strava, ai };
})();

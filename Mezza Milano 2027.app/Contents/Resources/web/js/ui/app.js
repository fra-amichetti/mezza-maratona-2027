/* Impianto dell'interfaccia: stato, navigazione, componenti condivisi, finestre modali e azioni. */
var MM = globalThis.MM || (globalThis.MM = {});

MM.app = (function () {
  const U = MM.util, P = MM.paces, PL = MM.plan, R = MM.rules, D = MM.db;
  const state = { db: null, view: 'oggi', params: {}, today: U.todayISO(), strava: { available: false }, ai: { available: false } };

  const NAV = [
    ['oggi', 'Oggi'], ['piano', 'Piano'], ['registro', 'Registro'], ['test', 'Test e obiettivo'],
    ['stats', 'Statistiche'], ['forza', 'Forza'], ['gara', 'Gara'], ['nutrizione', 'Nutrizione'],
    ['impostazioni', 'Impostazioni']
  ];

  // ---- Helper ----------------------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function attr(o) { return esc(JSON.stringify(o)); }
  const db = () => state.db;
  const S = () => state.db.settings;
  function p5Now() { return P.currentP5(db().tests); }
  function p5For(date) { return P.p5ForDate(db().tests, date, state.today); }
  function objective() { return P.objective(S().objective, S()); }
  function daysToRace() { return U.daysBetween(state.today, db().plan.raceDate); }

  function typeClass(s) { return 't-' + (s.type || 'rest'); }
  function typeBadge(type, label) {
    return '<span class="badge t-' + type + '">' + esc(label || PL.TYPE_LABEL[type] || type) + '</span>';
  }

  // Ritmo, FC e RPE principali di una seduta
  function sessionKey(s) {
    const z = PL.mainZone(s);
    const p5 = p5For(s.date);
    const hr = S().hrZones;
    if (z === 'race') {
      const o = objective();
      return { zone: z, label: 'ritmo obiettivo ' + o.label, pace: { fast: o.pace, slow: o.pace }, hr: '—', rpe: '8–9 nel finale' };
    }
    if (z === 'test') return { zone: z, label: 'a tutta, ritmo regolare', pace: null, hr: '> 165', rpe: '9' };
    if (!z) return null;
    const Z = P.ZONES[z];
    let hrTxt = Z.hrKey ? hr[Z.hrKey] : '—';
    if (Z.hrKey === 'easy') hrTxt = '< ' + S().hrEasyMax;
    return { zone: z, label: Z.short, pace: P.zoneRange(p5, z), hr: hrTxt, rpe: Z.rpe, feel: Z.feel };
  }

  function stepsHTML(s) {
    const st = PL.steps(s, p5For(s.date));
    if (!st.length) return '';
    return '<ol class="steps">' + st.map(x =>
      '<li><span class="zdot z-' + x.zone + '"></span><span class="st-text">' + esc(x.text) + '</span>' +
      (x.pace ? '<span class="st-pace">' + U.fmtPaceRange(x.pace) + '<small>/km</small></span>' : '') + '</li>').join('') + '</ol>';
  }

  // Scheda grande della seduta
  function sessionHero(s, opts) {
    opts = opts || {};
    const log = db().logs[s.id];
    const k = sessionKey(s);
    const est = PL.estimateDuration(s, p5For(s.date), objective().time / P.HALF_KM);
    let h = '<div class="hero ' + typeClass(s) + '">';
    h += '<div class="hero-top">' + typeBadge(s.type) +
      (s.optional ? '<span class="badge soft">facoltativa</span>' : '') +
      (opts.dateLabel ? '<span class="muted">' + esc(opts.dateLabel) + '</span>' : '') + '</div>';
    h += '<h2 class="hero-title">' + esc(PL.title(s)) + '</h2>';
    if (s.moved) h += '<div class="moved">↔ Spostata da ' + esc(U.fmtDateLong(s.plannedDate)) + ' <button class="btn sm ghost" data-act="moveReset" data-arg="' + attr(s.id) + '">Riporta al giorno previsto</button></div>';
    if (s.adjusted) h += '<div class="adjusted">⚠︎ ' + esc(s.adjusted) + (s.original ? ' <span class="muted">(previsto: ' + esc(PL.title(s.original)) + ')</span>' : '') + '</div>';
    if (s.type !== 'rest') {
      h += '<div class="hero-grid">';
      h += '<div class="big"><span class="lbl">Distanza</span><span class="val">' + U.fmtKm(s.km) + '<small> km</small></span>' +
        (est ? '<span class="sub">circa ' + Math.round(est / 60) + ' min</span>' : '') + '</div>';
      if (k) {
        h += '<div class="big main-pace"><span class="lbl">' + esc(k.label) + '</span><span class="val">' +
          (k.pace ? U.fmtPaceRange(k.pace) + '<small>/km</small>' : 'A tutta') + '</span>' + (k.feel ? '<span class="sub">' + esc(k.feel) + '</span>' : '') + '</div>';
        h += '<div class="big"><span class="lbl">FC target</span><span class="val">' + esc(k.hr) + '</span><span class="sub">RPE ' + esc(k.rpe) + '</span></div>';
      }
      h += '</div>';
      h += stepsHTML(s);
    } else if (!s.adjusted) {
      h += '<p class="muted">' + esc(s.note || 'Giornata di recupero.') + '</p>';
    }
    if (s.note && s.type !== 'rest') h += '<p class="note">' + esc(s.note) + '</p>';
    if (s.type === 'easy' || s.type === 'long') {
      h += '<p class="hint">Se la FC supera ' + S().hrEasyMax + ' rallenta, anche oltre il ritmo indicato.</p>';
      const ch = MM.cadence.hint(db());
      if (ch) h += '<p class="hint cad">👣 ' + esc(ch) + '</p>';
    }
    if (s.type === 'quality' && s.warmup) h += '<p class="hint">Recuperi tra le ripetute sempre corricchiando piano, mai fermo.</p>';
    if (PL.isRun(s) || (s.original && PL.isRun(s.original))) {
      h += '<div class="hero-actions">';
      if (log) h += logSummary(log, s) + coachHTML(log, s.id);
      h += '<button class="btn primary" data-act="openLog" data-arg="' + attr(s.id) + '">' + (log ? 'Modifica registrazione' : 'Registra allenamento') + '</button>';
      if (!log) h += '<button class="btn" data-act="quickSkip" data-arg="' + attr(s.id) + '">Saltato</button>';
      if (!log && s.date >= state.today) h += '<button class="btn ghost" data-act="openMove" data-arg="' + attr(s.id) + '">↔ Sposta giorno</button>';
      h += '</div>';
    }
    return h + '</div>';
  }

  function logSummary(log, s) {
    if (log.status === 'skipped') return '<div class="logsum skipped">✗ Saltato · non si recupera, si riparte dal prossimo' + (log.notes ? ' · ' + esc(log.notes) : '') + '</div>';
    const parts = ['✓ Fatto'];
    if (log.km) parts.push(U.fmtKm(log.km, 2).replace(/,?0+$/, '') + ' km');
    if (log.timeSec) parts.push(U.fmtDuration(log.timeSec));
    if (log.km && log.timeSec) parts.push(U.fmtPace(log.timeSec / log.km) + '/km');
    if (log.hrAvg) parts.push('FC ' + log.hrAvg);
    if (log.cadence) parts.push(log.cadence + ' passi/min');
    if (log.rpe) parts.push('RPE ' + log.rpe);
    if (log.knee != null && log.knee !== '') parts.push('ginocchia ' + log.knee + '/10');
    let warn = '';
    if (s && R.hrTooHigh(s.type, log.hrAvg, S().hrEasyMax)) warn = '<div class="warnline">Troppo veloce, rallenta anche oltre il ritmo indicato (FC ' + log.hrAvg + ' > ' + S().hrEasyMax + ')</div>';
    return '<div class="logsum done">' + parts.join(' · ') + '</div>' + warn;
  }

  function coachHTML(t, ref) {
    if (!t || !t.coach) return '';
    return '<div class="coach v-' + t.coach.verdict + '"><div class="coach-head"><strong>' + (t.coach.by === 'ai' ? '✦ Coach (Apple Intelligence)' : 'Coach') + '</strong>' +
      '<button class="btn sm ghost" data-act="regenCoach" data-arg="' + attr(ref) + '" title="Rigenera">↻</button></div><p>' + esc(t.coach.text) + '</p></div>';
  }

  function alertsHTML(list) {
    if (!list.length) return '';
    return '<div class="alerts">' + list.map(a =>
      '<div class="alert a-' + a.level + '"><div class="a-body"><strong>' + esc(a.title) + '</strong><span>' + esc(a.text) + '</span></div>' +
      (a.actions && a.actions.length ? '<div class="a-actions">' + a.actions.map(b =>
        '<button class="btn sm' + (b.primary ? ' primary' : '') + '" data-act="' + b.cmd + '" data-arg="' + attr(b.arg == null ? null : b.arg) + '">' + esc(b.label) + '</button>').join('') + '</div>' : '') +
      '</div>').join('') + '</div>';
  }

  // ---- Render --------------------------------------------------------------------------
  function sidebar() {
    const o = objective();
    const d = daysToRace();
    return '<div class="brand"><div class="logo">21,1</div><div><strong>Mezza Milano</strong><span>21 marzo 2027</span></div></div>' +
      '<nav>' + NAV.map(([id, label]) => '<a href="#" class="' + (state.view === id ? 'active' : '') + '" data-act="go" data-arg="' + attr(id) + '">' + label + '</a>').join('') + '</nav>' +
      '<div class="side-foot"><div class="countdown"><span class="num">' + Math.max(0, d) + '</span><span>' + (d === 1 ? 'giorno' : 'giorni') + ' alla gara</span></div>' +
      '<div class="objchip">Obiettivo ' + esc(o.label) + ' · ' + esc(o.timeLabel) + '</div></div>';
  }

  function render() {
    state.today = U.todayISO();
    document.getElementById('side').innerHTML = sidebar();
    const view = MM.views[state.view] || MM.views.oggi;
    const main = document.getElementById('main');
    main.innerHTML = view(state);
    if (view.mount) view.mount(main, state);
  }

  function go(view, params) {
    state.view = view;
    state.params = params || {};
    render();
    document.getElementById('main').scrollTop = 0;
  }

  let notifTimer = null;
  function commit(msg) {
    MM.store.save(state.db);
    render();
    if (msg) toast(msg);
    if (S().notifications.enabled) {
      clearTimeout(notifTimer);
      notifTimer = setTimeout(() => MM.store.scheduleNotifications(D.upcomingNotifications(state.db, new Date(), 14)), 1500);
    }
    scheduleReminders();
  }

  // App Promemoria: riscrive i promemoria dei prossimi 14 giorni (dopo ogni modifica, con un piccolo ritardo)
  let remTimer = null;
  function scheduleReminders(now) {
    if (!S().reminders.enabled || !MM.store.native) return;
    clearTimeout(remTimer);
    remTimer = setTimeout(() => syncRemindersNow(false), now ? 0 : 2000);
  }
  async function syncRemindersNow(loud) {
    try {
      const r = await MM.store.syncReminders(D.dailyReminders(state.db, new Date(), 14));
      S().reminders.lastSync = new Date().toISOString();
      S().reminders.lastCount = r && r.count;
      S().reminders.error = null;
      MM.store.save(state.db);
      if (loud) toast('Promemoria aggiornati: ' + (r && r.count) + ' giorni nell\'elenco "Mezza Milano 2027".');
    } catch (e) {
      S().reminders.error = e.message || String(e);
      MM.store.save(state.db);
      if (loud) toast(S().reminders.error);
    }
    if (state.view === 'impostazioni' && !document.querySelector('.modal-back')) render();
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
  }

  // ---- Modali -----------------------------------------------------------------------------
  function openModal(html, onMount, opts) {
    closeModal(true);
    const m = document.createElement('div');
    m.className = 'modal-back';
    if (opts && opts.locked) m.setAttribute('data-locked', '1');
    m.innerHTML = '<div class="modal" role="dialog">' + html + '</div>';
    m.addEventListener('mousedown', e => { if (e.target === m) closeModal(); });
    document.body.appendChild(m);
    if (onMount) onMount(m.querySelector('.modal'));
    const first = m.querySelector('input:not([type=hidden]):not([type=radio]):not([type=checkbox]), textarea');
    if (first) setTimeout(() => first.focus(), 30);
  }
  function closeModal(force) {
    if (force !== true && document.querySelector('.modal-back[data-locked]')) return; document.querySelectorAll('.modal-back').forEach(x => x.remove()); }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  function scale(name, from, to, value, labels) {
    let h = '<div class="scale" data-name="' + name + '">';
    for (let i = from; i <= to; i++) {
      h += '<label><input type="radio" name="' + name + '" value="' + i + '"' + (String(value) === String(i) ? ' checked' : '') + '><span>' + i + '</span></label>';
    }
    h += '</div>';
    if (labels) h += '<div class="scale-lbl"><span>' + labels[0] + '</span><span>' + labels[1] + '</span></div>';
    return h;
  }
  function field(label, name, value, opts) {
    opts = opts || {};
    return '<label class="field' + (opts.cls ? ' ' + opts.cls : '') + '"><span>' + label + '</span><input name="' + name + '" value="' + esc(value == null ? '' : value) + '"' +
      ' inputmode="' + (opts.mode || 'decimal') + '" placeholder="' + esc(opts.ph || '') + '" autocomplete="off"></label>';
  }
  function readForm(root) {
    const out = {};
    root.querySelectorAll('input, select, textarea').forEach(el => {
      if (!el.name) return;
      if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; else if (!(el.name in out)) out[el.name] = null; }
      else if (el.type === 'checkbox') out[el.name] = el.checked;
      else out[el.name] = el.value;
    });
    return out;
  }

  // Campi comuni del registro corse. kind: 'easy'|'long'|'quality'|'test-5k'|'test-10k'|'bench20'|'rmlong'
  function runFields(log, s) {
    const l = log || {};
    const isLong = s.type === 'long' || (s.original && s.original.type === 'long');
    const kind = s.testKind || (s.original && s.original.testKind);
    let h = '<div class="grid3">' +
      field('Km', 'km', l.km != null ? U.fmtKm(l.km, 2).replace(/,?0+$/, '') : '', { ph: U.fmtKm(s.km || (s.original && s.original.km)) }) +
      field('Tempo totale', 'time', l.timeSec ? U.fmtDuration(l.timeSec) : '', { ph: 'h:mm:ss', mode: 'text' }) +
      '<div class="field"><span>Ritmo</span><output name="paceOut" class="calc">–</output></div>' +
      field('FC media', 'hrAvg', l.hrAvg, { mode: 'numeric' }) +
      field('FC massima', 'hrMax', l.hrMax, { mode: 'numeric' }) + field('Cadenza (passi/min)', 'cadence', l.cadence, { mode: 'numeric', ph: 'dal Watch' });
    if (isLong) h += field('FC 1ª metà', 'hr1', l.hr1, { mode: 'numeric', ph: 'facoltativa' }) + field('FC 2ª metà', 'hr2', l.hr2, { mode: 'numeric', ph: 'facoltativa' }) + '<div class="field"><span>Deriva</span><output name="driftOut" class="calc">–</output></div>';
    h += '</div>';
    if (kind === '5k' || kind === '10k') {
      h += '<div class="testbox"><strong>Risultato del test ' + (kind === '5k' ? '5' : '10') + ' km</strong><div class="grid3">' +
        field('Tempo del test', 'testTime', l.testTimeSec ? U.fmtDuration(l.testTimeSec) : '', { ph: kind === '5k' ? 'mm:ss' : 'mm:ss', mode: 'text' }) +
        field('FC media del test', 'testHr', l.testHr, { mode: 'numeric' }) +
        '<div class="field"><span>Nuovo P5</span><output name="p5Out" class="calc">–</output></div></div></div>';
    }
    if (kind === 'bench20') {
      h += '<div class="testbox"><strong>Benchmark: distanza percorsa nei 20\' a soglia</strong><div class="grid3">' +
        field('Km nei 20\'', 'benchKm', l.benchKm != null ? U.fmtKm(l.benchKm, 2) : '', { ph: 'es. 3,85' }) +
        field('FC media dei 20\'', 'testHr', l.testHr, { mode: 'numeric' }) +
        '<div class="field"><span>Ritmo</span><output name="benchOut" class="calc">–</output></div></div></div>';
    }
    const tgt = MM.form.targetOf(s.original || s);
    if (tgt && tgt.zone !== 'test') {
      h += '<div class="testbox"><strong>' + (tgt.n > 1 ? 'Ripetute' : 'Tratto ' + P.ZONES[tgt.zone].short) + '</strong><div class="grid3">' +
        field(tgt.n > 1 ? 'Ritmo medio ripetute' : 'Ritmo del tratto', 'repPace', l.repPace ? U.fmtPace(l.repPace) : '', { mode: 'text', ph: 'm:ss' }) + '</div>' +
        (l.reps && l.reps.length ? '<table class="table reps"><thead><tr><th>#</th><th class="num">Durata</th><th class="num">Km</th><th class="num">Ritmo</th><th class="num">FC</th></tr></thead><tbody>' +
          l.reps.map((r, i) => '<tr><td>' + (i + 1) + '</td><td class="num">' + U.fmtDuration(r.sec) + '</td><td class="num">' + U.fmtKm(r.km, 2) + '</td><td class="num strong">' + U.fmtPace(r.pace) + '</td><td class="num">' + (r.hr || '') + '</td></tr>').join('') +
          '</tbody></table><span class="muted small">Riconosciute automaticamente dai dati di Strava.</span>' : '<span class="muted small">Se la corsa arriva da Strava, le ripetute vengono riconosciute da sole.</span>') + '</div>';
    }
    if (s.check === 'rmlong') h += '<div class="testbox"><strong>Prova generale</strong><span class="muted"> L\'RPE del tratto a RM decide se confermare l\'obiettivo (≤ 7 conferma).</span></div>';
    h += '<div class="lbl-row">RPE (fatica percepita)</div>' + scale('rpe', 1, 10, l.rpe, ['facilissimo', 'massimo']);
    h += '<div class="lbl-row">Dolore alle ginocchia</div>' + scale('knee', 0, 10, l.knee, ['nessuno', 'fortissimo']);
    h += '<div class="grid2"><label class="check"><input type="checkbox" name="heavy"' + (l.heavy ? ' checked' : '') + '> Gambe pesanti</label>' +
      '<label class="field"><span>Sensazioni</span><select name="feel">' + ['', 'Ottime', 'Buone', 'Normali', 'Faticose', 'Pessime'].map(f =>
        '<option' + (l.feel === f ? ' selected' : '') + '>' + f + '</option>').join('') + '</select></label></div>';
    h += '<label class="field"><span>Note</span><textarea name="notes" rows="2">' + esc(l.notes || '') + '</textarea></label>';
    h += '<div class="warnline" data-hrwarn hidden>Troppo veloce, rallenta anche oltre il ritmo indicato: nelle facili e nei lunghi la FC deve restare sotto ' + S().hrEasyMax + '.</div>';
    return h;
  }
  function liveCalc(root, s) {
    const upd = () => {
      const f = readForm(root);
      const km = U.parseNum(f.km), t = U.parseDuration(f.time);
      const po = root.querySelector('[name=paceOut]');
      if (po) po.textContent = km && t ? U.fmtPace(t / km) + '/km' : '–';
      const d = root.querySelector('[name=driftOut]');
      const h1 = U.parseNum(f.hr1), h2 = U.parseNum(f.hr2);
      if (d) d.textContent = h1 && h2 ? (h2 >= h1 ? '+' : '') + U.fmtKm((h2 - h1) / h1 * 100) + '%' : '–';
      const p = root.querySelector('[name=p5Out]');
      const tt = U.parseDuration(f.testTime);
      const kind = s.testKind || (s.original && s.original.testKind);
      if (p) p.textContent = tt ? U.fmtPace(P.p5FromTest(kind, tt)) + '/km' : '–';
      const b = root.querySelector('[name=benchOut]');
      const bk = U.parseNum(f.benchKm);
      if (b) b.textContent = bk ? U.fmtPace(1200 / bk) + '/km' : '–';
      const w = root.querySelector('[data-hrwarn]');
      const type = s.original ? s.original.type : s.type;
      if (w) w.hidden = !R.hrTooHigh(s.type === 'rest' ? type : s.type, U.parseNum(f.hrAvg), S().hrEasyMax);
    };
    root.addEventListener('input', upd);
    upd();
  }
  function parseRunForm(f) {
    const num = v => U.parseNum(v);
    return {
      km: num(f.km), timeSec: U.parseDuration(f.time), hrAvg: num(f.hrAvg), hrMax: num(f.hrMax),
      hr1: num(f.hr1), hr2: num(f.hr2), rpe: num(f.rpe), knee: num(f.knee), heavy: !!f.heavy,
      feel: f.feel || '', notes: (f.notes || '').trim(),
      testTimeSec: U.parseDuration(f.testTime), testHr: num(f.testHr), benchKm: num(f.benchKm),
      repPace: f.repPace ? U.parsePace(f.repPace) : null,
      cadence: f.cadence ? MM.cadence.normalize(U.parseNum(f.cadence)) : null
    };
  }

  function openLog(id) {
    const s = PL.findSession(db(), id);
    if (!s) return;
    const log = db().logs[id];
    const status = log ? log.status : 'done';
    const html = '<header><h3>' + esc(PL.title(s.original || s)) + '</h3><span class="muted">' + esc(U.fmtDateLong(s.date)) + ' · ' + U.fmtDate(s.date) + '</span></header>' +
      '<div class="seg"><label><input type="radio" name="status" value="done"' + (status === 'done' ? ' checked' : '') + '><span>✓ Fatto</span></label>' +
      '<label><input type="radio" name="status" value="skipped"' + (status === 'skipped' ? ' checked' : '') + '><span>✗ Saltato</span></label></div>' +
      '<div data-donefields>' + runFields(log, s) + '</div>' +
      '<footer>' + (log ? '<button class="btn danger" data-act="clearLog" data-arg="' + attr(id) + '">Cancella registrazione</button>' : '') +
      '<span class="spacer"></span><button class="btn" data-act="closeModal">Annulla</button><button class="btn primary" data-act="saveLog" data-arg="' + attr(id) + '">Salva</button></footer>';
    openModal(html, m => {
      liveCalc(m, s);
      const sync = () => { m.querySelector('[data-donefields]').classList.toggle('dim', readForm(m).status === 'skipped'); };
      m.addEventListener('change', sync);
      sync();
    });
  }

  function openExtra(id) {
    const r = id ? db().extraRuns.find(x => x.id === id) : null;
    const s = { type: r ? r.type : 'easy', km: 0, date: r ? r.date : state.today };
    const html = '<header><h3>' + (r ? 'Corsa extra' : 'Aggiungi corsa fuori piano') + '</h3></header>' +
      '<div class="grid3">' + field('Data (gg/mm/aaaa)', 'date', U.fmtDate(s.date), { mode: 'text' }) +
      '<label class="field"><span>Tipo</span><select name="type">' + [['easy', 'Facile'], ['long', 'Lungo'], ['quality', 'Qualità']].map(([v, l]) =>
        '<option value="' + v + '"' + (s.type === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label><div></div></div>' +
      runFields(r, s) +
      '<footer>' + (r ? '<button class="btn danger" data-act="deleteExtra" data-arg="' + attr(r.id) + '">Elimina</button>' : '') +
      '<span class="spacer"></span><button class="btn" data-act="closeModal">Annulla</button><button class="btn primary" data-act="saveExtra" data-arg="' + attr(r ? r.id : null) + '">Salva</button></footer>';
    openModal(html, m => liveCalc(m, s));
  }

  function openTestModal() {
    const html = '<header><h3>Registra un test</h3><span class="muted">Anche fuori dal piano, ad esempio un parkrun o una gara.</span></header>' +
      '<div class="grid3"><label class="field"><span>Tipo</span><select name="kind"><option value="5k">Test 5 km</option><option value="10k">Test / gara 10 km</option><option value="bench20">Benchmark 20\' a soglia</option></select></label>' +
      field('Data (gg/mm/aaaa)', 'date', U.fmtDate(state.today), { mode: 'text' }) + '<div></div>' +
      field('Tempo (5/10 km)', 'time', '', { mode: 'text', ph: 'mm:ss' }) + field('Km nei 20\' (benchmark)', 'benchKm', '', { ph: 'es. 3,85' }) +
      field('FC media', 'hrAvg', '', { mode: 'numeric' }) + '</div>' +
      '<footer><span class="spacer"></span><button class="btn" data-act="closeModal">Annulla</button><button class="btn primary" data-act="saveManualTest">Salva test</button></footer>';
    openModal(html);
  }

  // ---- Coach: commento a ogni allenamento (Apple Intelligence se disponibile, altrimenti regole) ----
  function runTarget(ref) { return db().logs[ref] || db().extraRuns.find(x => x.id === ref) || null; }
  const coachBusy = {};
  async function coachRun(ref) {
    const an = MM.coach.analyze(db(), ref);
    const target = runTarget(ref);
    if (!an || !target || target.status === 'skipped') return;
    const k = MM.coach.key(an.run);
    const upToDate = target.coach && target.coach.key === k && (target.coach.by === 'ai' || !state.ai.available);
    if (upToDate || coachBusy[ref]) return;
    coachBusy[ref] = true;
    let text = MM.coach.ruleComment(an), by = 'regole';
    if (state.ai.available) {
      try {
        const t = MM.coach.cleanAi(await MM.store.ai.comment(MM.coach.INSTRUCTIONS, MM.coach.aiPrompt(an)), text);
        if (t) { text = t; by = 'ai'; }
      } catch (e) { console.warn(e); }
    }
    delete coachBusy[ref];
    const t2 = runTarget(ref);
    if (!t2) return;
    t2.coach = { text, by, key: k, verdict: an.verdict };
    MM.store.save(db());
    if (!document.querySelector('.modal-back')) render();
  }
  // Commenti mancanti per le corse recenti (all'avvio)
  function coachBackfill() {
    R.allRuns(db()).filter(r => r.date >= db().plan.firstMonday && U.daysBetween(r.date, state.today) <= 14)
      .forEach(r => coachRun(r.sessionId || r.id));
  }

  // ---- Ripetute dai dati secondo per secondo di Strava ----
  async function analyzeStreams(ref) {
    const log = db().logs[ref];
    if (!log || !log.stravaId || log.repsChecked || !state.strava.connected) return;
    const s = PL.findSession(db(), ref);
    const tg = MM.form.targetOf(s && (s.original || s));
    if (!tg) { log.repsChecked = true; return; }
    try {
      const raw = JSON.parse(await MM.store.strava.streams(log.stravaId) || '{}');
      const stream = { time: raw.time && raw.time.data, distance: raw.distance && raw.distance.data, heartrate: raw.heartrate && raw.heartrate.data };
      const res = MM.form.detectReps(stream, tg);
      const l = db().logs[ref];
      if (!l) return;
      l.repsChecked = true;
      if (res) {
        l.reps = res.reps;
        if (tg.zone === 'test') {
          if (s.testKind === 'bench20') l.benchKmDetected = res.reps[0].km; else l.testDetectedSec = res.reps[0].sec;
        } else if (l.repPace == null) l.repPace = res.avgPace;
      }
      MM.store.save(db());
      coachRun(ref);
    } catch (e) { console.warn('streams', e); }
  }

  // Importa nel registro le corse Strava indicate; restituisce quante
  function importStravaRows(rows) {
    let n = 0;
    rows.forEach(r => {
      const data = { status: 'done', km: r.km, timeSec: r.timeSec, hrAvg: r.hrAvg, hrMax: r.hrMax, cadence: r.cadence || null, notes: r.name ? 'Strava: ' + r.name : 'Da Strava', source: 'strava' };
      if (r.stravaId) data.stravaId = r.stravaId;
      if (r.dupExtraId) {
        // Stessa corsa già presente fuori piano: la collega a Strava senza duplicarla
        const x = db().extraRuns.find(e => e.id === r.dupExtraId);
        if (!x) return;
        Object.assign(x, { stravaId: r.stravaId, source: 'strava', hrAvg: x.hrAvg || r.hrAvg, hrMax: x.hrMax || r.hrMax, timeSec: x.timeSec || r.timeSec });
      } else if (r.sessionId) {
        const s = PL.findSession(db(), r.sessionId);
        if (!s) return;
        const prev = db().logs[r.sessionId] && db().logs[r.sessionId].status === 'done' ? db().logs[r.sessionId] : null;
        // Se la seduta era già registrata a mano, tiene note/RPE/ginocchia e aggiorna solo i dati misurati
        const merged = prev ? Object.assign({}, prev, { km: r.km, timeSec: r.timeSec, hrAvg: r.hrAvg || prev.hrAvg, hrMax: r.hrMax || prev.hrMax, cadence: r.cadence || prev.cadence, stravaId: r.stravaId, source: 'strava' }) : data;
        D.saveLog(db(), s, merged);
      } else D.addExtraRun(db(), Object.assign({ date: r.date, type: r.km >= 13 ? 'long' : 'easy' }, data));
      n++;
      const ref = r.sessionId || (db().extraRuns.find(x => x.stravaId === r.stravaId) || {}).id;
      setTimeout(() => { if (r.sessionId) analyzeStreams(r.sessionId).then(() => coachRun(ref)); else if (ref) coachRun(ref); }, 50);
    });
    return n;
  }

  // ---- Azioni -----------------------------------------------------------------------------
  function afterTest(test) {
    if (!test) return;
    if (test.kind === '5k' || test.kind === '10k') toast('Test registrato: P5 ' + U.fmtPace(test.p5) + '/km. Tutti i ritmi futuri sono aggiornati.');
    else toast('Test registrato: guarda la proposta di obiettivo nella schermata Oggi.');
  }

  const actions = {
    go: v => go(v),
    goWeek: n => go('piano', { mode: 'week', n }),
    closeModal,
    openLog,
    openExtra,
    openTestModal,
    quickSkip: id => {
      const s = PL.findSession(db(), id);
      D.saveLog(db(), s, { status: 'skipped' });
      commit('Segnato come saltato: non va recuperato, si riparte dal prossimo.');
    },
    saveLog: id => {
      const m = document.querySelector('.modal');
      const f = readForm(m);
      const s = PL.findSession(db(), id);
      if (f.status === 'skipped') {
        D.saveLog(db(), s, { status: 'skipped', notes: (f.notes || '').trim() });
        closeModal();
        return commit('Segnato come saltato.');
      }
      const prev = db().logs[id] || {};
      const keep = {};
      ['stravaId', 'source', 'reps', 'repsChecked', 'testDetectedSec', 'benchKmDetected'].forEach(k => { if (prev[k] != null) keep[k] = prev[k]; });
      const data = Object.assign(keep, { status: 'done' }, parseRunForm(f));
      if (f.time && !data.timeSec) return toast('Tempo non valido: usa h:mm:ss o mm:ss');
      if (f.testTime && !data.testTimeSec) return toast('Tempo del test non valido: usa mm:ss');
      if (f.repPace && !data.repPace) return toast('Ritmo delle ripetute non valido: usa m:ss');
      if (f.cadence && !data.cadence) return toast('Cadenza non valida: inserisci i passi al minuto (es. 162).');
      const test = D.saveLog(db(), s, data);
      closeModal();
      commit(test ? null : 'Allenamento salvato: il coach sta preparando il commento.');
      afterTest(test);
      coachRun(id);
    },
    clearLog: id => { D.clearLog(db(), id); closeModal(); commit('Registrazione cancellata.'); },
    saveExtra: id => {
      const m = document.querySelector('.modal');
      const f = readForm(m);
      const date = U.parseDateIT(f.date);
      if (!date) return toast('Data non valida: usa gg/mm/aaaa');
      const data = Object.assign({ date, type: f.type }, parseRunForm(f));
      if (!data.km) return toast('Inserisci i km');
      if (id) Object.assign(db().extraRuns.find(x => x.id === id), data);
      else D.addExtraRun(db(), data);
      if (data.knee != null) db().health[date] = Object.assign({}, db().health[date], { knee: data.knee });
      closeModal();
      commit('Corsa salvata.');
      const saved = id ? db().extraRuns.find(x => x.id === id) : db().extraRuns[db().extraRuns.length - 1];
      if (saved) coachRun(saved.id);
    },
    deleteExtra: id => { db().extraRuns = db().extraRuns.filter(x => x.id !== id); closeModal(); commit('Corsa eliminata.'); },
    saveManualTest: () => {
      const f = readForm(document.querySelector('.modal'));
      const date = U.parseDateIT(f.date);
      if (!date) return toast('Data non valida: usa gg/mm/aaaa');
      const t = { date, kind: f.kind, hrAvg: U.parseNum(f.hrAvg) };
      if (f.kind === 'bench20') { t.distKm = U.parseNum(f.benchKm); if (!t.distKm) return toast('Inserisci i km percorsi nei 20\''); }
      else { t.timeSec = U.parseDuration(f.time); if (!t.timeSec) return toast('Tempo non valido: usa mm:ss'); }
      const test = D.upsertTest(db(), t);
      closeModal();
      commit();
      afterTest(test);
    },
    deleteTest: id => {
      if (!confirm('Eliminare questo test?')) return;
      D.removeTest(db(), id);
      commit('Test eliminato: i ritmi tornano al test precedente.');
    },
    acceptProposal: id => { D.acceptProposal(db(), id, state.today); commit('Obiettivo aggiornato: ' + objective().label + ' (' + objective().timeLabel + ').'); },
    rejectProposal: id => { D.rejectProposal(db(), id); commit('Obiettivo invariato.'); },
    setObjective: arg => {
      D.setObjective(db(), arg.id, arg.customSec, arg.reason || 'Scelta manuale', state.today);
      commit('Obiettivo attivo: ' + objective().label + ' (' + objective().timeLabel + ').');
    },
    kneeProtocol: days => {
      S().kneeProtocol = { from: state.today, until: U.addDays(state.today, days - 1) };
      commit('Protocollo ginocchia attivo per ' + (days / 7) + (days === 7 ? ' settimana.' : ' settimane.'));
    },
    endKneeProtocol: () => { S().kneeProtocol = null; commit('Protocollo ginocchia terminato.'); },
    repeatWeek: a => { S().weekOverrides[a.n] = { mode: 'repeat', from: a.from }; commit('La settimana ' + a.n + ' ripete la ' + a.from + '.'); },
    deloadWeek: n => { S().weekOverrides[n] = { mode: 'deload' }; commit('Settimana ' + n + ' trasformata in scarico.'); },
    removeOverride: n => { delete S().weekOverrides[n]; commit('Settimana ' + n + ' riportata al piano originale.'); },
    dismiss: key => { S().dismissed[key] = true; commit(); },
    resetDismissed: () => { S().dismissed = {}; commit('Avvisi nascosti ripristinati.'); },
    saveCheckin: () => {
      const f = readForm(document.querySelector('[data-checkin]'));
      const h = Object.assign({}, db().health[state.today]);
      if (f.cknee != null) h.knee = Number(f.cknee);
      h.sick = f.sick || 'no';
      db().health[state.today] = h;
      commit('Check-in salvato.');
    },
    weekNav: n => go('piano', { mode: 'week', n }),
    planMode: mode => go('piano', Object.assign({}, state.params, { mode })),
    // Palestra: salvataggio immediato a ogni modifica (gestito nella vista Forza)
    gymWeek: n => go('forza', { n }),
    raceObj: id => go('gara', Object.assign({}, state.params, { obj: id })),
    exportBackup: async () => {
      await MM.store.flush();
      const r = await MM.store.exportBackup(db(), state.today);
      if (r) toast('Backup salvato.');
    },
    importBackup: async () => {
      const txt = await MM.store.openText('json');
      if (!txt) return;
      let obj;
      try { obj = JSON.parse(txt); } catch (e) { return toast('File non valido.'); }
      if (!D.validate(obj)) return toast('Il file non sembra un backup di questa app.');
      if (!confirm('Sostituire tutti i dati attuali con quelli del backup?')) return;
      state.db = D.migrate(obj);
      commit('Backup importato.');
    },
    importStrava: async () => {
      const txt = await MM.store.openText('csv');
      if (!txt) return;
      const r = MM.strava.parseActivities(txt);
      if (r.error) return toast(r.error);
      const m = MM.strava.match(db(), r.runs).filter(x => x.status !== 'known').sort((a, b) => a.date < b.date ? 1 : -1);
      MM.views.stravaPreview(m);
    },
    confirmStrava: () => {
      const rows = MM.views._stravaRows || [];
      const chosen = [];
      document.querySelectorAll('.modal [data-srow]').forEach(cb => { if (cb.checked) chosen.push(rows[Number(cb.getAttribute('data-srow'))]); });
      const n = importStravaRows(chosen);
      closeModal();
      commit(n + (n === 1 ? ' corsa importata' : ' corse importate') + ' da Strava. Aggiungi RPE e ginocchia dalla schermata Oggi.');
    },
    stravaConnect: async () => {
      const id = (document.querySelector('[name=stravaId]').value || '').trim();
      const secret = (document.querySelector('[name=stravaSecret]').value || '').trim();
      if (!/^\d+$/.test(id)) return toast('Il Client ID è un numero: copialo da strava.com/settings/api');
      if (!/^[0-9a-f]{20,}$/i.test(secret)) return toast('Il Client Secret non sembra valido: copialo per intero (tasto "mostra").');
      toast('Si apre il browser: accedi a Strava e premi "Autorizza".');
      try {
        state.strava = await MM.store.strava.connect(id, secret);
        render();
        toast('Strava collegato' + (state.strava.athlete ? ' come ' + state.strava.athlete : '') + '. Scarico le corse…');
        actions.stravaSync(false);
      } catch (e) { toast(e.message || String(e)); render(); }
    },
    // Scarica le corse nuove da Strava e mostra l'anteprima di import. auto = avvio dell'app (silenzioso se non c'è nulla)
    stravaSync: async auto => {
      if (!state.strava.connected) return;
      const last = S().stravaLastSync;
      const fromISO = last ? U.addDays(last.slice(0, 10), -7) : U.addDays(db().plan.firstMonday, -14);
      const after = Math.floor(U.parseISO(fromISO) / 1000);
      if (!auto) toast('Sincronizzo con Strava…');
      try {
        const txt = await MM.store.strava.sync(after);
        const runs = MM.strava.fromApi(JSON.parse(txt || '[]'));
        const rows = MM.strava.match(db(), runs).filter(x => x.status !== 'known').sort((a, b) => a.date < b.date ? 1 : -1);
        S().stravaLastSync = new Date().toISOString();
        MM.store.save(db());
        Object.keys(db().logs).filter(k => db().logs[k].stravaId && !db().logs[k].repsChecked && db().logs[k].date >= db().plan.firstMonday)
          .slice(0, 5).forEach(k => analyzeStreams(k));
        const split = MM.strava.autoSplit(db(), rows);
        const n = importStravaRows(split.auto);
        if (n) commit(n + (n === 1 ? ' corsa importata' : ' corse importate') + ' da Strava. Completa RPE e ginocchia dalla schermata Oggi.');
        if (split.ask.length) {
          if (!document.querySelector('.modal-back')) MM.views.stravaPreview(split.ask);
        } else if (!n && !auto) toast('Nessuna corsa nuova su Strava.');
      } catch (e) { if (!auto) toast(e.message || String(e)); else console.warn(e); }
    },
    stravaDisconnect: async () => {
      if (!confirm('Scollegare Strava? Le corse già importate restano.')) return;
      state.strava = await MM.store.strava.disconnect();
      render();
      toast('Strava scollegato.');
    },
    confirmDetectedTest: id => {
      const l = db().logs[id];
      const s = PL.findSession(db(), id);
      if (!l || !s) return;
      const data = Object.assign({}, l);
      if (l.testDetectedSec) data.testTimeSec = l.testDetectedSec;
      if (l.benchKmDetected) data.benchKm = l.benchKmDetected;
      const test = D.saveLog(db(), s, data);
      commit();
      afterTest(test);
    },
    applyEstP5: p5 => {
      D.upsertTest(db(), { id: 'est-' + state.today, kind: 'est', date: state.today, p5: Number(p5), notes: 'Ritmi aggiornati dalla forma stimata' });
      commit('Ritmi aggiornati: P5 ' + U.fmtPace(p5) + '/km. Il prossimo test li verificherà.');
    },
    regenCoach: ref => { const t = runTarget(ref); if (t) delete t.coach; coachRun(ref); toast('Rigenero il commento…'); },
    openMove: id => {
      const s = PL.findSession(db(), id);
      if (!s) return;
      const w = PL.effectiveWeek(db(), s.week);
      let rows = '';
      for (let i = 0; i < 7; i++) {
        const d = U.addDays(w.start, i);
        const there = w.sessions.filter(x => x.date === d && x.id !== id && (PL.isRun(x) || (x.original && PL.isRun(x.original))));
        const gyms = MM.gym.sessionsForWeek(w.n, w.deload).filter(g => g.day === i + 1);
        const busy = there.map(x => PL.title(x)).concat(gyms.map(g => 'Palestra ' + g.kind)).join(' · ');
        const past = d < state.today;
        rows += '<label class="mv-day' + (past ? ' past' : '') + '"><input type="radio" name="mvdate" value="' + d + '"' + (d === s.date ? ' checked' : '') + (past ? ' disabled' : '') + '>' +
          '<span class="mv-d">' + esc(U.fmtDateLong(d)) + (d === s.plannedDate ? ' <em>(previsto)</em>' : '') + '</span><span class="mv-b">' + esc(busy || 'libero') + '</span></label>';
      }
      openModal('<header><h3>Sposta: ' + esc(PL.title(s)) + '</h3><span class="muted">Scegli un giorno della stessa settimana. Se c\'è già una corsa, le due sedute si scambiano.</span></header>' +
        '<div class="mv-list">' + rows + '</div><div data-mvinfo></div>' +
        '<footer><span class="spacer"></span><button class="btn" data-act="closeModal">Annulla</button><button class="btn primary" data-act="moveSave" data-arg="' + attr(id) + '">Sposta</button></footer>', m => {
        const upd = () => {
          const d = (m.querySelector('[name=mvdate]:checked') || {}).value;
          const box = m.querySelector('[data-mvinfo]');
          if (!d || d === s.date) { box.innerHTML = ''; return; }
          const pl = PL.planMove(db(), id, d);
          const warns = PL.moveWarnings(db(), id, d);
          box.innerHTML = (pl && pl.swapWith ? '<p class="note">↔ <strong>' + esc(PL.title(pl.swapWith)) + '</strong> passa a ' + esc(U.fmtDateLong(s.date)) + '.</p>' : '') +
            (warns.length ? warns.map(x => '<div class="warnline">' + esc(x) + '</div>').join('') : '<p class="note ok">Nessun problema: la settimana resta equilibrata.</p>');
        };
        m.addEventListener('change', upd);
        upd();
      });
    },
    moveSave: id => {
      const d = (document.querySelector('.modal [name=mvdate]:checked') || {}).value;
      const s = PL.findSession(db(), id);
      if (!d || !s || d === s.date) return closeModal();
      const pl = PL.planMove(db(), id, d);
      if (!pl) return toast('Puoi spostare la seduta solo dentro la sua settimana.');
      S().moves = pl.moves;
      closeModal();
      commit(PL.title(s) + ' spostata a ' + U.fmtDateLong(d) + (pl.swapWith ? '; ' + PL.title(pl.swapWith) + ' a ' + U.fmtDateLong(s.date) : '') + '.');
    },
    moveReset: id => {
      const s = PL.findSession(db(), id);
      if (!s) return;
      const pl = PL.planMove(db(), id, s.plannedDate);
      if (pl) S().moves = pl.moves;
      commit('Seduta riportata al giorno previsto.');
    },
    toggleReminders: async () => {
      const R = S().reminders;
      R.enabled = !R.enabled;
      MM.store.save(db());
      if (R.enabled) { toast('Collego Promemoria… se macOS te lo chiede, premi Consenti.'); await syncRemindersNow(true); }
      else {
        try { await MM.store.syncReminders([]); } catch (e) { /* elenco già vuoto o accesso negato */ }
        toast('Promemoria giornalieri disattivati: ho tolto quelli futuri dall\'elenco.');
      }
      render();
    },
    remindersNow: () => syncRemindersNow(true),
    saveCadenceTarget: () => {
      const v = MM.cadence.normalize(U.parseNum(document.querySelector('[name=cadTarget]').value));
      if (!v) return toast('Inserisci un obiettivo tra 150 e 190 passi/min.');
      S().cadenceTarget = v;
      commit('Obiettivo cadenza: ' + v + ' passi/min.');
    },
    resetCadenceTarget: () => { S().cadenceTarget = null; commit('Obiettivo cadenza automatico (base +5%).'); },
    finishSetup: async () => {
      const f = readForm(document.querySelector('.modal'));
      const timeSec = U.parseDuration(f.time);
      const date = U.parseDateIT(f.date);
      const weightKg = U.parseNum(f.weightKg), hr = U.parseNum(f.hrEasyMax);
      if (!timeSec || timeSec < (f.kind === '5k' ? 900 : 1800) || timeSec > (f.kind === '5k' ? 3000 : 6000)) return toast('Inserisci il tempo del test (es. 25:30 per un 5 km).');
      if (!date || date > state.today) return toast('Data non valida: usa gg/mm/aaaa (non nel futuro).');
      if (!weightKg || weightKg < 35 || weightKg > 160) return toast('Inserisci il peso in kg.');
      state.db = D.migrate(D.createBlank(state.today, { name: (f.name || '').trim(), weightKg, hrEasyMax: hr && hr > 100 && hr < 200 ? hr : 150, kind: f.kind, timeSec, date, objective: f.objective }));
      MM.store.save(state.db);
      closeModal(true);
      start();
      toast('Pronto! Il tuo piano è calcolato sul tuo test.');
    },
    toggleSetting: key => { S()[key] = !S()[key]; commit(); },
    saveSettings: () => {
      const f = readForm(document.querySelector('[data-settings]'));
      const n = U.parseNum;
      if (n(f.weightKg)) S().weightKg = n(f.weightKg);
      if (n(f.hrEasyMax)) S().hrEasyMax = n(f.hrEasyMax);
      ['aerobic', 'rm', 'threshold', 'tenk', 'intervals'].forEach(k => { if (f['hr_' + k]) S().hrZones[k] = f['hr_' + k]; });
      S().hrZones.easy = '< ' + S().hrEasyMax;
      commit('Impostazioni salvate.');
    },
    setCustomObjective: () => {
      const t = U.parseDuration(document.querySelector('[name=customObj]').value);
      if (!t || t < 3600 || t > 9000) return toast('Tempo non valido: usa h:mm:ss, es. 1:43:00');
      D.setObjective(db(), 'X', t, 'Obiettivo personalizzato', state.today);
      commit('Obiettivo personalizzato: ' + U.fmtHM(t));
    },
    toggleNotifications: async () => {
      const N = S().notifications;
      N.enabled = !N.enabled;
      MM.store.save(db());
      const list = N.enabled ? D.upcomingNotifications(db(), new Date(), 14) : [];
      const r = await MM.store.scheduleNotifications(list);
      render();
      toast(N.enabled ? (typeof r === 'string' ? r : 'Promemoria attivi: la sera prima alle ' + N.hour + ':00.') : 'Promemoria disattivati.');
    },
    setNotifHour: async h => {
      S().notifications.hour = Number(h);
      MM.store.save(db());
      if (S().notifications.enabled) await MM.store.scheduleNotifications(D.upcomingNotifications(db(), new Date(), 14));
      render();
    },
    revealData: () => MM.store.revealData(),
    resetPlan: () => {
      if (!confirm('Ricaricare il piano originale (3 allenamenti a settimana)? Registro, test e palestra restano.')) return;
      db().plan = MM.planData.upgrade(db().plan, db().logs);
      S().weekOverrides = {};
      commit('Piano ricaricato.');
    }
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    e.preventDefault();
    const name = el.getAttribute('data-act');
    const raw = el.getAttribute('data-arg');
    const arg = raw == null ? undefined : JSON.parse(raw);
    if (actions[name]) actions[name](arg, el);
  });

  async function init() {
    MM.charts.initTooltip();
    let data = null;
    try { data = await MM.store.load(); } catch (e) { console.error(e); }
    if (!data || !D.validate(data)) {
      if (MM.config.edition === 'share') return showSetup();
      data = D.createInitial(state.today);
      await MM.store.save(data);
    }
    state.db = D.migrate(data);
    start();
  }

  // ---- Primo avvio (versione condivisa): profilo e test di riferimento ----
  function showSetup() {
    document.getElementById('side').innerHTML = '<div class="brand"><div class="logo">21,1</div><div><strong>Mezza Milano</strong><span>21 marzo 2027</span></div></div>';
    document.getElementById('main').innerHTML = '<div class="setup-bg"><h1>Benvenuto!</h1><p class="muted">Configura l\'app per calcolare i tuoi ritmi.</p></div>';
    const objOpts = ['A', 'B', 'C', 'Base'].map(id => { const o = P.objective(id); return '<option value="' + id + '">' + o.label + ' · ' + o.timeLabel + ' (' + U.fmtPace(o.pace) + '/km)</option>'; }).join('');
    openModal('<header><h3>Configura il tuo piano</h3><span class="muted">Piano di 24 settimane per la Mezza Maratona di Milano del 21 marzo 2027: 3 allenamenti a settimana (martedì corsa di qualità, giovedì lungo, sabato forza a corpo libero), tutte le corse in piano. ' +
      'Tutti i ritmi si calcolano dal tuo test: dati salvati solo su questo Mac.</span></header>' +
      '<div class="grid3">' + field('Nome (facoltativo)', 'name', '', { mode: 'text' }) + field('Peso (kg)', 'weightKg', '', { ph: 'es. 70' }) +
      field('FC massima nelle corse facili', 'hrEasyMax', '150', { mode: 'numeric' }) + '</div>' +
      '<div class="testbox"><strong>Il tuo riferimento</strong><span class="muted"> Un 5 km o un 10 km corso a tutta di recente (gara, parkrun o prova da solo).</span><div class="grid3">' +
      '<label class="field"><span>Distanza</span><select name="kind"><option value="5k">5 km</option><option value="10k">10 km</option></select></label>' +
      field('Tempo', 'time', '', { mode: 'text', ph: 'mm:ss' }) + field('Data (gg/mm/aaaa)', 'date', U.fmtDate(state.today), { mode: 'text' }) + '</div></div>' +
      '<div data-setupinfo class="note"></div>' +
      '<label class="field"><span>Obiettivo di gara</span><select name="objective">' + objOpts + '</select></label>' +
      '<p class="muted small">Non hai un test recente? Corri 5 km a tutta (dopo 15\' di riscaldamento) e poi configura l\'app. FC: se non la conosci lascia 150.</p>' +
      '<footer><span class="spacer"></span><button class="btn primary" data-act="finishSetup">Inizia</button></footer>', m => {
      const upd = () => {
        const f = readForm(m);
        const t = U.parseDuration(f.time);
        const box = m.querySelector('[data-setupinfo]');
        if (!t) { box.textContent = ''; return; }
        const p5 = P.p5FromTest(f.kind, t);
        const est = P.halfFromP5(p5);
        const sug = f.kind === '5k' ? R.proposeFrom5k(t) : R.proposeFrom10k(t);
        box.innerHTML = 'Riferimento: <strong>' + U.fmtPace(p5) + '/km</strong> sui 5 km · se corressi oggi la mezza: <strong>' + U.fmtHM(Math.round(est)) + '</strong>. Obiettivo consigliato: <strong>' + esc(P.objective(sug).label) + '</strong> (puoi alzarlo dopo i test del piano).';
        if (!m.dataset.touched) m.querySelector('[name=objective]').value = sug;
      };
      m.addEventListener('input', upd);
      m.querySelector('[name=objective]').addEventListener('change', () => { m.dataset.touched = '1'; });
    }, { locked: true });
  }

  function start() {
    render();
    if (S().notifications.enabled) MM.store.scheduleNotifications(D.upcomingNotifications(state.db, new Date(), 14));
    // Promemoria giornalieri: all'avvio rinnova i prossimi 14 giorni
    scheduleReminders(true);
    // Apple Intelligence: se disponibile scrive i commenti; poi completa quelli mancanti
    MM.store.ai.status().then(st => { state.ai = st || { available: false }; coachBackfill(); }).catch(() => coachBackfill());
    // Strava: stato del collegamento e sincronizzazione automatica all'avvio (al massimo ogni 30 minuti)
    if (MM.config.strava !== false) MM.store.strava.status().then(st => {
      state.strava = st || { available: false };
      render();
      const last = S().stravaLastSync ? Date.parse(S().stravaLastSync) : 0;
      if (state.strava.connected && Date.now() - last > 30 * 60000) actions.stravaSync(true);
      // corse già importate ma non ancora analizzate (ripetute, test)
      if (state.strava.connected) Object.keys(db().logs).filter(k => db().logs[k].stravaId && !db().logs[k].repsChecked && db().logs[k].date >= db().plan.firstMonday)
        .slice(0, 5).forEach(k => analyzeStreams(k));
    }).catch(() => {});
    // Mentre l'app è aperta: ricontrolla Strava ogni 30 minuti e quando torni sulla finestra
    const maybeSync = () => {
      const last = S().stravaLastSync ? Date.parse(S().stravaLastSync) : 0;
      if (state.strava.connected && Date.now() - last > 30 * 60000) actions.stravaSync(true);
    };
    setInterval(maybeSync, 5 * 60000);
    window.addEventListener('focus', maybeSync);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) maybeSync(); });
    // A mezzanotte (o al risveglio del Mac) aggiorna la giornata
    setInterval(() => { if (U.todayISO() !== state.today && !document.querySelector('.modal-back')) render(); }, 60000);
  }

  return { state, init, render, go, commit, toast, esc, attr, openModal, closeModal, readForm, field, scale,
    sessionHero, sessionKey, stepsHTML, logSummary, alertsHTML, coachHTML, typeBadge, typeClass, p5Now, p5For, objective, daysToRace, actions };
})();

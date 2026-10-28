/* Schermate: Oggi, Piano (settimana / tutte), Registro. */
var MM = globalThis.MM || (globalThis.MM = {});
MM.views = MM.views || {};

(function () {
  const U = MM.util, P = MM.paces, PL = MM.plan, R = MM.rules, A = MM.app;
  const esc = A.esc, attr = A.attr;

  function clampWeek(db, n) { return Math.max(db.plan.firstWeek, Math.min(PL.lastWeek(db.plan), n)); }

  function statCards(st) {
    const db = st.db, o = A.objective(), p5 = A.p5Now();
    const t = P.latestPaceTest(db.tests);
    const est = p5 ? P.halfFromP5(p5) : null;
    const d = A.daysToRace();
    const n = PL.weekOfDate(db.plan, st.today);
    let gap = '';
    if (est) {
      const diff = Math.round(est / P.HALF_KM - o.time / P.HALF_KM);
      gap = diff > 0 ? 'mancano ' + diff + '"/km all\'obiettivo' : diff < 0 ? 'più veloce dell\'obiettivo di ' + (-diff) + '"/km' : 'in linea con l\'obiettivo';
    }
    const next = PL.allWeeks(db).flatMap(w => w.sessions).find(s => s.type === 'test' && s.date >= st.today && !db.logs[s.id]);
    return '<div class="cards4">' +
      '<div class="card stat"><span class="lbl">Alla gara</span><span class="val">' + Math.max(0, d) + '<small> giorni</small></span><span class="sub">' +
        (n >= 2 && n <= 24 ? 'settimana ' + n + ' di 24 · ' + esc(PL.phaseOf(n).name) : 'domenica 21/03/2027') + '</span></div>' +
      '<div class="card stat"><span class="lbl">Obiettivo attivo</span><span class="val">' + esc(o.label === 'Personalizzato' ? 'Pers.' : o.label) + ' <small>' + esc(o.timeLabel) + '</small></span><span class="sub">' + U.fmtPace(o.pace) + '/km in gara</span></div>' +
      '<div class="card stat"><span class="lbl">Se corressi oggi</span><span class="val">' + (est ? U.fmtHM(est) : '–') + '</span><span class="sub">' + esc(gap) + '</span></div>' +
      '<div class="card stat"><span class="lbl">Riferimento P5</span><span class="val">' + (p5 ? U.fmtPace(p5) + '<small>/km</small>' : '–') + '</span><span class="sub">' +
        (t ? 'test del ' + U.fmtDate(t.date) : '') + (next ? ' · prossimo: ' + U.fmtDayMonth(next.date) : '') + '</span></div>' +
      '</div>';
  }

  function gymToday(db, n, week, date) {
    if (!week) return [];
    return MM.gym.sessionsForWeek(n, week.deload).filter(g => g.day === U.weekday(date));
  }

  function gymCard(g, date) {
    const log = MM.app.state.db.gym[date];
    const done = log && log.done;
    return '<div class="hero t-gym compact"><div class="hero-top">' + A.typeBadge('gym', 'Palestra') + '<span class="muted">' + esc(g.stage.label) + '</span></div>' +
      '<h2 class="hero-title">Seduta ' + g.kind + (g.kind === 'A' ? ' · forza' : ' · stabilità') + '</h2>' +
      '<p class="muted">' + g.exercises.map(e => esc(e.name) + ' ' + e.sets + '×' + esc(e.reps)).join(' · ') + '</p>' +
      '<div class="hero-actions">' + (done ? '<div class="logsum done">✓ Seduta fatta</div>' : '') +
      '<button class="btn primary" data-act="gymWeek" data-arg="' + attr(PL.weekOfDate(MM.app.state.db.plan, date)) + '">Apri la scheda</button></div></div>';
  }

  // Previsione per il 21 marzo con probabilità di ogni obiettivo
  function forecastCard(st, compact) {
    const f = MM.form.forecast(st.db, st.today);
    if (!f) return '';
    const S = st.db.settings;
    const ids = ['A', 'B', 'C', 'Base'].concat(S.customObjectiveSec ? ['X'] : []);
    const week = MM.form.forecast(st.db, U.addDays(st.today, -7));
    const dAct = week ? Math.round((f.probs[S.objective] - week.probs[S.objective]) * 100) : 0;
    let h = '<div class="card fc"><h3>Previsione per il 21 marzo</h3>' +
      '<div class="fc-time">' + U.fmtHM(Math.round(f.time / 5) * 5) + '<small>forchetta probabile ' + U.fmtHM(Math.round(f.range[0] / 60) * 60) + '–' + U.fmtHM(Math.round(f.range[1] / 60) * 60) + '</small></div>' +
      '<div class="fc-probs">' + ids.map(id => {
        const o = P.objective(id, S), p = Math.round(f.probs[id] * 100);
        return '<div class="fc-row' + (id === S.objective ? ' on' : '') + '"><span class="fc-lbl">' + esc(o.label === 'Personalizzato' ? 'Pers.' : o.label) + ' <small>' + esc(o.timeLabel) + '</small></span>' +
          '<span class="fc-bar"><i style="width:' + Math.max(2, p) + '%"></i></span><span class="fc-pct">' + p + '%</span></div>';
      }).join('') + '</div>' +
      '<p class="muted small">Forma stimata: P5 ' + U.fmtPace(f.est.p5) + '/km (test ' + U.fmtPace(f.est.anchor.p5) + ')' +
      (f.adherence != null ? ' · piano seguito ' + (f.adherence >= 1 ? 'al 100%' : 'al ' + Math.round(f.adherence * 100) + '%') + ' nelle ultime 4 settimane' : '') +
      (dAct ? ' · obiettivo ' + esc(P.objective(S.objective, S).label) + ' ' + (dAct > 0 ? '+' : '') + dAct + ' punti in 7 giorni' : '') + '.</p>';
    if (!compact) h += '<p class="muted small">Si aggiorna dopo ogni allenamento. È una stima: i test restano il riferimento.</p>';
    return h + '</div>';
  }
  MM.views.forecastCard = forecastCard;

  function checkinCard(st) {
    const h = st.db.health[st.today] || {};
    return '<div class="card" data-checkin><h3>Come stai oggi?</h3>' +
      '<div class="lbl-row">Dolore alle ginocchia (0 = nessuno)</div>' + A.scale('cknee', 0, 10, h.knee) +
      '<div class="lbl-row">Malessere</div><div class="seg">' +
      [['no', 'Sto bene'], ['above', 'Sopra il collo (naso, gola)'], ['below', 'Sotto il collo (febbre, petto, dolori)']].map(([v, l]) =>
        '<label><input type="radio" name="sick" value="' + v + '"' + ((h.sick || 'no') === v ? ' checked' : '') + '><span>' + l + '</span></label>').join('') +
      '</div><div class="row-end"><button class="btn primary" data-act="saveCheckin">Salva check-in</button></div></div>';
  }

  function nutritionHint(st, sessions) {
    const w = st.db.settings.weightKg || 67;
    const run = sessions.find(s => PL.isRun(s));
    if (!run) return '<div class="card tip"><strong>Nutrizione</strong> Proteine circa ' + Math.round(1.6 * w) + ' g oggi (1,6 g/kg), distribuite su 3–4 pasti.</div>';
    const dur = PL.estimateDuration(run, A.p5For(run.date), A.objective().time / P.HALF_KM);
    const hard = run.type === 'quality' || run.type === 'long' || run.type === 'test' || run.type === 'race';
    let t = 'Proteine circa ' + Math.round(1.6 * w) + ' g.';
    if (hard) t += ' Giornata di qualità/lungo: carboidrati ' + Math.round(5 * w) + '–' + Math.round(7 * w) + ' g (5–7 g/kg).';
    if (dur > 75 * 60) t += ' Corsa oltre i 75\': porta 30–60 g di carboidrati all\'ora (gel o bevanda).';
    return '<div class="card tip"><strong>Nutrizione</strong> ' + esc(t) + '</div>';
  }

  function upcoming(st) {
    const db = st.db;
    const items = [];
    for (let i = 1; i <= 3; i++) {
      const d = U.addDays(st.today, i);
      const n = PL.weekOfDate(db.plan, d);
      const wk = PL.effectiveWeek(db, n);
      const runs = PL.sessionsOnDate(db, d);
      const gyms = gymToday(db, n, wk, d);
      let txt = runs.map(s => '<span class="badge t-' + s.type + '">' + esc(PL.TYPE_LABEL[s.type]) + '</span> ' + esc(PL.title(s)) +
        (PL.isRun(s) ? ' <span class="muted">' + U.fmtKm(s.km) + ' km' + (A.sessionKey(s) && A.sessionKey(s).pace ? ' · ' + U.fmtPaceRange(A.sessionKey(s).pace) : '') + '</span>' : '')).join(' ');
      txt += gyms.map(g => ' <span class="badge t-gym">Palestra</span> Seduta ' + g.kind).join('');
      if (!txt) txt = '<span class="badge t-rest">Riposo</span>';
      items.push('<li><span class="day">' + esc(U.fmtDateLong(d)) + '</span><span>' + txt + '</span></li>');
    }
    return '<div class="card"><h3>Prossimi giorni</h3><ul class="upcoming">' + items.join('') + '</ul></div>';
  }

  // ---- OGGI ---------------------------------------------------------------------------
  MM.views.oggi = function (st) {
    const db = st.db, today = st.today;
    const n = PL.weekOfDate(db.plan, today);
    const week = PL.effectiveWeek(db, n);
    const sessions = PL.sessionsOnDate(db, today);
    const alerts = R.computeAlerts(db, today);

    // Ieri da registrare?
    const y = U.addDays(today, -1);
    PL.sessionsOnDate(db, y).filter(s => PL.isRun(s) && !db.logs[s.id] && s.date >= PL.startDate(db)).forEach(s => alerts.unshift({
      level: 'info', title: 'Ieri: ' + PL.title(s), text: 'Registra com\'è andata oppure segnalo come saltato (non si recupera).',
      actions: [{ label: 'Registra', cmd: 'openLog', arg: s.id, primary: true }, { label: 'Saltato', cmd: 'quickSkip', arg: s.id }]
    }));

    // Corse arrivate da Strava negli ultimi 7 giorni ancora senza RPE
    const toComplete = R.allRuns(db).filter(r => r.source === 'strava' && (r.rpe == null || r.rpe === '') &&
      r.date >= db.plan.firstMonday && U.daysBetween(r.date, today) >= 0 && U.daysBetween(r.date, today) <= 7);
    toComplete.slice(-3).reverse().forEach(r => alerts.unshift({
      level: 'info', title: 'Da Strava: ' + U.fmtKm(r.km) + ' km del ' + U.fmtDayMonth(r.date) + (r.planned ? ' · ' + PL.title(r.planned) : ''),
      text: 'Aggiungi RPE, dolore alle ginocchia e gambe pesanti: servono alle regole di sicurezza.',
      actions: [{ label: 'Completa', cmd: r.sessionId ? 'openLog' : 'openExtra', arg: r.sessionId || r.id, primary: true }]
    }));

    let h = '<header class="page-head"><div><h1>' + esc(U.fmtDateLong(today)) + '</h1><p class="muted">' + U.fmtDate(today) +
      (week ? ' · Settimana ' + n + ' · <span class="phase-pill" style="--ph:' + week.phase.color + '">' + esc(week.phase.name) + '</span>' + (week.deload ? ' <span class="badge soft">↓ scarico</span>' : '') : '') +
      '</p></div></header>';
    h += statCards(st);
    h += A.alertsHTML(alerts);

    if (today > db.plan.raceDate) {
      h += '<div class="hero t-race"><h2 class="hero-title">Il piano è concluso</h2><p>Registra la gara dalla settimana 24 del Piano e goditi il recupero: 1–2 settimane di sola corsa facile.</p></div>';
    } else if (!week) {
      const first = PL.effectiveWeek(db, db.plan.firstWeek);
      h += '<div class="hero t-rest"><h2 class="hero-title">Il piano inizia il ' + U.fmtDate(first.start) + '</h2></div>';
    } else {
      h += '<div class="today-grid"><div class="today-main">';
      const gyms = gymToday(db, n, week, today);
      if (!sessions.length && !gyms.length) {
        h += '<div class="hero t-rest"><div class="hero-top">' + A.typeBadge('rest') + '</div><h2 class="hero-title">Riposo</h2>' +
          '<p class="muted">Recupero completo: è qui che il corpo assorbe il lavoro. Una camminata va benissimo.</p></div>';
      }
      sessions.forEach(s => { h += A.sessionHero(s); });
      gyms.forEach(g => { h += gymCard(g, today); });
      h += '</div><div class="today-side">' + forecastCard(st, true) + checkinCard(st) + nutritionHint(st, sessions) + upcoming(st) + '</div></div>';
    }
    return h;
  };

  // ---- PIANO --------------------------------------------------------------------------
  function dayItems(db, week, date) {
    const n = week.n;
    const out = [];
    const gymDates = MM.gym.sessionsForWeek(n, week.deload).map(g => U.addDays(week.start, g.day - 1));
    MM.gym.sessionsForWeek(n, week.deload).filter(g => g.day === U.weekday(date))
      .concat(MM.gym.loggedOffPlan(db.gym, date, date, gymDates)).forEach(g => {
      const done = db.gym[date] && db.gym[date].done;
      out.push('<button class="item t-gym" data-act="gymWeek" data-arg="' + attr(n) + '"><span class="badge t-gym">Palestra</span><span class="it-title">Seduta ' + g.kind + '</span>' +
        '<span class="it-meta">' + g.exercises.length + ' esercizi</span>' + (done ? '<span class="st ok">✓</span>' : '') + '</button>');
    });
    week.sessions.filter(s => s.date === date).forEach(s => {
      const log = db.logs[s.id];
      const k = A.sessionKey(s);
      const status = log ? (log.status === 'done' ? '<span class="st ok">✓ ' + (log.km ? U.fmtKm(log.km) + ' km' : '') + '</span>' : '<span class="st no">✗ saltato</span>')
        : (date < MM.app.state.today && date >= PL.startDate(db) && PL.isRun(s) ? '<span class="st todo">da registrare</span>' : '');
      out.push('<button class="item ' + A.typeClass(s) + (s.adjusted ? ' adj' : '') + '" data-act="openDetail" data-arg="' + attr(s.id) + '">' +
        '<span class="badge t-' + s.type + '">' + esc(PL.TYPE_LABEL[s.type]) + '</span><span class="it-title">' + esc(PL.title(s)) + (s.optional ? ' <em>(facolt.)</em>' : '') + (s.moved ? ' <em title="Spostata">↔</em>' : '') + '</span>' +
        '<span class="it-meta">' + (PL.isRun(s) ? U.fmtKm(s.km) + ' km' : '') + (k && k.pace ? ' · <span class="nw">' + U.fmtPaceRange(k.pace) + '/km</span>' : '') + '</span>' + status + '</button>');
    });
    if (!out.length) out.push('<div class="item t-rest"><span class="badge t-rest">Riposo</span></div>');
    return out.join('');
  }

  function weekView(st, n) {
    const db = st.db;
    const w = PL.effectiveWeek(db, n);
    const planned = PL.plannedKm(w), actual = R.weekActualKm(db, w);
    let h = '<div class="weeknav"><button class="btn" data-act="weekNav" data-arg="' + attr(clampWeek(db, n - 1)) + '"' + (n <= db.plan.firstWeek ? ' disabled' : '') + '>◀</button>' +
      '<div class="wk-title"><h2>Settimana ' + n + '</h2><span class="muted">' + U.fmtDate(w.start) + ' – ' + U.fmtDate(w.end) + '</span></div>' +
      '<button class="btn" data-act="weekNav" data-arg="' + attr(clampWeek(db, n + 1)) + '"' + (n >= PL.lastWeek(db.plan) ? ' disabled' : '') + '>▶</button>' +
      '<span class="phase-pill" style="--ph:' + w.phase.color + '">' + esc(w.phase.name) + '</span>' + (w.deload ? '<span class="badge soft">↓ scarico / taper</span>' : '') +
      '<span class="spacer"></span><span class="kmline">Km: <strong>' + U.fmtKm(actual) + '</strong> fatti su ' + U.fmtKm(planned) + ' previsti</span></div>';
    if (w.note) h += '<div class="alert a-info"><div class="a-body"><strong>' + esc(w.note) + '</strong></div><div class="a-actions"><button class="btn sm" data-act="removeOverride" data-arg="' + attr(n) + '">Ripristina piano originale</button></div></div>';
    h += '<div class="week-days">';
    for (let d = 0; d < 7; d++) {
      const date = U.addDays(w.start, d);
      h += '<div class="wday' + (date === st.today ? ' today' : '') + '"><div class="wd-head"><strong>' + U.GIORNI_BREVI[d] + '</strong> <span>' + U.fmtDayMonth(date) + '</span></div>' + dayItems(db, w, date) + '</div>';
    }
    return h + '</div>';
  }

  function allView(st) {
    const db = st.db;
    const curN = PL.weekOfDate(db.plan, st.today);
    let h = '<div class="phase-legend">' + PL.PHASES.map(p => '<span><i style="background:' + p.color + '"></i>' + esc(p.name) + ' (' + p.from + '–' + p.to + ')</span>').join('') +
      '<span><i class="deload-i"></i>settimana di scarico / taper</span></div>';
    h += '<table class="plan-table"><thead><tr><th>Sett.</th><th>Date</th><th>Martedì</th><th>Giovedì</th><th>Sabato</th><th>Domenica</th><th class="num">Km prev.</th><th class="num">Km fatti</th></tr></thead><tbody>';
    PL.allWeeks(db).forEach(w => {
      // una colonna per giorno: corse del piano (anche quelle già registrate del vecchio piano) e forza
      const gym = MM.gym.sessionsForWeek(w.n, w.deload)[0];
      const gymDate = gym ? U.addDays(w.start, gym.day - 1) : null;
      const gymDone = gymDate && db.gym[gymDate] && db.gym[gymDate].done;
      const cell = d => '<td>' + (gym && gym.day === d ? '<span class="cell t-gym">Forza · seduta ' + esc(gym.kind) + (gymDone ? ' ✓' : '') + '</span> ' : '') +
        w.sessions.filter(s => s.slot === d).map(s => { const log = db.logs[s.id]; return '<span class="cell ' + A.typeClass(s) + '">' + esc(PL.title(s)) + (log ? (log.status === 'done' ? ' ✓' : ' ✗') : '') + '</span>'; }).join(' ') + '</td>';
      const actual = R.weekActualKm(db, w);
      h += '<tr class="' + (w.deload ? 'deload ' : '') + (w.n === curN ? 'current' : '') + '" data-act="goWeek" data-arg="' + attr(w.n) + '" style="--ph:' + w.phase.color + '">' +
        '<td class="wk"><span class="ph-bar"></span>' + w.n + (w.deload ? ' ↓' : '') + '</td><td class="muted">' + U.fmtDayMonth(w.start) + '–' + U.fmtDayMonth(w.end) + '</td>' +
        cell(2) + cell(4) + cell(6) + cell(7) +
        '<td class="num">' + U.fmtKm(PL.plannedKm(w)) + '</td><td class="num">' + (actual ? U.fmtKm(actual) : '') + '</td></tr>';
    });
    return h + '</tbody></table>';
  }

  MM.views.piano = function (st) {
    const db = st.db;
    const mode = st.params.mode || 'week';
    const n = clampWeek(db, st.params.n || PL.weekOfDate(db.plan, st.today));
    let h = '<header class="page-head"><div><h1>Piano di allenamento</h1><p class="muted">24 settimane · ritmi calcolati dal P5 attuale (' + U.fmtPace(A.p5Now()) + '/km)</p></div>' +
      '<div class="seg small">' + [['week', 'Settimana'], ['all', 'Tutte le settimane']].map(([m, l]) =>
        '<button class="' + (mode === m ? 'on' : '') + '" data-act="planMode" data-arg="' + attr(m) + '">' + l + '</button>').join('') + '</div></header>';
    h += mode === 'all' ? allView(st) : weekView(st, n);
    return h;
  };

  A.actions.openDetail = id => {
    const s = PL.findSession(MM.app.state.db, id);
    if (!s) return;
    A.openModal('<header><h3>' + esc(U.fmtDateLong(s.date)) + '</h3><span class="muted">' + U.fmtDate(s.date) + ' · settimana ' + s.week + '</span></header>' +
      A.sessionHero(s) + '<footer><span class="spacer"></span><button class="btn" data-act="closeModal">Chiudi</button></footer>');
  };

  // ---- REGISTRO -----------------------------------------------------------------------
  MM.views.registro = function (st) {
    const db = st.db;
    const rows = [];
    PL.allWeeks(db).forEach(w => w.sessions.forEach(s => {
      if (s.date > st.today || s.date < PL.startDate(db)) return;
      if (!PL.isRun(s) && !(s.original && PL.isRun(s.original)) && !db.logs[s.id]) return;
      rows.push({ date: s.date, kind: 'plan', s, log: db.logs[s.id] });
    }));
    db.extraRuns.forEach(r => rows.push({ date: r.date, kind: 'extra', r }));
    Object.keys(db.gym).forEach(d => { if (db.gym[d].done) rows.push({ date: d, kind: 'gym', g: db.gym[d] }); });
    rows.sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

    let h = '<header class="page-head"><div><h1>Registro allenamenti</h1><p class="muted">Tutte le sedute fino a oggi. Clicca per registrare o modificare.</p></div>' +
      '<div class="head-actions">' + (MM.config.strava === false ? '' : st.strava.connected ? '<button class="btn" data-act="stravaSync" data-arg="false">↻ Sincronizza Strava</button>' : '<button class="btn" data-act="importStrava">Importa CSV Strava</button>') +
      '<button class="btn primary" data-act="openExtra">+ Corsa fuori piano</button></div></header>';
    const todo = rows.filter(r => r.kind === 'plan' && !r.log && PL.isRun(r.s) && r.date < st.today).length;
    if (todo) h += '<div class="alert a-info"><div class="a-body"><strong>' + todo + (todo === 1 ? ' seduta passata da registrare' : ' sedute passate da registrare') + '</strong><span>Registrale o segnale come saltate: i grafici e le regole di sicurezza si basano su questi dati.</span></div></div>';
    h += '<div class="log-list">';
    rows.forEach(r => {
      if (r.kind === 'gym') {
        h += '<div class="log-row t-gym"><span class="ld">' + U.fmtDate(r.date) + '</span><span class="badge t-gym">Palestra</span><span class="lt">Seduta ' + esc(r.g.session || '') + '</span><span class="ls">✓ fatta</span>' +
          '<button class="btn sm" data-act="gymWeek" data-arg="' + attr(PL.weekOfDate(db.plan, r.date)) + '">Apri</button></div>';
      } else if (r.kind === 'extra') {
        const x = r.r;
        h += '<div class="log-row t-' + x.type + '"><span class="ld">' + U.fmtDate(x.date) + '</span><span class="badge t-' + x.type + '">' + esc(PL.TYPE_LABEL[x.type]) + '</span>' +
          '<span class="lt">Fuori piano' + (x.notes ? ' · <span class="muted">' + esc(x.notes) + '</span>' : '') + '</span><span class="ls">' + A.logSummary(Object.assign({ status: 'done' }, x), x) + '</span>' +
          '<button class="btn sm" data-act="openExtra" data-arg="' + attr(x.id) + '">Modifica</button>' +
          (x.coach ? '<div class="log-coach">' + (x.coach.by === 'ai' ? '✦ ' : '') + esc(x.coach.text) + '</div>' : '') + '</div>';
      } else {
        const s = r.s, log = r.log;
        h += '<div class="log-row ' + A.typeClass(s.original || s) + '"><span class="ld">' + U.fmtDate(s.date) + '</span><span class="badge t-' + (s.original || s).type + '">' + esc(PL.TYPE_LABEL[(s.original || s).type]) + '</span>' +
          '<span class="lt">' + esc(PL.title(s.original || s)) + '</span><span class="ls">' + (log ? A.logSummary(log, s.original || s) : '<span class="st todo">da registrare</span>') + '</span>' +
          '<button class="btn sm' + (log ? '' : ' primary') + '" data-act="openLog" data-arg="' + attr(s.id) + '">' + (log ? 'Modifica' : 'Registra') + '</button>' +
          (log && log.coach ? '<div class="log-coach">' + (log.coach.by === 'ai' ? '✦ ' : '') + esc(log.coach.text) + '</div>' : '') + '</div>';
      }
    });
    return h + '</div>';
  };
})();

/* Schermate: Test e obiettivo, Statistiche, Forza, Gara, Nutrizione, Impostazioni, anteprima Strava. */
var MM = globalThis.MM || (globalThis.MM = {});
MM.views = MM.views || {};

(function () {
  const U = MM.util, P = MM.paces, PL = MM.plan, R = MM.rules, A = MM.app, G = MM.gym;
  const esc = A.esc, attr = A.attr;
  const C1 = 'var(--series-1)', C_PLAN = 'var(--series-plan)', C2 = 'var(--series-2)';
  const KIND_LABEL = { '5k': 'Test 5 km', '10k': 'Test 10 km', bench20: "Benchmark 20' soglia", rmlong: 'Lungo con finale a RM', est: 'Forma stimata (confermata)' };

  // ---- TEST E OBIETTIVO ---------------------------------------------------------------
  function zonesTable(st) {
    const p5 = A.p5Now(), S = st.db.settings;
    const rows = ['easy', 'long', 'aerobic', 'rm', 'threshold', 'tenk', 'intervals', 'strides'].map(z => {
      const Z = P.ZONES[z];
      const hr = Z.hrKey === 'easy' ? '< ' + S.hrEasyMax : Z.hrKey ? S.hrZones[Z.hrKey] : '—';
      return '<tr><td><span class="zdot z-' + z + '"></span>' + esc(Z.name) + '</td><td class="num strong">' + U.fmtPaceRange(P.zoneRange(p5, z)) + '</td><td class="muted num">P5 ' +
        (Z.add[0] >= 0 ? '+' : '−') + Math.abs(Z.add[0]) + ' / ' + (Z.add[1] >= 0 ? '+' : '−') + Math.abs(Z.add[1]) + '"</td><td>' + esc(Z.rpe) + '</td><td>' + esc(hr) + '</td><td class="muted">' + esc(Z.feel) + '</td></tr>';
    }).join('');
    return '<div class="card"><h3>I tuoi ritmi attuali <span class="muted">(P5 = ' + U.fmtPace(p5) + '/km)</span></h3>' +
      '<table class="table"><thead><tr><th>Zona</th><th class="num">Ritmo /km</th><th class="num">Formula</th><th>RPE</th><th>FC</th><th>Sensazioni</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function estimateChart(db, width) {
    const tests = db.tests.filter(t => t.p5);
    if (!tests.length) return '<p class="muted">Nessun test ancora.</p>';
    return MM.charts.lines({
      title: 'Stima del tempo in mezza dai test',
      labels: tests.map(t => U.fmtDayMonth(t.date)),
      series: [{ name: 'Stima in mezza', values: tests.map(t => P.halfFromP5(t.p5)), color: C1 }],
      yFormat: v => U.fmtHM(Math.round(v / 60) * 60), invert: true, minSpan: 120, height: 220, width: width || 720,
      tip: i => U.fmtDate(tests[i].date) + ' · ' + KIND_LABEL[tests[i].kind] + ' ' + U.fmtDuration(tests[i].timeSec) + ' → stima ' + U.fmtHM(P.halfFromP5(tests[i].p5))
    });
  }

  MM.views.test = function (st) {
    const db = st.db, S = db.settings, cur = A.objective();
    const est = A.p5Now() ? P.halfFromP5(A.p5Now()) : null;
    let h = '<header class="page-head"><div><h1>Test e obiettivo</h1><p class="muted">Ogni test aggiorna P5 e tutti i ritmi futuri. L\'obiettivo cambia solo quando lo confermi tu.</p></div>' +
      '<div class="head-actions"><button class="btn primary" data-act="openTestModal">+ Registra un test</button></div></header>';
    h += A.alertsHTML(R.computeAlerts(db, st.today).filter(a => a.level === 'proposal'));

    h += '<div class="card"><h3>Obiettivo di gara</h3><div class="obj-grid">';
    ['A', 'B', 'C', 'Base'].forEach(id => {
      const o = P.objective(id, S);
      const on = S.objective === id;
      const reach = est && est <= o.time;
      h += '<button class="obj' + (on ? ' on' : '') + '" data-act="setObjective" data-arg="' + attr({ id }) + '"' + (on ? ' disabled' : '') + '>' +
        '<span class="o-lbl">' + esc(o.label) + '</span><span class="o-time">' + esc(o.timeLabel) + '</span><span class="o-pace">' + U.fmtPace(o.pace) + '/km</span>' +
        '<span class="o-note">' + (on ? 'attivo' : reach ? 'alla portata secondo la stima' : '') + '</span></button>';
    });
    const x = P.objective('X', S);
    h += '<div class="obj custom' + (S.objective === 'X' ? ' on' : '') + '"><span class="o-lbl">Personalizzato</span>' +
      '<input name="customObj" value="' + (S.customObjectiveSec ? U.fmtDuration(S.customObjectiveSec) : '') + '" placeholder="h:mm:ss" inputmode="text">' +
      '<span class="o-pace">' + (S.customObjectiveSec ? U.fmtPace(x.pace) + '/km' : 'per puntare sotto 1h45\'') + '</span>' +
      '<button class="btn sm" data-act="setCustomObjective">' + (S.objective === 'X' ? 'Aggiorna' : 'Imposta') + '</button></div>';
    h += '</div><p class="muted small">Stima attuale da Riegel (T2 = T1 × (D2/D1)^1,06): <strong>' + (est ? U.fmtHM(est) : '–') + '</strong> · obiettivo attivo <strong>' + esc(cur.label) + ' ' + esc(cur.timeLabel) + '</strong>. ' +
      'Il ritmo gara (RM) negli allenamenti segue P5, così si alza da solo man mano che migliori.</p></div>';

    h += zonesTable(st);
    h += formSection(st);

    h += '<div class="card"><h3>Andamento</h3>' + estimateChart(db) + '</div>';
    h += '<div class="card"><h3>Storico test</h3><table class="table"><thead><tr><th>Data</th><th>Tipo</th><th class="num">Risultato</th><th class="num">Ritmo</th><th class="num">FC</th><th class="num">P5</th><th>Obiettivo proposto</th><th></th></tr></thead><tbody>';
    db.tests.slice().reverse().forEach(t => {
      const res = t.kind === 'bench20' ? (t.distKm ? U.fmtKm(t.distKm, 2) + ' km' : '') : t.kind === 'rmlong' ? 'RPE ' + t.rpe : U.fmtDuration(t.timeSec);
      const prop = t.proposal ? P.objective(t.proposal.obj, { customObjectiveSec: t.proposal.customSec }) : null;
      const dec = t.decision === 'accepted' ? 'confermato' : t.decision === 'rejected' ? 'non accettato' : t.decision === 'baseline' ? 'riferimento iniziale' : 'da decidere';
      h += '<tr><td>' + U.fmtDate(t.date) + '</td><td>' + esc(KIND_LABEL[t.kind]) + '</td><td class="num">' + esc(res) + '</td><td class="num">' + (t.paceSec ? U.fmtPace(t.paceSec) : '') + '</td><td class="num">' + (t.hrAvg || '') + '</td>' +
        '<td class="num strong">' + (t.p5 ? U.fmtPace(t.p5) : '') + '</td><td>' + (prop ? esc(prop.label + ' (' + prop.timeLabel + ')') + ' <span class="muted">· ' + dec + '</span>' : '<span class="muted">' + dec + '</span>') + '</td>' +
        '<td>' + (t.decision === 'baseline' ? '' : '<button class="btn sm ghost" data-act="deleteTest" data-arg="' + attr(t.id) + '">Elimina</button>') + '</td></tr>';
    });
    h += '</tbody></table></div>';

    const upcoming = PL.allWeeks(db).flatMap(w => w.sessions).filter(s => (s.type === 'test' || s.check === 'rmlong') && s.date >= st.today);
    h += '<div class="grid2"><div class="card"><h3>Prossimi test nel piano</h3><ul class="plain">' + upcoming.map(s =>
      '<li><strong>' + U.fmtDate(s.date) + '</strong> · sett. ' + s.week + ' · ' + esc(PL.title(s)) + '</li>').join('') + '</ul>' +
      '<p class="muted small">Soglie: 5 km &lt; 24:00 → A · 24:00–24:45 → B · 24:45–26:00 → C · oltre → Base. 20\' soglia ≤ 5:00 → A · 5:01–5:15 → B · oltre → C. 10 km &lt; 47:30 → A · 47:30–49:30 → B · 49:30–51:30 → C · oltre → Base. Lungo RM: RPE ≤ 7 conferma.</p></div>' +
      '<div class="card"><h3>Storico obiettivo</h3><ul class="plain">' + db.objectiveHistory.slice().reverse().map(o =>
        '<li><strong>' + U.fmtDate(o.date) + '</strong> · ' + esc(P.objective(o.to, { customObjectiveSec: o.customSec }).label) + ' <span class="muted">' + esc(o.reason || '') + '</span></li>').join('') + '</ul></div></div>';
    return h;
  };

  // Forma stimata e previsione nel tempo
  function formSection(st) {
    const db = st.db, S = db.settings;
    const f = MM.form.forecast(db, st.today);
    if (!f) return '';
    const hist = MM.form.history(db, st.today);
    const o = P.objective(S.objective, S);
    let h = '<div class="grid2"><div>' + MM.views.forecastCard(st, false) +
      '<div class="card"><h3>Da cosa nasce la stima</h3><table class="table"><thead><tr><th>Fonte</th><th class="num">P5 indicato</th><th class="num">Peso</th></tr></thead><tbody>' +
      f.est.sources.map(x => '<tr><td>' + esc(x.label) + '</td><td class="num strong">' + U.fmtPace(x.p5) + '</td><td class="num">' + Math.round(x.w / f.est.sources.reduce((t, y) => t + y.w, 0) * 100) + '%</td></tr>').join('') +
      '</tbody></table><p class="muted small">Il test pesa meno col passare delle settimane; facili (ritmo a parità di FC) e ripetute (ritmo e RPE) aggiungono indizi. ' +
      'Miglioramento atteso da qui alla gara se segui il piano: ' + U.fmtKm(f.gain * 100) + '%.</p></div></div>';
    if (hist.length < 2) return h + '<div><div class="card"><h3>Andamento</h3><p class="muted">I grafici di previsione e probabilità si riempiono settimana dopo settimana: il primo punto è oggi, il prossimo arriva domenica.</p></div></div></div>';
    h += '<div><div class="card"><h3>Previsione in mezza, settimana per settimana</h3>' + MM.charts.lines({
      title: 'Previsione in mezza', labels: hist.map(x => U.fmtDayMonth(x.asOf)), width: 440,
      series: [{ name: 'Previsione', values: hist.map(x => x.time), color: C1 }],
      yFormat: v => U.fmtHM(Math.round(v / 60) * 60), invert: true, minSpan: 120,
      tip: i => U.fmtDate(hist[i].asOf) + ': ' + U.fmtHM(Math.round(hist[i].time)) + ' (P5 stimato ' + U.fmtPace(hist[i].est.p5) + ')'
    }) + '</div><div class="card"><h3>Probabilità obiettivo ' + esc(o.label) + ' (' + esc(o.timeLabel) + ')</h3>' + MM.charts.lines({
      title: 'Probabilità obiettivo', labels: hist.map(x => U.fmtDayMonth(x.asOf)), width: 440,
      series: [{ name: 'Probabilità', values: hist.map(x => Math.round(x.probs[S.objective] * 100)), color: C2 }],
      yFormat: v => Math.round(v) + '%', zeroBase: true, minSpan: 10,
      tip: i => U.fmtDate(hist[i].asOf) + ': ' + Math.round(hist[i].probs[S.objective] * 100) + '%'
    }) + '</div></div></div>';
    return h;
  }

  // ---- STATISTICHE -------------------------------------------------------------------
  MM.views.stats = function (st) {
    const db = st.db, S = db.settings;
    const weeks = PL.allWeeks(db);
    const runs = R.allRuns(db);
    const curN = PL.weekOfDate(db.plan, st.today);
    const totKm = runs.reduce((t, r) => t + (r.km || 0), 0);
    const logs = Object.values(db.logs);
    const done = logs.filter(l => l.status === 'done').length, skipped = logs.filter(l => l.status === 'skipped').length;
    let h = '<header class="page-head"><div><h1>Statistiche</h1><p class="muted">Passa il mouse sui grafici per i dettagli.</p></div></header>';
    h += '<div class="cards4"><div class="card stat"><span class="lbl">Km totali corsi</span><span class="val">' + U.fmtKm(totKm) + '</span><span class="sub">da ' + runs.length + ' corse registrate</span></div>' +
      '<div class="card stat"><span class="lbl">Sedute fatte</span><span class="val">' + done + '</span><span class="sub">' + skipped + ' saltate</span></div>' +
      '<div class="card stat"><span class="lbl">Lungo più lungo</span><span class="val">' + U.fmtKm(Math.max(0, ...runs.map(r => r.km || 0))) + '<small> km</small></span><span class="sub">obiettivo del piano: ' + U.fmtKm(Math.max(0, ...weeks.flatMap(w => w.sessions).filter(s => s.type === 'long').map(s => s.km))) + ' km</span></div>' +
      '<div class="card stat"><span class="lbl">Km piano completo</span><span class="val">' + U.fmtKm(weeks.reduce((t, w) => t + PL.plannedKm(w), 0)) + '</span><span class="sub">settimane 2–24</span></div></div>';

    // Km settimanali
    const actual = weeks.map(w => w.start <= st.today ? R.weekActualKm(db, w) : null);
    h += '<div class="card"><h3>Km settimanali: previsti e reali</h3>' + MM.charts.bars({
      title: 'Km settimanali', labels: weeks.map(w => String(w.n)),
      series: [{ name: 'Previsti', values: weeks.map(w => PL.plannedKm(w)), color: C_PLAN, outline: true }, { name: 'Reali', values: actual, color: C1 }],
      tip: i => 'Settimana ' + weeks[i].n + (weeks[i].deload ? ' (scarico)' : '') + ': previsti ' + U.fmtKm(PL.plannedKm(weeks[i])) + ' km' + (actual[i] != null ? ', reali ' + U.fmtKm(actual[i]) + ' km' : ''),
      height: 250
    }) + '</div>';

    // Ritmo facile a parità di FC
    const easy = runs.filter(r => (r.type === 'easy' || r.type === 'long') && r.hrAvg && r.km && r.timeSec);
    const ref = S.hrEasyMax || 150;
    h += '<div class="grid2"><div class="card"><h3>Ritmo facile a parità di FC</h3><p class="muted small">Ritmo riportato a ' + ref + ' bpm (ritmo × FC / ' + ref + '). Se la linea sale stai diventando più efficiente: stessa FC, più veloce.</p>' +
      (easy.length ? MM.charts.lines({
        title: 'Ritmo equivalente', labels: easy.map(r => U.fmtDayMonth(r.date)),
        series: [{ name: 'Ritmo a ' + ref + ' bpm', values: easy.map(r => r.timeSec / r.km * r.hrAvg / ref), color: C1 }],
        yFormat: v => U.fmtPace(v), invert: true, minSpan: 15, width: 440,
        tip: i => U.fmtDate(easy[i].date) + ': ' + U.fmtPace(easy[i].timeSec / easy[i].km) + '/km a FC ' + easy[i].hrAvg + ' → ' + U.fmtPace(easy[i].timeSec / easy[i].km * easy[i].hrAvg / ref) + ' a ' + ref
      }) : '<p class="muted">Registra FC, km e tempo delle corse facili per vedere il grafico.</p>') + '</div>';

    // Progressione del lungo
    const longPlanned = weeks.map(w => { const s = w.sessions.find(x => x.type === 'long' || x.type === 'race'); return s ? s.km : null; });
    const longDone = weeks.map(w => {
      if (w.start > st.today) return null;
      const km = runs.filter(r => r.date >= w.start && r.date <= w.end && (r.type === 'long' || r.type === 'race')).map(r => r.km || 0);
      return km.length ? Math.max(...km) : null;
    });
    h += '<div class="card"><h3>Progressione del lungo</h3>' + MM.charts.lines({
      title: 'Lungo settimanale', labels: weeks.map(w => String(w.n)),
      series: [{ name: 'Previsto', values: longPlanned, color: C_PLAN, dashed: true, noDots: true, connect: true }, { name: 'Fatto', values: longDone, color: C1 }],
      yFormat: v => U.fmtKm(v), zeroBase: true, width: 440,
      tip: (i, k) => 'Settimana ' + weeks[i].n + ': ' + (k === 0 ? 'previsto ' + U.fmtKm(longPlanned[i]) : 'fatto ' + U.fmtKm(longDone[i])) + ' km'
    }) + '</div></div>';

    // Cadenza
    h += cadenceCard(st);

    // Deriva cardiaca
    const drift = runs.filter(r => r.hr1 && r.hr2);
    h += '<div class="grid2"><div class="card"><h3>Deriva cardiaca nei lunghi</h3><p class="muted small">FC della seconda metà rispetto alla prima. Sotto il 5% = buona base aerobica.</p>' +
      (drift.length ? MM.charts.bars({
        title: 'Deriva cardiaca', labels: drift.map(r => U.fmtDayMonth(r.date)),
        series: [{ name: 'Deriva %', values: drift.map(r => Math.max(0.1, (r.hr2 - r.hr1) / r.hr1 * 100)), color: C2 }],
        yFormat: v => v + '%', height: 200, width: 440,
        tip: i => U.fmtDate(drift[i].date) + ': ' + drift[i].hr1 + ' → ' + drift[i].hr2 + ' bpm (' + U.fmtKm((drift[i].hr2 - drift[i].hr1) / drift[i].hr1 * 100) + '%)'
      }) : '<p class="muted">Inserisci FC della 1ª e 2ª metà nei lunghi per vedere la deriva.</p>') + '</div>';
    h += '<div class="card"><h3>Storico test</h3>' + estimateChart(db, 440) + '</div></div>';
    return h;
  };

  function cadenceCard(st) {
    const db = st.db, C = MM.cadence;
    const runs = C.easyRuns(db);
    const base = C.baseline(db), tgt = C.target(db);
    let h = '<div class="card"><h3>Cadenza nelle corse facili e nei lunghi</h3>' +
      '<p class="muted small">Passi al minuto. Con passi più corti e frequenti il piede atterra più vicino al corpo e la tibia assorbe meno impatto: è uno dei fattori più legati alla periostite. ' +
      'Si aumenta gradualmente, circa il 5% alla volta, solo nelle corse facili e senza correre più forte.</p>';
    if (runs.length) {
      h += MM.charts.lines({
        title: 'Cadenza', labels: runs.map(r => U.fmtDayMonth(r.date)),
        series: [{ name: 'Cadenza', values: runs.map(r => r.cadence), color: C1 }].concat(tgt ? [{ name: 'Obiettivo', values: runs.map(() => tgt), color: C_PLAN, dashed: true, noDots: true }] : []),
        yFormat: v => Math.round(v), minSpan: 8, height: 200,
        tip: (i, k) => k === 0 ? U.fmtDate(runs[i].date) + ': ' + runs[i].cadence + ' passi/min a ' + U.fmtPace(runs[i].timeSec / runs[i].km) + '/km' : 'Obiettivo ' + tgt
      });
    } else {
      h += '<p class="note">Ancora nessuna cadenza registrata. Strava non la riceve dal tuo Apple Watch, quindi inseriscila a mano quando registri la corsa: ' +
        'la trovi nell\'app <strong>Fitness</strong> sull\'iPhone (dettagli dell\'allenamento) o sul Watch durante la corsa (vista "Cadenza" dell\'app Allenamento).</p>';
    }
    h += '<div class="row cad-row"><span>' + (base ? 'Base: <strong>' + base + '</strong> passi/min' : 'Base: servono almeno 3 corse facili con la cadenza') + '</span>' +
      '<label class="field inline"><span>Obiettivo</span><input name="cadTarget" inputmode="numeric" style="width:70px" value="' + (tgt || '') + '" placeholder="auto"></label>' +
      '<button class="btn sm" data-act="saveCadenceTarget">Imposta</button>' + (db.settings.cadenceTarget ? '<button class="btn sm ghost" data-act="resetCadenceTarget">Automatico</button>' : '') + '</div></div>';
    return h;
  }

  // ---- FORZA ------------------------------------------------------------------------
  MM.views.forza = function (st) {
    const db = st.db;
    const n = Math.max(db.plan.firstWeek, Math.min(24, st.params.n || PL.weekOfDate(db.plan, st.today)));
    const w = PL.effectiveWeek(db, n);
    const planned = G.sessionsForWeek(n, w.deload);
    const sessions = planned.concat(G.loggedOffPlan(db.gym, w.start, w.end, planned.map(g => U.addDays(w.start, g.day - 1))));
    const stage = G.stage(n);
    let h = '<header class="page-head"><div><h1>Forza</h1><p class="muted">Tutto a corpo libero: servono solo un gradino, una sedia e un muro. Una seduta a settimana, il sabato (nella settimana di gara il giovedì): seduta A nelle settimane pari, seduta B nelle dispari. I dati si salvano mentre scrivi.</p></div></header>';
    h += '<div class="weeknav"><button class="btn" data-act="gymWeek" data-arg="' + attr(Math.max(2, n - 1)) + '"' + (n <= 2 ? ' disabled' : '') + '>◀</button>' +
      '<div class="wk-title"><h2>Settimana ' + n + '</h2><span class="muted">' + U.fmtDate(w.start) + ' – ' + U.fmtDate(w.end) + '</span></div>' +
      '<button class="btn" data-act="gymWeek" data-arg="' + attr(Math.min(24, n + 1)) + '"' + (n >= 24 ? ' disabled' : '') + '>▶</button>' +
      '<span class="badge t-gym">' + esc(stage.label) + '</span>' + (w.deload && stage.id !== 'half' ? '<span class="badge soft">↓ scarico: una serie in meno</span>' : '') + '</div>';
    h += '<p class="note">' + esc(stage.text) + (n >= 9 && stage.id !== 'half' && stage.id !== 'activation' ? ' Pliometria (pogo jump, skip) nella seduta B: contatti brevi e reattivi.' : '') + '</p>';
    h += '<div class="alert a-info shin"><div class="a-body"><strong>Polpacci e tibie</strong><span>Gli esercizi segnati <span class="badge calf">polpacci/tibie</span> rinforzano soleo, polpaccio, tibiale anteriore e piede: è la prevenzione più efficace per la periostite tibiale. ' +
      'Se però senti dolore puntiforme sull\'osso della tibia, che peggiora correndo o resta anche a riposo, non insistere: fermati e fatti vedere da un medico o fisioterapista (va esclusa una frattura da stress).</span></div></div>';
    if (!sessions.length) return h + '<div class="hero t-rest"><h2 class="hero-title">Settimana di gara: niente palestra</h2></div>';
    h += '<div class="grid2">';
    sessions.forEach(g => {
      const date = g.date || U.addDays(w.start, g.day - 1);
      const log = db.gym[date] || {};
      h += '<div class="card gym-card" data-gym="' + date + '" data-kind="' + g.kind + '"><div class="gym-head"><h3>Seduta ' + g.kind + ' · ' + esc(g.title) + '<span class="muted small"> · ' + esc(U.fmtDateLong(date)) + '</span></h3>' +
        '<label class="check big"><input type="checkbox" data-g="done"' + (log.done ? ' checked' : '') + '> Seduta fatta</label></div><table class="table gym"><thead><tr><th></th><th>Esercizio</th><th>Serie × rip.</th><th title="Ripetizioni o secondi per serie">Fatte</th><th>Ultima volta</th></tr></thead><tbody>';
      g.exercises.forEach(e => {
        const el = (log.ex && log.ex[e.id]) || {};
        const last = G.lastVal(db.gym, e.id, date);
        const unit = e.unit === 'sec' ? '"' : ' rip.';
        const cur = el.val != null ? el.val : el.kg;
        h += '<tr' + (e.plyo ? ' class="plyo"' : '') + '><td><input type="checkbox" data-ex="' + e.id + '" data-f="done"' + (el.done ? ' checked' : '') + '></td><td><button class="exbtn" data-act="openExercise" data-arg="' + attr({ id: e.id, sets: e.sets, reps: e.reps, date }) + '" title="Come si fa">' +
          '<span class="exthumb">' + MM.exercises.svg(e.id, { only: 'last' }) + '</span><span>' + esc(e.name) + (e.calf ? ' <span class="badge calf">polpacci/tibie</span>' : '') + '<small>come si fa ›</small></span></button></td><td class="num">' + e.sets + ' × ' + esc(e.reps) + '</td>' +
          '<td><input class="kg" data-ex="' + e.id + '" data-f="val" inputmode="numeric" placeholder="' + (e.unit === 'sec' ? 'sec' : 'rip') + '" value="' + esc(cur == null ? '' : cur) + '"></td>' +
          '<td class="muted small">' + (last ? last.val + unit + ' · ' + U.fmtDayMonth(last.date) : '') + '</td></tr>';
      });
      h += '</tbody></table><label class="field"><span>Note</span><input data-g="notes" value="' + esc(log.notes || '') + '"></label></div>';
    });
    return h + '</div>';
  };
  MM.views.forza.mount = function (main, st) {
    const handler = e => {
      const card = e.target.closest('[data-gym]');
      if (!card) return;
      const date = card.getAttribute('data-gym');
      const g = st.db.gym[date] || (st.db.gym[date] = { session: card.getAttribute('data-kind'), ex: {} });
      g.ex = g.ex || {};
      const t = e.target;
      if (t.getAttribute('data-g') === 'done') g.done = t.checked;
      else if (t.getAttribute('data-g') === 'notes') g.notes = t.value;
      else if (t.getAttribute('data-ex')) {
        const ex = g.ex[t.getAttribute('data-ex')] || (g.ex[t.getAttribute('data-ex')] = {});
        if (t.getAttribute('data-f') === 'done') ex.done = t.checked;
        else { ex.val = U.parseNum(t.value); delete ex.kg; }
      }
      // segna la seduta come fatta quando tutti gli esercizi sono spuntati
      const boxes = card.querySelectorAll('[data-f=done]');
      if (t.getAttribute('data-f') === 'done' && Array.from(boxes).every(b => b.checked) && !g.done) {
        g.done = true;
        card.querySelector('[data-g=done]').checked = true;
        A.toast('Seduta completata!');
      }
      MM.store.save(st.db);
    };
    main.addEventListener('change', handler);
    main.addEventListener('input', e => { if (e.target.matches('input.kg, [data-g=notes]')) handler(e); });
  };

  // Finestra con disegno e istruzioni dell'esercizio
  A.actions.openExercise = arg => {
    const ex = MM.exercises.info(arg.id);
    const meta = G.A.concat(G.B, G.PLYO).find(e => e.id === arg.id) || {};
    const last = G.lastVal(MM.app.state.db.gym, arg.id, U.addDays(arg.date, 1));
    A.openModal('<header><h3>' + esc(meta.name || arg.id) + '</h3><span class="muted">Questa settimana: ' + arg.sets + ' × ' + esc(arg.reps) +
      (last ? ' · ultima volta ' + last.val + (meta.unit === 'sec' ? '"' : ' rip.') + ' (' + U.fmtDayMonth(last.date) + ')' : '') + '</span></header>' +
      '<div class="exbig ph' + ex.phases.length + '">' + MM.exercises.svg(arg.id) + '</div>' +
      '<h4>Come si fa</h4><ol class="cues">' + ex.cues.map(c => '<li>' + esc(c) + '</li>').join('') + '</ol>' +
      '<p class="note"><strong>Perché ti serve:</strong> ' + esc(ex.why) + '</p>' +
      '<footer><span class="spacer"></span><button class="btn primary" data-act="closeModal">Chiudi</button></footer>');
  };

  // ---- GARA -------------------------------------------------------------------------
  MM.views.gara = function (st) {
    const db = st.db, S = db.settings;
    const id = st.params.obj || S.objective;
    const o = P.objective(id, S);
    const temp = st.params.temp != null ? st.params.temp : S.raceTempC;
    const s = MM.race.strategy(o.time, temp);
    const est = A.p5Now() ? P.halfFromP5(A.p5Now()) : null;
    let h = '<header class="page-head"><div><h1>Strategia di gara</h1><p class="muted">Domenica 21 marzo 2027 · Mezza Maratona di Milano · tra ' + Math.max(0, A.daysToRace()) + ' giorni</p></div></header>';
    h += '<div class="card"><div class="race-ctrl"><div class="seg small">' + ['A', 'B', 'C', 'Base'].concat(S.customObjectiveSec ? ['X'] : []).map(k => {
      const ok = P.objective(k, S);
      return '<button class="' + (k === id ? 'on' : '') + '" data-act="raceObj" data-arg="' + attr(k) + '">' + esc(ok.label === 'Personalizzato' ? 'Pers.' : ok.label) + ' ' + esc(U.fmtHM(ok.time)) + (k === S.objective ? ' ★' : '') + '</button>';
    }).join('') + '</div>' +
      '<label class="field inline"><span>Temperatura prevista</span><select data-temp>' + [[12, 'fino a 15 °C'], [18, '15–20 °C'], [22, 'oltre 20 °C']].map(([v, l]) =>
        '<option value="' + v + '"' + ((temp <= 15 && v === 12) || (temp > 15 && temp <= 20 && v === 18) || (temp > 20 && v === 22) ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label></div>' +
      '<div class="cards4 tight"><div class="stat"><span class="lbl">Obiettivo</span><span class="val">' + esc(o.timeLabel) + '</span><span class="sub">' + (id === S.objective ? 'obiettivo attivo' : 'simulazione') + '</span></div>' +
      '<div class="stat"><span class="lbl">Ritmo medio</span><span class="val">' + U.fmtPace(Math.floor(s.pace)) + '<small>/km</small></span><span class="sub">' + (s.heat[1] ? 'con correzione caldo +' + s.heat[0] + '–' + s.heat[1] + '"' : 'senza correzione caldo') + '</span></div>' +
      '<div class="stat"><span class="lbl">Arrivo previsto</span><span class="val">' + U.fmtDuration(s.finish) + '</span><span class="sub">' + (s.heat[1] ? 'il caldo costa ' + Math.round((s.finish - o.time) / 60) + ' min circa' : '') + '</span></div>' +
      '<div class="stat"><span class="lbl">Stima dai test</span><span class="val">' + (est ? U.fmtHM(est) : '–') + '</span><span class="sub">' + (est ? (est <= o.time ? 'obiettivo alla portata' : 'servono ' + Math.round(est / P.HALF_KM - o.time / P.HALF_KM) + '"/km in più') : '') + '</span></div></div></div>';

    h += '<div class="grid2"><div class="card"><h3>Piano di gara</h3><ol class="race-plan">' +
      '<li><span class="rk">Prima</span><span>Riscaldamento 10–12\' di corsa facile + 4 allunghi. Gel 10–15\' prima del via.</span></li>' +
      s.segments.map(g => '<li><span class="rk">km ' + U.fmtKm(g.from) + '–' + U.fmtKm(g.to) + '</span><span><strong>' + U.fmtPaceRange(g.pace) + '/km</strong> · ' + esc(g.text) + '</span></li>').join('') +
      '</ol><p class="muted small">Gel: 10–15\' prima del via, al km 7 e al km 14, con un sorso d\'acqua. Niente di nuovo il giorno della gara (scarpe, colazione, gel già provati nei lunghi).</p></div>';
    h += '<div class="card"><h3>Tempi di passaggio</h3><table class="table splits"><thead><tr><th>Km</th><th class="num">Passaggio</th><th class="num">Ritmo del tratto</th></tr></thead><tbody>' +
      s.splits.map((x, i) => {
        const prev = i ? s.splits[i - 1] : { km: 0, time: 0 };
        return '<tr><td>' + U.fmtKm(x.km) + '</td><td class="num strong">' + U.fmtDuration(x.time) + '</td><td class="num">' + U.fmtPace((x.time - prev.time) / (x.km === 21.1 ? P.HALF_KM - prev.km : x.km - prev.km)) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="muted small">Partendo a +6" nei primi 5 km, recuperi i ~30" tenendo circa 2" sotto il ritmo obiettivo dal km 5 in poi. Correzione caldo: sopra 15 °C +5–10"/km, sopra 20 °C +15–20"/km.</p></div></div>';
    return h;
  };
  MM.views.gara.mount = function (main, st) {
    const sel = main.querySelector('[data-temp]');
    if (sel) sel.addEventListener('change', () => {
      st.db.settings.raceTempC = Number(sel.value);
      MM.store.save(st.db);
      A.go('gara', Object.assign({}, st.params, { temp: Number(sel.value) }));
    });
  };

  // ---- NUTRIZIONE -----------------------------------------------------------------------
  MM.views.nutrizione = function (st) {
    const w = st.db.settings.weightKg || 67;
    const card = (t, big, txt) => '<div class="card nut"><h3>' + t + '</h3><div class="val">' + big + '</div><p>' + txt + '</p></div>';
    return '<header class="page-head"><div><h1>Nutrizione</h1><p class="muted">Promemoria sintetici calcolati su ' + U.fmtKm(w) + ' kg (modificabile nelle impostazioni).</p></div></header>' +
      '<div class="grid3 cards">' +
      card('Proteine ogni giorno', Math.round(1.6 * w) + ' g', 'Circa 1,6 g/kg, distribuite su 3–4 pasti (20–30 g ciascuno), una porzione entro 1–2 ore dagli allenamenti e dalla palestra.') +
      card('Carboidrati nei giorni duri', Math.round(5 * w) + '–' + Math.round(7 * w) + ' g', '5–7 g/kg nei giorni di qualità e di lungo. Nei giorni facili o di riposo puoi stare più bassi.') +
      card('Durante i lunghi', '30–60 g/h', 'Nei lunghi oltre 75–90\': gel o bevanda con carboidrati. Usa i lunghi per provare gli stessi gel della gara.') +
      card('Carico pre-gara', Math.round(8 * w) + '–' + Math.round(10 * w) + ' g', 'Nei 2 giorni prima della gara (19–20 marzo): carboidrati alti (circa 8–10 g/kg), pochi grassi e fibre, idratazione regolare.') +
      card('Colazione di gara', '2–3 h prima', 'Colazione già provata prima di un lungo: carboidrati facili (pane, marmellata, banana), poca fibra. Gel 10–15\' prima del via.') +
      card('Regola d\'oro', 'Niente di nuovo', 'Il giorno della gara solo cose già provate: cibo, gel, scarpe, abbigliamento.') +
      '</div>';
  };

  // ---- IMPOSTAZIONI -----------------------------------------------------------------------
  MM.views.impostazioni = function (st) {
    const db = st.db, S = db.settings;
    const ov = Object.keys(S.weekOverrides || {});
    const F = A.field;
    let h = '<header class="page-head"><div><h1>Impostazioni</h1></div></header>';
    h += '<div class="grid2"><div class="card" data-settings><h3>Profilo e frequenza cardiaca</h3><div class="grid3">' +
      F('Peso (kg)', 'weightKg', U.fmtKm(S.weightKg)) + F('FC max facili/lunghi', 'hrEasyMax', S.hrEasyMax, { mode: 'numeric' }) + '<div></div>' +
      F('FC aerobico', 'hr_aerobic', S.hrZones.aerobic, { mode: 'text' }) + F('FC ritmo gara', 'hr_rm', S.hrZones.rm, { mode: 'text' }) + F('FC soglia', 'hr_threshold', S.hrZones.threshold, { mode: 'text' }) +
      F('FC ritmo 10 km', 'hr_tenk', S.hrZones.tenk, { mode: 'text' }) + F('FC ripetute', 'hr_intervals', S.hrZones.intervals, { mode: 'text' }) + '</div>' +
      '<p class="muted small">Zone provvisorie (FC max stimata 180–185). Aggiornale se fai un test della FC massima.</p><div class="row-end"><button class="btn primary" data-act="saveSettings">Salva</button></div></div>';

    h += '<div class="card"><h3>Piano</h3>' +
      '<p class="muted small">3 allenamenti a settimana: martedì corsa di qualità, giovedì lungo, sabato forza. Tutte le corse in piano. Puoi spostare una corsa dentro la sua settimana dalla scheda della seduta.</p>' +
      '<h4>Adattamenti attivi</h4>' + (ov.length || S.kneeProtocol ? '<ul class="plain">' +
        ov.map(n => '<li>Settimana ' + n + ': ' + (S.weekOverrides[n].mode === 'repeat' ? 'ripete la ' + S.weekOverrides[n].from : 'scarico anticipato') + ' <button class="btn sm ghost" data-act="removeOverride" data-arg="' + attr(Number(n)) + '">Annulla</button></li>').join('') +
        (S.kneeProtocol ? '<li>Protocollo ginocchia fino al ' + U.fmtDate(S.kneeProtocol.until) + ' <button class="btn sm ghost" data-act="endKneeProtocol">Termina</button></li>' : '') + '</ul>' : '<p class="muted">Nessuno: stai seguendo il piano originale.</p>') +
      '<div class="row-end"><button class="btn sm ghost" data-act="resetDismissed">Mostra di nuovo gli avvisi nascosti</button><button class="btn sm ghost" data-act="resetPlan">Ricarica il piano originale</button></div></div></div>';

    const RM = S.reminders;
    h += '<div class="card rem-card"><h3>App Promemoria (anche su iPhone e Apple Watch)</h3>' +
      '<p class="muted small">Ogni giorno un promemoria con l\'allenamento da fare (ritmi, FC, palestra o riposo) nell\'elenco <strong>"Mezza Milano 2027"</strong> dell\'app Promemoria. ' +
      'Si sincronizza con iCloud, quindi suona anche sull\'iPhone e sul Watch, ed è sempre aggiornato con spostamenti e adattamenti. L\'app prepara i prossimi 14 giorni ogni volta che la apri.</p>' +
      '<div class="row"><button class="btn' + (RM.enabled ? '' : ' primary') + '" data-act="toggleReminders">' + (RM.enabled ? 'Disattiva' : 'Attiva promemoria giornalieri') + '</button>' +
      '<label class="field inline"><span>Quando</span><select data-rem-mode><option value="day"' + (!RM.eveBefore ? ' selected' : '') + '>la mattina del giorno</option><option value="eve"' + (RM.eveBefore ? ' selected' : '') + '>la sera prima</option></select></label>' +
      '<label class="field inline"><span>Ora</span><select data-rem-hour>' + [6, 7, 8, 9, 12, 18, 19, 20, 21, 22].map(x => '<option value="' + x + '"' + (x === RM.hour ? ' selected' : '') + '>' + x + ':00</option>').join('') + '</select></label>' +
      (RM.enabled ? '<button class="btn ghost" data-act="remindersNow">Aggiorna ora</button>' : '') + '</div>' +
      (RM.error ? '<div class="warnline">' + esc(RM.error) + '</div>' : RM.enabled && RM.lastSync ? '<p class="note ok">Attivo · ' + RM.lastCount + ' giorni preparati · ultimo aggiornamento ' + U.fmtDate(RM.lastSync.slice(0, 10)) + '</p>' : '') +
      (MM.store.native ? '' : '<p class="muted small">Disponibile solo nell\'app per Mac.</p>') + '</div>';
    h += '<div class="grid2"><div class="card"><h3>Notifiche del Mac</h3><p class="muted small">In alternativa: una notifica solo su questo Mac la sera prima di ogni allenamento.</p>' +
      '<div class="row"><button class="btn' + (S.notifications.enabled ? '' : ' primary') + '" data-act="toggleNotifications">' + (S.notifications.enabled ? 'Disattiva promemoria' : 'Attiva promemoria') + '</button>' +
      '<label class="field inline"><span>Orario</span><select data-notif-hour>' + [18, 19, 20, 21, 22].map(x => '<option' + (x === S.notifications.hour ? ' selected' : '') + ' value="' + x + '">' + x + ':00</option>').join('') + '</select></label></div>' +
      (MM.store.native ? '' : '<p class="muted small">Disponibili solo nell\'app per Mac.</p>') + '</div>';

    h += '<div class="card"><h3>Dati e backup</h3><p class="muted small">Cartella dati: <code data-datadir>…</code></p>' +
      '<div class="row"><button class="btn primary" data-act="exportBackup">Esporta backup</button><button class="btn" data-act="importBackup">Importa backup</button>' +
      (MM.store.native ? '<button class="btn ghost" data-act="revealData">Mostra nel Finder</button>' : '') + '</div>' +
      (MM.config.strava === false ? '</div></div>' : '') +
      (MM.config.strava === false ? '' : '<h4>Import da file</h4><p class="muted small">In alternativa al collegamento: export dell\'archivio Strava, file <code>activities.csv</code>.</p>' +
      '<button class="btn" data-act="importStrava">Importa activities.csv</button></div></div>');
    if (MM.config.strava !== false) h += stravaCard(st);
    h += '<div class="card"><h3>Coach AI</h3>' + (st.ai.available
      ? '<p>✦ Apple Intelligence attiva: commenta ogni allenamento direttamente sul Mac, gratis e senza inviare dati.</p>'
      : '<p>Apple Intelligence non attiva: i commenti sono generati dalle regole dell\'app.</p><p class="muted small">' + esc(st.ai.reason || '') + '</p>') + '</div>';
    return h;
  };
  function stravaCard(st) {
    const sv = st.strava || {};
    let h = '<div class="card strava-card"><h3>Collegamento Strava</h3>';
    if (!sv.available) return h + '<p class="muted small">Disponibile solo nell\'app per Mac.</p></div>';
    if (sv.connected) {
      const last = st.db.settings.stravaLastSync;
      return h + '<p>✓ Collegato' + (sv.athlete ? ' come <strong>' + esc(sv.athlete) + '</strong>' : '') + '. Le corse nuove si scaricano all\'apertura dell\'app' +
        (last ? ' · ultima sincronizzazione ' + U.fmtDate(last.slice(0, 10)) + ' ' + last.slice(11, 16) + ' UTC' : '') + '.</p>' +
        '<div class="row"><button class="btn primary" data-act="stravaSync" data-arg="false">↻ Sincronizza ora</button><button class="btn ghost" data-act="stravaDisconnect">Scollega</button></div></div>';
    }
    return h + '<ol class="guide"><li>Apri <strong>strava.com/settings/api</strong> e crea un\'applicazione (sito web: <code>http://localhost</code>, dominio di callback: <code>localhost</code>).</li>' +
      '<li>Copia qui sotto <strong>Client ID</strong> e <strong>Client Secret</strong>.</li><li>Premi <strong>Collega</strong>: si apre il browser, accedi e premi <strong>Autorizza</strong>.</li></ol>' +
      '<div class="grid3">' + A.field('Client ID', 'stravaId', sv.clientId || '', { mode: 'numeric', ph: 'es. 123456' }) +
      '<label class="field"><span>Client Secret</span><input name="stravaSecret" type="password" autocomplete="off" placeholder="40 caratteri"></label>' +
      '<div class="field"><span>&nbsp;</span><button class="btn primary" data-act="stravaConnect">Collega Strava</button></div></div>' +
      '<p class="muted small">Credenziali e accesso restano solo sul tuo Mac, in <code>app/data/strava.json</code>, e non finiscono nei backup esportati.</p></div>';
  }

  MM.views.impostazioni.mount = function (main, st) {
    MM.store.info().then(i => { const el = main.querySelector('[data-datadir]'); if (el) el.textContent = i.dataDir; });
    const remChange = () => {
      const R = st.db.settings.reminders;
      R.hour = Number(main.querySelector('[data-rem-hour]').value);
      R.eveBefore = main.querySelector('[data-rem-mode]').value === 'eve';
      A.commit(R.enabled ? 'Orario dei promemoria aggiornato.' : null);
    };
    main.querySelectorAll('[data-rem-hour],[data-rem-mode]').forEach(x => x.addEventListener('change', remChange));
    const sel = main.querySelector('[data-notif-hour]');
    if (sel) sel.addEventListener('change', () => A.actions.setNotifHour(sel.value));
  };

  // ---- Anteprima import Strava ---------------------------------------------------------
  MM.views.stravaPreview = function (rows) {
    MM.views._stravaRows = rows;
    const lbl = { match: 'abbina a', extra: 'fuori piano', already: 'giorno già registrato (aggiorna)', known: 'già importata' };
    let h = '<header><h3>Corse da Strava</h3><span class="muted">' + rows.length + (rows.length === 1 ? ' corsa nuova' : ' corse nuove') + '. Scegli quali importare: poi aggiungi RPE, ginocchia e sensazioni dal Registro.</span></header>' +
      '<div class="scroll"><table class="table"><thead><tr><th></th><th>Data</th><th>Nome</th><th class="num">Km</th><th class="num">Tempo</th><th class="num">Ritmo</th><th class="num">FC</th><th>Abbinamento</th></tr></thead><tbody>';
    rows.forEach((r, i) => {
      h += '<tr><td><input type="checkbox" data-srow="' + i + '"' + (r.status === 'match' || r.status === 'extra' ? ' checked' : '') + '></td><td>' + U.fmtDate(r.date) + '</td><td>' + esc(r.name) + '</td><td class="num">' + U.fmtKm(r.km, 2) + '</td>' +
        '<td class="num">' + U.fmtDuration(r.timeSec) + '</td><td class="num">' + (r.timeSec ? U.fmtPace(r.timeSec / r.km) : '') + '</td><td class="num">' + (r.hrAvg || '') + '</td>' +
        '<td>' + lbl[r.status] + (r.sessionTitle && r.status === 'match' ? ' <strong>' + esc(r.sessionTitle) + '</strong>' : '') + '</td></tr>';
    });
    h += '</tbody></table></div><footer><span class="spacer"></span><button class="btn" data-act="closeModal">Annulla</button><button class="btn primary" data-act="confirmStrava">Importa selezionate</button></footer>';
    A.openModal(h);
  };
})();

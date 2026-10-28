/* Piano: date, fasi, sedute "effettive" (con adattamenti) e descrizioni con ritmi calcolati. */
var MM = globalThis.MM || (globalThis.MM = {});

MM.plan = (function () {
  const U = MM.util, P = MM.paces;

  const PHASES = [
    { id: 'base', name: 'Ripresa e base', from: 1, to: 4, color: '#3fa7a0' },
    { id: 'volume', name: 'Volume aerobico', from: 5, to: 8, color: '#4c8fd6' },
    { id: 'soglia', name: 'Soglia', from: 9, to: 12, color: '#8a6fd1' },
    { id: 'specifica', name: 'Specifica', from: 13, to: 18, color: '#d9822b' },
    { id: 'picco', name: 'Picco', from: 19, to: 21, color: '#d6455d' },
    { id: 'taper', name: 'Taper e gara', from: 22, to: 24, color: '#2f9e5b' }
  ];
  function phaseOf(n) { return PHASES.find(p => n >= p.from && n <= p.to) || PHASES[0]; }

  const TYPE_LABEL = {
    easy: 'Facile', long: 'Lungo', quality: 'Qualità', test: 'Test', race: 'Gara', rest: 'Riposo', gym: 'Palestra'
  };
  const RUN_TYPES = ['easy', 'long', 'quality', 'test', 'race'];
  function isRun(s) { return s && RUN_TYPES.indexOf(s.type) >= 0 && s.km > 0; }

  function weekStart(plan, n) { return U.addDays(plan.firstMonday, (n - plan.firstWeek) * 7); }
  function weekOfDate(plan, iso) { return plan.firstWeek + Math.floor(U.daysBetween(plan.firstMonday, iso) / 7); }
  function lastWeek(plan) { return plan.weeks[plan.weeks.length - 1].n; }

  function sessionDay(s, settings) {
    return (settings && settings.satToWed && s.day === 6) ? 3 : s.day;
  }

  // ---- Varianti delle sedute -------------------------------------------------------------
  function asRest(s, reason) {
    return Object.assign({}, s, { type: 'rest', km: 0, segs: [], warmup: false, cooldown: false,
      testKind: null, check: null, original: s.original || s, adjusted: reason });
  }
  function asEasy(s, km, strides, reason) {
    const segs = [{ t: 'run', km, z: 'easy' }];
    if (strides) segs.push({ t: 'strides', n: strides });
    return Object.assign({}, s, { type: 'easy', km, segs, warmup: false, cooldown: false,
      testKind: null, check: null, original: s.original || s, adjusted: reason });
  }
  function asShortLong(s, factor, reason) {
    const km = U.roundHalf(s.km * factor);
    return Object.assign({}, s, { type: 'long', km, segs: [{ t: 'run', km, z: 'long' }], check: null,
      original: s.original || s, adjusted: reason });
  }
  // Settimana di scarico anticipata: -30% e niente qualità (solo allunghi)
  function deloadSession(s) {
    if (s.type === 'race' || s.type === 'rest') return s;
    if (s.type === 'quality' || s.type === 'test') return asEasy(s, U.roundHalf(s.km * 0.7), 6, 'Scarico anticipato: qualità sostituita da facile + allunghi');
    if (s.type === 'long') return asShortLong(s, 0.7, 'Scarico anticipato: lungo ridotto del 30%');
    return asEasy(s, U.roundHalf(s.km * 0.8), 0, 'Scarico anticipato: facile più corto');
  }

  // Applica protocollo ginocchia e malessere a una seduta datata
  function effectiveSession(db, s) {
    let out = s;
    if (!isRun(out) || out.type === 'race') return out;
    const kp = db.settings && db.settings.kneeProtocol;
    if (kp && out.date >= kp.from && out.date <= kp.until) {
      if (out.type === 'quality' || out.type === 'test') out = asEasy(out, Math.min(6, U.roundHalf(out.km * 0.7)), 0, 'Protocollo ginocchia: niente qualità, solo corsa facile e corta in piano');
      else if (out.legacy && out.type === 'easy') out = asRest(out, 'Protocollo ginocchia: seduta facile saltata');
      else if (out.type === 'long') out = asShortLong(out, 0.7, 'Protocollo ginocchia: lungo accorciato del 30%, tutto facile');
    }
    const h = db.health && db.health[out.date];
    if (h && isRun(out)) {
      if (h.sick === 'below') out = asRest(out, 'Malessere sotto il collo: oggi riposo');
      else if (h.sick === 'above') out = asEasy(out, Math.min(out.km, 5), 0, "Sintomi sopra il collo: solo corsa facile e breve (max 30')");
    }
    return out;
  }

  function effectiveWeek(db, n) {
    const plan = db.plan;
    const base = plan.weeks.find(w => w.n === n);
    if (!base) return null;
    const start = weekStart(plan, n);
    let sessions = base.sessions, deload = base.deload, note = null;
    const ov = db.settings && db.settings.weekOverrides && db.settings.weekOverrides[n];
    if (ov && ov.mode === 'repeat') {
      const src = plan.weeks.find(w => w.n === ov.from);
      if (src) {
        sessions = src.sessions.filter(s => !s.legacy).map(s => Object.assign({}, s, { id: 'w' + n + '-' + s.day, repeatedFrom: ov.from }));
        deload = src.deload;
        note = 'Ripete la settimana ' + ov.from + ' (settimana precedente saltata)';
      }
    }
    if (ov && ov.mode === 'deload') {
      sessions = sessions.map(deloadSession);
      deload = true;
      note = 'Scarico anticipato per fatica accumulata';
    }
    const end = U.addDays(start, 6);
    const moves = (db.settings && db.settings.moves) || {};
    const dated = sessions.map(s => {
      // slot = giorno previsto dal piano (2 mar = qualità, 4 gio = lungo, 7 dom = gara; forza in gym.js); la data può essere spostata dentro la settimana
      const planned = U.addDays(start, sessionDay(s, db.settings) - 1);
      const mv = moves[s.id];
      const date = mv && mv >= start && mv <= end ? mv : planned;
      return effectiveSession(db, Object.assign({}, s, { week: n, slot: s.day, day: U.weekday(date), date,
        plannedDate: planned, moved: date !== planned }));
    }).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.slot - b.slot);
    return { n, start, end, phase: phaseOf(n), deload, note, sessions: dated };
  }

  function allWeeks(db) { return db.plan.weeks.map(w => effectiveWeek(db, w.n)); }

  function sessionsOnDate(db, iso) {
    const n = weekOfDate(db.plan, iso);
    const w = effectiveWeek(db, n);
    return w ? w.sessions.filter(s => s.date === iso) : [];
  }
  function findSession(db, id) {
    const m = /^w(\d+)-/.exec(id || '');
    if (!m) return null;
    const w = effectiveWeek(db, Number(m[1]));
    return w ? w.sessions.find(s => s.id === id) || null : null;
  }

  // ---- Spostare una seduta dentro la sua settimana ------------------------------------------
  const HARD = ['quality', 'test', 'long', 'race'];
  // Nuove "mosse": se nel giorno scelto c'è un'altra corsa, le due sedute si scambiano
  function planMove(db, id, newDate) {
    const s = findSession(db, id);
    if (!s) return null;
    const w = effectiveWeek(db, s.week);
    if (newDate < w.start || newDate > w.end) return null;
    const moves = Object.assign({}, db.settings.moves || {});
    const other = w.sessions.find(x => x.id !== id && x.date === newDate && (isRun(x) || (x.original && isRun(x.original))));
    const set = (sess, date) => { if (date === sess.plannedDate) delete moves[sess.id]; else moves[sess.id] = date; };
    set(s, newDate);
    if (other) set(other, s.date);
    return { moves, swapWith: other || null };
  }
  // Avvisi su come resterebbe la settimana dopo lo spostamento
  function moveWarnings(db, id, newDate) {
    const plan = planMove(db, id, newDate);
    if (!plan) return ['Puoi spostare la seduta solo dentro la sua settimana.'];
    const sim = Object.assign({}, db, { settings: Object.assign({}, db.settings, { moves: plan.moves }) });
    const s = findSession(sim, id);
    const w = effectiveWeek(sim, s.week);
    const runs = w.sessions.filter(x => isRun(x));
    const out = [];
    const hard = x => HARD.indexOf(x.type) >= 0;
    runs.forEach((a, i) => {
      const b = runs[i + 1];
      if (b && U.daysBetween(a.date, b.date) === 1 && hard(a) && hard(b)) {
        out.push('Due sedute impegnative in giorni consecutivi (' + title(a) + ' ' + U.fmtDayMonth(a.date) + ' e ' + title(b) + ' ' + U.fmtDayMonth(b.date) + '): meglio tenerle separate da una facile o da un riposo.');
      }
    });
    // ultima corsa della settimana prima e prima della settimana dopo
    const prevW = effectiveWeek(sim, s.week - 1), nextW = effectiveWeek(sim, s.week + 1);
    const prevLast = prevW && prevW.sessions.filter(isRun).slice(-1)[0];
    const nextFirst = nextW && nextW.sessions.filter(isRun)[0];
    if (prevLast && runs[0] && U.daysBetween(prevLast.date, runs[0].date) === 1 && hard(prevLast) && hard(runs[0])) out.push('La prima seduta della settimana arriva il giorno dopo ' + title(prevLast) + '.');
    const last = runs[runs.length - 1];
    if (nextFirst && last && U.daysBetween(last.date, nextFirst.date) === 1 && hard(last) && hard(nextFirst)) out.push(title(last) + ' è il giorno prima di ' + title(nextFirst) + ' della settimana dopo.');
    // forza: meglio non nello stesso giorno o il giorno prima di una corsa impegnativa
    if (MM.gym) MM.gym.sessionsForWeek(s.week, w.deload).forEach(g => {
      const gd = U.addDays(w.start, g.day - 1);
      runs.filter(hard).forEach(x => {
        if (x.date === gd) out.push(title(x) + ' cade nel giorno della forza (' + U.fmtDayMonth(gd) + '): se puoi, corri prima e fai la forza qualche ora dopo, oppure scegli un altro giorno.');
        else if (U.daysBetween(gd, x.date) === 1) out.push(title(x) + ' arriva il giorno dopo la forza (' + U.fmtDayMonth(gd) + '): le gambe potrebbero essere ancora affaticate.');
      });
    });
    return out;
  }

  // Primo giorno di utilizzo (versione condivisa): le sedute precedenti non contano come saltate
  function startDate(db) { return (db.settings && db.settings.startDate) || '0000-00-00'; }

  function plannedKm(week) {
    return week.sessions.reduce((t, s) => t + (isRun(s) ? s.km : 0), 0);
  }

  // ---- Descrizioni ---------------------------------------------------------------------
  function segWhat(seg) {
    if (seg.sec != null) return U.fmtShort(seg.sec);
    if (seg.unit === 'm') return Math.round(seg.km * 1000) + ' m';
    return U.fmtKm(seg.km) + ' km';
  }
  function zoneLabel(z) { return P.ZONES[z] ? P.ZONES[z].short : z; }

  // Passi della seduta con ritmi calcolati da p5
  function steps(s, p5) {
    const out = [];
    const rng = z => P.zoneRange(p5, z);
    if (s.warmup) {
      out.push({ label: 'Riscaldamento', text: s.testKind === '10k' ? '2–3 km facili + 4 allunghi' : '2 km facili + 4 allunghi', zone: 'easy', pace: rng('easy') });
    }
    (s.segs || []).forEach(seg => {
      if (seg.t === 'run') {
        out.push({ label: zoneLabel(seg.z), text: U.fmtKm(seg.km) + ' km ' + zoneLabel(seg.z), zone: seg.z, pace: rng(seg.z), km: seg.km });
      } else if (seg.t === 'time') {
        out.push({ label: zoneLabel(seg.z), text: U.fmtShort(seg.sec) + ' continui a ' + zoneLabel(seg.z), zone: seg.z, pace: rng(seg.z) });
      } else if (seg.t === 'reps') {
        const rec = seg.recMode === 'down' ? 'recupero scendendo piano' : 'rec ' + U.fmtShort(seg.rec) + ' corricchiando piano';
        out.push({ label: zoneLabel(seg.z), text: seg.n + '×' + segWhat(seg) + ' ' + zoneLabel(seg.z) + ', ' + rec, zone: seg.z, pace: rng(seg.z) });
      } else if (seg.t === 'strides') {
        out.push({ label: 'Allunghi', text: seg.n + ' allunghi da 80–100 m, recupero ~1\' camminando', zone: 'strides', pace: rng('strides') });
      } else if (seg.t === 'test') {
        out.push({ label: 'Test', text: 'TEST ' + U.fmtKm(seg.km) + ' km a tutta, ritmo regolare', zone: 'test', pace: null });
      } else if (seg.t === 'race') {
        out.push({ label: 'Gara', text: 'Mezza maratona 21,1 km: vedi strategia nella sezione Gara', zone: 'race', pace: null });
      }
    });
    if (s.cooldown) out.push({ label: 'Defaticamento', text: '1–1,5 km facili', zone: 'easy', pace: rng('easy') });
    return out;
  }

  // Zona principale della seduta (quella da guardare "in 3 secondi")
  function mainZone(s) {
    if (s.type === 'test') return s.testKind === 'bench20' ? 'threshold' : 'test';
    if (s.type === 'race') return 'race';
    if (s.type === 'rest') return null;
    const order = ['intervals', 'tenk', 'hill', 'threshold', 'rm', 'aerobic', 'long', 'easy'];
    const zs = (s.segs || []).filter(g => g.z).map(g => g.z);
    for (const z of order) if (zs.indexOf(z) >= 0) return z;
    return s.type === 'long' ? 'long' : 'easy';
  }

  function title(s) {
    if (s.type === 'rest') return 'Riposo';
    if (s.type === 'race') return 'GARA · Mezza di Milano';
    if (s.type === 'test') {
      if (s.testKind === 'bench20') return "Benchmark 20' a soglia";
      return 'TEST ' + (s.testKind === '10k' ? '10' : '5') + ' km';
    }
    const strides = (s.segs || []).find(g => g.t === 'strides');
    if (s.type === 'easy') return 'Facile ' + U.fmtKm(s.km) + ' km' + (strides ? ' + ' + strides.n + ' allunghi' : '');
    if (s.type === 'long') {
      const fast = (s.segs || []).filter(g => g.z && g.z !== 'long' && g.z !== 'easy');
      return 'Lungo ' + U.fmtKm(s.km) + ' km' + (fast.length ? ' con ' + fast.map(g => U.fmtKm(g.km) + ' ' + zoneLabel(g.z)).join(' + ') : '');
    }
    const main = (s.segs || []).find(g => g.t === 'reps' || g.t === 'time' || (g.t === 'run' && g.z !== 'easy'));
    const pre = s.label ? s.label + ' · ' : '';
    if (!main) return pre + 'Qualità ' + U.fmtKm(s.km) + ' km';
    if (main.t === 'reps') return pre + main.n + '×' + segWhat(main) + ' ' + zoneLabel(main.z);
    if (main.t === 'run') return pre + U.fmtKm(main.km) + ' km ' + zoneLabel(main.z) + ' (' + U.fmtKm(s.km) + ' km tot.)';
    return pre + U.fmtShort(main.sec) + ' ' + zoneLabel(main.z);
  }

  // Stima della durata (s) usando il centro delle zone
  function estimateDuration(s, p5, objectivePace) {
    if (!isRun(s) || !p5) return 0;
    const mid = z => { const r = P.zoneRange(p5, z); return r ? (r.fast + r.slow) / 2 : p5 + 77; };
    if (s.type === 'race') return (objectivePace || P.halfFromP5(p5) / P.HALF_KM) * P.HALF_KM;
    let km = s.km, t = 0, counted = 0;
    (s.segs || []).forEach(seg => {
      if (seg.t === 'run') { t += seg.km * mid(seg.z); counted += seg.km; }
      else if (seg.t === 'test') { t += P.riegel(p5 * 5, 5, seg.km); counted += seg.km; }
      else if (seg.t === 'time') { t += seg.sec; counted += seg.sec / mid(seg.z); }
      else if (seg.t === 'reps') {
        if (seg.sec != null) { t += seg.n * seg.sec; counted += seg.n * seg.sec / (mid(seg.z) || p5); }
        else { t += seg.n * seg.km * mid(seg.z); counted += seg.n * seg.km; }
        t += (seg.n - 1) * (seg.rec || 0); counted += (seg.n - 1) * (seg.rec || 0) / (p5 + 150);
      }
    });
    const rest = Math.max(0, km - counted);
    return t + rest * mid('easy');
  }

  return {
    PHASES, TYPE_LABEL, RUN_TYPES, phaseOf, isRun, weekStart, weekOfDate, lastWeek,
    effectiveWeek, effectiveSession, allWeeks, sessionsOnDate, findSession, plannedKm, deloadSession, planMove, moveWarnings, startDate,
    steps, mainZone, title, estimateDuration, zoneLabel
  };
})();

/* Forma stimata dagli allenamenti, previsione per il giorno della gara e probabilità degli obiettivi.

   Idea: l'ultimo test resta l'ancora (P5), ma ogni allenamento aggiunge un indizio:
   - corse facili e lunghi: ritmo a parità di FC (efficienza aerobica) rispetto al periodo del test;
   - qualità: ritmo delle ripetute rispetto alla zona prevista, corretto con l'RPE;
   I pesi calano con l'età del dato. La stima è limitata a ±4–6% dal test: un test vero vale di più. */
var MM = globalThis.MM || (globalThis.MM = {});

MM.form = (function () {
  const U = MM.util, P = MM.paces, PL = MM.plan, R = MM.rules;
  const REF_HR = 150;
  // RPE "giusto" per zona: sopra significa che quel ritmo ti costa più del previsto
  const ZONE_RPE = { intervals: 9, tenk: 8, threshold: 7, rm: 7, aerobic: 6 };

  const median = a => { const s = a.slice().sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
  const zoneMid = z => { const Z = P.ZONES[z]; return Z && Z.add ? (Z.add[0] + Z.add[1]) / 2 : null; };

  // Ritmo riportato a FC 150 (s/km): più basso = più efficiente
  function eqPace(run, ref) {
    if (!run.km || run.km < 3 || !run.timeSec || !run.hrAvg || run.hrAvg < 110 || run.hrAvg > 180) return null;
    return (run.timeSec / run.km) * run.hrAvg / (ref || REF_HR);
  }

  // ---- Ripetute dai dati secondo per secondo (Strava streams) ---------------------------------
  // stream: { time:[s], distance:[m], heartrate:[bpm] } ; target: { n, sec } oppure { n, km }
  function detectReps(stream, target) {
    const t = stream && stream.time, d = stream && stream.distance;
    if (!t || !d || t.length < 20 || !target || !target.n) return null;
    const hr = stream.heartrate || null;
    const N = t.length;
    const cands = [];
    let j = 0;
    for (let i = 0; i < N; i++) {
      if (j < i) j = i;
      while (j < N - 1 && (target.sec ? t[j] - t[i] < target.sec : d[j] - d[i] < target.km * 1000)) j++;
      const dt = t[j] - t[i], dd = d[j] - d[i];
      if (dt <= 0 || (target.sec ? dt < target.sec * 0.9 : dd < target.km * 1000 * 0.95)) break;
      cands.push({ i, j, speed: dd / dt });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => b.speed - a.speed);
    const chosen = [];
    for (const c of cands) {
      if (chosen.length >= target.n) break;
      if (chosen.every(o => c.j < o.i || c.i > o.j)) chosen.push(c);
    }
    if (chosen.length < target.n) return null;
    chosen.sort((a, b) => a.i - b.i);
    // le ripetute devono essere chiaramente più veloci del resto della corsa
    const overall = (d[N - 1] - d[0]) / (t[N - 1] - t[0]);
    const avgSpeed = chosen.reduce((s, c) => s + c.speed, 0) / chosen.length;
    if (target.n > 1 && avgSpeed < overall * 1.05) return null;
    const reps = chosen.map(c => {
      let hrAvg = null;
      if (hr) { const seg = hr.slice(c.i, c.j + 1).filter(Boolean); hrAvg = seg.length ? Math.round(seg.reduce((a, b) => a + b, 0) / seg.length) : null; }
      return { sec: Math.round(t[c.j] - t[c.i]), km: Math.round((d[c.j] - d[c.i]) / 10) / 100, pace: Math.round(1000 / c.speed), hr: hrAvg };
    });
    const hrs = reps.map(r => r.hr).filter(Boolean);
    return { reps, avgPace: Math.round(1000 / avgSpeed), avgHr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null };
  }

  // Blocco principale di una seduta da cercare nei dati (ripetute, tratto a RM, test)
  function targetOf(s) {
    if (!s) return null;
    if (s.type === 'test' && (s.testKind === '5k' || s.testKind === '10k')) return { n: 1, km: s.testKind === '5k' ? 5 : 10, zone: 'test' };
    if (s.type === 'test' && s.testKind === 'bench20') return { n: 1, sec: 1200, zone: 'threshold' };
    const seg = (s.segs || []).find(g => g.t === 'reps' && g.z !== 'hill') ||
      (s.segs || []).find(g => g.t === 'run' && ['rm', 'aerobic', 'threshold', 'tenk'].indexOf(g.z) >= 0);
    if (!seg) return null;
    if (seg.t === 'reps') return seg.sec != null ? { n: seg.n, sec: seg.sec, zone: seg.z } : { n: seg.n, km: seg.km, zone: seg.z };
    return { n: 1, km: seg.km, zone: seg.z };
  }

  // ---- Stima della forma ------------------------------------------------------------------
  // asOf: data (inclusa) fino a cui usare i dati. exclude: id di log/corsa da ignorare (per il "prima/dopo")
  function estimate(db, asOf, exclude) {
    const tests = (db.tests || []).filter(t => t.date <= asOf);
    const anchor = P.latestPaceTest(tests);
    if (!anchor) return null;
    const runs = R.allRuns(db).filter(r => r.date <= asOf && (r.sessionId || r.id) !== exclude);
    const sources = [];
    const daysTest = U.daysBetween(anchor.date, asOf);
    sources.push({ kind: 'test', label: 'Test del ' + U.fmtDate(anchor.date), p5: anchor.p5, w: 2 * Math.exp(-daysTest / 35), date: anchor.date });

    // Efficienza nelle facili/lunghi: confronto col periodo del test
    const easy = runs.filter(r => (r.type === 'easy' || r.type === 'long') && eqPace(r) != null);
    const base = easy.filter(r => U.daysBetween(r.date, anchor.date) <= 21 && U.daysBetween(anchor.date, r.date) <= 7).map(eqPace);
    const cur = easy.filter(r => r.date > anchor.date && U.daysBetween(r.date, asOf) <= 21).slice(-4).map(eqPace);
    if (base.length && cur.length && U.daysBetween(anchor.date, asOf) >= 7) {
      const f = median(cur) / median(base);
      sources.push({ kind: 'easy', label: 'Efficienza nelle facili (' + cur.length + ' corse, ' + (f < 1 ? '−' : '+') + U.fmtKm(Math.abs(f - 1) * 100) + '% a parità di FC)',
        p5: anchor.p5 * (1 + 0.6 * (f - 1)), w: 0.5 * Math.min(1, cur.length / 3), date: asOf });
    }

    // Qualità: ritmo delle ripetute rispetto alla zona, corretto con l'RPE
    runs.filter(r => r.planned && r.repPace && U.daysBetween(r.date, asOf) <= 28).forEach(r => {
      const tg = targetOf(r.planned.original || r.planned);
      if (!tg || tg.zone === 'test' || !ZONE_RPE[tg.zone]) return;
      let p5 = r.repPace - zoneMid(tg.zone);
      const exp = ZONE_RPE[tg.zone];
      if (r.rpe != null && r.rpe !== '') {
        if (r.rpe > exp) p5 += 4 * (r.rpe - exp);
        else if (r.rpe < exp - 1) p5 -= 2 * (exp - 1 - r.rpe);
      }
      const age = U.daysBetween(r.date, asOf);
      sources.push({ kind: 'quality', label: PL.title(r.planned.original || r.planned) + ' del ' + U.fmtDayMonth(r.date) + ' a ' + U.fmtPace(r.repPace) + '/km' + (r.rpe ? ', RPE ' + r.rpe : ''),
        p5, w: 0.6 * (age <= 7 ? 1 : age <= 14 ? 0.6 : 0.35), date: r.date });
    });

    const W = sources.reduce((s, x) => s + x.w, 0);
    let p5 = sources.reduce((s, x) => s + x.w * x.p5, 0) / W;
    p5 = Math.max(anchor.p5 * 0.94, Math.min(anchor.p5 * 1.04, p5));
    return { p5, anchor, sources, daysSinceTest: daysTest };
  }

  // ---- Previsione al giorno della gara -------------------------------------------------------
  // Aderenza: km fatti / km previsti nelle ultime 4 settimane (sedute già passate)
  function adherence(db, asOf) {
    const from = [U.addDays(asOf, -28), PL.startDate(db)].sort()[1];
    let planned = 0;
    PL.allWeeks(db).forEach(w => w.sessions.forEach(s => {
      if (PL.isRun(s) && s.date >= from && s.date < asOf) planned += s.km;
    }));
    if (planned < 10) return null;
    const done = R.allRuns(db).filter(r => r.date >= from && r.date < asOf).reduce((t, r) => t + (r.km || 0), 0);
    return done / planned;
  }

  // Funzione di ripartizione normale (approssimazione di Abramowitz-Stegun)
  function phi(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
  }

  function forecast(db, asOf, exclude) {
    const est = estimate(db, asOf, exclude);
    if (!est) return null;
    const race = db.plan.raceDate;
    const weeksLeft = Math.max(0, U.daysBetween(asOf, race) / 7);
    const adh = adherence(db, asOf);
    const adhF = adh == null ? 1 : Math.max(0, Math.min(1, (adh - 0.3) / 0.6));
    // Miglioramento atteso da qui alla gara se segui il piano (rendimenti decrescenti)
    const gain = 0.08 * (0.4 + 0.6 * adhF) * (1 - Math.exp(-weeksLeft / 10));
    const p5Race = est.p5 * (1 - gain);
    const time = P.halfFromP5(p5Race);
    const sigma = (0.012 + 0.028 * Math.min(1, weeksLeft / 24) + (est.daysSinceTest > 42 ? 0.008 : 0)) * time;
    const S = db.settings;
    const ids = ['A', 'B', 'C', 'Base'].concat(S.customObjectiveSec ? ['X'] : []);
    const probs = {};
    ids.forEach(id => { probs[id] = phi((P.objective(id, S).time - time) / sigma); });
    return { asOf, est, adherence: adh, gain, p5Race, time, range: [time - sigma, time + sigma], sigma, probs, weeksLeft };
  }

  // Andamento settimana per settimana (calcolato ogni volta, nessun dato da salvare)
  function history(db, today) {
    const out = [];
    let d = U.addDays(db.plan.firstMonday, 6);
    while (d < today) { const f = forecast(db, d); if (f) out.push(f); d = U.addDays(d, 7); }
    const f = forecast(db, today);
    if (f) out.push(f);
    return out;
  }

  // Proposta di aggiornare i ritmi (solo con conferma): forma migliore del test di almeno 6"/km
  // e almeno una seduta di qualità recente a supporto
  function paceProposal(db, today) {
    const est = estimate(db, today);
    if (!est) return null;
    const hasQuality = est.sources.some(s => s.kind === 'quality' && U.daysBetween(s.date, today) <= 21);
    const p5 = Math.round(est.p5);
    if (hasQuality && p5 <= est.anchor.p5 - 6) return { p5, from: est.anchor.p5 };
    return null;
  }

  return { REF_HR, eqPace, detectReps, targetOf, estimate, adherence, phi, forecast, history, paceProposal };
})();

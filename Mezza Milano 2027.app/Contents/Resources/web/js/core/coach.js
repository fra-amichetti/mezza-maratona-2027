/* Valutazione di un allenamento: confronto previsto/fatto, punti chiave, effetto sulla previsione.
   Produce sia un commento "a regole" (sempre disponibile) sia il testo da dare ad Apple Intelligence,
   che deve solo riformulare questi fatti senza inventare numeri. */
var MM = globalThis.MM || (globalThis.MM = {});

MM.coach = (function () {
  const U = MM.util, P = MM.paces, PL = MM.plan, R = MM.rules, F = MM.form;
  const EXPECTED_RPE = { easy: [3, 4], long: [3, 5], aerobic: [5, 6], rm: [6, 7], threshold: [6, 7], tenk: [7, 8], intervals: [8, 9], test: [9, 10], race: [8, 10] };

  function findRun(db, ref) { return R.allRuns(db).find(r => (r.sessionId || r.id) === ref) || null; }

  function nextSession(db, date) {
    for (const w of PL.allWeeks(db)) for (const s of w.sessions) if (s.date > date && PL.isRun(s)) return s;
    return null;
  }

  // Firma dei dati che contano: se non cambia, il commento non va rigenerato
  function key(run) { return ['v3', run.cadence, run.km, run.timeSec, run.hrAvg, run.rpe, run.knee, run.heavy ? 1 : 0, run.repPace, run.testTimeSec].join('|'); }

  function analyze(db, ref) {
    const run = findRun(db, ref);
    if (!run) return null;
    const S = db.settings;
    const s = run.planned ? (run.planned.original || run.planned) : null;
    const type = s ? s.type : run.type;
    const p5 = P.p5ForDate(db.tests, run.date, run.date) || P.currentP5(db.tests);
    const zone = s ? PL.mainZone(s) : (type === 'long' ? 'long' : 'easy');
    const range = P.zoneRange(p5, zone);
    const pace = run.km && run.timeSec ? run.timeSec / run.km : null;
    const pts = [];
    let score = 0; // >0 bene, <0 attenzione

    // Test: conta il risultato, non la distanza totale (che include riscaldamento e defaticamento)
    if (type === 'test' && run.testTimeSec && s && (s.testKind === '5k' || s.testKind === '10k')) {
      const dist = s.testKind === '5k' ? 5 : 10;
      pts.push('Test ' + dist + ' km in ' + U.fmtDuration(run.testTimeSec) + ' (' + U.fmtPace(run.testTimeSec / dist) + '/km): P5 ' + U.fmtPace(P.p5FromTest(s.testKind, run.testTimeSec)) + '/km, su cui si calcolano i ritmi.');
      score += 1;
    }
    // Distanza
    if (s && s.km && run.km && type !== 'test' && type !== 'race') {
      const r = run.km / s.km;
      if (r < 0.85) { pts.push('Più corta del previsto: ' + U.fmtKm(run.km) + ' km su ' + U.fmtKm(s.km) + '.'); score -= 1; }
      else if (r > 1.15) { pts.push('Più lunga del previsto: ' + U.fmtKm(run.km) + ' km su ' + U.fmtKm(s.km) + '. Attenzione a non aumentare troppo il volume.'); score -= 1; }
      else pts.push('Distanza rispettata (' + U.fmtKm(run.km) + ' km).');
    }

    // Ritmo e FC nelle facili/lunghi
    if ((type === 'easy' || type === 'long') && pace && range) {
      if (pace < range.fast - 3 && run.hrAvg && run.hrAvg <= S.hrEasyMax) pts.push('Ritmo ' + U.fmtPace(pace) + '/km, più veloce della zona ' + U.fmtPaceRange(range) + ', ma con la FC sotto controllo: va bene, nelle facili conta la FC.');
      else if (pace < range.fast - 3) { pts.push('Ritmo ' + U.fmtPace(pace) + '/km: più veloce della zona ' + U.fmtPaceRange(range) + ' di ' + Math.round(range.fast - pace) + '".'); score -= 1; }
      else if (pace > range.slow + 10) pts.push('Ritmo ' + U.fmtPace(pace) + '/km, più lento della zona: va benissimo se la FC lo richiedeva.');
      else { pts.push('Ritmo ' + U.fmtPace(pace) + '/km dentro la zona facile ' + U.fmtPaceRange(range) + '.'); score += 1; }
      if (run.hrAvg) {
        if (run.hrAvg > S.hrEasyMax) { pts.push('FC media ' + run.hrAvg + ' sopra il limite di ' + S.hrEasyMax + ': troppo veloce per una corsa facile.'); score -= 2; }
        else { pts.push('FC media ' + run.hrAvg + ', sotto il limite di ' + S.hrEasyMax + '.'); score += 1; }
      }
      if (run.hr1 && run.hr2) {
        const drift = (run.hr2 - run.hr1) / run.hr1 * 100;
        pts.push('Deriva cardiaca ' + U.fmtKm(drift) + '%' + (drift < 5 ? ': buona base aerobica.' : ': alta, idratazione e ritmo iniziale più prudente.'));
        score += drift < 5 ? 1 : -1;
      }
      // Efficienza rispetto alle ultime facili
      const eq = F.eqPace(run);
      const prev = R.allRuns(db).filter(r => r.date < run.date && (r.type === 'easy' || r.type === 'long')).map(F.eqPace).filter(x => x != null).slice(-5);
      if (eq && prev.length >= 2) {
        const m = prev.slice().sort((a, b) => a - b)[Math.floor(prev.length / 2)];
        const d = (eq - m) / m * 100;
        if (Math.abs(d) >= 1.5) pts.push('A parità di FC sei ' + (d < 0 ? 'più veloce' : 'più lento') + ' del ' + U.fmtKm(Math.abs(d)) + '% rispetto alle ultime facili' + (d < 0 ? ': la base aerobica migliora.' : ' (stanchezza, caldo o poco sonno?).'));
        score += d < -1.5 ? 1 : d > 3 ? -1 : 0;
      }
    }

    // Cadenza (solo facili e lunghi)
    const cad = MM.cadence && MM.cadence.evaluate(db, run);
    if (cad) { pts.push(cad.text); score += cad.ok ? 0 : -1; }

    // Qualità: ripetute
    const tg = s ? F.targetOf(s) : null;
    if (tg && tg.zone !== 'test' && run.repPace) {
      const rr = P.zoneRange(p5, tg.zone);
      const lbl = P.ZONES[tg.zone].short;
      if (rr) {
        if (run.repPace < rr.fast - 4) { pts.push('Ripetute a ' + U.fmtPace(run.repPace) + '/km, più veloci della zona ' + lbl + ' (' + U.fmtPaceRange(rr) + '): segnale di forma, ma non esagerare.'); score += 1; }
        else if (run.repPace > rr.slow + 4) { pts.push('Ripetute a ' + U.fmtPace(run.repPace) + '/km, più lente della zona ' + lbl + ' (' + U.fmtPaceRange(rr) + ').'); score -= 1; }
        else { pts.push('Ripetute a ' + U.fmtPace(run.repPace) + '/km, dentro la zona ' + lbl + ' (' + U.fmtPaceRange(rr) + ').'); score += 1; }
      }
      if (run.reps && run.reps.length >= 3) {
        const ps = run.reps.map(x => x.pace);
        const spread = Math.max(...ps) - Math.min(...ps);
        const last = ps[ps.length - 1], first = ps[0];
        if (spread <= 6) { pts.push('Ripetute molto regolari (scarto ' + spread + '").'); score += 1; }
        else if (last - first > 6) { pts.push('Calo nelle ultime ripetute (+' + (last - first) + '"/km): parti un filo più piano la prossima volta.'); score -= 1; }
        else pts.push('Ripetute poco regolari (scarto ' + spread + '"): cerca un ritmo costante.');
      }
    }

    // Fatica, ginocchia
    const ezone = type === 'easy' || type === 'long' ? type : (tg ? tg.zone : zone);
    const exp = EXPECTED_RPE[ezone];
    if (run.rpe != null && run.rpe !== '' && exp) {
      if (run.rpe > exp[1] + 1) { pts.push('RPE ' + run.rpe + ', più alto del previsto (' + exp[0] + '–' + exp[1] + ').'); score -= 1; }
      else if (run.rpe <= exp[1]) pts.push('RPE ' + run.rpe + ', in linea con la seduta.');
    }
    if (run.heavy) { pts.push('Gambe pesanti segnalate.'); score -= 1; }
    if (run.knee != null && run.knee !== '' && Number(run.knee) > 0) {
      pts.push('Dolore alle ginocchia ' + run.knee + '/10.' + (run.knee >= 4 ? ' Valore alto: applica il protocollo ginocchia.' : ' Tienilo d\'occhio nei prossimi giorni.'));
      score -= run.knee >= 4 ? 3 : 1;
    }

    // Effetto sulla previsione (prima / dopo questo allenamento)
    const before = F.forecast(db, run.date, run.sessionId || run.id);
    const after = F.forecast(db, run.date);
    const obj = S.objective;
    let fc = null;
    if (before && after) {
      fc = { time: after.time, dTime: after.time - before.time, prob: after.probs[obj], dProb: (after.probs[obj] || 0) - (before.probs[obj] || 0), p5: after.est.p5 };
      if (Math.abs(fc.dTime) >= 5) pts.push('Previsione in mezza ' + (fc.dTime < 0 ? 'migliorata' : 'peggiorata') + ' di ' + Math.round(Math.abs(fc.dTime)) + '" (ora ' + U.fmtHM(Math.round(after.time)) + ').');
    }

    // Suggerimento per la prossima seduta
    const next = nextSession(db, run.date);
    let tip;
    if (run.knee >= 4) tip = 'Prima di correre ancora, segui il protocollo ginocchia proposto nella schermata Oggi.';
    else if ((type === 'easy' || type === 'long') && run.hrAvg > S.hrEasyMax) tip = 'Nella prossima facile parti più piano e guarda la FC, non il ritmo.';
    else if (run.heavy || (run.rpe && exp && run.rpe > exp[1] + 1)) tip = 'Recupera bene: sonno, carboidrati e la prossima facile davvero facile.';
    else tip = next ? 'Prossima seduta: ' + PL.title(next) + ' (' + U.fmtDateLong(next.date) + ').' : 'Continua così.';

    const verdict = score >= 2 ? 'ottimo' : score >= 0 ? 'bene' : 'attenzione';
    return { ref, run, title: s ? PL.title(s) : (type === 'long' ? 'Lungo' : 'Corsa') + ' fuori piano', type, verdict, points: pts, tip, forecast: fc, objective: P.objective(obj, S) };
  }

  const OPEN = { ottimo: 'Allenamento eseguito molto bene.', bene: 'Allenamento fatto bene nel complesso.', attenzione: 'Allenamento da tenere d\'occhio.' };

  function ruleComment(an) {
    const pts = an.points.slice(0, 3).join(' ');
    let fc = '';
    if (an.forecast && an.forecast.prob != null) fc = ' Probabilità di chiudere ' + an.objective.timeLabel + ': ' + Math.round(an.forecast.prob * 100) + '%.';
    return OPEN[an.verdict] + ' ' + pts + fc + ' ' + an.tip;
  }

  // Il modello sul Mac è piccolo: gli si chiede solo di riformulare una bozza già corretta,
  // poi si controlla che abbia tenuto i numeri e non si sia ripetuto (altrimenti si usa la bozza).
  const INSTRUCTIONS = 'Sei un allenatore di corsa. Riscrivi la bozza che ti viene data come un commento parlato al tuo atleta, in italiano, dandogli del tu. ' +
    'Regole: mantieni ESATTAMENTE tutti i numeri della bozza (ritmi, FC, percentuali, km, tempi); non aggiungere fatti, numeri o date che non ci sono; ' +
    'massimo 3 frasi; testo semplice senza grassetto, senza elenchi, senza titoli, senza saluti e senza nominare l\'atleta; non ripetere concetti. ' +
    'Termina con il consiglio per la prossima seduta presente nella bozza.';

  function aiPrompt(an) { return 'Bozza da riscrivere:\n' + ruleComment(an); }

  // Numeri "chiave" della bozza che devono restare nel testo dell'AI
  function keyNumbers(text) {
    return Array.from(new Set((text.match(/\d+:\d{2}(?::\d{2})?|\d+(?:,\d+)?%|\b\d{2,3}\b/g) || [])));
  }
  function cleanAi(text, draft) {
    let t = String(text || '').replace(/\*\*|__|^#+\s*/gm, '').replace(/^\s*[-•]\s+/gm, '').replace(/\s*\n+\s*/g, ' ').trim();
    if (!t || t.length > 700) return null;
    const sentences = t.split(/[.!?]+\s+/).map(x => x.toLowerCase().replace(/[^a-zàèéìòù ]/g, '').trim()).filter(Boolean);
    if (new Set(sentences).size < sentences.length) return null;                       // frasi ripetute
    const nums = keyNumbers(draft);
    const kept = nums.filter(n => t.indexOf(n) >= 0).length;
    if (nums.length && kept / nums.length < 0.7) return null;                           // ha perso i numeri
    const extra = keyNumbers(t).filter(n => nums.indexOf(n) < 0 && !/^20\d\d$/.test(n));
    if (extra.length > 1) return null;                                                   // ha inventato numeri
    return t;
  }

  return { analyze, ruleComment, aiPrompt, INSTRUCTIONS, key, findRun, cleanAi, keyNumbers };
})();

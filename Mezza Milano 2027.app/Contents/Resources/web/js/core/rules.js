/* Regole: proposta dell'obiettivo dopo i test, regole di sicurezza e avvisi automatici. */
var MM = globalThis.MM || (globalThis.MM = {});

MM.rules = (function () {
  const U = MM.util, P = MM.paces, PL = MM.plan;

  // ---- Proposta obiettivo dai test -------------------------------------------------------
  // Test 5 km: < 24:00 A · 24:00–24:45 B · 24:45–26:00 C · oltre Base
  function proposeFrom5k(sec) {
    if (sec < 1440) return 'A';
    if (sec <= 1485) return 'B';
    if (sec <= 1560) return 'C';
    return 'Base';
  }
  // Benchmark 20' a soglia (ritmo medio): ≤ 5:00 A · 5:01–5:15 B · oltre C
  function proposeFromBench(paceSec) {
    if (paceSec <= 300) return 'A';
    if (paceSec <= 315) return 'B';
    return 'C';
  }
  // Test 10 km: < 47:30 A · 47:30–49:30 B · 49:30–51:30 C · oltre Base
  function proposeFrom10k(sec) {
    if (sec < 2850) return 'A';
    if (sec <= 2970) return 'B';
    if (sec <= 3090) return 'C';
    return 'Base';
  }
  // Lungo con finale a RM (prova generale, sett. 21): RPE ≤ 7 conferma, altrimenti un livello sotto
  function proposeFromRmLong(rpe, current) {
    return rpe != null && rpe <= 7 ? current : P.levelDown(current);
  }

  // Se un test indica una mezza ben sotto 1h45', propone un obiettivo personalizzato più ambizioso
  function customFromEstimate(estSec) {
    return Math.ceil(estSec / 60) * 60;
  }

  function proposeForTest(test, currentObjective) {
    let obj, reason, customSec = null;
    if (test.kind === '5k' || test.kind === '10k') {
      obj = test.kind === '5k' ? proposeFrom5k(test.timeSec) : proposeFrom10k(test.timeSec);
      const est = P.halfFromP5(test.p5);
      reason = 'Test ' + (test.kind === '5k' ? '5' : '10') + ' km in ' + U.fmtDuration(test.timeSec) +
        ': stima in mezza ' + U.fmtHM(est) + '.';
      if (obj === 'A' && est < 6300 - 60) {
        obj = 'X';
        customSec = customFromEstimate(est);
        reason += ' Sei oltre la soglia dell\'obiettivo A: puoi puntare a ' + U.fmtHM(customSec) + '.';
      }
    } else if (test.kind === 'bench20') {
      obj = proposeFromBench(test.paceSec);
      reason = "Benchmark 20' a soglia a " + U.fmtPace(test.paceSec) + '/km.';
    } else if (test.kind === 'rmlong') {
      obj = proposeFromRmLong(test.rpe, currentObjective);
      reason = 'Tratto a ritmo gara del lungo con RPE ' + test.rpe + (obj === currentObjective ? ': obiettivo confermato.' : ': troppo faticoso, meglio scendere di un livello.');
    }
    return { obj, customSec, reason };
  }

  // ---- Corse registrate ------------------------------------------------------------------
  // Tutte le corse fatte (da piano + extra), normalizzate
  function allRuns(db) {
    const out = [];
    Object.keys(db.logs || {}).forEach(id => {
      const l = db.logs[id];
      if (l.status !== 'done') return;
      const s = PL.findSession(db, id);
      out.push(Object.assign({ sessionId: id, type: s ? s.type : 'easy', planned: s }, l));
    });
    (db.extraRuns || []).forEach(r => out.push(Object.assign({ sessionId: null, type: r.type || 'easy' }, r)));
    return out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  }
  function pace(run) { return run.km && run.timeSec ? run.timeSec / run.km : null; }

  function weekActualKm(db, week) {
    return allRuns(db).filter(r => r.date >= week.start && r.date <= week.end)
      .reduce((t, r) => t + (r.km || 0), 0);
  }

  // ---- Regole di sicurezza --------------------------------------------------------------
  function weeklyIncrease(prevKm, curKm) {
    if (!prevKm) return { pct: null, alert: false };
    const pct = (curKm - prevKm) / prevKm * 100;
    return { pct, alert: pct > 15 };
  }

  function hrTooHigh(type, hrAvg, limit) {
    return (type === 'easy' || type === 'long') && hrAvg != null && hrAvg > (limit || 150);
  }

  // Dolore alle ginocchia: entries = [{date, pain}] (check-in e registro)
  function kneeEntries(db) {
    const map = {};
    Object.keys(db.health || {}).forEach(d => {
      const k = db.health[d].knee;
      if (k != null && k !== '') map[d] = Math.max(map[d] == null ? 0 : map[d], Number(k));
    });
    Object.keys(db.logs || {}).forEach(id => {
      const l = db.logs[id];
      if (l.knee != null && l.knee !== '' && l.date) map[l.date] = Math.max(map[l.date] == null ? 0 : map[l.date], Number(l.knee));
    });
    (db.extraRuns || []).forEach(r => {
      if (r.knee != null && r.knee !== '') map[r.date] = Math.max(map[r.date] == null ? 0 : map[r.date], Number(r.knee));
    });
    return Object.keys(map).sort().map(d => ({ date: d, pain: map[d] }));
  }

  // L'episodio di dolore inizia col primo valore > 0 dopo l'ultimo 0 e dura finché non registri 0.
  function kneeStatus(entries, today) {
    const list = entries.filter(e => e.date <= today);
    if (!list.length) return { active: false };
    let i = list.length - 1;
    if (list[i].pain === 0) return { active: false, latest: 0 };
    while (i > 0 && list[i - 1].pain > 0) i--;
    const start = list[i].date;
    const last = list[list.length - 1];
    const days = U.daysBetween(start, today) + 1;
    const stale = U.daysBetween(last.date, today) > 3;
    const maxPain = Math.max.apply(null, list.slice(i).map(e => e.pain));
    return {
      active: true, start, days, latest: last.pain, lastDate: last.date, maxPain, stale,
      protocol: last.pain >= 4 || days > 2,
      physio: days > 7
    };
  }

  // Fatica: RPE medio alto (≥ 6,5) e gambe pesanti in almeno 2 corse
  function weekFatigue(runs) {
    const withRpe = runs.filter(r => r.rpe != null && r.rpe !== '');
    const avgRpe = withRpe.length ? withRpe.reduce((t, r) => t + Number(r.rpe), 0) / withRpe.length : null;
    const heavy = runs.filter(r => r.heavy).length;
    return { avgRpe, heavy, high: avgRpe != null && avgRpe >= 6.5 && heavy >= 2 };
  }

  // ---- Avvisi --------------------------------------------------------------------------
  function computeAlerts(db, today) {
    const alerts = [];
    const S = db.settings;
    const dismissed = S.dismissed || {};
    const plan = db.plan;
    const n = PL.weekOfDate(plan, today);
    const runs = allRuns(db);
    const add = a => { if (!a.key || !dismissed[a.key]) alerts.push(a); };

    // Proposte di obiettivo in attesa
    (db.tests || []).filter(t => t.proposal && !t.decision).forEach(t => {
      const cur = P.objective(S.objective, S);
      const prop = P.objective(t.proposal.obj, { customObjectiveSec: t.proposal.customSec || S.customObjectiveSec });
      const same = t.proposal.obj === S.objective && (t.proposal.obj !== 'X' || t.proposal.customSec === S.customObjectiveSec);
      add({
        level: 'proposal', title: same ? 'Obiettivo confermato dal test' : 'Nuovo obiettivo proposto: ' + prop.label + ' (' + prop.timeLabel + ')',
        text: t.proposal.reason + (same ? '' : ' Obiettivo attuale: ' + cur.label + ' (' + cur.timeLabel + ').'),
        actions: same ? [{ label: 'Ok', cmd: 'acceptProposal', arg: t.id }]
          : [{ label: 'Conferma ' + prop.label, cmd: 'acceptProposal', arg: t.id, primary: true },
             { label: 'Mantieni ' + cur.label, cmd: 'rejectProposal', arg: t.id }]
      });
    });

    // Ginocchia
    const ks = kneeStatus(kneeEntries(db), today);
    if (ks.active) {
      if (ks.stale) {
        add({ level: 'info', key: 'knee-stale-' + ks.lastDate, title: 'Come vanno le ginocchia?',
          text: 'L\'ultimo dolore registrato (' + ks.latest + '/10) è del ' + U.fmtDate(ks.lastDate) + '. Aggiorna il check-in di oggi: segna 0 se è passato.' });
      } else if (ks.physio) {
        add({ level: 'danger', title: 'Dolore alle ginocchia da ' + ks.days + ' giorni',
          text: 'Il dolore dura da più di una settimana: prenota un fisioterapista prima di riprendere la qualità.' +
            (S.kneeProtocol ? '' : ' Nel frattempo applica il protocollo ginocchia.'),
          actions: S.kneeProtocol ? [] : [{ label: 'Protocollo 2 settimane', cmd: 'kneeProtocol', arg: 14, primary: true }] });
      } else if (ks.protocol && !(S.kneeProtocol && S.kneeProtocol.until >= today)) {
        add({ level: 'warn', title: 'Ginocchia: ' + (ks.latest >= 4 ? 'dolore ' + ks.latest + '/10' : 'dolore da ' + ks.days + ' giorni'),
          text: 'Per 1–2 settimane niente qualità (il martedì solo corsa facile e corta) e lungo accorciato del 30%. Se dura oltre 7–10 giorni, fisioterapista.',
          actions: [{ label: 'Applica 1 settimana', cmd: 'kneeProtocol', arg: 7, primary: true }, { label: '2 settimane', cmd: 'kneeProtocol', arg: 14 }] });
      }
    }
    if (S.kneeProtocol && S.kneeProtocol.until >= today) {
      add({ level: 'info', title: 'Protocollo ginocchia attivo fino al ' + U.fmtDate(S.kneeProtocol.until),
        text: 'Niente qualità (martedì facile e corto), lungo -30%. Il piano mostrato è già adattato.',
        actions: [{ label: 'Termina ora', cmd: 'endKneeProtocol' }] });
    }

    // Malessere di oggi
    const h = db.health && db.health[today];
    if (h && h.sick === 'below') add({ level: 'danger', title: 'Malessere sotto il collo', text: 'Febbre, tosse di petto o dolori diffusi: oggi riposo completo. Riprendi solo quando stai bene da almeno un giorno.' });
    if (h && h.sick === 'above') add({ level: 'warn', title: 'Sintomi sopra il collo', text: "Naso chiuso o mal di gola: solo corsa facile e breve (max 30'), niente qualità." });

    // Aumento dei km settimanali
    const week = PL.effectiveWeek(db, n);
    if (week) {
      const prev = PL.effectiveWeek(db, n - 1), prev2 = PL.effectiveWeek(db, n - 2);
      let ref = prev ? weekActualKm(db, prev) : 0;
      if (prev && prev.deload && prev2) ref = Math.max(ref, weekActualKm(db, prev2));
      const done = runs.filter(r => r.date >= week.start && r.date <= week.end).reduce((t, r) => t + (r.km || 0), 0);
      const remaining = week.sessions.filter(s => PL.isRun(s) && s.date >= today && !(db.logs[s.id] && db.logs[s.id].status))
        .reduce((t, s) => t + s.km, 0);
      const inc = weeklyIncrease(ref, done + remaining);
      if (inc.alert) add({ level: 'warn', key: 'inc-' + n, title: 'Aumento dei km del ' + Math.round(inc.pct) + '%',
        text: 'Questa settimana arriveresti a ' + U.fmtKm(done + remaining) + ' km contro ' + U.fmtKm(ref) + ' km di riferimento (max +15%). Accorcia le facili o il lungo.',
        actions: [{ label: 'Ho capito', cmd: 'dismiss', arg: 'inc-' + n }] });

      // Settimana intera saltata -> ripeti la precedente
      const ov = S.weekOverrides || {};
      if (prev && prev.end < today && prev.start >= PL.startDate(db) && n - 2 >= plan.firstWeek && n <= 21 && !ov[n]) {
        const prevRuns = prev.sessions.filter(s => PL.isRun(s));
        const doneRuns = runs.filter(r => r.date >= prev.start && r.date <= prev.end);
        if (prevRuns.length >= 2 && doneRuns.length === 0) {
          add({ level: 'warn', key: 'skipweek-' + n, title: 'Settimana ' + (n - 1) + ' saltata',
            text: 'Non recuperare: per ripartire bene questa settimana ripeti la settimana ' + (n - 2) + ' invece di saltare avanti.',
            actions: [{ label: 'Ripeti sett. ' + (n - 2), cmd: 'repeatWeek', arg: { n, from: n - 2 }, primary: true },
                      { label: 'No, vado avanti', cmd: 'dismiss', arg: 'skipweek-' + n }] });
        }
      }

      // Due settimane di fatica -> scarico anticipato
      if (prev && prev2 && !week.deload && n <= 21 && !ov[n]) {
        const f1 = weekFatigue(runs.filter(r => r.date >= prev.start && r.date <= prev.end));
        const f2 = weekFatigue(runs.filter(r => r.date >= prev2.start && r.date <= prev2.end));
        if (f1.high && f2.high) add({ level: 'warn', key: 'fatigue-' + n, title: 'Fatica accumulata',
          text: 'Due settimane di fila con RPE medio alto (' + U.fmtKm(f2.avgRpe) + ' e ' + U.fmtKm(f1.avgRpe) + ') e gambe pesanti: anticipa lo scarico a questa settimana.',
          actions: [{ label: 'Scarico questa settimana', cmd: 'deloadWeek', arg: n, primary: true },
                    { label: 'Ignora', cmd: 'dismiss', arg: 'fatigue-' + n }] });
      }
    }

    // FC alta nelle ultime corse facili
    runs.filter(r => U.daysBetween(r.date, today) <= 3 && U.daysBetween(r.date, today) >= 0 && hrTooHigh(r.type, r.hrAvg, S.hrEasyMax))
      .forEach(r => add({ level: 'warn', key: 'hr-' + r.date, title: 'Troppo veloce, rallenta anche oltre il ritmo indicato',
        text: 'Corsa del ' + U.fmtDate(r.date) + ' con FC media ' + r.hrAvg + ' (limite ' + (S.hrEasyMax || 150) + '). Nelle facili e nei lunghi conta la FC, non il ritmo.',
        actions: [{ label: 'Ok', cmd: 'dismiss', arg: 'hr-' + r.date }] }));

    // Test riconosciuto nei dati di Strava: va confermato
    Object.keys(db.logs || {}).forEach(id => {
      const l = db.logs[id];
      if (l.status !== 'done' || l.testTimeSec || !(l.testDetectedSec || l.benchKmDetected)) return;
      const txt = l.testDetectedSec ? U.fmtDuration(l.testDetectedSec) : U.fmtKm(l.benchKmDetected, 2) + ' km nei 20\'';
      add({ level: 'proposal', key: 'testdet-' + id + '-' + (l.testDetectedSec || l.benchKmDetected), title: 'Test riconosciuto da Strava: ' + txt,
        text: 'Ho trovato il tratto del test nei dati della corsa del ' + U.fmtDate(l.date) + '. Confermalo come risultato oppure inserisci tu il tempo esatto.',
        actions: [{ label: 'Conferma ' + txt, cmd: 'confirmDetectedTest', arg: id, primary: true }, { label: 'Inserisco io', cmd: 'openLog', arg: id }] });
    });

    // Forma stimata migliore del test: propone di aggiornare i ritmi (solo con conferma)
    const pp = MM.form && MM.form.paceProposal(db, today);
    if (pp) add({ level: 'proposal', key: 'estp5-' + pp.p5, title: 'Sei più in forma del tuo ultimo test',
      text: 'Dagli ultimi allenamenti il tuo P5 stimato è ' + U.fmtPace(pp.p5) + '/km contro ' + U.fmtPace(pp.from) + ' del test. Puoi aggiornare subito i ritmi o aspettare il prossimo test.',
      actions: [{ label: 'Aggiorna i ritmi a ' + U.fmtPace(pp.p5), cmd: 'applyEstP5', arg: pp.p5, primary: true }, { label: 'Aspetto il test', cmd: 'dismiss', arg: 'estp5-' + pp.p5 }] });

    // Obiettivo vs stima attuale (spinta a migliorare)
    const p5 = P.currentP5(db.tests);
    if (p5 && !alerts.some(a => a.level === 'proposal')) {
      const est = P.halfFromP5(p5);
      const obj = P.objective(S.objective, S);
      const better = bestObjectiveFor(est);
      if (est < obj.time - 60 && P.OBJECTIVES[better.id].rank > P.OBJECTIVES[obj.id].rank) {
        add({ level: 'proposal', key: 'up-' + p5 + '-' + S.objective, title: 'Puoi puntare più in alto',
          text: 'La stima attuale (' + U.fmtHM(est) + ') è più veloce del tuo obiettivo ' + obj.label + ' (' + obj.timeLabel + ').',
          actions: [{ label: 'Passa a ' + P.objective(better.id, { customObjectiveSec: better.customSec }).label + ' (' + U.fmtHM(better.customSec || P.OBJECTIVES[better.id].time) + ')', cmd: 'setObjective', arg: better, primary: true },
                    { label: 'Non ora', cmd: 'dismiss', arg: 'up-' + p5 + '-' + S.objective }] });
      }
    }
    return alerts;
  }

  // Obiettivo più ambizioso compatibile con una stima
  function bestObjectiveFor(estSec) {
    if (estSec < 6300 - 60) return { id: 'X', customSec: customFromEstimate(estSec) };
    for (const id of ['A', 'B', 'C']) if (estSec <= P.OBJECTIVES[id].time) return { id };
    return { id: 'Base' };
  }

  return {
    proposeFrom5k, proposeFromBench, proposeFrom10k, proposeFromRmLong, proposeForTest, customFromEstimate,
    allRuns, pace, weekActualKm, weeklyIncrease, hrTooHigh, kneeEntries, kneeStatus, weekFatigue,
    computeAlerts, bestObjectiveFor
  };
})();

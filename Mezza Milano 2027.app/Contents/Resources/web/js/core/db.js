/* Database: dati iniziali, migrazioni e operazioni che modificano i dati. */
var MM = globalThis.MM || (globalThis.MM = {});

MM.db = (function () {
  const U = MM.util, P = MM.paces, R = MM.rules, PL = MM.plan;
  const VERSION = 1;

  function defaultSettings() {
    return {
      objective: 'B', customObjectiveSec: null, hrEasyMax: 150, hrZones: Object.assign({}, P.DEFAULT_HR),
      satToWed: false, weightKg: 67, notifications: { enabled: false, hour: 20 },
      reminders: { enabled: false, hour: 7, eveBefore: false },
      weekOverrides: {}, moves: {}, kneeProtocol: null, dismissed: {}, raceTempC: 12
    };
  }

  function createInitial(today) {
    const db0 = {
      version: VERSION,
      createdAt: today,
      plan: MM.planData.build(),
      settings: defaultSettings(),
      // dati personali iniziali (test, prime corse): in js/seed-personal.js, assente nella versione per amici
      tests: [], logs: {}, extraRuns: [],
      gym: {},
      health: {},
      objectiveHistory: [{ date: today, from: null, to: 'B', reason: 'Obiettivo iniziale' }]
    };
    if (MM.personalSeed) Object.assign(db0, MM.personalSeed());
    return db0;
  }

  // Nuovo utente (versione condivisa): piano, profilo e test iniziale scelti al primo avvio, nessun altro dato
  // p: { name, weightKg, hrEasyMax, kind: '5k'|'10k', timeSec, date, objective, customSec }
  function createBlank(today, p) {
    const settings = Object.assign(defaultSettings(), {
      name: p.name || '', weightKg: p.weightKg || 70, hrEasyMax: p.hrEasyMax || 150,
      objective: p.objective || 'C', customObjectiveSec: p.customSec || null, onboarded: true, startDate: today
    });
    settings.hrZones.easy = '< ' + settings.hrEasyMax;
    return {
      version: VERSION, createdAt: today, plan: MM.planData.build(), settings,
      tests: [{ id: 'test-iniziale', date: p.date || today, kind: p.kind, timeSec: p.timeSec, distKm: p.kind === '10k' ? 10 : 5,
        p5: P.p5FromTest(p.kind, p.timeSec), paceSec: p.timeSec / (p.kind === '10k' ? 10 : 5), decision: 'baseline', notes: 'Test di riferimento iniziale' }],
      logs: {}, extraRuns: [], gym: {}, health: {},
      objectiveHistory: [{ date: today, from: null, to: settings.objective, reason: 'Obiettivo iniziale' }]
    };
  }

  // Completa i campi mancanti (dati salvati con versioni precedenti dell'app)
  function migrate(db) {
    const def = defaultSettings();
    db.settings = Object.assign(def, db.settings || {});
    db.settings.hrZones = Object.assign({}, P.DEFAULT_HR, db.settings.hrZones || {});
    db.settings.notifications = Object.assign({ enabled: false, hour: 20 }, db.settings.notifications || {});
    db.settings.reminders = Object.assign({ enabled: false, hour: 7, eveBefore: false }, db.settings.reminders || {});
    ['tests', 'extraRuns', 'objectiveHistory'].forEach(k => { if (!Array.isArray(db[k])) db[k] = []; });
    ['logs', 'gym', 'health'].forEach(k => { if (!db[k] || typeof db[k] !== 'object') db[k] = {}; });
    if (!db.plan || !db.plan.weeks) db.plan = MM.planData.build();
    // Piano precedente -> piano attuale (le sedute già registrate restano)
    else if (MM.planData.OLD_SOURCES.indexOf(db.plan.source) >= 0) {
      db.plan = MM.planData.upgrade(db.plan, db.logs);
      // gli spostamenti di sedute non registrate si riferivano al piano precedente
      Object.keys(db.settings.moves || {}).forEach(id => { if (!db.logs[id]) delete db.settings.moves[id]; });
    }
    db.version = VERSION;
    return db;
  }

  function validate(obj) {
    return obj && typeof obj === 'object' && obj.plan && Array.isArray(obj.plan.weeks) && obj.settings;
  }

  // ---- Test ---------------------------------------------------------------------------
  function buildTest(db, t) {
    const test = Object.assign({ id: t.id || 'test-' + Date.now() }, t);
    if (test.kind === '5k' || test.kind === '10k') {
      test.distKm = test.kind === '5k' ? 5 : 10;
      test.p5 = P.p5FromTest(test.kind, test.timeSec);
      test.paceSec = test.timeSec / test.distKm;
    }
    if (test.kind === 'bench20' && !test.paceSec && test.distKm) test.paceSec = Math.round(1200 / test.distKm);
    if (test.kind === 'est') { test.decision = 'accepted'; return test; }  // ritmi aggiornati dalla forma stimata, già confermati
    test.proposal = R.proposeForTest(test, db.settings.objective);
    test.decision = null;
    return test;
  }
  function upsertTest(db, t) {
    const test = buildTest(db, t);
    const i = db.tests.findIndex(x => x.id === test.id);
    // Stesso risultato di prima (es. seduta aggiornata da Strava): la decisione già presa resta valida
    const old = i >= 0 ? db.tests[i] : null;
    if (old && old.decision && old.kind === test.kind && old.timeSec === test.timeSec &&
        old.distKm === test.distKm && old.rpe === test.rpe) {
      test.decision = old.decision;
      if (old.decision === 'baseline') delete test.proposal;
    }
    if (i >= 0) db.tests[i] = test; else db.tests.push(test);
    db.tests.sort((a, b) => a.date < b.date ? -1 : 1);
    return test;
  }
  function removeTest(db, id) { db.tests = db.tests.filter(t => t.id !== id); }

  function setObjective(db, id, customSec, reason, today) {
    const from = db.settings.objective;
    db.settings.objective = id;
    if (id === 'X' && customSec) db.settings.customObjectiveSec = customSec;
    db.objectiveHistory.push({ date: today, from, to: id, customSec: id === 'X' ? db.settings.customObjectiveSec : null, reason: reason || 'Scelta manuale' });
  }
  function acceptProposal(db, testId, today) {
    const t = db.tests.find(x => x.id === testId);
    if (!t || !t.proposal) return;
    if (t.proposal.obj !== db.settings.objective || t.proposal.obj === 'X') {
      setObjective(db, t.proposal.obj, t.proposal.customSec, t.proposal.reason, today);
    }
    t.decision = 'accepted';
  }
  function rejectProposal(db, testId) {
    const t = db.tests.find(x => x.id === testId);
    if (t) t.decision = 'rejected';
  }

  // ---- Registro sedute ------------------------------------------------------------------
  // data: { status, km, timeSec, hrAvg, hrMax, hr1, hr2, rpe, knee, heavy, feel, notes, testTimeSec, testHr, benchKm }
  function saveLog(db, session, data) {
    const log = Object.assign({}, data, { date: session.date });
    db.logs[session.id] = log;
    // Il dolore alle ginocchia del giorno va anche nel check-in salute
    if (log.knee != null && log.knee !== '') {
      db.health[session.date] = Object.assign({}, db.health[session.date], { knee: Number(log.knee) });
    }
    let test = null;
    const testId = 'test-' + session.id;
    const kind = session.testKind || (session.original && session.original.testKind);
    if (log.status === 'done' && session.type === 'test' && kind) {
      if ((kind === '5k' || kind === '10k') && log.testTimeSec) {
        test = upsertTest(db, { id: testId, sessionId: session.id, date: session.date, kind, timeSec: log.testTimeSec, hrAvg: log.testHr || log.hrAvg, rpe: log.rpe });
      } else if (kind === 'bench20' && log.benchKm) {
        test = upsertTest(db, { id: testId, sessionId: session.id, date: session.date, kind, distKm: log.benchKm, hrAvg: log.testHr || log.hrAvg, rpe: log.rpe });
      }
    } else if (log.status === 'done' && session.check === 'rmlong' && log.rpe != null && log.rpe !== '') {
      test = upsertTest(db, { id: testId, sessionId: session.id, date: session.date, kind: 'rmlong', rpe: Number(log.rpe), hrAvg: log.hrAvg });
    } else {
      removeTest(db, testId);
    }
    return test;
  }
  function clearLog(db, sessionId) {
    delete db.logs[sessionId];
    removeTest(db, 'test-' + sessionId);
  }

  function addExtraRun(db, run) {
    const r = Object.assign({ id: 'x-' + run.date + '-' + Date.now() }, run);
    db.extraRuns.push(r);
    return r;
  }

  // ---- Notifiche: la sera prima di ogni allenamento --------------------------------------
  function upcomingNotifications(db, now, days) {
    const today = U.todayISO(now);
    const hour = (db.settings.notifications && db.settings.notifications.hour) || 20;
    const out = [];
    for (let i = 1; i <= (days || 14); i++) {
      const date = U.addDays(today, i);
      const eve = U.addDays(date, -1);
      const at = new Date(Number(eve.slice(0, 4)), Number(eve.slice(5, 7)) - 1, Number(eve.slice(8, 10)), hour, 0, 0);
      if (at <= now) continue;
      const items = [];
      PL.sessionsOnDate(db, date).forEach(s => {
        if (!PL.isRun(s)) return;
        const p5 = P.currentP5(db.tests);
        const z = PL.mainZone(s);
        const r = P.zoneRange(p5, z);
        items.push(PL.title(s) + ' (' + U.fmtKm(s.km) + ' km' + (r ? ', ' + P.ZONES[z].short + ' ' + U.fmtPaceRange(r) : '') + ')');
      });
      const n = PL.weekOfDate(db.plan, date);
      const wk = PL.effectiveWeek(db, n);
      if (wk) MM.gym.sessionsForWeek(n, wk.deload).forEach(g => { if (U.weekday(date) === g.day) items.push('Palestra seduta ' + g.kind); });
      if (!items.length) continue;
      out.push({ id: 'mm-' + date, at: eve + 'T' + U.pad(hour) + ':00', title: 'Domani: ' + items[0], body: items.join(' · ') });
    }
    return out;
  }

  // ---- Promemoria giornalieri (app Promemoria): uno al giorno con l'allenamento ----------------
  function dayReminder(db, date) {
    const S = db.settings;
    const n = PL.weekOfDate(db.plan, date);
    const wk = PL.effectiveWeek(db, n);
    if (!wk) return null;
    const p5 = P.currentP5(db.tests);
    const runs = PL.sessionsOnDate(db, date);
    const gyms = MM.gym.sessionsForWeek(n, wk.deload).filter(g => U.weekday(date) === g.day);
    const parts = [], notes = [U.fmtDateLong(date).replace(/^./, c => c.toUpperCase()) + ' · settimana ' + n + ' · ' + wk.phase.name];
    runs.forEach(s => {
      if (!PL.isRun(s)) {
        if (s.adjusted) notes.push('Corsa sostituita da riposo: ' + s.adjusted + '.');
        return;
      }
      const z = PL.mainZone(s);
      const r = P.zoneRange(p5, z);
      const Z = P.ZONES[z];
      parts.push((s.type === 'race' ? '🏁 ' : '🏃 ') + PL.title(s) + (r ? ' · ' + U.fmtPaceRange(r) + '/km' : ''));
      notes.push('', PL.title(s) + ' (' + U.fmtKm(s.km) + ' km)' + (s.optional ? ', facoltativa' : ''));
      if (s.adjusted) notes.push('⚠︎ ' + s.adjusted);
      PL.steps(s, p5).forEach(st => notes.push('• ' + st.text + (st.pace ? ' a ' + U.fmtPaceRange(st.pace) + '/km' : '')));
      if (Z) notes.push((Z.hrKey ? 'FC ' + (Z.hrKey === 'easy' ? '< ' + S.hrEasyMax : S.hrZones[Z.hrKey]) + ' · ' : '') + 'RPE ' + Z.rpe);
      if (s.type === 'easy' || s.type === 'long') {
        notes.push('Se la FC supera ' + S.hrEasyMax + ', rallenta anche oltre il ritmo indicato.');
        const ch = MM.cadence && MM.cadence.hint(db);
        if (ch) notes.push(ch);
      }
    });
    gyms.forEach(g => {
      parts.push('🏋️ Palestra ' + g.kind);
      notes.push('', 'Palestra seduta ' + g.kind + ' (' + g.title + '): ' + g.exercises.map(e => e.name + ' ' + e.sets + '×' + e.reps).join(', ') + '.');
    });
    if (!parts.length) {
      parts.push('😴 Riposo');
      notes.push('', 'Giornata di recupero: una camminata va benissimo. Ricordati il check-in delle ginocchia nell\'app.');
    }
    notes.push('', 'Dopo l\'allenamento registralo nell\'app (o lascia che arrivi da Strava).');
    return { title: parts.join(' + '), notes: notes.join('\n') };
  }

  function dailyReminders(db, now, days) {
    const R = db.settings.reminders || {};
    const hour = R.hour != null ? R.hour : 7;
    const today = U.todayISO(now);
    const out = [];
    for (let i = 0; i <= (days || 14); i++) {
      const date = U.addDays(today, i);
      if (date > db.plan.raceDate) break;
      const day = R.eveBefore ? U.addDays(date, -1) : date;
      const at = new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), hour, 0, 0);
      if (at <= now) continue;
      const r = dayReminder(db, date);
      if (!r) continue;
      out.push({ id: date, at: day + 'T' + U.pad(hour) + ':00', title: (R.eveBefore ? 'Domani: ' : '') + r.title, notes: r.notes });
    }
    return out;
  }

  return { VERSION, defaultSettings, createBlank, dayReminder, dailyReminders, createInitial, migrate, validate, buildTest, upsertTest, removeTest,
    setObjective, acceptProposal, rejectProposal, saveLog, clearLog, addExtraRun, upcomingNotifications };
})();

/* Piano iniziale: 3 allenamenti a settimana (1 forza + 2 corse), ricavato dal piano a 4 uscite
   del file allenamenti_mezza_milano_4_uscite.xlsx (stesse fasi e ritmi), in forma
   strutturata: nessun ritmo scritto qui, i ritmi si calcolano da P5.
   Settimana tipo: martedì corsa di qualità, giovedì lungo, sabato forza (vedi gym.js).
   Settimana di gara: martedì qualità leggera, giovedì forza (attivazione), domenica gara.
   Nessuna corsa in salita: tutte le sedute di corsa si fanno in piano.

   Segmenti (segs):
     { t:'run',  km, z }                     corsa continua in una zona
     { t:'time', sec, z }                    corsa continua a tempo
     { t:'reps', n, sec|km, z, rec, recMode } ripetute; rec in secondi; recMode 'jog' | 'down'
     { t:'strides', n }                      allunghi da 80–100 m
     { t:'test', km }                        test a tutta
     { t:'race', km }                        gara
   label: nome del tipo di seduta (Ripetute, Tempo, Fartlek…), mostrato nel titolo
   warmup: 2 km facili + 4 allunghi; cooldown: 1–1,5 km facili (inclusi nei km totali). */
var MM = globalThis.MM || (globalThis.MM = {});

MM.planData = (function () {
  const TUE = 2, THU = 4, SUN = 7;

  function easy(km, strides, extra) {
    const segs = [{ t: 'run', km, z: 'easy' }];
    if (strides) segs.push({ t: 'strides', n: strides });
    return Object.assign({ type: 'easy', km, segs }, extra || {});
  }
  function long(km, segs, extra) {
    return Object.assign({ type: 'long', km, segs: segs || [{ t: 'run', km, z: 'long' }] }, extra || {});
  }
  function quality(km, segs, extra) {
    return Object.assign({ type: 'quality', km, warmup: true, cooldown: true, segs }, extra || {});
  }
  const reps = (n, what, z, rec, recMode) => Object.assign({ t: 'reps', n, z, rec, recMode: recMode || 'jog' }, what);
  const run = (km, z) => ({ t: 'run', km, z });

  // Regole del piano (v2):
  // - ogni settimana: qualità il martedì, lungo il giovedì (sempre presente), forza il sabato (gym.js):
  //   mercoledì e venerdì liberi, la forza non è mai il giorno prima di una corsa impegnativa;
  // - qualità a rotazione (ripetute, tempo, fartlek) con progressione graduale;
  // - test al posto della qualità circa ogni 5–6 settimane (sett. 2, 7, 13, 17), in settimane con lungo facile;
  // - scarico ogni 3–4 settimane (4, 8, 12, 16, 19, 22): lungo −25/30% e martedì facile con allunghi;
  // - lungo con finale a ritmo gara solo nella fase specifica (15, 18, 21), sempre seguito da uno scarico
  //   e con una qualità leggera nella stessa settimana;
  // - lungo facile e conversazionale, massimo 19 km (sett. 20), ultimo lungo importante 3 settimane prima della gara;
  // - ultime 2 settimane: taper con poco ritmo gara al martedì e lungo facile.
  // [settimana, scarico, martedì (qualità), giovedì (lungo; la gara è la domenica)]. La forza è in gym.js.
  const test5k = () => ({ type: 'test', testKind: '5k', km: 8.5, warmup: true, cooldown: true, segs: [{ t: 'test', km: 5 }] });
  const WEEKS = [
    [2, false, test5k(), long(10)],
    [3, false, quality(7, [reps(6, { sec: 60 }, 'tenk', 60)], { label: 'Fartlek', note: 'Fartlek: 1\' svelto e 1\' facile, senza fermarti' }), long(11)],
    [4, true, easy(6, 6), long(8)],
    [5, false, quality(8, [reps(6, { sec: 120 }, 'intervals', 120)]), long(12)],
    [6, false, quality(8, [reps(3, { sec: 360 }, 'threshold', 120)], { label: 'Tempo' }), long(13)],
    [7, false, test5k(), long(14)],
    [8, true, easy(6, 6), long(10)],
    [9, false, quality(9, [reps(8, { sec: 120 }, 'tenk', 60)], { label: 'Fartlek', note: 'Fartlek: 2\' svelti e 1\' facile, senza fermarti' }), long(14)],
    [10, false, quality(9, [reps(5, { km: 1, unit: 'm' }, 'intervals', 120)]), long(15)],
    [11, false, quality(10, [reps(2, { sec: 900 }, 'threshold', 180)], { label: 'Tempo' }), long(16)],
    [12, true, easy(6, 6), long(12)],
    [13, false,
      { type: 'test', testKind: 'bench20', km: 10, warmup: true, cooldown: true, segs: [{ t: 'time', sec: 1200, z: 'threshold' }],
        note: 'Tempo run di 20\' a ritmo costante: è il test di questa fase' },
      long(16)],
    [14, false, quality(10, [reps(6, { km: 1, unit: 'm' }, 'tenk', 90)], { label: 'Ripetute' }), long(17)],
    [15, false, quality(7, [reps(6, { sec: 60 }, 'tenk', 90)], { label: 'Fartlek leggero', note: 'Settimana con finale a ritmo gara nel lungo: qui solo un fartlek leggero' }),
      long(17, [run(12, 'long'), run(5, 'rm')], { note: 'Primi 12 km facili e conversazionali, ultimi 5 a ritmo gara' })],
    [16, true, easy(7, 6), long(12)],
    [17, false, test5k(), long(17)],
    [18, false, quality(6.5, [reps(8, { sec: 40 }, 'intervals', 80)], { label: 'Leggero', note: 'Settimana con finale a ritmo gara nel lungo: ripetute brevi e leggere' }),
      long(18, [run(12, 'long'), run(6, 'rm')], { note: 'Primi 12 km facili e conversazionali, ultimi 6 a ritmo gara' })],
    [19, true, easy(7, 6), long(13)],
    [20, false, quality(8, [{ t: 'time', sec: 1500, z: 'threshold' }], { label: 'Tempo' }),
      long(19, null, { note: 'Lungo più lungo del piano, tutto facile' })],
    [21, false, quality(7, [reps(6, { sec: 60 }, 'intervals', 60)], { label: 'Leggero', note: 'Settimana della prova generale: qualità corta' }),
      long(18, [run(10, 'long'), run(8, 'rm')],
        { check: 'rmlong', note: 'Prova generale e ultimo lungo importante: annota bene l\'RPE degli 8 km a RM' })],
    [22, true, easy(6, 6), long(13)],
    [23, true, quality(8, [reps(2, { km: 2 }, 'rm', 120)], { label: 'Taper', note: 'Un po\' di ritmo gara, senza forzare' }), long(10)],
    [24, false, quality(6, [reps(3, { km: 1 }, 'rm', 120)], { label: 'Taper', note: 'Solo per sentire il ritmo gara: deve sembrare facile' }),
      { type: 'race', km: 21.1, segs: [{ t: 'race', km: 21.0975 }], note: 'Mezza Maratona di Milano' }]
  ];

  // Km di corsa previsti per settimana (martedì + giovedì), usati nei test di coerenza
  const PLAN_KM = { 2: 18.5, 3: 18, 4: 14, 5: 20, 6: 21, 7: 22.5, 8: 16, 9: 23, 10: 24, 11: 26, 12: 18, 13: 26,
    14: 27, 15: 24, 16: 19, 17: 25.5, 18: 24.5, 19: 20, 20: 27, 21: 25, 22: 19, 23: 18, 24: 27.1 };
  // Km totali del vecchio piano a 4 uscite (colonna G del foglio Excel), per confronto
  const EXCEL_KM = { 2: 29.5, 3: 30, 4: 25, 5: 32, 6: 35, 7: 37, 8: 29.5, 9: 37, 10: 39, 11: 41, 12: 30, 13: 41,
    14: 44, 15: 44, 16: 45, 17: 28, 18: 46, 19: 46, 20: 48, 21: 41, 22: 37, 23: 32, 24: 36 };
  const SOURCE = 'piano_3_allenamenti_v3';
  // Piani precedenti: a 4 uscite (Excel) e versioni precedenti a 3 allenamenti (lungo la domenica)
  const OLD_SOURCES = ['allenamenti_mezza_milano_4_uscite.xlsx', 'piano_3_allenamenti_v1', 'piano_3_allenamenti_v2'];

  function build() {
    return {
      source: SOURCE,
      firstWeek: 2,
      firstMonday: '2026-10-12',
      raceDate: '2027-03-21',
      weeks: WEEKS.map(w => {
        const [n, deload, tue, second] = w;
        const sessions = [[TUE, tue], [second.type === 'race' ? SUN : THU, second]].map(([day, s]) =>
          Object.assign({ id: 'w' + n + '-' + day, day }, JSON.parse(JSON.stringify(s))));
        return { n, deload, sessions };
      })
    };
  }

  // Passaggio da un piano precedente: piano nuovo, ma le sedute già registrate (fatte o saltate)
  // restano com'erano, così registro, statistiche e storico non perdono nulla. Se il lungo di quella settimana
  // è già stato registrato in un altro giorno, il nuovo lungo non si aggiunge (niente doppioni).
  function upgrade(oldPlan, logs) {
    const plan = build();
    if (!oldPlan || !Array.isArray(oldPlan.weeks)) return plan;
    oldPlan.weeks.forEach(ow => {
      const w = plan.weeks.find(x => x.n === ow.n);
      if (!w) return;
      (ow.sessions || []).forEach(s => {
        if (!logs || !logs[s.id]) return;
        const i = w.sessions.findIndex(x => x.id === s.id);
        if (i >= 0) w.sessions[i] = Object.assign({}, s);
        else w.sessions.push(Object.assign({}, s, { legacy: true }));
      });
      if (w.sessions.some(s => s.legacy && s.type === 'long')) {
        w.sessions = w.sessions.filter(s => s.legacy || s.type !== 'long' || (logs && logs[s.id]));
      }
      w.sessions.sort((a, b) => a.day - b.day);
    });
    return plan;
  }

  return { build, upgrade, SOURCE, OLD_SOURCES, PLAN_KM, EXCEL_KM };
})();

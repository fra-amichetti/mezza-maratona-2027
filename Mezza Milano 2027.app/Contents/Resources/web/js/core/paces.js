/* Calcolo dei ritmi: zone da P5, formula di Riegel, obiettivi di gara. */
var MM = globalThis.MM || (globalThis.MM = {});

MM.paces = (function () {
  const HALF_KM = 21.0975;
  const RIEGEL_EXP = 1.06;

  // add = [secondi aggiunti a P5 per il limite veloce, per il limite lento]
  const ZONES = {
    easy:      { name: 'Facile / recupero', short: 'facile', add: [65, 90], rpe: '3–4', feel: 'Parli a frasi intere', hrKey: 'easy' },
    long:      { name: 'Lungo', short: 'lungo', add: [65, 85], rpe: '3–4', feel: 'Come il facile', hrKey: 'easy' },
    aerobic:   { name: 'Aerobico / medio', short: 'aerobico', add: [35, 45], rpe: '5–6', feel: 'Frasi brevi, controllato', hrKey: 'aerobic' },
    rm:        { name: 'Ritmo gara mezza (RM)', short: 'ritmo gara (RM)', add: [22, 28], rpe: '6–7', feel: 'Impegnativo ma sostenibile', hrKey: 'rm' },
    threshold: { name: 'Soglia', short: 'soglia', add: [10, 20], rpe: '7', feel: '"Comodamente duro"', hrKey: 'threshold' },
    tenk:      { name: 'Ritmo 10 km', short: 'ritmo 10 km', add: [5, 10], rpe: '7–8', feel: 'Sostenuto, respiro pesante ma regolare', hrKey: 'tenk' },
    intervals: { name: 'Ripetute', short: 'ripetute', add: [-5, 0], rpe: '8–9', feel: 'Duro, non uno sprint', hrKey: 'intervals' },
    strides:   { name: 'Allunghi (80–100 m)', short: 'allunghi', add: [-35, -25], rpe: '8, fluidi', feel: "Veloci ma rilassati, recupero ~1' camminando", hrKey: null },
    hill:      { name: 'Salite brevi', short: 'in salita', add: null, rpe: '8', feel: 'Spinta decisa, busto alto, passi corti', hrKey: null }
  };

  // Zone FC provvisorie (modificabili nelle impostazioni)
  const DEFAULT_HR = {
    easy: '< 150', aerobic: '150–160', rm: '158–165', threshold: '163–172', tenk: '168–175', intervals: '> 172'
  };

  function zoneRange(p5, zone) {
    const z = ZONES[zone];
    if (!z || !z.add || p5 == null) return null;
    return { fast: p5 + z.add[0], slow: p5 + z.add[1] };
  }

  // Riegel: T2 = T1 × (D2/D1)^1,06
  function riegel(t1, d1, d2, exp) {
    return t1 * Math.pow(d2 / d1, exp == null ? RIEGEL_EXP : exp);
  }

  // P5 (s/km) ricavato da un test. Il 10 km diventa un 5 km equivalente con Riegel.
  function p5FromTest(kind, timeSec) {
    if (!timeSec) return null;
    if (kind === '5k') return Math.round(timeSec / 5);
    if (kind === '10k') return Math.round(riegel(timeSec, 10, 5) / 5);
    return null;
  }

  // Ultimo test valido (5 km o 10 km) con data <= date (o in assoluto se date manca)
  function latestPaceTest(tests, date) {
    const valid = (tests || [])
      .filter(t => (t.kind === '5k' || t.kind === '10k' || t.kind === 'est') && t.p5 && (!date || t.date <= date))
      .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    return valid.length ? valid[valid.length - 1] : null;
  }
  function currentP5(tests, date) {
    const t = latestPaceTest(tests, date) || latestPaceTest(tests);
    return t ? t.p5 : null;
  }
  // Per le sedute future si usa sempre l'ultimo test; per quelle passate il test valido in quel giorno.
  function p5ForDate(tests, date, today) {
    if (date >= today) return currentP5(tests);
    return currentP5(tests, date);
  }

  function halfFromP5(p5) { return riegel(p5 * 5, 5, HALF_KM); }

  // Obiettivi di gara (tempi in secondi)
  const OBJECTIVES = {
    X:    { id: 'X', label: 'Personalizzato', time: null, rank: 5 },
    A:    { id: 'A', label: 'A', time: 6300, rank: 4 },
    B:    { id: 'B', label: 'B', time: 6600, rank: 3 },
    C:    { id: 'C', label: 'C', time: 6900, rank: 2, below: true },
    Base: { id: 'Base', label: 'Base', time: 7200, rank: 1, below: true }
  };
  const ORDER = ['X', 'A', 'B', 'C', 'Base'];

  function objective(id, settings) {
    const o = Object.assign({}, OBJECTIVES[id] || OBJECTIVES.B);
    if (o.id === 'X') o.time = (settings && settings.customObjectiveSec) || 6300;
    o.pace = objectivePace(o.time);
    o.timeLabel = (o.below ? 'sotto ' : '') + MM.util.fmtHM(o.time);
    return o;
  }
  // Ritmo dell'obiettivo arrotondato per difetto: es. 1h45' -> 4:58/km
  function objectivePace(timeSec) { return Math.floor(timeSec / HALF_KM); }
  function levelDown(id) {
    const i = ORDER.indexOf(id);
    return ORDER[Math.min(ORDER.length - 1, i + 1)];
  }

  return {
    HALF_KM, RIEGEL_EXP, ZONES, DEFAULT_HR, ORDER, OBJECTIVES,
    zoneRange, riegel, p5FromTest, latestPaceTest, currentP5, p5ForDate, halfFromP5,
    objective, objectivePace, levelDown
  };
})();

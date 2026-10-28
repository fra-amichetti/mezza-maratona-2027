/* Schede di forza a corpo libero e progressione per settimana: una sola seduta a settimana, il sabato
   (48 ore dopo il lungo del giovedì e 72 prima della qualità del martedì); nella settimana di gara il giovedì,
   lontano dalla gara della domenica. Seduta A nelle settimane pari,
   seduta B nelle dispari: ogni settimana si lavorano comunque gambe, glutei, polpacci/tibie e core.
   Servono solo un gradino, una sedia e un muro. Molto lavoro sulla parte bassa della gamba
   (soleo, gastrocnemio, tibiale anteriore, piede) per prevenire la periostite tibiale. */
var MM = globalThis.MM || (globalThis.MM = {});

MM.gym = (function () {
  // unit: cosa si registra nella colonna "Fatte" (ripetizioni o secondi per serie)
  const A = [
    { id: 'squat', name: 'Squat a corpo libero', sets: 3, reps: '15', unit: 'rip' },
    { id: 'lunge', name: 'Affondo indietro', sets: 3, reps: '10 per gamba', unit: 'rip' },
    { id: 'bridge', name: 'Ponte glutei', sets: 3, reps: '15', unit: 'rip' },
    { id: 'calfsingle', name: 'Calf raise su una gamba (gradino)', sets: 3, reps: '12–15 per gamba', unit: 'rip', calf: true },
    { id: 'calfbent', name: 'Calf raise a ginocchia piegate (soleo)', sets: 3, reps: '15–20', unit: 'rip', calf: true },
    { id: 'tibraise', name: 'Sollevamento punte al muro (tibiale)', sets: 3, reps: '15–20', unit: 'rip', calf: true },
    { id: 'plank', name: 'Plank', sets: 3, reps: '30–45"', unit: 'sec' },
    { id: 'deadbug', name: 'Dead bug', sets: 2, reps: '10 per lato', unit: 'rip' }
  ];
  const B = [
    { id: 'wallsit', name: 'Squat isometrico al muro', sets: 4, reps: '30–45"', unit: 'sec' },
    { id: 'bulgarian', name: 'Bulgarian split squat (piede su sedia)', sets: 3, reps: '8–10 per gamba', unit: 'rip' },
    { id: 'sldl', name: 'Stacco rumeno a una gamba', sets: 3, reps: '10 per gamba', unit: 'rip' },
    { id: 'slbridge', name: 'Ponte glutei a una gamba', sets: 3, reps: '10 per gamba', unit: 'rip' },
    { id: 'abduction', name: 'Abduzioni sul fianco', sets: 2, reps: '15 per lato', unit: 'rip' },
    { id: 'calfecc', name: 'Calf eccentrico su gradino', sets: 3, reps: '12 per gamba', unit: 'rip', calf: true },
    { id: 'heelwalk', name: 'Camminata sui talloni', sets: 2, reps: '20 m', unit: 'rip', calf: true },
    { id: 'balance', name: 'Equilibrio su una gamba', sets: 2, reps: '30" per lato', unit: 'sec', calf: true },
    { id: 'sideplank', name: 'Plank laterale', sets: 2, reps: '30" per lato', unit: 'sec' },
    { id: 'birddog', name: 'Bird dog', sets: 2, reps: '10 per lato', unit: 'rip' }
  ];
  // Settimana di gara: solo attivazione leggera, niente eccentrici né pliometria
  const ACT = ['squat', 'bridge', 'calfbent', 'tibraise', 'plank'];
  // Dalla settimana 9, solo se le tibie non fanno male
  const PLYO = [
    { id: 'pogo', name: 'Pogo jump', sets: 3, reps: '15', unit: 'rip', plyo: true },
    { id: 'skip', name: 'Skip', sets: 2, reps: '20 m', unit: 'rip', plyo: true }
  ];

  const DAY = 6;        // sabato
  const RACE_DAY = 4;   // giovedì, nella settimana di gara

  function stage(n) {
    if (n <= 4) return { id: 'light', label: 'Facile (RPE 6)', text: 'Impara la tecnica: movimenti lenti e controllati, chiudi ogni serie con qualche ripetizione ancora in canna.' };
    if (n <= 16) return { id: 'progressive', label: 'Progressivo', text: 'Quando tutte le serie ti riescono facili, rendile più dure: +2–3 ripetizioni, discesa lenta di 3", pausa di 1" in basso, oppure +10" negli esercizi a tempo.' };
    if (n <= 21) return { id: 'maintain', label: 'Mantenimento (2 serie)', text: 'Stessa difficoltà delle ultime settimane, solo 2 serie: serve a mantenere, non a stancare.' };
    if (n <= 23) return { id: 'half', label: 'Metà volume, niente pliometria', text: 'Seduta a metà volume, senza arrivare a fatica.' };
    return { id: 'activation', label: 'Attivazione (settimana di gara)', text: '15–20 minuti con 1 serie leggera per esercizio: tiene attivi i muscoli senza stancarli. Niente eccentrici né pliometria.' };
  }

  // Seduta della settimana n (una sola, il sabato; giovedì in settimana di gara). deload = settimana di scarico (una serie in meno).
  function sessionsForWeek(n, deload) {
    const st = stage(n);
    function adapt(list) {
      return list.map(ex => {
        let sets = ex.sets;
        if (st.id === 'maintain') sets = 2;
        if (st.id === 'half') sets = Math.ceil(ex.sets / 2);
        else if (st.id === 'activation') sets = 1;
        else if (deload) sets = sets - 1;
        return Object.assign({}, ex, { sets: Math.max(1, sets) });
      });
    }
    if (st.id === 'activation') {
      return [{ kind: 'A', day: RACE_DAY, title: 'attivazione pre-gara', exercises: adapt(A.filter(ex => ACT.indexOf(ex.id) >= 0)), stage: st }];
    }
    if (n % 2 === 0) return [{ kind: 'A', day: DAY, title: 'forza e polpacci', exercises: adapt(A), stage: st }];
    const bList = n >= 9 && st.id !== 'half' ? B.concat(PLYO) : B;
    return [{ kind: 'B', day: DAY, title: 'stabilità e prevenzione', exercises: adapt(bList), stage: st }];
  }

  // Sedute registrate in altri giorni della settimana (es. lunedì/venerdì del vecchio piano):
  // restano visibili con la scheda con cui erano state fatte.
  function loggedOffPlan(gymLogs, start, end, plannedDates) {
    return Object.keys(gymLogs || {}).filter(d => d >= start && d <= end && plannedDates.indexOf(d) < 0)
      .sort().map(d => {
        const g = gymLogs[d];
        const kind = g.session === 'B' ? 'B' : 'A';
        const ids = Object.keys(g.ex || {});
        const list = (kind === 'A' ? A : B.concat(PLYO)).filter(ex => kind === 'A' || !ex.plyo || ids.indexOf(ex.id) >= 0);
        return { kind, date: d, title: kind === 'A' ? 'forza e polpacci' : 'stabilità e prevenzione', exercises: list, stage: { id: 'logged', label: 'Registrata', text: '' }, offPlan: true };
      });
  }

  // Ultimo valore registrato (ripetizioni o secondi) per un esercizio prima di una data
  function lastVal(gymLogs, exId, beforeDate) {
    const dates = Object.keys(gymLogs || {}).filter(d => d < beforeDate).sort().reverse();
    for (const d of dates) {
      const e = gymLogs[d].ex && gymLogs[d].ex[exId];
      const v = e && (e.val != null && e.val !== '' ? e.val : e.kg);
      if (v != null && v !== '') return { date: d, val: v };
    }
    return null;
  }

  return { A, B, PLYO, DAY, stage, sessionsForWeek, loggedOffPlan, lastVal };
})();

/* Cadenza (passi al minuto): base personale, obiettivo graduale e valutazione delle corse.
   Una cadenza bassa con passi lunghi aumenta il carico su tibie e ginocchia; aumentarla di circa il 5%
   riduce l'impatto a ogni appoggio. Si cambia gradualmente e solo nelle corse facili. */
var MM = globalThis.MM || (globalThis.MM = {});

MM.cadence = (function () {
  const U = MM.util, R = MM.rules;
  const EASY = ['easy', 'long'];

  // Normalizza un valore inserito o importato: sotto 120 è "per gamba" (alcuni orologi/Strava) e va raddoppiato
  function normalize(v) {
    const x = Number(v);
    if (!isFinite(x) || x <= 0) return null;
    const spm = x < 120 ? x * 2 : x;
    return spm >= 130 && spm <= 230 ? Math.round(spm) : null;
  }

  function easyRuns(db, asOf) {
    return R.allRuns(db).filter(r => r.cadence && EASY.indexOf(r.type) >= 0 && (!asOf || r.date <= asOf));
  }

  // Base: mediana delle ultime 6 corse facili/lunghi (servono almeno 3)
  function baseline(db, asOf) {
    const v = easyRuns(db, asOf).slice(-6).map(r => r.cadence).sort((a, b) => a - b);
    if (v.length < 3) return null;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
  }

  // Obiettivo: quello scelto nelle impostazioni, oppure base +5% (solo se la base è sotto 170), max 180
  function target(db) {
    const set = db.settings && db.settings.cadenceTarget;
    if (set) return set;
    const b = baseline(db);
    if (!b) return null;
    return b >= 170 ? b : Math.min(180, Math.round(b * 1.05));
  }

  function level(spm) {
    if (spm < 160) return { id: 'bassa', label: 'bassa' };
    if (spm < 170) return { id: 'media', label: 'nella media' };
    return { id: 'buona', label: 'buona' };
  }

  // Valutazione di una corsa facile/lungo
  function evaluate(db, run) {
    if (!run || !run.cadence || EASY.indexOf(run.type) < 0) return null;
    const t = target(db);
    const lv = level(run.cadence);
    let text = 'Cadenza ' + run.cadence + ' passi/min (' + lv.label + ')';
    let ok = lv.id !== 'bassa';
    if (t && t > run.cadence + 2) { text += ': prova a salire verso ' + t + ' con passi più corti e rapidi.'; ok = false; }
    else if (t && run.cadence >= t - 2) { text += ', in linea con l\'obiettivo di ' + t + '.'; ok = true; }
    else text += lv.id === 'bassa' ? ': passi probabilmente lunghi, che caricano di più la tibia.' : '.';
    return { text, ok, target: t, level: lv.id };
  }

  // Indicazione da mostrare nelle corse facili (scheda e promemoria)
  function hint(db) {
    const t = target(db), b = baseline(db);
    if (!t || (b && b >= t)) return null;
    return 'Cadenza obiettivo ~' + t + ' passi/min: passi più corti e rapidi, senza correre più forte (aiuta un metronomo o musica a ' + t + ' BPM).';
  }

  return { normalize, baseline, target, level, evaluate, hint, easyRuns };
})();

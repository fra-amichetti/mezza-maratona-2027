/* Strategia di gara calcolata sull'obiettivo attivo, con correzione per il caldo. */
var MM = globalThis.MM || (globalThis.MM = {});

MM.race = (function () {
  const P = MM.paces;

  // Correzione per il caldo, in s/km: sopra 15 °C +5–10", sopra 20 °C +15–20"
  function heatAdjust(tempC) {
    if (tempC == null || tempC <= 15) return [0, 0];
    if (tempC <= 20) return [5, 10];
    return [15, 20];
  }

  function strategy(targetSec, tempC) {
    const heat = heatAdjust(tempC);
    const heatMid = (heat[0] + heat[1]) / 2;
    const p = targetSec / P.HALF_KM + heatMid;                 // ritmo medio corretto
    const finish = p * P.HALF_KM;
    const startPace = p + 6.5;                                 // km 0–5 a obiettivo +5/+8"
    // I ~30" persi nei primi 5 km si recuperano tenendo poco sotto il ritmo obiettivo dal 5° km
    const midPace = (finish - 5 * startPace) / (P.HALF_KM - 5);
    const splits = [
      { km: 5, time: 5 * startPace },
      { km: 10, time: 5 * startPace + 5 * midPace },
      { km: 15, time: 5 * startPace + 10 * midPace },
      { km: 21.1, time: finish }
    ];
    const segments = [
      { from: 0, to: 5, pace: { fast: p + 5, slow: p + 8 }, text: 'Partenza controllata: obiettivo +5/+8". Non farti trascinare.' },
      { from: 5, to: 15, pace: { fast: midPace, slow: p }, text: 'Ritmo obiettivo, regolare. Corri in gruppo se puoi.' },
      { from: 15, to: 18, pace: { fast: midPace, slow: p }, text: 'Tieni: è il tratto più duro, pensa solo al km che stai correndo.' },
      { from: 18, to: 21.1, pace: { fast: midPace - 10, slow: midPace }, text: 'Se ne hai, accelera progressivamente fino al traguardo.' }
    ];
    return { targetPace: targetSec / P.HALF_KM, pace: p, heat, startPace, midPace, finish, splits, segments };
  }

  return { heatAdjust, strategy };
})();

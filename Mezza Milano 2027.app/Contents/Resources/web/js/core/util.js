/* Utility: date, formattazione di numeri, ritmi e durate in italiano.
   Nessuna dipendenza dal DOM: questi file girano anche nei test (JavaScriptCore). */
var MM = globalThis.MM || (globalThis.MM = {});

MM.util = (function () {
  const DAY = 86400000;
  const GIORNI = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
  const GIORNI_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto',
    'settembre', 'ottobre', 'novembre', 'dicembre'];
  const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

  function pad(n) { return String(n).padStart(2, '0'); }

  // Le date sono stringhe ISO 'aaaa-mm-gg' e si calcolano in UTC per evitare problemi di fuso/ora legale.
  function parseISO(iso) {
    const p = iso.split('-').map(Number);
    return Date.UTC(p[0], p[1] - 1, p[2]);
  }
  function toISO(ms) {
    const d = new Date(ms);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function addDays(iso, n) { return toISO(parseISO(iso) + n * DAY); }
  function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / DAY); }
  function todayISO(now) {
    const d = now || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  // 1 = lunedì … 7 = domenica
  function weekday(iso) {
    const w = new Date(parseISO(iso)).getUTCDay();
    return w === 0 ? 7 : w;
  }
  function mondayOf(iso) { return addDays(iso, 1 - weekday(iso)); }

  function fmtDate(iso) {
    if (!iso) return '';
    const p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }
  function fmtDayMonth(iso) {
    const p = iso.split('-');
    return Number(p[2]) + ' ' + MESI_BREVI[Number(p[1]) - 1];
  }
  function fmtDateLong(iso) {
    return GIORNI[weekday(iso) - 1] + ' ' + Number(iso.slice(8, 10)) + ' ' + MESI[Number(iso.slice(5, 7)) - 1];
  }
  function parseDateIT(s) {
    const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    return m[3] + '-' + pad(+m[2]) + '-' + pad(+m[1]);
  }

  // Ritmo in secondi/km -> "m:ss"
  function fmtPace(sec) {
    if (sec == null || !isFinite(sec)) return '–';
    let s = Math.round(sec);
    const neg = s < 0;
    s = Math.abs(s);
    return (neg ? '-' : '') + Math.floor(s / 60) + ':' + pad(s % 60);
  }
  function parsePace(str) {
    const m = String(str || '').trim().match(/^(\d{1,2})[:.,'](\d{1,2})"?$/);
    if (!m || +m[2] > 59) return null;
    return +m[1] * 60 + +m[2];
  }
  function fmtPaceRange(r) {
    if (!r) return '';
    const a = fmtPace(r.fast), b = fmtPace(r.slow);
    return a === b ? a : a + '–' + b;
  }

  // Durata in secondi -> "h:mm:ss" oppure "m:ss"
  function fmtDuration(sec) {
    if (sec == null || !isFinite(sec)) return '–';
    const s = Math.round(sec);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return h ? h + ':' + pad(m) + ':' + pad(r) : m + ':' + pad(r);
  }
  // Durata in stile gara: 1h45' oppure 2h01'08"
  function fmtHM(sec) {
    const s = Math.round(sec);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return h + 'h' + pad(m) + "'" + (r ? pad(r) + '"' : '');
  }
  // "1:17:53" | "26:20" | "45" (minuti) -> secondi
  function parseDuration(str) {
    const t = String(str == null ? '' : str).trim();
    if (!t) return null;
    const parts = t.replace(/[.,']/g, ':').replace(/"/g, '').split(':');
    if (parts.some(p => !/^\d+$/.test(p))) return null;
    const n = parts.map(Number);
    if (n.length === 1) return n[0] * 60;
    if (n.length === 2) return n[1] > 59 ? null : n[0] * 60 + n[1];
    if (n.length === 3) return (n[1] > 59 || n[2] > 59) ? null : n[0] * 3600 + n[1] * 60 + n[2];
    return null;
  }
  // Brevi durate per le ripetute: 45" / 2' / 1'30"
  function fmtShort(sec) {
    if (sec < 60) return sec + '"';
    const m = Math.floor(sec / 60), r = sec % 60;
    return m + "'" + (r ? pad(r) + '"' : '');
  }

  // Km con la virgola: 29.5 -> "29,5", 30 -> "30", 21.0975 -> "21,1"
  function fmtKm(km, dec) {
    if (km == null || !isFinite(km)) return '–';
    const d = dec == null ? 1 : dec;
    let s = (Math.round(km * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d);
    if (dec == null) s = s.replace(/\.0$/, '');
    return s.replace('.', ',');
  }
  function parseNum(str) {
    if (str == null || String(str).trim() === '') return null;
    const v = Number(String(str).trim().replace(',', '.'));
    return isFinite(v) ? v : null;
  }
  function roundHalf(x) { return Math.round(x * 2) / 2; }

  return {
    DAY, GIORNI, GIORNI_BREVI, MESI, MESI_BREVI, pad,
    parseISO, toISO, addDays, daysBetween, todayISO, weekday, mondayOf,
    fmtDate, fmtDayMonth, fmtDateLong, parseDateIT,
    fmtPace, parsePace, fmtPaceRange, fmtDuration, fmtHM, parseDuration, fmtShort,
    fmtKm, parseNum, roundHalf
  };
})();

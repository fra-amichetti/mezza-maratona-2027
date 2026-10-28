/* Import dell'export Strava (activities.csv) e abbinamento ai giorni del piano. */
var MM = globalThis.MM || (globalThis.MM = {});

MM.strava = (function () {
  const U = MM.util;

  // Parser CSV con virgolette, virgole e a capo dentro i campi
  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQ = false;
    const s = String(text || '').replace(/^﻿/, '');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inQ) {
        if (c === '"') {
          if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false;
        } else field += c;
      } else if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    gen: 1, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, dic: 12 };

  // "Oct 4, 2026, 7:12:33 AM" | "4 ott 2026, 07:12:33" | "2026-10-04 07:12:33"
  function parseStravaDate(str) {
    const t = String(str || '').trim();
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = t.match(/^([A-Za-zàé]{3})[a-zàé]*\.? (\d{1,2}), (\d{4})/);
    if (m && MONTHS[m[1].toLowerCase()]) return m[3] + '-' + U.pad(MONTHS[m[1].toLowerCase()]) + '-' + U.pad(+m[2]);
    m = t.match(/^(\d{1,2}) ([A-Za-zàé]{3})[a-zàé]*\.? (\d{4})/);
    if (m && MONTHS[m[2].toLowerCase()]) return m[3] + '-' + U.pad(MONTHS[m[2].toLowerCase()]) + '-' + U.pad(+m[1]);
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return m[3] + '-' + U.pad(+m[2]) + '-' + U.pad(+m[1]);
    return null;
  }

  function col(header, names) {
    for (const n of names) {
      const i = header.findIndex(h => h.trim().toLowerCase() === n);
      if (i >= 0) return i;
    }
    return -1;
  }
  function num(v) {
    if (v == null) return null;
    const t = String(v).trim();
    if (!t) return null;
    // "1.234,5" -> 1234.5 ; "10,02" -> 10.02 ; "10.02" -> 10.02
    const norm = /,\d+$/.test(t) && t.indexOf('.') >= 0 ? t.replace(/\./g, '').replace(',', '.') : t.replace(',', '.');
    const x = Number(norm);
    return isFinite(x) ? x : null;
  }

  function parseActivities(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) return { error: 'File vuoto o non valido', runs: [] };
    const h = rows[0];
    const iDate = col(h, ['activity date', 'data attività', 'data dell\'attività']);
    const iName = col(h, ['activity name', 'nome attività', 'nome dell\'attività']);
    const iType = col(h, ['activity type', 'tipo attività', 'tipo di attività']);
    const iDist = col(h, ['distance', 'distanza']);
    const iMov = col(h, ['moving time', 'tempo in movimento']);
    const iElap = col(h, ['elapsed time', 'tempo trascorso']);
    const iHr = col(h, ['average heart rate', 'frequenza cardiaca media']);
    const iHrMax = col(h, ['max heart rate', 'frequenza cardiaca massima']);
    if (iDate < 0 || iType < 0 || iDist < 0) return { error: 'Non trovo le colonne di Strava (data, tipo, distanza). È il file activities.csv?', runs: [] };
    const runs = [];
    rows.slice(1).forEach((r, idx) => {
      const type = (r[iType] || '').trim();
      if (!/run|corsa/i.test(type)) return;
      const date = parseStravaDate(r[iDate]);
      let km = num(r[iDist]);
      if (!date || !km) return;
      if (km > 500) km = km / 1000;          // alcuni export riportano i metri
      const timeSec = num(r[iMov]) || num(r[iElap]);
      runs.push({
        stravaRow: idx + 1, date, name: iName >= 0 ? r[iName] : '', km: Math.round(km * 100) / 100,
        timeSec: timeSec ? Math.round(timeSec) : null,
        hrAvg: iHr >= 0 && num(r[iHr]) ? Math.round(num(r[iHr])) : null,
        hrMax: iHrMax >= 0 && num(r[iHrMax]) ? Math.round(num(r[iHrMax])) : null
      });
    });
    return { error: null, runs };
  }

  // Attività dall'API di Strava (/athlete/activities) -> corse nel formato dell'app
  function fromApi(list) {
    return (list || [])
      .filter(a => /run/i.test(a.sport_type || a.type || ''))
      .map(a => ({
        stravaId: String(a.id),
        date: String(a.start_date_local || a.start_date || '').slice(0, 10),
        name: a.name || '',
        km: Math.round((a.distance || 0) / 10) / 100,
        timeSec: a.moving_time || a.elapsed_time || null,
        hrAvg: a.average_heartrate ? Math.round(a.average_heartrate) : null,
        hrMax: a.max_heartrate ? Math.round(a.max_heartrate) : null,
        cadence: a.average_cadence ? MM.cadence.normalize(a.average_cadence) : null
      }))
      .filter(r => r.km > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.date));
  }

  // Id Strava già presenti nei dati (per non importare due volte la stessa corsa)
  function knownIds(db) {
    const ids = {};
    Object.keys(db.logs || {}).forEach(k => { if (db.logs[k].stravaId) ids[db.logs[k].stravaId] = true; });
    (db.extraRuns || []).forEach(r => { if (r.stravaId) ids[r.stravaId] = true; });
    return ids;
  }

  // Abbina ogni corsa a una seduta del piano nello stesso giorno (se c'è e non è già registrata)
  function match(db, runs) {
    const known = knownIds(db);
    return runs.map(r => {
      if (r.stravaId && known[r.stravaId]) return Object.assign({}, r, { status: 'known' });
      const sess = MM.plan.sessionsOnDate(db, r.date).find(s => MM.plan.isRun(s) || (s.original && MM.plan.isRun(s.original)));
      const existing = sess && db.logs[sess.id] && db.logs[sess.id].status === 'done';
      const dup = (db.extraRuns || []).find(x => x.date === r.date && Math.abs((x.km || 0) - r.km) < 0.3);
      const dupExtra = !!dup;
      return Object.assign({}, r, {
        sessionId: sess ? sess.id : null, sessionTitle: sess ? MM.plan.title(sess) : null, dupExtraId: dup ? dup.id : null,
        status: existing || dupExtra ? 'already' : sess ? 'match' : 'extra'
      });
    });
  }

  // Divide le corse in "importabili da sole" (abbinamento sicuro) e "da confermare".
  // Sicure: corsa unica nel suo giorno, seduta del piano non ancora registrata e km plausibili
  // (tra il 50% e il 160% del previsto), oppure corsa già presente fuori piano da collegare.
  function autoSplit(db, rows) {
    const perDay = {};
    rows.forEach(r => { perDay[r.date] = (perDay[r.date] || 0) + 1; });
    const auto = [], ask = [];
    rows.forEach(r => {
      if (r.status === 'known') return;
      let safe = false;
      if (r.dupExtraId) safe = true;
      else if (r.status === 'match' && perDay[r.date] === 1) {
        const s = MM.plan.findSession(db, r.sessionId);
        const planned = s ? (MM.plan.isRun(s) ? s.km : (s.original && s.original.km) || 0) : 0;
        safe = planned > 0 && r.km >= planned * 0.5 && r.km <= planned * 1.6;
      }
      (safe ? auto : ask).push(r);
    });
    return { auto, ask };
  }

  return { parseCSV, parseStravaDate, parseActivities, fromApi, knownIds, match, autoSplit };
})();

/* Grafici SVG minimi (barre raggruppate e linee) con tooltip al passaggio del mouse. */
var MM = globalThis.MM || (globalThis.MM = {});

MM.charts = (function () {
  const PAD = { l: 52, r: 16, t: 14, b: 34 };

  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function niceTicks(min, max, count) {
    const span = max - min || 1;
    const step0 = span / (count || 4);
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0) || step0;
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  }

  function legend(series) {
    if (series.length < 2) return '';
    return '<div class="chart-legend">' + series.map(s =>
      '<span><i style="background:' + s.color + (s.outline ? ';background:transparent;border:2px solid ' + s.color : '') + '"></i>' + esc(s.name) + '</span>').join('') + '</div>';
  }

  // Barre raggruppate: labels[], series [{name, values[], color, outline}]
  function bars(opt) {
    const W = opt.width || 720, H = opt.height || 240;
    const n = opt.labels.length;
    const all = opt.series.flatMap(s => s.values).filter(v => v != null);
    const max = Math.max(1, ...all) * 1.08;
    const ticks = niceTicks(0, max, 4);
    const top = Math.max(max, ticks[ticks.length - 1]);
    const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
    const y = v => PAD.t + ih - (v / top) * ih;
    const band = iw / n;
    const gap = 2;
    const bw = Math.max(3, Math.min(18, (band * 0.75 - gap * (opt.series.length - 1)) / opt.series.length));
    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart" role="img" aria-label="' + esc(opt.title || '') + '">';
    ticks.forEach(t => {
      svg += '<line class="grid" x1="' + PAD.l + '" x2="' + (W - PAD.r) + '" y1="' + y(t) + '" y2="' + y(t) + '"/>' +
        '<text class="axis" x="' + (PAD.l - 8) + '" y="' + (y(t) + 4) + '" text-anchor="end">' + esc(opt.yFormat ? opt.yFormat(t) : t) + '</text>';
    });
    opt.labels.forEach((lab, i) => {
      const cx = PAD.l + band * i + band / 2;
      const groupW = bw * opt.series.length + gap * (opt.series.length - 1);
      opt.series.forEach((s, k) => {
        const v = s.values[i];
        if (v == null || v <= 0) return;
        const x = cx - groupW / 2 + k * (bw + gap);
        const h = Math.max(1, PAD.t + ih - y(v));
        const r = Math.min(4, bw / 2, h);
        const yy = y(v);
        // rettangolo con angoli superiori arrotondati, ancorato alla base
        const d = 'M' + x + ',' + (PAD.t + ih) + 'V' + (yy + r) + 'Q' + x + ',' + yy + ' ' + (x + r) + ',' + yy +
          'H' + (x + bw - r) + 'Q' + (x + bw) + ',' + yy + ' ' + (x + bw) + ',' + (yy + r) + 'V' + (PAD.t + ih) + 'Z';
        svg += s.outline
          ? '<path d="' + d + '" style="fill:none;stroke:' + s.color + '" stroke-width="1.5"/>'
          : '<path d="' + d + '" style="fill:' + s.color + '"/>';
      });
      const tip = opt.tip ? opt.tip(i) : lab;
      svg += '<rect class="hit" x="' + (PAD.l + band * i) + '" y="' + PAD.t + '" width="' + band + '" height="' + ih + '" data-tip="' + esc(tip) + '"/>';
      if (n <= 12 || i % Math.ceil(n / 12) === 0) {
        svg += '<text class="axis" x="' + cx + '" y="' + (H - 12) + '" text-anchor="middle">' + esc(lab) + '</text>';
      }
    });
    svg += '<line class="base" x1="' + PAD.l + '" x2="' + (W - PAD.r) + '" y1="' + (PAD.t + ih) + '" y2="' + (PAD.t + ih) + '"/>';
    return legend(opt.series) + svg + '</svg>';
  }

  // Linee: xLabels[], series [{name, values[] (null = buco), color, dashed}], invert = valori bassi in alto (ritmi)
  function lines(opt) {
    const W = opt.width || 720, H = opt.height || 220;
    const n = opt.labels.length;
    const all = opt.series.flatMap(s => s.values).filter(v => v != null);
    if (!all.length) return '<p class="muted">Ancora nessun dato.</p>';
    let min = Math.min(...all), max = Math.max(...all);
    const padv = (max - min) * 0.15 || (opt.minSpan || 10);
    min -= padv; max += padv;
    if (opt.zeroBase) min = 0;
    const ticks = niceTicks(min, max, 4);
    const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
    const y = v => opt.invert ? PAD.t + ((v - min) / (max - min)) * ih : PAD.t + ih - ((v - min) / (max - min)) * ih;
    const x = i => n === 1 ? PAD.l + iw / 2 : PAD.l + (i / (n - 1)) * iw;
    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart" role="img" aria-label="' + esc(opt.title || '') + '">';
    ticks.filter(t => t >= min && t <= max).forEach(t => {
      svg += '<line class="grid" x1="' + PAD.l + '" x2="' + (W - PAD.r) + '" y1="' + y(t) + '" y2="' + y(t) + '"/>' +
        '<text class="axis" x="' + (PAD.l - 8) + '" y="' + (y(t) + 4) + '" text-anchor="end">' + esc(opt.yFormat ? opt.yFormat(t) : t) + '</text>';
    });
    opt.labels.forEach((lab, i) => {
      if (n <= 10 || i % Math.ceil(n / 10) === 0 || i === n - 1) {
        svg += '<text class="axis" x="' + x(i) + '" y="' + (H - 12) + '" text-anchor="middle">' + esc(lab) + '</text>';
      }
    });
    opt.series.forEach((s, k) => {
      let d = '', pen = false;
      s.values.forEach((v, i) => {
        if (v == null) { if (!s.connect) pen = false; return; }
        d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1);
        pen = true;
      });
      svg += '<path d="' + d + '" style="fill:none;stroke:' + s.color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"' + (s.dashed ? ' stroke-dasharray="5 5"' : '') + '/>';
      s.values.forEach((v, i) => {
        if (v == null || s.noDots) return;
        const tip = opt.tip ? opt.tip(i, k) : s.name + ': ' + (opt.yFormat ? opt.yFormat(v) : v);
        svg += '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="4.5" style="fill:' + s.color + '" class="dot"/>' +
          '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="12" class="hit" data-tip="' + esc(tip) + '"/>';
      });
    });
    return legend(opt.series) + svg + '</svg>';
  }

  // Tooltip unico per tutti i grafici
  function initTooltip() {
    const tip = document.createElement('div');
    tip.className = 'tooltip';
    document.body.appendChild(tip);
    document.addEventListener('mousemove', e => {
      const el = e.target.closest && e.target.closest('[data-tip]');
      if (!el) { tip.style.opacity = 0; return; }
      tip.textContent = el.getAttribute('data-tip');
      tip.style.opacity = 1;
      const x = Math.min(window.innerWidth - tip.offsetWidth - 8, e.clientX + 14);
      tip.style.transform = 'translate(' + x + 'px,' + (e.clientY + 14) + 'px)';
    });
  }

  return { bars, lines, initTooltip };
})();

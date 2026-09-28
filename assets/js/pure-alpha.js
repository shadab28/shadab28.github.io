/* Pure Alpha research dashboard. Reads window.PURE_ALPHA (assets/js/pure-alpha-data.js),
   which tools/build_pure_alpha_data.py generates from the Pure Alpha research run. Charts reuse the
   site's chart styling (.chart, .chart__tip, .grid, .s-a, .s-b); no chart library. */
(function () {
  "use strict";
  var D = window.PURE_ALPHA;
  if (!D) return;

  var NS = "http://www.w3.org/2000/svg";
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MINUS = "−";

  /* ---------- formatting (Indian units) ---------- */
  function sign(v) { return v < 0 ? MINUS : ""; }
  function inr(v) {
    var a = Math.abs(v);
    if (a >= 1e7) return sign(v) + "₹" + (a / 1e7).toFixed(2) + " Cr";
    if (a >= 1e5) return sign(v) + "₹" + (a / 1e5).toFixed(1) + " L";
    return sign(v) + "₹" + Math.round(a).toLocaleString("en-IN");
  }
  function cr(v, dp) { return sign(v) + "₹" + (Math.abs(v) / 1e7).toFixed(dp == null ? 2 : dp) + " Cr"; }
  function pct(v, dp) { return sign(v) + Math.abs(v).toFixed(dp == null ? 1 : dp) + "%"; }
  function num(v) { return Math.round(v).toLocaleString("en-IN"); }
  function fdate(iso) { var p = iso.slice(0, 10).split("-"); return +p[2] + " " + MONTHS[+p[1] - 1] + " " + p[0]; }
  function cls(v) { return v < 0 ? "neg" : v > 0 ? "pos" : ""; }

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function niceStep(range, target) {
    var raw = range / Math.max(1, target);
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var n = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  }
  function onResize(node, fn) {
    if (!("ResizeObserver" in window)) return;
    var last = node.clientWidth;
    new ResizeObserver(function () {
      if (Math.abs(node.clientWidth - last) > 2) { last = node.clientWidth; fn(); }
    }).observe(node);
  }
  function placeTip(tip, x, W, top) {
    var tw = tip.offsetWidth, left = x + 14;
    if (left + tw > W) left = x - tw - 14;
    tip.style.transform = "translate(" + Math.max(0, left) + "px," + (top || 6) + "px)";
  }

  /* ---------- time-series chart (shared x range, linked hover) ---------- */
  function timeChart(frame, cfg) {
    var tip = frame.querySelector(".chart__tip");
    var svg, api = {}, geo = null;
    var dates = cfg.dates;

    api.render = function (i0, i1) {
      api.i0 = i0; api.i1 = i1;
      var W = frame.clientWidth, H = frame.clientHeight;
      if (!W || !H) return;
      if (svg) svg.remove();
      var compact = W < 560;
      var m = { t: 10, r: compact ? 50 : 64, b: cfg.noX ? 8 : 24, l: compact ? 44 : 54 };
      var iw = W - m.l - m.r, ih = H - m.t - m.b;
      var lo = Infinity, hi = -Infinity;
      cfg.series.forEach(function (s) {
        if (s.hidden) return;
        for (var i = i0; i <= i1; i++) { var v = s.values[i]; if (v != null) { if (v < lo) lo = v; if (v > hi) hi = v; } }
      });
      if (cfg.zeroTop) hi = 0;
      if (cfg.includeZero && i0 === 0) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); } // zero baseline on the full history only
      var step = niceStep(hi - lo || 1, cfg.ticks || (compact ? 4 : 5));
      lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
      if (hi === lo) hi = lo + step;
      var n = i1 - i0;
      var x = function (i) { return m.l + ((i - i0) / Math.max(1, n)) * iw; };
      var y = function (v) { return m.t + (1 - (v - lo) / (hi - lo)) * ih; };
      geo = { x: x, y: y, m: m, W: W, H: H, iw: iw };

      svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": frame.getAttribute("data-label") });
      frame.insertBefore(svg, tip);
      var g = el("g", { "class": "grid" }, svg);
      for (var v = lo; v <= hi + step / 1e6; v += step) {
        var yy = Math.round(y(v)) + 0.5;
        el("line", { x1: m.l, x2: W - m.r, y1: yy, y2: yy, "class": Math.abs(v) < step / 1e6 ? "zero" : null }, g);
        el("text", { x: m.l - 8, y: yy + 4, "text-anchor": "end" }, svg).textContent = cfg.yFmt(v);
      }
      if (!cfg.noX) {
        var spanDays = (new Date(dates[i1]) - new Date(dates[i0])) / 864e5;
        var monthly = spanDays < 560;
        var klen = monthly ? 7 : 4, prevKey = dates[i0].slice(0, klen);
        for (var i = i0 + 1; i <= i1; i++) {
          var d = dates[i], key = d.slice(0, klen);
          if (key === prevKey) continue;
          prevKey = key;
          if (monthly && [1, 4, 7, 10].indexOf(+d.slice(5, 7)) < 0) continue;
          if (!monthly && compact && spanDays > 2500 && +key % 2) continue;
          var xx = Math.round(x(i)) + 0.5;
          el("line", { x1: xx, x2: xx, y1: H - m.b, y2: H - m.b + 4, stroke: "var(--line-strong)" }, g);
          el("text", { x: xx, y: H - m.b + 16, "text-anchor": "middle" }, svg).textContent =
            monthly ? MONTHS[+d.slice(5, 7) - 1] + " " + d.slice(2, 4) : key;
        }
      }
      function path(vals) {
        var s = "", pen = false;
        for (var i = i0; i <= i1; i++) {
          var v = vals[i];
          if (v == null) { pen = false; continue; }
          s += (pen ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1);
          pen = true;
        }
        return s;
      }
      cfg.series.forEach(function (s) {
        if (s.hidden) return;
        if (s.area) {
          var base = y(Math.max(lo, Math.min(hi, 0))).toFixed(1);
          el("path", { d: path(s.values) + "L" + x(i1).toFixed(1) + "," + base + "L" + x(i0).toFixed(1) + "," + base + "Z", "class": s.area }, svg);
        }
        el("path", { d: path(s.values), "class": s.cls }, svg);
      });
      (cfg.markers || []).forEach(function (mk) {
        if (mk.i < i0 || mk.i > i1) return;
        var mx = x(mk.i), my = y(mk.v);
        el("circle", { cx: mx, cy: my, r: 4, "class": mk.cls }, svg);
        var t = el("text", { x: mx + (mx > W - 160 ? -8 : 8), y: my + (mk.below ? 16 : -8), "class": "mark-label", "text-anchor": mx > W - 160 ? "end" : "start" }, svg);
        t.textContent = mk.label;
      });
      // direct end labels for visible series
      var labels = [];
      cfg.series.forEach(function (s) {
        if (s.hidden || !s.endLabel) return;
        for (var k = i1; k >= i0; k--) if (s.values[k] != null) { labels.push({ y: y(s.values[k]), t: cfg.yFmtEnd(s.values[k]) }); break; }
      });
      labels.sort(function (a, b) { return a.y - b.y; });
      for (var j = 1; j < labels.length; j++) if (labels[j].y - labels[j - 1].y < 13) labels[j].y = labels[j - 1].y + 13;
      labels.forEach(function (lb) { el("text", { x: W - m.r + 8, y: lb.y + 4, "class": "endlabel" }, svg).textContent = lb.t; });

      var hover = el("g", { visibility: "hidden" }, svg);
      api._xh = el("line", { y1: m.t, y2: H - m.b, "class": "xhair" }, hover);
      api._dots = cfg.series.filter(function (s) { return !s.hidden && s.dot; }).map(function (s) {
        return { s: s, c: el("circle", { r: 4, "class": s.dot }, hover) };
      });
      api._hover = hover;
      var hit = el("rect", { x: m.l, y: 0, width: iw, height: H, fill: "transparent" }, svg);
      function idxAt(e) {
        var r = svg.getBoundingClientRect();
        var px = (e.clientX - r.left) * (W / r.width);
        return Math.max(i0, Math.min(i1, i0 + Math.round(((px - m.l) / iw) * n)));
      }
      hit.addEventListener("pointermove", function (e) { cfg.onHover(idxAt(e)); });
      hit.addEventListener("pointerdown", function (e) { cfg.onHover(idxAt(e)); });
      hit.addEventListener("pointerleave", function () { cfg.onHover(null); });
    };
    api.show = function (i) {
      if (!geo || !api._hover) return;
      if (i == null || i < api.i0 || i > api.i1) { api._hover.setAttribute("visibility", "hidden"); if (tip) tip.classList.remove("is-on"); return; }
      var xx = geo.x(i);
      api._xh.setAttribute("x1", xx); api._xh.setAttribute("x2", xx);
      api._dots.forEach(function (d) {
        var v = d.s.values[i];
        d.c.setAttribute("visibility", v == null ? "hidden" : "visible");
        if (v != null) { d.c.setAttribute("cx", xx); d.c.setAttribute("cy", geo.y(v)); }
      });
      api._hover.setAttribute("visibility", "visible");
      if (tip && cfg.tip) { tip.innerHTML = cfg.tip(i); tip.classList.add("is-on"); placeTip(tip, xx, geo.W, geo.m.t + 4); }
    };
    return api;
  }

  /* ---------- bar chart ---------- */
  function barChart(frame, cfg) {
    var tip = frame.querySelector(".chart__tip");
    function render() {
      var W = frame.clientWidth, H = frame.clientHeight;
      if (!W || !H) return;
      var old = frame.querySelector("svg"); if (old) old.remove();
      var compact = W < 560;
      var m = { t: 16, r: 12, b: 26, l: compact ? 46 : 56 };
      var iw = W - m.l - m.r, ih = H - m.t - m.b;
      var vals = cfg.values, n = vals.length;
      var lo = Math.min(0, Math.min.apply(null, vals)), hi = Math.max(0, Math.max.apply(null, vals));
      var step = niceStep(hi - lo || 1, compact ? 4 : 5);
      lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
      var y = function (v) { return m.t + (1 - (v - lo) / (hi - lo)) * ih; };
      var bw = iw / n, gap = Math.min(2, bw * 0.2);
      var svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": frame.getAttribute("data-label") });
      frame.insertBefore(svg, tip);
      var g = el("g", { "class": "grid" }, svg);
      for (var v = lo; v <= hi + step / 1e6; v += step) {
        var yy = Math.round(y(v)) + 0.5;
        el("line", { x1: m.l, x2: W - m.r, y1: yy, y2: yy, "class": Math.abs(v) < step / 1e6 ? "zero" : null }, g);
        el("text", { x: m.l - 8, y: yy + 4, "text-anchor": "end" }, svg).textContent = cfg.yFmt(v);
      }
      var every = cfg.labelEvery ? cfg.labelEvery(compact) : 1;
      var bars = [];
      vals.forEach(function (v, i) {
        var x0 = m.l + i * bw + gap / 2, y0 = y(Math.max(0, v)), h = Math.abs(y(v) - y(0));
        var cl = cfg.colour ? cfg.colour(i, v) : (v < 0 ? "bar-neg" : "bar-pos");
        bars.push(el("rect", { x: x0, y: y0, width: Math.max(1, bw - gap), height: Math.max(v === 0 ? 0 : 1, h), "class": cl }, svg));
        if (i % every === 0 && cfg.labels[i] != null) {
          el("text", { x: x0 + (bw - gap) / 2, y: H - m.b + 16, "text-anchor": "middle" }, svg).textContent = cfg.labels[i];
        }
      });
      (cfg.marks || []).forEach(function (mk) {
        var mx = m.l + mk.pos * iw;
        el("line", { x1: mx, x2: mx, y1: m.t, y2: H - m.b, "class": "bar-mark" }, svg);
        el("text", { x: mx + 4, y: m.t + 2 + (mk.row || 0) * 12, "class": "mark-label" }, svg).textContent = mk.label;
      });
      var hit = el("rect", { x: m.l, y: 0, width: iw, height: H, fill: "transparent" }, svg);
      var cur = -1;
      function show(i) {
        if (cur >= 0 && bars[cur]) bars[cur].classList.remove("hl");
        cur = i;
        if (i < 0) { tip.classList.remove("is-on"); return; }
        bars[i].classList.add("hl");
        tip.innerHTML = cfg.tip(i);
        tip.classList.add("is-on");
        placeTip(tip, m.l + (i + 0.5) * bw, W, m.t);
      }
      function idx(e) {
        var r = svg.getBoundingClientRect();
        var px = (e.clientX - r.left) * (W / r.width);
        return Math.max(0, Math.min(n - 1, Math.floor((px - m.l) / bw)));
      }
      hit.addEventListener("pointermove", function (e) { show(idx(e)); });
      hit.addEventListener("pointerdown", function (e) { show(idx(e)); });
      hit.addEventListener("pointerleave", function () { show(-1); });
      frame._show = show; frame._n = n; frame._cur = function () { return cur; };
    }
    frame.setAttribute("tabindex", "0");
    frame.addEventListener("keydown", function (e) {
      if (!frame._show) return;
      var c = frame._cur();
      if (e.key === "ArrowRight") { frame._show(Math.min(frame._n - 1, c + 1)); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { frame._show(Math.max(0, c < 0 ? frame._n - 1 : c - 1)); e.preventDefault(); }
      else if (e.key === "Escape") frame._show(-1);
    });
    frame.addEventListener("blur", function () { if (frame._show) frame._show(-1); });
    render();
    onResize(frame, render);
  }

  /* ================================================================
     1. Performance: equity + linked drawdown
     ================================================================ */
  var E = D.equity, B = D.benchmark;
  var dates = E.d, N = dates.length;
  var peakArr = [], pk = -Infinity;
  E.cum.forEach(function (v) { pk = Math.max(pk, v); peakArr.push(pk); });
  var bench = B ? B.pnl : null;
  var eqFrame = document.getElementById("pa-equity");
  var ddFrame = document.getElementById("pa-dd");
  var benchToggle = document.getElementById("pa-bench");
  var charts = [];

  function hoverAll(i) { charts.forEach(function (c) { c.show(i); }); }

  if (eqFrame && ddFrame) {
    var sBench = { values: bench || [], cls: "s-b", dot: "dot-b", endLabel: true, hidden: !(benchToggle && benchToggle.checked) || !bench };
    var eq = timeChart(eqFrame, {
      dates: dates,
      series: [
        { values: peakArr, cls: "s-peak" },
        sBench,
        { values: E.cum, cls: "s-a", dot: "dot-a", endLabel: true }
      ],
      yFmt: function (v) { return (v / 1e7).toFixed(v % 1e7 === 0 ? 0 : 1); },
      yFmtEnd: function (v) { return (v / 1e7).toFixed(2); },
      includeZero: true, noX: true,
      onHover: hoverAll,
      tip: function (i) {
        var s = "<b>" + fdate(dates[i]) + "</b>" +
          '<div class="row"><span><i class="sw"></i>Cumulative P&amp;L</span><b>' + cr(E.cum[i]) + "</b></div>" +
          '<div class="row"><span>Running peak</span><b>' + cr(peakArr[i]) + "</b></div>" +
          '<div class="row"><span>Drawdown</span><b>' + (E.dd[i] < 0 ? cr(E.dd[i]) : "at peak") + "</b></div>";
        if (!sBench.hidden) s += '<div class="row"><span><i class="sw b"></i>NIFTY 50 TRI</span><b>' + (bench[i] == null ? "n/a" : cr(bench[i])) + "</b></div>";
        return s;
      }
    });
    var worst = D.drawdowns[0];
    var tIdx = dates.indexOf(worst.trough);
    var dd = timeChart(ddFrame, {
      dates: dates,
      series: [{ values: E.dd, cls: "s-dd-line", area: "s-dd", dot: "dot-n" }],
      yFmt: function (v) { return (v / 1e7).toFixed(1); },
      yFmtEnd: function (v) { return (v / 1e7).toFixed(2); },
      zeroTop: true, ticks: 3,
      markers: [{ i: tIdx, v: worst.depth, cls: "dot-n", label: "Max DD " + cr(worst.depth) + " · " + fdate(worst.trough) }],
      onHover: hoverAll,
      tip: null
    });
    charts = [eq, dd];

    var range = { i0: 0, i1: N - 1 };
    function draw() { charts.forEach(function (c) { c.render(range.i0, range.i1); }); }
    function setRange(years) {
      if (!years) { range.i0 = 0; }
      else {
        var end = new Date(dates[N - 1]); end.setFullYear(end.getFullYear() - years);
        var iso = end.toISOString().slice(0, 10), k = 0;
        while (k < N - 1 && dates[k] < iso) k++;
        range.i0 = k;
      }
      range.i1 = N - 1;
      draw();
    }
    document.querySelectorAll("[data-range]").forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll("[data-range]").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", "true");
        setRange(+b.getAttribute("data-range"));
      });
    });
    if (benchToggle) {
      if (!bench) benchToggle.closest("label").hidden = true;
      benchToggle.addEventListener("change", function () {
        sBench.hidden = !benchToggle.checked;
        var lg = document.getElementById("pa-bench-legend");
        if (lg) lg.hidden = sBench.hidden;
        draw();
      });
    }
    // keyboard stepping on the equity chart drives both charts
    var kIdx = null;
    eqFrame.setAttribute("tabindex", "0");
    eqFrame.addEventListener("keydown", function (e) {
      var i = kIdx == null ? range.i1 : kIdx;
      if (e.key === "ArrowLeft") i = Math.max(range.i0, i - 1);
      else if (e.key === "ArrowRight") i = Math.min(range.i1, i + 1);
      else if (e.key === "Home") i = range.i0;
      else if (e.key === "End") i = range.i1;
      else if (e.key === "Escape") { kIdx = null; hoverAll(null); return; }
      else return;
      e.preventDefault(); kIdx = i; hoverAll(i);
    });
    eqFrame.addEventListener("blur", function () { kIdx = null; hoverAll(null); });
    draw();
    onResize(eqFrame, draw);
  }

  /* ================================================================
     2. Annual table (inline bars) and monthly heatmap
     ================================================================ */
  var yBody = document.getElementById("pa-years");
  if (yBody) {
    var maxAbs = Math.max.apply(null, D.years.map(function (y) { return Math.abs(y.net); }));
    var byYearBench = B ? B.years : {};
    var n0 = D.years.length;
    yBody.innerHTML = D.years.map(function (y, k) {
      var partial = k === 0 ? "¹" : k === n0 - 1 ? "²" : "";
      var label = y.year + (k === n0 - 1 ? " YTD" : "") + partial;
      var w = (Math.abs(y.net) / maxAbs * 50).toFixed(1);
      var bt = byYearBench[y.year];
      return "<tr><td>" + label + '</td><td class="' + cls(y.net) + '">' + inr(y.net) + '</td><td class="bar-cell"><div class="inbar"><span class="' +
        (y.net < 0 ? "n" : "p") + '" style="width:' + w + '%"></span></div></td><td class="' + cls(y.roc) + '">' + pct(y.roc) + "</td><td>" +
        cr(y.max_dd) + "</td><td>" + num(y.trades) + "</td><td>" + y.win_rate.toFixed(1) + "%</td><td>" + (y.sharpe == null ? "n/a" : sign(y.sharpe) + Math.abs(y.sharpe).toFixed(2)) +
        "</td><td>" + (bt ? pct(bt.ret) : "n/a") + "</td></tr>";
    }).join("");
  }

  var heat = document.getElementById("pa-heat");
  if (heat) {
    var mm = {}, maxM = 0;
    D.months.forEach(function (m) { mm[m.m] = m; maxM = Math.max(maxM, Math.abs(m.roc)); });
    var yrs = D.years.map(function (y) { return y.year; });
    var yTot = {}; D.years.forEach(function (y) { yTot[y.year] = y; });
    var first = D.months[0].m, last = D.months[D.months.length - 1].m;
    var h = '<thead><tr><th scope="col"><span class="visually-hidden">Year</span></th>' + MONTHS.map(function (m) { return '<th scope="col">' + m.toUpperCase() + "</th>"; }).join("") + '<th scope="col">YEAR</th></tr></thead><tbody>';
    yrs.forEach(function (y) {
      h += '<tr><th scope="row">' + y + "</th>";
      for (var k = 1; k <= 12; k++) {
        var key = y + "-" + (k < 10 ? "0" : "") + k, c = mm[key];
        if (!c) {
          var outside = key < first || key > last;
          h += '<td class="na" title="' + (outside ? "Outside the backtest window" : "No positions closed") + '">' + (outside ? "" : "0.0") + "</td>";
          continue;
        }
        var a = Math.min(1, Math.abs(c.roc) / (maxM * 0.6));
        var bg = c.roc >= 0 ? "rgba(62,158,122," + (0.12 + a * 0.73).toFixed(3) + ")" : "rgba(208,120,74," + (0.12 + a * 0.73).toFixed(3) + ")";
        var lab = MONTHS[k - 1] + " " + y + ": " + inr(c.net) + ", " + pct(c.roc, 2) + " of peak margin, " + num(c.trades) + " positions closed";
        h += '<td tabindex="0" style="background:' + bg + '" title="' + lab + '" aria-label="' + lab + '">' + (c.roc < 0 ? MINUS : "") + Math.abs(c.roc).toFixed(1) + "</td>";
      }
      var t = yTot[y];
      h += '<td class="tot ' + cls(t.roc) + '" title="' + y + ": " + inr(t.net) + '">' + pct(t.roc) + "</td></tr>";
    });
    heat.innerHTML = h + "</tbody>";
  }

  /* ================================================================
     3. Trade analytics
     ================================================================ */
  var dist = D.dist;
  var hf = document.getElementById("pa-hist");
  if (hf) {
    var ed = dist.edges, cnt = dist.counts.slice();
    var labs = cnt.map(function (_, i) { var v = ed[i]; return v % 50000 === 0 ? (v === 0 ? "0" : (v / 1e5).toFixed(1).replace(".0", "") + "L") : null; });
    var span = ed[ed.length - 1] - ed[0];
    barChart(hf, {
      values: cnt, labels: labs,
      labelEvery: function (compact) { return compact ? 10 : 5; },
      colour: function (i) { return ed[i] < 0 ? "bar-neg" : "bar-pos"; },
      yFmt: function (v) { return num(v); },
      marks: [
        { pos: (dist.median - ed[0]) / span, label: "median " + inr(dist.median), row: 0 },
        { pos: (dist.mean - ed[0]) / span, label: "mean " + inr(dist.mean), row: 1 }
      ],
      tip: function (i) {
        return "<b>" + inr(ed[i]) + " to " + inr(ed[i + 1]) + "</b>" +
          '<div class="row"><span>Positions</span><b>' + num(cnt[i]) + "</b></div>" +
          '<div class="row"><span>Share</span><b>' + (cnt[i] / D.headline.positions * 100).toFixed(1) + "%</b></div>";
      }
    });
  }

  var holdF = document.getElementById("pa-hold");
  if (holdF) {
    var hb = D.hold_buckets;
    barChart(holdF, {
      values: hb.map(function (b) { return b.net; }),
      labels: hb.map(function (b) { return b.label.replace("Same session", "Same day").replace(" days", "d").replace("Over 40d", ">40d").replace("1 day", "1d"); }),
      yFmt: function (v) { return (v / 1e7).toFixed(0); },
      tip: function (i) {
        var b = hb[i];
        return "<b>Held " + b.label.toLowerCase() + "</b>" +
          '<div class="row"><span>Net P&amp;L</span><b>' + cr(b.net) + "</b></div>" +
          '<div class="row"><span>Positions</span><b>' + num(b.n) + "</b></div>" +
          '<div class="row"><span>Win rate</span><b>' + b.wr.toFixed(1) + "%</b></div>";
      }
    });
    var hbBody = document.getElementById("pa-hold-table");
    if (hbBody) hbBody.innerHTML = hb.map(function (b) {
      return "<tr><td>" + b.label + "</td><td>" + num(b.n) + "</td><td>" + (b.n / D.headline.positions * 100).toFixed(1) + '%</td><td class="' + cls(b.net) + '">' + cr(b.net) + "</td><td>" + b.wr.toFixed(1) + "%</td></tr>";
    }).join("");
  }

  var hourF = document.getElementById("pa-hour");
  if (hourF) {
    var hr = D.hours;
    barChart(hourF, {
      values: hr.map(function (h) { return h.net; }),
      labels: hr.map(function (h) { return h.k === "Special" ? "Spl" : h.k.slice(3) === "15" && h.k !== "15:15" ? h.k.replace(/^0/, "") : null; }),
      labelEvery: function () { return 1; },
      yFmt: function (v) { return (v / 1e7).toFixed(1); },
      tip: function (i) {
        var h = hr[i];
        return "<b>Entry bar " + h.k + "</b>" +
          '<div class="row"><span>Net P&amp;L</span><b>' + inr(h.net) + "</b></div>" +
          '<div class="row"><span>Positions</span><b>' + num(h.n) + "</b></div>" +
          '<div class="row"><span>Win rate</span><b>' + h.wr.toFixed(1) + "%</b></div>";
      }
    });
  }
  var dowBody = document.getElementById("pa-dow");
  if (dowBody) {
    var maxD = Math.max.apply(null, D.dows.map(function (d) { return Math.abs(d.net); }));
    dowBody.innerHTML = D.dows.map(function (d) {
      return "<tr><td>" + d.k + "</td><td>" + num(d.n) + '</td><td class="' + cls(d.net) + '">' + inr(d.net) + '</td><td class="bar-cell"><div class="inbar"><span class="' + (d.net < 0 ? "n" : "p") +
        '" style="width:' + (Math.abs(d.net) / maxD * 50).toFixed(1) + '%"></span></div></td><td>' + d.wr.toFixed(1) + "%</td></tr>";
    }).join("");
  }

  function underRows(list, id) {
    var body = document.getElementById(id);
    if (!body) return;
    var mx = Math.max.apply(null, D.under_top.concat(D.under_bottom).map(function (u) { return Math.abs(u.net); }));
    body.innerHTML = list.map(function (u) {
      return "<tr><td>" + u.s + '</td><td class="' + cls(u.net) + '">' + inr(u.net) + '</td><td class="bar-cell"><div class="inbar"><span class="' + (u.net < 0 ? "n" : "p") +
        '" style="width:' + (Math.abs(u.net) / mx * 50).toFixed(1) + '%"></span></div></td><td>' + num(u.n) + "</td><td>" + u.wr.toFixed(1) + '%</td><td class="' + cls(u.avg) + '">' + inr(u.avg) + "</td></tr>";
    }).join("");
  }
  underRows(D.under_top, "pa-top");
  underRows(D.under_bottom, "pa-bottom");
})();

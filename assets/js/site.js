/* Site behaviour: nav state, section tracking, email, reveal, charts. No dependencies. */
(function () {
  "use strict";

  var doc = document.documentElement;
  doc.classList.add("js");
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Nav: border on scroll, mobile menu ---------- */
  var nav = document.querySelector(".nav");
  if (nav) {
    var onScroll = function () { nav.classList.toggle("is-scrolled", window.scrollY > 8); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    var toggle = nav.querySelector(".nav__toggle");
    if (toggle) {
      var setOpen = function (open) {
        nav.classList.toggle("is-open", open);
        toggle.setAttribute("aria-expanded", String(open));
        toggle.textContent = open ? "Close" : "Menu";
      };
      toggle.addEventListener("click", function () { setOpen(!nav.classList.contains("is-open")); });
      nav.querySelectorAll(".nav__menu a").forEach(function (a) {
        a.addEventListener("click", function () { setOpen(false); });
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && nav.classList.contains("is-open")) { setOpen(false); toggle.focus(); }
      });
    }
  }

  /* ---------- Active section indicator (nav and case-study contents) ---------- */
  function trackSections(linkSelector) {
    var links = Array.prototype.slice.call(document.querySelectorAll(linkSelector));
    if (!links.length || !("IntersectionObserver" in window)) return;
    var map = {};
    links.forEach(function (a) {
      var id = (a.getAttribute("href") || "").split("#")[1];
      var el = id && document.getElementById(id);
      if (el) map[id] = { link: a, el: el };
    });
    var visible = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { visible[en.target.id] = en.isIntersecting; });
      var current = null;
      Object.keys(map).forEach(function (id) { if (visible[id] && !current) current = id; });
      links.forEach(function (a) { a.removeAttribute("aria-current"); });
      if (current) map[current].link.setAttribute("aria-current", "true");
    }, { rootMargin: "-45% 0px -50% 0px" });
    Object.keys(map).forEach(function (id) { io.observe(map[id].el); });
  }
  trackSections(".nav__links a");
  trackSections(".toc a");

  /* ---------- Email: assembled at runtime to keep it out of simple scrapers ---------- */
  document.querySelectorAll("[data-email-user]").forEach(function (el) {
    var addr = el.getAttribute("data-email-user") + "@" + el.getAttribute("data-email-domain");
    el.setAttribute("href", "mailto:" + addr);
    var out = el.querySelector("[data-email-out]");
    if (out) out.textContent = addr;
  });

  /* ---------- Reveal on scroll (one pass, then unobserved) ---------- */
  var revealEls = document.querySelectorAll("[data-reveal]");
  if (!reduceMotion && "IntersectionObserver" in window) {
    var rio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); rio.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    revealEls.forEach(function (el) { rio.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("is-in"); });
  }

  /* ---------- Charts ---------- */
  var NS = "http://www.w3.org/2000/svg";
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function svgEl(name, attrs, parent) {
    var el = document.createElementNS(NS, name);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  function niceStep(range, target) {
    var raw = range / Math.max(1, target);
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var n = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  }
  function fmtDate(iso) {
    var p = iso.split("-");
    return +p[2] + " " + MONTHS[+p[1] - 1] + " " + p[0];
  }
  function drawdown(series) {
    var peak = -Infinity;
    return series.map(function (v) { peak = Math.max(peak, v); return (v / peak - 1) * 100; });
  }

  /* opts: { dates, a, b, names:[a,b], kind:"nav"|"dd", compact } */
  function lineChart(frame, opts) {
    var tip = frame.querySelector(".chart__tip");
    var svg = null;
    var state = { idx: null };

    function render() {
      var W = frame.clientWidth, H = frame.clientHeight;
      if (!W || !H) return;
      if (svg) svg.remove();
      var compact = opts.compact || W < 520;
      var m = { t: 10, r: compact ? 44 : 64, b: 26, l: compact ? 34 : 42 };
      var iw = W - m.l - m.r, ih = H - m.t - m.b;
      var all = opts.a.concat(opts.b);
      var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
      if (opts.kind === "dd") { hi = 0; }
      var step = niceStep(hi - lo, compact ? 4 : 6);
      lo = Math.floor(lo / step) * step;
      hi = Math.ceil(hi / step) * step;
      var n = opts.dates.length;
      var x = function (i) { return m.l + (i / (n - 1)) * iw; };
      var y = function (v) { return m.t + (1 - (v - lo) / (hi - lo)) * ih; };

      svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": frame.getAttribute("data-label") || "" });
      frame.insertBefore(svg, tip);

      var g = svgEl("g", { "class": "grid" }, svg);
      for (var v = lo; v <= hi + 1e-9; v += step) {
        var yy = Math.round(y(v)) + 0.5;
        svgEl("line", { x1: m.l, x2: W - m.r, y1: yy, y2: yy, "class": (opts.kind === "dd" && Math.abs(v) < 1e-9) || (opts.kind === "nav" && Math.abs(v - 100) < 1e-9) ? "zero" : "" }, g);
        var t = svgEl("text", { x: m.l - 8, y: yy + 4, "text-anchor": "end" }, svg);
        t.textContent = opts.kind === "dd" ? Math.round(v) + "%" : Math.round(v);
      }
      // Year ticks
      var lastYear = null;
      opts.dates.forEach(function (d, i) {
        var yr = d.slice(0, 4);
        if (yr !== lastYear && d.slice(5, 7) === "01") {
          lastYear = yr;
          if (compact && +yr % 2) return;
          var xx = Math.round(x(i)) + 0.5;
          svgEl("line", { x1: xx, x2: xx, y1: H - m.b, y2: H - m.b + 4, "class": "" }, g).setAttribute("stroke", "var(--line-strong)");
          var t = svgEl("text", { x: xx, y: H - m.b + 17, "text-anchor": "middle" }, svg);
          t.textContent = yr;
        }
      });

      function pathFor(s) {
        return s.map(function (v, i) { return (i ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1); }).join("");
      }
      if (opts.kind === "dd") {
        var base = y(0).toFixed(1);
        svgEl("path", { d: pathFor(opts.b) + "L" + x(n - 1).toFixed(1) + "," + base + "L" + x(0).toFixed(1) + "," + base + "Z", "class": "s-b-area" }, svg);
        svgEl("path", { d: pathFor(opts.a) + "L" + x(n - 1).toFixed(1) + "," + base + "L" + x(0).toFixed(1) + "," + base + "Z", "class": "s-a-area" }, svg);
      }
      svgEl("path", { d: pathFor(opts.b), "class": "s-b" }, svg);
      svgEl("path", { d: pathFor(opts.a), "class": "s-a" }, svg);

      // Direct end labels (nudged apart if they collide)
      var ya = y(opts.a[n - 1]), yb = y(opts.b[n - 1]);
      if (Math.abs(ya - yb) < 14) { if (ya < yb) { ya -= 7; yb += 7; } else { ya += 7; yb -= 7; } }
      var fmtEnd = function (v) { return opts.kind === "dd" ? v.toFixed(1) + "%" : v.toFixed(0); };
      var la = svgEl("text", { x: W - m.r + 8, y: ya + 4, "class": "endlabel" }, svg);
      la.textContent = fmtEnd(opts.a[n - 1]);
      var lb = svgEl("text", { x: W - m.r + 8, y: yb + 4, "class": "endlabel" }, svg);
      lb.textContent = fmtEnd(opts.b[n - 1]);

      // Hover layer
      var hover = svgEl("g", { visibility: "hidden" }, svg);
      var xh = svgEl("line", { y1: m.t, y2: H - m.b, "class": "xhair" }, hover);
      var da = svgEl("circle", { r: 4, "class": "dot-a" }, hover);
      var db = svgEl("circle", { r: 4, "class": "dot-b" }, hover);
      var hit = svgEl("rect", { x: m.l, y: 0, width: iw, height: H, fill: "transparent" }, svg);

      function show(i) {
        state.idx = i;
        var xx = x(i);
        xh.setAttribute("x1", xx); xh.setAttribute("x2", xx);
        da.setAttribute("cx", xx); da.setAttribute("cy", y(opts.a[i]));
        db.setAttribute("cx", xx); db.setAttribute("cy", y(opts.b[i]));
        hover.setAttribute("visibility", "visible");
        var f = opts.kind === "dd"
          ? function (v) { return v.toFixed(1) + "%"; }
          : function (v) { return v.toFixed(1); };
        tip.innerHTML = "<b>" + fmtDate(opts.dates[i]) + "</b>" +
          '<div class="row"><span><i class="sw"></i>' + opts.names[0] + "</span><b>" + f(opts.a[i]) + "</b></div>" +
          '<div class="row"><span><i class="sw b"></i>' + opts.names[1] + "</span><b>" + f(opts.b[i]) + "</b></div>";
        tip.classList.add("is-on");
        var tw = tip.offsetWidth;
        var left = xx + 14;
        if (left + tw > W) left = xx - tw - 14;
        tip.style.transform = "translate(" + Math.max(0, left) + "px," + (m.t + 4) + "px)";
      }
      function hide() { hover.setAttribute("visibility", "hidden"); tip.classList.remove("is-on"); state.idx = null; }
      function idxAt(evt) {
        var r = svg.getBoundingClientRect();
        var px = (evt.clientX - r.left) * (W / r.width);
        return Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / iw) * (n - 1))));
      }
      hit.addEventListener("pointermove", function (e) { show(idxAt(e)); });
      hit.addEventListener("pointerdown", function (e) { show(idxAt(e)); });
      hit.addEventListener("pointerleave", hide);
      frame._show = show; frame._hide = hide; frame._n = n;
    }

    frame.setAttribute("tabindex", "0");
    frame.addEventListener("keydown", function (e) {
      if (!frame._show) return;
      var i = state.idx == null ? frame._n - 1 : state.idx;
      if (e.key === "ArrowLeft") { frame._show(Math.max(0, i - 1)); e.preventDefault(); }
      else if (e.key === "ArrowRight") { frame._show(Math.min(frame._n - 1, i + 1)); e.preventDefault(); }
      else if (e.key === "Home") { frame._show(0); e.preventDefault(); }
      else if (e.key === "End") { frame._show(frame._n - 1); e.preventDefault(); }
      else if (e.key === "Escape") frame._hide();
    });
    frame.addEventListener("blur", function () { if (frame._hide) frame._hide(); });

    render();
    if ("ResizeObserver" in window) {
      var last = frame.clientWidth;
      new ResizeObserver(function () {
        if (Math.abs(frame.clientWidth - last) > 2) { last = frame.clientWidth; render(); }
      }).observe(frame);
    }
  }

  var data = window.WHEEL_WEEKLY;
  if (data) {
    var names = ["Wheel 3×", "NIFTY 50 TRI"];
    document.querySelectorAll("[data-chart]").forEach(function (frame) {
      var kind = frame.getAttribute("data-chart");
      if (kind === "dd") {
        lineChart(frame, { dates: data.d, a: drawdown(data.s), b: drawdown(data.b), names: names, kind: "dd" });
      } else {
        lineChart(frame, { dates: data.d, a: data.s, b: data.b, names: names, kind: "nav", compact: frame.hasAttribute("data-compact") });
      }
    });
  }
})();

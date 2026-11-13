/* Nisal Shanuka Perera · page-local motion (the engine stays untouched).
   1. top bar: progress, hide on scroll down, active link
   2. split-lines headings
   3. velocity ticker
   4. section backgrounds: one canvas per section, each drawing what that
      section is about. Only visible canvases draw. Phones run at 30 fps and
      1x pixel density. Reduced motion draws one still frame.            */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  try { sessionStorage.setItem('ns-intro', '1'); } catch (e) {}

  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var isSmall = function () { return window.innerWidth <= 760; };
  var coarse = window.matchMedia && matchMedia('(hover: none), (pointer: coarse)').matches;

  /* ---- shared input state --------------------------------------------- */
  var y = window.scrollY, lastY = y, smoothVel = 0, dir = 1, energy = 0;
  window.addEventListener('scroll', function () { y = window.scrollY; }, { passive: true });
  var px = .5, py = .5, pointerAt = -1e9;
  window.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    px = e.clientX / Math.max(window.innerWidth, 1);
    py = e.clientY / Math.max(window.innerHeight, 1);
    pointerAt = performance.now();
  }, { passive: true });

  /* ---- 1. top bar ------------------------------------------------------ */
  var bar = document.querySelector('.bar');
  var links = Array.prototype.slice.call(document.querySelectorAll('.bar__nav a'));
  if ('IntersectionObserver' in window && links.length) {
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var navIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.removeAttribute('aria-current'); });
        var a = byId[e.target.id];
        if (a) a.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['top', 'services', 'work', 'experience', 'contact'].forEach(function (id) {
      var el = document.getElementById(id); if (el) navIo.observe(el);
    });
  }
  var barFocus = false;
  if (bar) {
    bar.addEventListener('focusin', function () { barFocus = true; bar.classList.remove('is-hidden'); });
    bar.addEventListener('focusout', function () { barFocus = false; });
  }

  /* ---- 2. split-lines -------------------------------------------------- */
  var heads = Array.prototype.slice.call(document.querySelectorAll('.split-lines'));
  heads.forEach(function (h) {
    var text = h.textContent.trim(), words = text.split(/\s+/);
    h.setAttribute('aria-label', text);
    h.textContent = '';
    words.forEach(function (w, i) {
      var o = document.createElement('span'); o.className = 'w'; o.setAttribute('aria-hidden', 'true');
      var s = document.createElement('span'); s.textContent = w; s.style.setProperty('--i', i);
      o.appendChild(s); h.appendChild(o);
      if (i < words.length - 1) h.appendChild(document.createTextNode(' '));
    });
  });
  if (reduce || !('IntersectionObserver' in window)) {
    heads.forEach(function (h) { h.classList.add('is-in'); });
  } else {
    var hIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); hIo.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -10% 0px' });
    heads.forEach(function (h) { hIo.observe(h); });
  }

  /* ---- 3. ticker ------------------------------------------------------- */
  var rows = Array.prototype.slice.call(document.querySelectorAll('.ticker__row')).map(function (row) {
    var track = row.querySelector('.ticker__track');
    var clone = track.cloneNode(true); clone.setAttribute('aria-hidden', 'true');
    row.appendChild(clone);
    return { el: row, track: track, x: 0, w: 0, speed: parseFloat(row.getAttribute('data-speed')) || 1 };
  });
  var measureTicker = function () { rows.forEach(function (R) { R.w = R.track.offsetWidth || 1; }); };
  measureTicker();
  window.addEventListener('resize', measureTicker);
  var tickerOn = true, ticker = document.querySelector('.ticker');
  if (ticker && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (e) { tickerOn = e[0].isIntersecting; }).observe(ticker);
  }

  /* ---- 4. backgrounds -------------------------------------------------- */
  var FROST = '207,227,255', BLUE = '41,99,242';
  var rgba = function (c, a) { return 'rgba(' + c + ',' + (a < 0 ? 0 : a > 1 ? 1 : a).toFixed(3) + ')'; };
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var hash = function (i) { var s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); };
  var hostP = function (b, d) { var v = parseFloat(b.host && b.host.style.getPropertyValue('--sc-p')); return isNaN(v) ? d : v; };

  // A 116 BPM groove the console meters dance to. Six channel "types".
  function chLevel(i, t) {
    var b = t * 116 / 60, ph = b % 1, s2 = b % 2;
    var kick = Math.exp(-ph * 6);
    var hat = Math.exp(-((b + .5) % 1) * 9);
    var snare = s2 >= 1 ? Math.exp(-(s2 - 1) * 5) : 0;
    var slow = .5 + .5 * Math.sin(t * .7 + i * 1.3);
    var n = .07 * Math.sin(t * 11.3 + i * 7.1) + .05 * Math.sin(t * 17.9 + i * 3.7);
    var v;
    switch (i % 6) {
      case 0: v = kick * .95; break;
      case 1: v = hat * .65 + .12; break;
      case 2: v = snare * .85 + .05; break;
      case 3: v = .4 + .35 * slow * (.5 + .5 * kick); break;
      case 4: v = .3 + .4 * slow; break;
      default: v = .28 + .5 * hat * slow;
    }
    return clamp(v + n, 0, 1);
  }

  var R = {};

  /* Sound field: a perspective grid of points riding the interference of two
     speakers (stereo). The mouse is a third source. */
  R.field = {
    init: function (b) { return { calm: b.kind === 'field-calm' }; },
    draw: function (b, t) {
      var c = b.ctx, W = b.w, H = b.h, S = b.state;
      c.clearRect(0, 0, W, H);
      var small = W < 760;
      var rowsN = small ? 18 : 30, cols = small ? 26 : 64;
      var horizon = H * (S.calm ? .26 : (small ? .52 : .4)), bottom = H * 1.04;
      var amp = (S.calm ? 11 : 22) * (1 + energy * .9);
      var srcs = [[.27, .55, 0], [.73, .55, 1.7]];
      var live = !S.calm && performance.now() - pointerAt < 3500;
      if (live) srcs.push([px, .95, 3.1]);
      var buckets = [[], [], [], [], [], []], accent = [];
      for (var r = 0; r < rowsN; r++) {
        var v = r / (rowsN - 1);
        var y0 = horizon + Math.pow(v, 1.7) * (bottom - horizon);
        var spread = W * (.5 + .8 * v);
        var near = .35 + .65 * v;
        var size = .8 + 1.8 * v;
        for (var k = 0; k < cols; k++) {
          var u = k / (cols - 1);
          var x = W / 2 + (u - .5) * spread;
          if (x < -4 || x > W + 4) continue;
          var h = 0;
          for (var s = 0; s < srcs.length; s++) {
            var dx = (u - srcs[s][0]) * 3.2, dv = (v - srcs[s][1]) * 2.2;
            var d = Math.sqrt(dx * dx + dv * dv);
            h += Math.sin(d * 13 - t * (S.calm ? 1.5 : 2.4) + srcs[s][2]) / (1 + d * 2.4);
          }
          var yy = y0 - h * amp * near;
          var level = .5 + .5 * Math.tanh(h * 1.2);
          if (level > .86 && v > .35) { accent.push(x, yy, size + .4); continue; }
          var a = (S.calm ? .07 + .45 * v : .1 + .62 * v) * (.32 + .68 * level);
          var bi = Math.min(5, Math.floor(a / .12));
          buckets[bi].push(x, yy, size);
        }
      }
      for (var q = 0; q < 6; q++) {
        var arr = buckets[q]; if (!arr.length) continue;
        c.fillStyle = rgba(FROST, (q + .5) * .12);
        c.beginPath();
        for (var m = 0; m < arr.length; m += 3) c.rect(arr[m], arr[m + 1], arr[m + 2], arr[m + 2]);
        c.fill();
      }
      if (accent.length) {
        c.fillStyle = rgba(BLUE, .75);
        c.beginPath();
        for (var z = 0; z < accent.length; z += 3) c.rect(accent[z], accent[z + 1], accent[z + 2], accent[z + 2]);
        c.fill();
      }
    }
  };

  /* Desk: a live mixing console on the Audio side, an editor minimap on the
     Development side. The crossfader (--sc-p) moves the split between them. */
  function consoleLayer(w, h, small) {
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    var c = cv.getContext('2d');
    var cw = small ? 34 : 44, n = Math.ceil(w / cw) + 1;
    var top = 36, bottom = h - 36, stripH = bottom - top;
    var faderTop = top + stripH * .56, faderBot = bottom - 8;
    var knobs = clamp(Math.floor((faderTop - top - 24) / 34), 2, 10);
    var knobGap = (faderTop - top - 24) / knobs;
    for (var i = 0; i < n; i++) {
      var x0 = i * cw, cx = x0 + cw / 2;
      c.fillStyle = rgba(FROST, .05); c.fillRect(x0, top, 1, stripH);
      c.strokeStyle = rgba(FROST, .12); c.lineWidth = 1;
      for (var j = 0; j < knobs; j++) {
        c.beginPath(); c.arc(cx, top + 16 + j * knobGap, small ? 6 : 8, 0, Math.PI * 2); c.stroke();
      }
      c.fillStyle = rgba(FROST, .1); c.fillRect(cx + 6, faderTop, 2, faderBot - faderTop);
      c.fillStyle = rgba(FROST, .06);
      for (var g = 0; g <= 10; g++) c.fillRect(cx + 10, faderTop + (faderBot - faderTop) * g / 10, 4, 1);
    }
    return { cv: cv, cw: cw, n: n, top: top, faderTop: faderTop, faderBot: faderBot, knobs: knobs, knobGap: knobGap };
  }
  function codeLayer(w, small) {
    var lineH = small ? 8 : 9, lines = 180, h = lines * lineH;
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    var c = cv.getContext('2d'), rand = rng(7);
    var x0 = Math.round(w * (small ? .08 : .5)), indent = 0;
    for (var i = 0; i < lines; i++) {
      var r = rand();
      if (r < .12) { indent = Math.max(0, indent - 1); continue; }   // blank line, dedent
      if (r > .86) indent = Math.min(4, indent + 1);
      var x = x0 + indent * 18, tokens = 2 + Math.floor(rand() * 5);
      for (var k = 0; k < tokens; k++) {
        var tw = 10 + Math.floor(rand() * (small ? 40 : 84));
        var kind = rand();
        c.fillStyle = kind < .18 ? rgba(BLUE, .55) : kind < .55 ? rgba(FROST, .2) : rgba(FROST, .1);
        c.fillRect(x, i * lineH + 2, tw, small ? 3 : 4);
        x += tw + 6;
        if (x > w - 20) break;
      }
    }
    return { cv: cv, h: h, lineH: lineH, x0: x0 };
  }
  R.desk = {
    resize: function (b) {
      var small = b.w < 760;
      var ch = small ? Math.round(b.h * .5) : b.h;
      b.state.con = consoleLayer(b.w, ch, small);
      b.state.code = codeLayer(b.w, small);
      b.state.peaks = [];
    },
    draw: function (b, t) {
      var c = b.ctx, W = b.w, H = b.h, S = b.state;
      if (!S.con) return;
      c.clearRect(0, 0, W, H);
      var small = W < 760;
      var x = clamp((hostP(b, .5) - .3) / .36, 0, 1);
      var bx = small ? W : W * (.84 - .68 * x);       // console | code split
      var by = small ? H * .5 : H;
      var kA = small ? 1 : 1 - x * .45, kD = small ? 1 : .55 + x * .45;

      // console
      c.save(); c.beginPath(); c.rect(0, 0, bx, by); c.clip();
      c.globalAlpha = kA; c.drawImage(S.con.cv, 0, 0); c.globalAlpha = 1;
      var C = S.con, segs = 16, segH = (C.faderBot - C.faderTop) / segs;
      for (var i = 0; i < C.n; i++) {
        var cx = i * C.cw + C.cw / 2;
        if (cx - C.cw > bx) break;
        var lvl = chLevel(i, t);
        var pk = S.peaks[i] || 0; pk = Math.max(lvl, pk - .006); S.peaks[i] = pk;
        var lit = Math.round(lvl * segs);
        c.fillStyle = rgba(FROST, .06 * kA);
        c.beginPath();
        for (var s0 = lit; s0 < segs; s0++) c.rect(cx - 12, C.faderBot - (s0 + 1) * segH + 1, 5, segH - 2);
        c.fill();
        c.fillStyle = rgba(FROST, .5 * kA);
        c.beginPath();
        for (var s1 = 0; s1 < Math.min(lit, segs - 2); s1++) c.rect(cx - 12, C.faderBot - (s1 + 1) * segH + 1, 5, segH - 2);
        c.fill();
        if (lit > segs - 2) {
          c.fillStyle = rgba(BLUE, .85 * kA);
          c.beginPath();
          for (var s2 = segs - 2; s2 < lit; s2++) c.rect(cx - 12, C.faderBot - (s2 + 1) * segH + 1, 5, segH - 2);
          c.fill();
        }
        var pkY = C.faderBot - Math.round(pk * segs) * segH;
        c.fillStyle = rgba(FROST, .7 * kA); c.fillRect(cx - 12, pkY, 5, 1.5);
        // knob pointers: a few drift as if someone is riding the EQ
        c.strokeStyle = rgba(FROST, .42 * kA); c.lineWidth = 1.3;
        c.beginPath();
        for (var j = 0; j < C.knobs; j++) {
          var moving = (i * 3 + j) % 7 === 0;
          var ang = -2.35 + 4.7 * (.5 + .45 * Math.sin(i * 2.1 + j * 1.7 + (moving ? t * .6 : 0)));
          var ky = C.top + 16 + j * C.knobGap, kr = small ? 5 : 7;
          c.moveTo(cx, ky); c.lineTo(cx + Math.sin(ang) * kr, ky - Math.cos(ang) * kr);
        }
        c.stroke();
        // fader cap, ridden slowly
        var fpos = .42 + .2 * Math.sin(t * .22 + i * .9) + .06 * Math.sin(t * .9 + i);
        var capY = C.faderBot - (C.faderBot - C.faderTop) * fpos;
        c.fillStyle = rgba(FROST, .55 * kA); c.fillRect(cx + 1, capY - 5, 12, 10);
        c.fillStyle = rgba(BLUE, .9 * kA); c.fillRect(cx + 1, capY - .5, 12, 1.2);
      }
      c.restore();

      // code
      c.save(); c.beginPath();
      if (small) c.rect(0, by, W, H - by); else c.rect(bx, 0, W - bx, H);
      c.clip();
      var K = S.code, top0 = small ? by : 0;
      var off = (t * 14) % K.h;
      c.globalAlpha = kD;
      c.drawImage(K.cv, 0, top0 - off); c.drawImage(K.cv, 0, top0 - off + K.h);
      c.globalAlpha = 1;
      // the line being edited
      var line = Math.floor(t / 1.2) % 24;
      var ly = top0 + 120 + line * K.lineH * 2 - (off % (K.lineH * 2));
      c.fillStyle = rgba(BLUE, .14 * kD); c.fillRect(small ? 0 : bx, ly, W, K.lineH);
      c.fillStyle = rgba(BLUE, .9 * kD); c.fillRect(small ? 0 : bx, ly, 2, K.lineH);
      if ((t * 2 | 0) % 2 === 0) { c.fillStyle = rgba(FROST, .8 * kD); c.fillRect(K.x0 + 60 + (t * 30 % 120), ly + 1, 1.5, K.lineH - 2); }
      c.restore();

      // the seam is the crossfader position
      c.fillStyle = rgba(BLUE, .5);
      if (small) c.fillRect(0, by, W, 1); else c.fillRect(bx, 0, 1, H);
    }
  };

  /* Network: servers and links, with packets moving between them. */
  R.network = {
    resize: function (b) {
      var rand = rng(11), n = b.w < 760 ? 9 : 16, nodes = [];
      for (var i = 0; i < n; i++) nodes.push({ x: .04 + rand() * .92, y: .1 + rand() * .8, ph: rand() * 6.28, big: rand() < .25 });
      var edges = [], seen = {};
      nodes.forEach(function (a, i) {
        var near = nodes.map(function (o, j) {
          var dx = (o.x - a.x) * b.w, dy = (o.y - a.y) * b.h; return { j: j, d: dx * dx + dy * dy };
        }).filter(function (o) { return o.j !== i; }).sort(function (p, q) { return p.d - q.d; }).slice(0, 2);
        near.forEach(function (o) {
          var key = Math.min(i, o.j) + '-' + Math.max(i, o.j);
          if (!seen[key]) { seen[key] = 1; edges.push({ a: i, b: o.j, s: .07 + rand() * .14, o: rand(), two: rand() < .4 }); }
        });
      });
      b.state.nodes = nodes; b.state.edges = edges;
    },
    draw: function (b, t) {
      var c = b.ctx, W = b.w, H = b.h, S = b.state;
      if (!S.nodes) return;
      c.clearRect(0, 0, W, H);
      var P = S.nodes.map(function (nd) {
        return [nd.x * W + Math.sin(t * .2 + nd.ph) * 10, nd.y * H + Math.cos(t * .17 + nd.ph) * 8];
      });
      c.strokeStyle = rgba(FROST, .1); c.lineWidth = 1;
      c.beginPath();
      S.edges.forEach(function (e) { c.moveTo(P[e.a][0], P[e.a][1]); c.lineTo(P[e.b][0], P[e.b][1]); });
      c.stroke();
      S.edges.forEach(function (e) {
        var count = e.two ? 2 : 1;
        for (var k = 0; k < count; k++) {
          var f = (t * e.s + e.o + k * .5) % 1, A = P[e.a], B = P[e.b];
          for (var tr = 0; tr < 3; tr++) {
            var ff = f - tr * .018; if (ff < 0) continue;
            c.fillStyle = tr === 0 ? rgba(BLUE, .9) : rgba(BLUE, .35 - tr * .1);
            c.fillRect(A[0] + (B[0] - A[0]) * ff - 1.5, A[1] + (B[1] - A[1]) * ff - 1.5, 3, 3);
          }
        }
      });
      S.nodes.forEach(function (nd, i) {
        var x = P[i][0], y = P[i][1];
        c.fillStyle = rgba(FROST, .55); c.fillRect(x - 2.5, y - 2.5, 5, 5);
        if (nd.big) {
          c.strokeStyle = rgba(FROST, .22); c.beginPath(); c.arc(x, y, 10, 0, 6.283); c.stroke();
          var pulse = ((t + nd.ph) % 3) / 3;
          c.strokeStyle = rgba(BLUE, .4 * (1 - pulse)); c.beginPath(); c.arc(x, y, 10 + pulse * 26, 0, 6.283); c.stroke();
        }
      });
    }
  };

  /* Chart: candles stream past with entry, take-profit and stop-loss levels. */
  R.chart = {
    init: function () {
      var rand = rng(23), N = 420, price = 100, out = [];
      for (var i = 0; i < N; i++) {
        var drift = Math.sin(i / 37) * .35 + Math.sin(i / 11) * .2;
        var o = price, cl = o + (rand() - .5) * 2.4 + drift;
        var hi = Math.max(o, cl) + rand() * 1.2, lo = Math.min(o, cl) - rand() * 1.2;
        out.push([o, hi, lo, cl]); price = cl;
      }
      return { c: out, min: null, max: null };
    },
    draw: function (b, t) {
      var c = b.ctx, W = b.w, H = b.h, S = b.state, D = S.c, N = D.length;
      c.clearRect(0, 0, W, H);
      var small = W < 760, cw = small ? 6 : 9, step = cw + (small ? 4 : 5);
      var run = t * 12, start = Math.floor(run / step), off = run % step;
      var vis = Math.ceil(W / step) + 2, lo = 1e9, hi = -1e9, k, d;
      for (k = 0; k < vis; k++) { d = D[(start + k) % N]; if (d[2] < lo) lo = d[2]; if (d[1] > hi) hi = d[1]; }
      S.min = S.min === null ? lo : S.min + (lo - S.min) * .03;
      S.max = S.max === null ? hi : S.max + (hi - S.max) * .03;
      var top = H * .2, bot = H * .8, span = Math.max(S.max - S.min, 1);
      var Y = function (v) { return bot - (v - S.min) / span * (bot - top); };
      var upPath = new Path2D(), downPath = new Path2D(), wick = new Path2D();
      for (k = 0; k < vis; k++) {
        d = D[(start + k) % N];
        var x = k * step - off;
        wick.moveTo(x + cw / 2, Y(d[1])); wick.lineTo(x + cw / 2, Y(d[2]));
        var yo = Y(d[0]), yc = Y(d[3]), yt = Math.min(yo, yc), hh = Math.max(Math.abs(yc - yo), 1);
        (d[3] >= d[0] ? upPath : downPath).rect(x + .5, yt + .5, cw - 1, hh);
      }
      c.strokeStyle = rgba(FROST, .16); c.lineWidth = 1; c.stroke(wick);
      c.strokeStyle = rgba(FROST, .28); c.stroke(upPath);
      c.fillStyle = rgba(FROST, .14); c.fill(downPath);
      // moving average
      c.strokeStyle = rgba(BLUE, .6); c.lineWidth = 1.5; c.beginPath();
      for (k = 0; k < vis; k++) {
        var sum = 0; for (var q = 0; q < 8; q++) sum += D[(start + k - q + N * 2) % N][3];
        var mx = k * step - off + cw / 2, my = Y(sum / 8);
        if (k === 0) c.moveTo(mx, my); else c.lineTo(mx, my);
      }
      c.stroke();
      // a trade: entry at the last close, three targets and a stop
      var last = D[(start + vis - 3) % N][3], ey = Y(last);
      var lines = [[ey, BLUE, .55, 'ENTRY'], [ey - 26, FROST, .22, 'TP1'], [ey - 52, FROST, .18, 'TP2'], [ey - 78, FROST, .14, 'TP3'], [ey + 34, FROST, .16, 'SL']];
      c.setLineDash([4, 5]); c.lineWidth = 1;
      c.font = '500 10px "IBM Plex Mono", monospace'; c.textAlign = 'right';
      lines.forEach(function (L) {
        c.strokeStyle = rgba(L[1], L[2]); c.beginPath(); c.moveTo(W * .35, L[0]); c.lineTo(W - 44, L[0]); c.stroke();
        c.fillStyle = rgba(L[1], L[2] + .1); c.fillText(L[3], W - 8, L[0] + 3);
      });
      c.setLineDash([]);
      // keep the chart quiet behind the copy column on wide screens
      if (!small) {
        var fade = c.createLinearGradient(0, 0, W * .5, 0);
        fade.addColorStop(0, 'rgba(0,0,0,.85)'); fade.addColorStop(.7, 'rgba(0,0,0,.6)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
        c.globalCompositeOperation = 'destination-out';
        c.fillStyle = fade; c.fillRect(0, 0, W * .5, H);
        c.globalCompositeOperation = 'source-over';
      } else {
        // phones: the copy sits on top, so the chart lives lower down
        var vf = c.createLinearGradient(0, 0, 0, H * .5);
        vf.addColorStop(0, 'rgba(0,0,0,.95)'); vf.addColorStop(.75, 'rgba(0,0,0,.8)'); vf.addColorStop(1, 'rgba(0,0,0,0)');
        c.globalCompositeOperation = 'destination-out';
        c.fillStyle = vf; c.fillRect(0, 0, W, H * .5);
        c.globalCompositeOperation = 'source-over';
      }
    }
  };

  /* Streams: encrypted traffic flowing through the tunnel. The pan adds depth. */
  R.streams = {
    init: function (b) {
      var rand = rng(31), n = isSmall() ? 14 : 22, rowsA = [];
      for (var i = 0; i < n; i++) {
        var segs = [], L = 0;
        while (L < 900) { var len = 8 + rand() * 46, gap = 10 + rand() * 90; segs.push([L, len, rand() < .08]); L += len + gap; }
        rowsA.push({ y: (i + .5) / n, speed: 30 + rand() * 110, depth: .3 + rand() * .7, segs: segs, L: L });
      }
      return { rows: rowsA };
    },
    draw: function (b, t) {
      var c = b.ctx, W = b.w, H = b.h, S = b.state;
      c.clearRect(0, 0, W, H);
      var p = hostP(b, 0);
      var plain = new Path2D(), hot = new Path2D();
      S.rows.forEach(function (row) {
        var yy = row.y * H, th = 1 + row.depth * 1.5;
        var shift = (t * row.speed + p * 900 * row.depth) % row.L;
        for (var base = -shift; base < W; base += row.L) {
          for (var s = 0; s < row.segs.length; s++) {
            var sg = row.segs[s], x = base + sg[0];
            if (x > W || x + sg[1] < 0) continue;
            (sg[2] ? hot : plain).rect(x, yy, sg[1], th);
          }
        }
      });
      c.fillStyle = rgba(FROST, .1); c.fill(plain);
      c.fillStyle = rgba(BLUE, .7); c.fill(hot);
    }
  };

  /* Layout: a 12-column grid where page wireframes keep assembling. */
  R.layout = {
    init: function () { return { blocks: [], next: 0, rand: rng(41) }; },
    draw: function (b, t) {
      var c = b.ctx, W = b.w, H = b.h, S = b.state;
      c.clearRect(0, 0, W, H);
      var small = W < 760, cols = small ? 4 : 12, gap = small ? 12 : 20;
      var content = Math.min(1180, W - 2 * clamp(W * .04, 20, 40)), left = (W - content) / 2;
      var colW = (content - gap * (cols - 1)) / cols, unit = 40;
      c.fillStyle = rgba(FROST, .022);
      for (var i = 0; i < cols; i++) c.fillRect(left + i * (colW + gap), 0, colW, H);
      if (t > S.next && S.blocks.length < (small ? 5 : 10)) {
        var r = S.rand, span = 2 + Math.floor(r() * (small ? 2 : 5)), c0 = Math.floor(r() * (cols - span + 1));
        S.blocks.push({ c0: c0, span: span, row: Math.floor(r() * (H / unit - 3)), h: 1 + Math.floor(r() * 3), born: t, life: 4 + r() * 3, accent: r() < .14 });
        S.next = t + .45;
      }
      S.blocks = S.blocks.filter(function (B) { return t - B.born < B.life; });
      S.blocks.forEach(function (B) {
        var age = t - B.born, env = Math.min(1, age / .6) * Math.min(1, (B.life - age) / .8);
        var x = left + B.c0 * (colW + gap), w = B.span * colW + (B.span - 1) * gap;
        var y = B.row * unit + 8, h = B.h * unit - 8;
        var per = 2 * (w + h), drawn = Math.min(1, age / .9) * per;
        c.setLineDash([drawn, per]);
        c.strokeStyle = B.accent ? rgba(BLUE, .6 * env) : rgba(FROST, .18 * env);
        c.lineWidth = 1;
        c.strokeRect(x + .5, y + .5, w, h);
        c.setLineDash([]);
        c.fillStyle = rgba(FROST, .03 * env); c.fillRect(x, y, w, h);
        if (h > 30) { c.fillStyle = rgba(FROST, .1 * env); c.fillRect(x + 10, y + 12, Math.min(w * .5, 120), 3); }
      });
    }
  };

  /* Arrange: a DAW arrangement. Clips scroll under a playhead. */
  R.arrange = {
    init: function (b) {
      var rand = rng(53), lanes = [];
      for (var i = 0; i < 14; i++) {
        var clips = [], L = 0, kind = i % 3;
        while (L < 1600) { var len = 70 + rand() * 260, gp = 20 + rand() * 140; clips.push([L, len, Math.floor(rand() * 1000)]); L += len + gp; }
        lanes.push({ clips: clips, L: L, kind: kind });
      }
      return { lanes: lanes };
    },
    draw: function (b, t) {
      var c = b.ctx, W = b.w, H = b.h, S = b.state;
      c.clearRect(0, 0, W, H);
      var laneH = 28, lgap = 14, top = 64, n = Math.min(S.lanes.length, Math.floor((H - top - 40) / (laneH + lgap)));
      var shift = t * 22, ph = W * (W < 760 ? .7 : .62);
      // ruler
      c.fillStyle = rgba(FROST, .12);
      for (var x = -(shift % 40); x < W; x += 40) {
        var idx = Math.round((x + shift) / 40);
        c.fillRect(x, 30, 1, idx % 4 === 0 ? 12 : 6);
      }
      var box = new Path2D(), active = new Path2D(), wave = new Path2D();
      for (var i = 0; i < n; i++) {
        var lane = S.lanes[i], yy = top + i * (laneH + lgap), sh = shift % lane.L;
        for (var base = -sh; base < W; base += lane.L) {
          for (var k = 0; k < lane.clips.length; k++) {
            var cl = lane.clips[k], x0 = base + cl[0], w = cl[1];
            if (x0 > W || x0 + w < 0) continue;
            (x0 < ph && x0 + w > ph ? active : box).rect(x0, yy, w, laneH);
            if (lane.kind === 0) {
              for (var bx = Math.max(x0 + 4, 0); bx < Math.min(x0 + w - 4, W); bx += 4) {
                var hh = (.25 + .75 * hash(cl[2] + Math.floor((bx - x0) / 4))) * laneH * .38;
                wave.rect(bx, yy + laneH / 2 - hh, 2, hh * 2);
              }
            } else if (lane.kind === 1) {
              for (var nx = x0 + 6; nx < x0 + w - 12; nx += 18) {
                var ny = yy + 4 + hash(cl[2] + nx) * (laneH - 10);
                wave.rect(nx, ny, 10, 2);
              }
            }
          }
        }
      }
      c.fillStyle = rgba(FROST, .02); c.fill(box);
      c.strokeStyle = rgba(FROST, .06); c.lineWidth = 1; c.stroke(box);
      c.fillStyle = rgba(BLUE, .05); c.fill(active);
      c.strokeStyle = rgba(BLUE, .3); c.stroke(active);
      c.fillStyle = rgba(FROST, .08); c.fill(wave);
      c.fillStyle = rgba(BLUE, .6); c.fillRect(ph, 22, 1.5, H - 22);
      c.beginPath(); c.moveTo(ph - 5, 22); c.lineTo(ph + 6.5, 22); c.lineTo(ph + .75, 30); c.fill();
    }
  };

  var bgs = [];
  Array.prototype.forEach.call(document.querySelectorAll('canvas.bg[data-bg]'), function (cv) {
    var kind = cv.getAttribute('data-bg'), r = R[kind] || (kind.indexOf('field') === 0 ? R.field : null);
    if (!r) return;
    var b = { cv: cv, ctx: cv.getContext('2d'), kind: kind, R: r, w: 0, h: 0, dpr: 1, on: false, last: 0, host: cv.closest('[data-sc-act]') };
    b.state = r.init ? r.init(b) : {};
    bgs.push(b);
  });
  function sizeBg(b) {
    var w = b.cv.clientWidth, h = b.cv.clientHeight;
    if (!w || !h) return;
    var d = isSmall() ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    if (w === b.w && h === b.h && d === b.dpr) return;
    b.w = w; b.h = h; b.dpr = d;
    b.cv.width = Math.round(w * d); b.cv.height = Math.round(h * d);
    b.ctx.setTransform(d, 0, 0, d, 0, 0);
    if (b.R.resize) b.R.resize(b);
    if (reduce && b.on) b.R.draw(b, 8);
  }
  bgs.forEach(sizeBg);
  if ('ResizeObserver' in window) {
    var ro = new ResizeObserver(function (entries) {
      entries.forEach(function (e) { bgs.forEach(function (b) { if (b.cv === e.target) sizeBg(b); }); });
    });
    bgs.forEach(function (b) { ro.observe(b.cv); });
  } else {
    window.addEventListener('resize', function () { bgs.forEach(sizeBg); });
  }
  if ('IntersectionObserver' in window) {
    var bio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        bgs.forEach(function (b) {
          if (b.cv !== e.target) return;
          b.on = e.isIntersecting;
          if (b.on) { sizeBg(b); if (reduce) b.R.draw(b, 8); }
        });
      });
    }, { rootMargin: '80px 0px' });
    bgs.forEach(function (b) { bio.observe(b.cv); });
  } else {
    bgs.forEach(function (b) { b.on = true; if (reduce) b.R.draw(b, 8); });
  }

  /* ---- mobile: the product film loops instead of scrubbing ------------- */
  var loopVid = document.querySelector('.film video.is-loop');
  if (loopVid && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (e) {
      if (e[0].isIntersecting) { var pr = loopVid.play(); if (pr && pr.catch) pr.catch(function () {}); }
      else loopVid.pause();
    }, { threshold: .2 }).observe(loopVid);
  }

  /* ---- one loop -------------------------------------------------------- */
  var max = 1;
  function measure() { max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1); }
  measure();
  window.addEventListener('resize', measure);
  window.addEventListener('load', measure);

  if (reduce) {
    window.addEventListener('scroll', function () { if (bar) bar.style.setProperty('--prog', (window.scrollY / max).toFixed(4)); }, { passive: true });
    return;
  }

  var t0 = performance.now(), frameGap = (coarse || isSmall()) ? 33 : 0;
  function frame(now) {
    var t = (now - t0) / 1000;
    var vel = y - lastY; lastY = y;
    smoothVel += (vel - smoothVel) * .12;
    if (Math.abs(vel) > .5) dir = vel > 0 ? 1 : -1;
    energy += (Math.min(Math.abs(smoothVel) / 25, 1) - energy) * .05;

    if (bar) {
      bar.style.setProperty('--prog', (y / max).toFixed(4));
      if (!barFocus && y > 240 && smoothVel > 1.2) bar.classList.add('is-hidden');
      else if (smoothVel < -1.2 || y <= 240) bar.classList.remove('is-hidden');
    }

    if (tickerOn) {
      for (var i = 0; i < rows.length; i++) {
        var Rw = rows[i];
        Rw.x -= (.5 + Math.min(Math.abs(smoothVel) * .35, 14)) * Rw.speed * dir;
        if (Rw.x <= -Rw.w) Rw.x += Rw.w;
        if (Rw.x > 0) Rw.x -= Rw.w;
        Rw.el.style.transform = 'translate3d(' + Rw.x.toFixed(2) + 'px,0,0)';
      }
    }

    for (var k = 0; k < bgs.length; k++) {
      var b = bgs[k];
      if (!b.on || !b.w) continue;
      if (frameGap && now - b.last < frameGap) continue;
      b.last = now;
      b.R.draw(b, t);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

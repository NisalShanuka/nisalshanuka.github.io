/* Nisal Shanuka Perera · page-local motion (the engine stays untouched).
   1. intro flag   2. top bar: progress, hide on scroll down, active link
   3. split-lines headings   4. velocity ticker   5. hero signal waveform  */
(function () {
  'use strict';
  var doc = document.documentElement;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  try { sessionStorage.setItem('ns-intro', '1'); } catch (e) {}

  /* ---- scroll state shared by everything below ---------------------------- */
  var y = window.scrollY, lastY = y, vel = 0, smoothVel = 0, dir = 1;
  window.addEventListener('scroll', function () { y = window.scrollY; }, { passive: true });

  /* ---- 2. top bar ---------------------------------------------------------- */
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
  // Keep the bar visible while keyboard focus is inside it.
  var barFocus = false;
  if (bar) {
    bar.addEventListener('focusin', function () { barFocus = true; bar.classList.remove('is-hidden'); });
    bar.addEventListener('focusout', function () { barFocus = false; });
  }

  /* ---- 3. split-lines ------------------------------------------------------ */
  var heads = Array.prototype.slice.call(document.querySelectorAll('.split-lines'));
  heads.forEach(function (h) {
    var words = h.textContent.trim().split(/\s+/);
    h.setAttribute('aria-label', h.textContent.trim());
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
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); hIo.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    heads.forEach(function (h) { hIo.observe(h); });
  }

  /* ---- 4. ticker ----------------------------------------------------------- */
  var rows = Array.prototype.slice.call(document.querySelectorAll('.ticker__row')).map(function (row) {
    var track = row.querySelector('.ticker__track');
    var clone = track.cloneNode(true); clone.setAttribute('aria-hidden', 'true');
    row.appendChild(clone);
    return { el: row, track: track, x: 0, speed: parseFloat(row.getAttribute('data-speed')) || 1 };
  });
  var tickerOn = true;
  var ticker = document.querySelector('.ticker');
  if (ticker && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (e) { tickerOn = e[0].isIntersecting; }).observe(ticker);
  }

  /* ---- 5. signal waveform -------------------------------------------------- */
  var cv = document.querySelector('.signal');
  var ctx = cv && cv.getContext('2d');
  var W = 0, H = 0, dpr = 1, heroOn = true, amp = 1, ampTarget = 1, mx = .5;
  function size() {
    if (!cv) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  if (cv) {
    size();
    window.addEventListener('resize', size);
    window.addEventListener('pointermove', function (e) {
      mx = e.clientX / Math.max(window.innerWidth, 1);
      ampTarget = 1.9;
    }, { passive: true });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) { heroOn = e[0].isIntersecting; }).observe(cv);
    }
  }
  // Five strands of one signal, like a waveform on a scope. Each fades at the
  // edges so it reads as a sound, not a border.
  var strands = [
    { a: 34, f: 1.6, s: .55, ph: 0,   col: 'rgba(207,227,255,.16)', w: 1 },
    { a: 26, f: 2.3, s: .8,  ph: 1.3, col: 'rgba(207,227,255,.10)', w: 1 },
    { a: 44, f: 1.1, s: .35, ph: 2.1, col: 'rgba(41,99,242,.55)',  w: 1.5 },
    { a: 18, f: 3.4, s: 1.1, ph: .7,  col: 'rgba(207,227,255,.08)', w: 1 },
    { a: 30, f: 1.9, s: .62, ph: 4.0, col: 'rgba(41,99,242,.28)',  w: 1 }
  ];
  function drawSignal(t) {
    ctx.clearRect(0, 0, W, H);
    var mid = H * (W < 760 ? .9 : .82);
    var focus = W * (W < 760 ? .5 : (.3 + mx * .4));
    for (var k = 0; k < strands.length; k++) {
      var S = strands[k];
      ctx.beginPath();
      for (var x = 0; x <= W; x += 6) {
        var u = x / W;
        var env = Math.exp(-Math.pow((x - focus) / (W * .32), 2));
        var v = Math.sin(u * Math.PI * 2 * S.f + t * S.s + S.ph) * .7 +
                Math.sin(u * Math.PI * 2 * S.f * 2.7 - t * S.s * 1.6) * .3;
        var yy = mid + v * S.a * env * amp;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.strokeStyle = S.col; ctx.lineWidth = S.w; ctx.stroke();
    }
  }

  /* ---- one loop ------------------------------------------------------------ */
  var max = 1;
  function measure() { max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1); }
  measure();
  window.addEventListener('resize', measure);
  window.addEventListener('load', measure);

  var t0 = performance.now();
  function frame(now) {
    var t = (now - t0) / 1000;
    vel = y - lastY; lastY = y;
    smoothVel += (vel - smoothVel) * .12;
    if (Math.abs(vel) > 0.5) dir = vel > 0 ? 1 : -1;

    // bar
    if (bar) {
      bar.style.setProperty('--prog', (y / max).toFixed(4));
      var hide = !barFocus && y > 240 && smoothVel > 1.2;
      var show = smoothVel < -1.2 || y <= 240;
      if (hide) bar.classList.add('is-hidden'); else if (show) bar.classList.remove('is-hidden');
    }

    // ticker: base drift plus scroll velocity, flipping with scroll direction
    if (tickerOn && !reduce) {
      for (var i = 0; i < rows.length; i++) {
        var R = rows[i];
        var wTrack = R.track.offsetWidth || 1;
        R.x -= (0.5 + Math.min(Math.abs(smoothVel) * .35, 14)) * R.speed * dir;
        if (R.x <= -wTrack) R.x += wTrack;
        if (R.x > 0) R.x -= wTrack;
        R.el.style.transform = 'translate3d(' + R.x.toFixed(2) + 'px,0,0)';
      }
    }

    // signal
    if (ctx && heroOn) {
      ampTarget += (1 + Math.min(Math.abs(smoothVel) * .08, 1.2) - ampTarget) * .04;
      amp += (ampTarget - amp) * .06;
      drawSignal(reduce ? 0 : t);
    }

    if (!reduce || ctx) requestAnimationFrame(frame);
  }
  if (reduce) {
    if (ctx) drawSignal(0);
    // still keep the progress bar honest without animating anything else
    window.addEventListener('scroll', function () { if (bar) bar.style.setProperty('--prog', (window.scrollY / max).toFixed(4)); }, { passive: true });
  } else {
    requestAnimationFrame(frame);
  }
})();

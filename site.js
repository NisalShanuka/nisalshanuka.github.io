/* ==========================================================================
   Nisal Shanuka · page-local behaviour (the engine stays untouched)

   1. Session Timeline: ruler markers placed at each act's real position,
      playhead = scroll position, current marker tracked.
   2. Signature move, "Build the mix": every act sets which channels are open.
      - Visual (always): meters driven by the SAME step sequencer the audio
        plays, so what you see is what the groove is doing.
      - Audio (opt-in only): a real groove synthesized with Web Audio. Each
        channel has its own fader; scroll rides the faders. Meters then read
        real AnalyserNode levels. Never autoplays.
      - Solo: tap a channel, everything else ducks (audio + page).
      - Raw / Mixed: the post act flips the lead between an unprocessed chain
        and the mixed chain.
   3. Live act: derives --rig / --flash / --sweep from the act's --sc-p.
   4. The bounce: a running record of the master level prints as the closing
      waveform.
   ========================================================================== */
(function () {
  'use strict';

  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;
  var CHS = ['kick', 'hats', 'snare', 'bass', 'pad', 'lead'];

  /* -------------------------------------------------- scene → open channels */
  var SCENES = {
    top:        { kick: 1 },
    soundcheck: { kick: 1, hats: 0.8 },
    lights:     {},                                                    // authored silence
    live:       { kick: 1, hats: 0.9, snare: 1, bass: 1, pad: 0.8, lead: 0.9 },
    post:       { lead: 1, pad: 0.35 },
    code:       { kick: 0.9, hats: 0.7, bass: 0.9, pad: 0.5, lead: 0.5 },
    channels:   { kick: 1, hats: 0.8, snare: 0.9, bass: 1, pad: 0.7, lead: 0.7 },
    ns:         { kick: 0.9, hats: 0.6, bass: 0.9, pad: 0.8 },
    book:       { kick: 1, hats: 0.8, snare: 0.9, bass: 1, pad: 0.8, lead: 0.8 }
  };
  var acts = Array.prototype.slice.call(document.querySelectorAll('[data-scene]'));
  var scene = 'top';
  var target = {}; CHS.forEach(function (c) { target[c] = 0; });
  var gains = {};  CHS.forEach(function (c) { gains[c] = 0; });
  var solo = null;

  /* ------------------------------------------------------------ pattern ---- */
  // 116 BPM, 16 steps per bar, 4 bars. F minor: Fm, Db, Ab, Eb.
  var BPM = 116, STEP = 60 / BPM / 4, STEPS = 64;
  var P = {
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,.6],
    hats:  [0,0,.7,0, 0,.4,.8,.3, 0,0,.7,0, 0,.4,.9,.5],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,.35]
  };
  var CHORDS = [[53,56,60,65],[49,53,56,61],[56,60,63,68],[51,55,58,63]]; // midi
  var BASS = [29, 25, 32, 27];
  var LEAD = [77,0,75,72, 0,72,75,0, 77,0,80,0, 79,77,75,0];
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // Envelope a channel would show at a step position (for visual-only mode).
  function vizLevel(ch, pos) {
    var step = Math.floor(pos) % STEPS, frac = pos - Math.floor(pos);
    var s16 = step % 16, bar = Math.floor(step / 16);
    function since(arr, decay) {
      for (var k = 0; k < 4; k++) {
        var v = arr[(s16 - k + 16) % 16];
        if (v) return v * Math.exp(-(k + frac) * decay);
      }
      return 0;
    }
    switch (ch) {
      case 'kick':  return since(P.kick, 1.6);
      case 'hats':  return since(P.hats, 3.2) * .8;
      case 'snare': return since(P.snare, 1.2);
      case 'bass':  return .55 + .35 * since(P.kick, .9);
      case 'pad':   return .5 + .12 * Math.sin((pos / 16) * Math.PI * 2 + bar);
      case 'lead':  var n = LEAD[s16]; return n ? .85 * Math.exp(-frac * .6) : .2;
    }
    return 0;
  }

  /* ================================================================ AUDIO == */
  var A = null; // audio graph, built on first user gesture
  function buildAudio() {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    var ctx = new Ctx();
    var g = { ctx: ctx, ch: {}, an: {}, next: 0, step: 0, timer: 0, mode: 'mixed' };

    // master: mixed bus → glue comp → limiter-ish → out ; raw bus → straight out
    var master = ctx.createGain(); master.gain.value = 0.82;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = .01; comp.release.value = .2;
    var mixedBus = ctx.createGain(), rawBus = ctx.createGain();
    mixedBus.connect(comp); comp.connect(master);
    rawBus.connect(master);
    var masterAn = ctx.createAnalyser(); masterAn.fftSize = 1024;
    master.connect(masterAn); master.connect(ctx.destination);
    g.masterAn = masterAn; g.master = master;

    // reverb send (generated impulse)
    var rev = ctx.createConvolver(), len = ctx.sampleRate * 1.8, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var c = 0; c < 2; c++) { var d = ir.getChannelData(c); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    rev.buffer = ir; var revRet = ctx.createGain(); revRet.gain.value = .28; rev.connect(revRet); revRet.connect(mixedBus);

    // noise buffer
    var nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), nd = nb.getChannelData(0);
    for (var j = 0; j < nd.length; j++) nd[j] = Math.random() * 2 - 1;
    g.noise = nb;

    // raw chain colour: overdriven, unbalanced, mono, no space
    var shaper = ctx.createWaveShaper(), curve = new Float32Array(1024);
    for (var k = 0; k < 1024; k++) { var x = k / 512 - 1; curve[k] = Math.tanh(x * 4.5); }
    shaper.curve = curve; shaper.connect(rawBus);
    var RAW_BAL = { kick: .5, hats: 1.6, snare: .7, bass: 1.9, pad: 1.3, lead: 1.7 };
    var PAN = { kick: 0, hats: .35, snare: -.08, bass: 0, pad: -.3, lead: .22 };
    var HP = { kick: 0, hats: 6000, snare: 120, bass: 0, pad: 220, lead: 260 };
    var SEND = { kick: 0, hats: .08, snare: .25, bass: 0, pad: .5, lead: .38 };

    CHS.forEach(function (name) {
      var input = ctx.createGain();                 // voices write here
      var fader = ctx.createGain(); fader.gain.value = 0;
      var an = ctx.createAnalyser(); an.fftSize = 512;
      input.connect(fader); fader.connect(an);
      // mixed path: hp → pan → mixedBus, + reverb send
      var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = HP[name] || 20;
      var pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
      if (pan.pan) pan.pan.value = PAN[name];
      var toMixed = ctx.createGain(), toRaw = ctx.createGain(), send = ctx.createGain();
      send.gain.value = SEND[name];
      fader.connect(hp); hp.connect(pan); pan.connect(toMixed); toMixed.connect(mixedBus);
      pan.connect(send); send.connect(rev);
      fader.connect(toRaw); toRaw.connect(shaper);
      toMixed.gain.value = 1; toRaw.gain.value = 0;
      g.ch[name] = { input: input, fader: fader, toMixed: toMixed, toRaw: toRaw, rawBal: RAW_BAL[name] };
      g.an[name] = an;
    });

    // lead delay (mixed only)
    var dl = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain();
    dl.delayTime.value = STEP * 3; fb.gain.value = .32; wet.gain.value = .22;
    g.ch.lead.toMixed.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(mixedBus);

    g.buf = new Float32Array(512);
    return g;
  }

  function env(param, t, peak, a, d) {
    param.cancelScheduledValues(t); param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(peak, t + a); param.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function voice(name, t, step) {
    var ctx = A.ctx, out = A.ch[name].input, s16 = step % 16, bar = Math.floor(step / 16) % 4, o, v, f;
    if (name === 'kick' && P.kick[s16]) {
      o = ctx.createOscillator(); v = ctx.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + .12);
      env(v.gain, t, .95 * P.kick[s16], .003, .32); o.connect(v); v.connect(out); o.start(t); o.stop(t + .4);
    }
    if (name === 'snare' && P.snare[s16]) {
      var n = ctx.createBufferSource(); n.buffer = A.noise; f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = .8;
      v = ctx.createGain(); env(v.gain, t, .55 * P.snare[s16], .002, .18); n.connect(f); f.connect(v); v.connect(out); n.start(t); n.stop(t + .25);
      o = ctx.createOscillator(); var vt = ctx.createGain(); o.frequency.value = 185; env(vt.gain, t, .3 * P.snare[s16], .002, .08); o.connect(vt); vt.connect(out); o.start(t); o.stop(t + .12);
    }
    if (name === 'hats' && P.hats[s16]) {
      var h = ctx.createBufferSource(); h.buffer = A.noise; f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
      v = ctx.createGain(); env(v.gain, t, .22 * P.hats[s16], .001, .05); h.connect(f); f.connect(v); v.connect(out); h.start(t); h.stop(t + .08);
    }
    if (name === 'bass' && (s16 % 2 === 0)) {
      o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(BASS[bar] + (s16 % 8 === 6 ? 12 : 0));
      f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(160, t + .2);
      v = ctx.createGain(); env(v.gain, t, .38, .006, .22); o.connect(f); f.connect(v); v.connect(out); o.start(t); o.stop(t + .3);
    }
    if (name === 'pad' && s16 === 0) {
      var dur = STEP * 16;
      CHORDS[bar].forEach(function (m, idx) {
        [-6, 6].forEach(function (det) {
          var po = ctx.createOscillator(); po.type = 'sawtooth'; po.frequency.value = mtof(m); po.detune.value = det + idx;
          var pf = ctx.createBiquadFilter(); pf.type = 'lowpass'; pf.frequency.value = 1400;
          var pv = ctx.createGain(); pv.gain.setValueAtTime(0.0001, t); pv.gain.exponentialRampToValueAtTime(.035, t + .5);
          pv.gain.setValueAtTime(.035, t + dur - .3); pv.gain.exponentialRampToValueAtTime(0.0001, t + dur + .2);
          po.connect(pf); pf.connect(pv); pv.connect(out); po.start(t); po.stop(t + dur + .25);
        });
      });
    }
    if (name === 'lead' && LEAD[s16]) {
      o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = mtof(LEAD[s16] - (bar === 1 ? 4 : bar === 3 ? 2 : 0));
      f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
      v = ctx.createGain(); env(v.gain, t, .14, .008, .26); o.connect(f); f.connect(v); v.connect(out); o.start(t); o.stop(t + .32);
    }
  }
  function schedule() {
    var now = A.ctx.currentTime;
    while (A.next < now + 0.12) {
      for (var i = 0; i < CHS.length; i++) voice(CHS[i], A.next, A.step);
      A.next += STEP; A.step = (A.step + 1) % STEPS;
    }
  }

  var playing = false;
  var phones = document.querySelector('.strip__phones');
  var phonesLabel = phones.querySelector('.strip__phones-label');
  function startAudio() {
    if (!A) { A = buildAudio(); if (!A) return; A.next = A.ctx.currentTime + .06; }
    A.ctx.resume();
    clearInterval(A.timer); A.timer = setInterval(schedule, 25); schedule();
    playing = true; phones.setAttribute('aria-pressed', 'true'); phonesLabel.textContent = 'Sound off';
    applyMode(); document.body.classList.add('is-playing'); hint();
  }
  function stopAudio() {
    if (!A) return;
    clearInterval(A.timer); A.ctx.suspend();
    playing = false; phones.setAttribute('aria-pressed', 'false'); phonesLabel.textContent = 'Sound on';
    document.body.classList.remove('is-playing'); hint();
  }
  phones.addEventListener('click', function () { playing ? stopAudio() : startAudio(); });
  document.addEventListener('visibilitychange', function () {
    if (!A || !playing) return;
    if (document.hidden) A.ctx.suspend(); else A.ctx.resume();
  });

  /* ------------------------------------------------------------- solo ---- */
  var chEls = {}; document.querySelectorAll('.strip .ch').forEach(function (li) { chEls[li.dataset.ch] = li; });
  var liveEls = {}; document.querySelectorAll('.live__meters li').forEach(function (li) { liveEls[li.dataset.ch] = li; });
  Object.keys(chEls).forEach(function (name) {
    var btn = chEls[name].querySelector('.ch__solo');
    btn.addEventListener('click', function () {
      solo = (solo === name) ? null : name;
      Object.keys(chEls).forEach(function (n) { chEls[n].querySelector('.ch__solo').setAttribute('aria-pressed', String(solo === n)); });
      document.body.classList.toggle('is-solo', !!solo);
      if (!playing) startAudio();
    });
  });

  /* ----------------------------------------------------- raw / mixed ---- */
  var abBtns = document.querySelectorAll('[data-ab]');
  var abMode = 'mixed';
  function applyMode() {
    if (!A) return;
    var t = A.ctx.currentTime;
    CHS.forEach(function (n) {
      var c = A.ch[n];
      c.toMixed.gain.setTargetAtTime(abMode === 'mixed' ? 1 : 0, t, .03);
      c.toRaw.gain.setTargetAtTime(abMode === 'raw' ? .55 * c.rawBal : 0, t, .03);
    });
  }
  abBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      abMode = b.dataset.ab;
      abBtns.forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); });
      if (!playing) startAudio(); else applyMode();
    });
    b.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var other = b.dataset.ab === 'raw' ? abBtns[1] : abBtns[0]; other.focus(); other.click(); e.preventDefault();
    });
  });
  var hintEl = document.querySelector('.ab__hint');
  function hint() {
    hintEl.textContent = playing
      ? (abMode === 'raw' ? 'Raw: clipped, muddy, everything fighting.' : 'Mixed: cleaned, balanced, placed in the room.')
      : 'Sound is off. Press a button to hear it.';
  }

  /* ==================================================== CONSOLE FADERS == */
  (function drawConsole() {
    var g = document.querySelector('.hero__console .faders'); if (!g) return;
    var ns = 'http://www.w3.org/2000/svg', html = '';
    for (var i = 0; i < 26; i++) {
      var x = 70 + i * 56, y = 96 + Math.round(Math.abs(Math.sin(i * 1.7)) * 46);
      html += '<rect class="track" x="' + (x + 9) + '" y="92" width="6" height="150" rx="3"/>' +
              '<rect class="cap" x="' + x + '" y="' + y + '" width="24" height="12" rx="2"/>' +
              (i % 3 === 0 ? '<rect class="led" x="' + (x + 8) + '" y="76" width="8" height="4" rx="2"/>' : '');
    }
    g.innerHTML = html; void ns;
  })();

  /* ================================================== TIMELINE RULER == */
  var ruler = document.querySelector('.timeline__ruler');
  var head = document.querySelector('.timeline__head');
  var nowEl = document.querySelector('.timeline__now');
  var markers = Array.prototype.slice.call(document.querySelectorAll('[data-marker]'));
  var marks = [];
  function layoutRuler() {
    var max = document.documentElement.scrollHeight - innerHeight;
    marks = markers.map(function (a) {
      var el = document.getElementById(a.dataset.marker);
      var y = el.getBoundingClientRect().top + scrollY;
      var f = Math.min(1, Math.max(0, y / max));
      a.parentNode.style.setProperty('--at', (f * 100).toFixed(2) + '%');
      return { a: a, y: y, name: a.textContent };
    });
  }

  /* ============================================================ BOUNCE == */
  var history = [];      // master level samples, the record of the visit
  var lastSample = 0;
  var wave = document.querySelector('.book__wave');
  var wctx = wave.getContext('2d');
  var bookAct = document.getElementById('book');
  function drawBounce(p) {
    var dpr = Math.min(devicePixelRatio || 1, 2);
    var w = wave.clientWidth, h = wave.clientHeight;
    if (wave.width !== Math.round(w * dpr) || wave.height !== Math.round(h * dpr)) { wave.width = Math.round(w * dpr); wave.height = Math.round(h * dpr); }
    wctx.setTransform(dpr, 0, 0, dpr, 0, 0); wctx.clearRect(0, 0, w, h);
    var data = history.length > 60 ? history : synthHistory();
    var foot = (bookAct.querySelector('.foot') || {}).offsetHeight || 80;
    var bars = Math.max(60, Math.floor(w / 5)), amp = Math.min(64, h * 0.07), mid = h - foot - amp - 24;
    var shown = reduced ? bars : Math.floor(bars * Math.min(1, Math.max(0, p * 1.6 + .08)));
    for (var i = 0; i < shown; i++) {
      var k = Math.floor(i / bars * data.length), v = 0, n = 0;
      for (var j = k; j < Math.min(data.length, k + Math.ceil(data.length / bars)); j++) { v = Math.max(v, data[j]); n++; }
      var x = i * (w / bars), y = Math.max(1.5, v * amp);
      var tone = i / bars;
      wctx.fillStyle = tone > .92 ? 'rgba(245,248,255,.85)' : tone > .6 ? 'rgba(92,200,255,.55)' : 'rgba(47,107,255,.5)';
      wctx.fillRect(x, mid - y, Math.max(1.5, w / bars - 2), y * 2);
    }
    // playhead at the print position
    wctx.fillStyle = '#2F6BFF'; wctx.fillRect(shown * (w / bars), mid - amp * 1.25, 2, amp * 2.5);
  }
  function synthHistory() { // what the groove looks like, for visitors who jumped straight here
    var a = []; for (var i = 0; i < 400; i++) { var s = 0; CHS.forEach(function (c) { s += vizLevel(c, i * .4) * ((SCENES.book[c]) || 0); }); a.push(Math.min(1, s / 3.2)); } return a;
  }

  /* ============================================================== LOOP == */
  var liveAct = document.getElementById('live');
  var slots = document.querySelectorAll('.slot');
  slots.forEach(function (s, i) { s.style.setProperty('--i', i); });
  var t0 = performance.now();

  function currentScene() {
    var mid = innerHeight * 0.5, best = scene;
    for (var i = 0; i < acts.length; i++) {
      var r = acts[i].getBoundingClientRect();
      if (r.top <= mid && r.bottom > mid) { best = acts[i].dataset.scene; break; }
    }
    return best;
  }
  function actP(el) { var v = parseFloat(el.style.getPropertyValue('--sc-p')); return isNaN(v) ? 0 : v; }

  function frame(now) {
    // scene + targets
    var s = currentScene();
    if (s !== scene) { scene = s; }
    var sc = SCENES[scene] || {};
    CHS.forEach(function (c) { target[c] = (solo ? (solo === c ? 1 : 0) : (sc[c] || 0)); });

    // ride faders (smooth)
    CHS.forEach(function (c) { gains[c] += (target[c] - gains[c]) * (reduced ? 1 : 0.08); });
    if (A && playing) {
      var t = A.ctx.currentTime;
      CHS.forEach(function (c) { A.ch[c].fader.gain.setTargetAtTime(target[c], t, .12); });
    }

    // meters
    var pos = A && playing ? (A.step + (1 - (A.next - A.ctx.currentTime) / STEP)) : ((now - t0) / 1000 / STEP);
    var sum = 0;
    CHS.forEach(function (c) {
      var lvl;
      if (A && playing) {
        A.an[c].getFloatTimeDomainData(A.buf);
        var pk = 0; for (var i = 0; i < A.buf.length; i += 4) pk = Math.max(pk, Math.abs(A.buf[i]));
        lvl = Math.min(1, pk * 1.6);
      } else {
        lvl = reduced ? gains[c] * .6 : vizLevel(c, pos) * gains[c];
      }
      sum += lvl;
      chEls[c].style.setProperty('--lvl', lvl.toFixed(3));
      chEls[c].classList.toggle('is-on', target[c] > 0);
      if (liveEls[c]) liveEls[c].style.setProperty('--lvl', lvl.toFixed(3));
    });
    if (now - lastSample > 90 && scene !== 'book') {
      lastSample = now; history.push(Math.min(1, sum / 3.2)); if (history.length > 1600) history.shift();
    }

    // live act lighting
    var lp = actP(liveAct);
    var rig = reduced ? 1 : Math.min(1, Math.max(0, (lp - 0.04) / 0.06));
    var flash = reduced ? 0 : Math.max(0, 1 - Math.abs(lp - 0.1) / 0.05) * 0.55;
    var sweep = reduced ? 0 : Math.sin(lp * Math.PI * 3) * 9;
    liveAct.style.setProperty('--rig', rig.toFixed(3));
    liveAct.style.setProperty('--flash', flash.toFixed(3));
    liveAct.style.setProperty('--sweep', sweep.toFixed(2));

    // ab scope
    drawScope();

    // timeline playhead
    var max = document.documentElement.scrollHeight - innerHeight;
    var f = max > 0 ? scrollY / max : 0;
    var rw = ruler.clientWidth;
    root.style.setProperty('--play', (f * rw).toFixed(1));
    root.style.setProperty('--playf', f.toFixed(4));
    var cur = null;
    for (var m = 0; m < marks.length; m++) if (scrollY + innerHeight * .5 >= marks[m].y) cur = marks[m];
    marks.forEach(function (mk) { mk.a.setAttribute('aria-current', String(mk === cur)); });
    nowEl.textContent = cur ? cur.name : 'Intro';

    // bounce
    var br = bookAct.getBoundingClientRect();
    if (br.top < innerHeight && br.bottom > 0) drawBounce(actP(bookAct));

    requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------- scope ---- */
  var scope = document.querySelector('.ab__scope'), sctx = scope.getContext('2d');
  var postAct = document.getElementById('post');
  function drawScope() {
    var r = postAct.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
    var w = scope.width, h = scope.height;
    sctx.clearRect(0, 0, w, h);
    sctx.strokeStyle = 'rgba(207,227,255,.12)'; sctx.lineWidth = 1;
    for (var gx = 0; gx <= 12; gx++) { sctx.beginPath(); sctx.moveTo(gx * w / 12, 0); sctx.lineTo(gx * w / 12, h); sctx.stroke(); }
    sctx.beginPath(); sctx.moveTo(0, h / 2); sctx.lineTo(w, h / 2); sctx.stroke();
    sctx.lineWidth = 2.5; sctx.strokeStyle = abMode === 'raw' ? '#CFE3FF' : '#5CC8FF';
    sctx.beginPath();
    if (A && playing) {
      var an = A.masterAn, buf = new Float32Array(an.fftSize); an.getFloatTimeDomainData(buf);
      for (var i = 0; i < buf.length; i++) { var x = i / (buf.length - 1) * w, y = h / 2 - buf[i] * h * .9; i ? sctx.lineTo(x, y) : sctx.moveTo(x, y); }
    } else { sctx.moveTo(0, h / 2); sctx.lineTo(w, h / 2); }
    sctx.stroke();
  }

  /* ----------------------------------------------------------- boot ---- */
  function boot() { layoutRuler(); requestAnimationFrame(frame); }
  addEventListener('resize', layoutRuler);
  addEventListener('load', layoutRuler);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutRuler);
  boot();
})();

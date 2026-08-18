/* ============================================================
   Daily Postcard — the background hearts
   ------------------------------------------------------------
   Scattered, slowly drifting, they shy away from your cursor,
   and a click sets off a little burst.

   Want more/fewer, bigger/smaller, faster/slower? Everything
   worth touching is in TUNING right below.
   ============================================================ */

(function () {
  "use strict";

  var TUNING = {
    count:        120,    // hearts on screen (desktop)
    countMobile:  60,     // ...on narrow screens
    edgeBias:     0,      // 0 = spread evenly across the whole screen.
                          // Raise toward 1 to push them out to the
                          // margins either side of the card instead.
    minSize:      9,      // smallest heart, px
    maxSize:      34,     // largest heart, px
    minFade:      0.05,   // faintest heart
    maxFade:      0.20,   // boldest heart
    driftSpeed:   0.14,   // how fast they float upward
    repelRadius:  130,    // how close the cursor gets before they move
    repelForce:   0.9,    // how hard they're pushed
    burstCount:   18,     // hearts per click explosion
    burstSpeed:   5.0,    // how far they fly
    burstMinSize: 7,      // smallest heart in the burst
    burstMaxSize: 17      // largest
  };

  // Two layers: ambient hearts sit BEHIND the card, click
  // bursts sit ON TOP of it — otherwise every burst you set off
  // by clicking the card would be hidden behind it.
  var canvas = document.getElementById("hearts");
  var sparkCanvas = document.getElementById("sparks");
  if (!canvas || !sparkCanvas) return;

  var ctx  = canvas.getContext("2d");
  var sctx = sparkCanvas.getContext("2d");
  var draw = ctx;   // whichever layer we're painting on
  var calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var W = 0, H = 0, DPR = 1;
  var hearts = [], sparks = [];
  var mx = -9999, my = -9999;

  /* ---------- the heart shape ---------- */

  function heartPath(x, y, s, rot) {
    draw.save();
    draw.translate(x, y);
    draw.rotate(rot);
    draw.scale(s, s);
    draw.beginPath();
    draw.moveTo(0, 0.75);
    draw.bezierCurveTo(-1.1, -0.05, -0.62, -0.95, 0, -0.38);
    draw.bezierCurveTo(0.62, -0.95, 1.1, -0.05, 0, 0.75);
    draw.closePath();
    draw.restore();
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  // The card sits in a centred column, and any heart behind it is
  // invisible. So most hearts get dropped into the margins either
  // side of it, where they can actually be seen.
  function pickX() {
    var colW = Math.min(W, 676);           // card column incl. padding
    var margin = (W - colW) / 2;
    if (margin < 70 || Math.random() > TUNING.edgeBias) return rand(0, W);
    return Math.random() < 0.5
      ? rand(0, margin)
      : rand(W - margin, W);
  }

  /* ---------- setup ---------- */

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    [canvas, sparkCanvas].forEach(function (c) {
      c.width  = Math.floor(W * DPR);
      c.height = Math.floor(H * DPR);
      c.style.width  = W + "px";
      c.style.height = H + "px";
      c.getContext("2d").setTransform(DPR, 0, 0, DPR, 0, 0);
    });
  }

  function makeHeart(seeded) {
    var size = rand(TUNING.minSize, TUNING.maxSize);
    // Bias small hearts to be fainter, so big ones read as "closer".
    var depth = (size - TUNING.minSize) / (TUNING.maxSize - TUNING.minSize);
    return {
      x: pickX(),
      y: seeded ? rand(0, H) : H + size * 2,
      size: size,
      rot: rand(-0.5, 0.5),
      spin: rand(-0.0035, 0.0035),
      alpha: rand(TUNING.minFade, TUNING.minFade +
                  (TUNING.maxFade - TUNING.minFade) * (0.35 + depth * 0.65)),
      rise: TUNING.driftSpeed * rand(0.45, 1.25) * (0.5 + depth * 0.8),
      sway: rand(0.0006, 0.0018),
      swayAmp: rand(6, 20),
      phase: rand(0, Math.PI * 2),
      warm: Math.random() < 0.35,   // a few warmer/redder ones
      dx: 0, dy: 0, vdx: 0, vdy: 0
    };
  }

  function seed() {
    var n = W < 640 ? TUNING.countMobile : TUNING.count;
    hearts = [];
    for (var i = 0; i < n; i++) hearts.push(makeHeart(true));
  }

  /* ---------- the click burst ---------- */

  function burst(x, y) {
    if (calm) return;
    for (var i = 0; i < TUNING.burstCount; i++) {
      var a = (Math.PI * 2 * i) / TUNING.burstCount + rand(-0.25, 0.25);
      var sp = rand(TUNING.burstSpeed * 0.35, TUNING.burstSpeed);
      sparks.push({
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1.1,
        size: rand(TUNING.burstMinSize, TUNING.burstMaxSize),
        rot: rand(-0.9, 0.9),
        spin: rand(-0.12, 0.12),
        life: 1,
        decay: rand(0.014, 0.026),
        hot: Math.random() < 0.5
      });
    }
  }

  /* ---------- the loop ---------- */

  function frame() {
    ctx.clearRect(0, 0, W, H);
    sctx.clearRect(0, 0, W, H);
    draw = ctx;

    var i, h, t = performance.now();

    for (i = 0; i < hearts.length; i++) {
      h = hearts[i];

      if (!calm) {
        h.y -= h.rise;
        h.rot += h.spin;
        h.phase += h.sway;

        // Shy away from the cursor, then drift back.
        var px = h.x + h.dx, py = h.y + h.dy;
        var ddx = px - mx, ddy = py - my;
        var d2 = ddx * ddx + ddy * ddy;
        var R = TUNING.repelRadius;
        if (d2 < R * R) {
          var d = Math.sqrt(d2) || 1;
          var push = ((R - d) / R) * TUNING.repelForce;
          h.vdx += (ddx / d) * push;
          h.vdy += (ddy / d) * push;
        }
        h.vdx *= 0.88; h.vdy *= 0.88;
        h.dx = (h.dx + h.vdx) * 0.93;
        h.dy = (h.dy + h.vdy) * 0.93;

        if (h.y < -h.size * 2) {
          hearts[i] = makeHeart(false);
          continue;
        }
      }

      var sway = Math.sin(h.phase + t * 0.00008) * h.swayAmp;
      ctx.globalAlpha = h.alpha;
      ctx.fillStyle = h.warm ? "#D2707E" : "#C97B84";
      heartPath(h.x + h.dx + sway, h.y + h.dy, h.size, h.rot);
      ctx.fill();
    }

    draw = sctx;
    for (i = sparks.length - 1; i >= 0; i--) {
      var s = sparks[i];
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.11;          // gravity
      s.vx *= 0.985;
      s.rot += s.spin;
      s.life -= s.decay;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }

      sctx.globalAlpha = Math.min(1, Math.max(0, s.life) * 1.15);
      sctx.fillStyle = s.hot ? "#E63950" : "#C4213C";
      heartPath(s.x, s.y, s.size * (0.45 + s.life * 0.55), s.rot);
      sctx.fill();
    }

    ctx.globalAlpha = 1;
    sctx.globalAlpha = 1;
    draw = ctx;
    requestAnimationFrame(frame);
  }

  /* ---------- wiring ---------- */

  resize();
  seed();

  window.addEventListener("resize", function () {
    var wasNarrow = W < 640;
    resize();
    if ((W < 640) !== wasNarrow) seed();
  });

  // Fine pointers only — no phantom repel from a fingertip.
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    window.addEventListener("pointermove", function (e) {
      mx = e.clientX; my = e.clientY;
    }, { passive: true });
    window.addEventListener("pointerleave", function () {
      mx = my = -9999;
    });
  }

  window.addEventListener("pointerdown", function (e) {
    burst(e.clientX, e.clientY);
  }, { passive: true });

  requestAnimationFrame(frame);
})();

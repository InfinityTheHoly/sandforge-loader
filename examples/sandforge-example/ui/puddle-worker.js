/**
 * 2D SPH liquid (Müller kernels + XSPH + cohesion).
 * All sim work stays in this worker.
 */
(function () {
  var W = 700;
  var H = 476;
  var HLEN = 18;
  var H2 = HLEN * HLEN;
  var MASS = 1.15;
  var RHO0 = 3.6;
  var K_P = 95;
  var MU = 0.22;
  var SIGMA = 0.45;
  var XSPH = 0.18;
  var DT = 0.0065;
  var G0 = 2200;
  var CUP_NEED = 42;
  var MAX = 1400;

  var POLY6 = 4 / (Math.PI * Math.pow(HLEN, 8));
  var SPIKY = 30 / (Math.PI * Math.pow(HLEN, 5));
  var VISC_LAP = 40 / (Math.PI * Math.pow(HLEN, 5));

  var n = 0;
  var px = new Float32Array(MAX);
  var py = new Float32Array(MAX);
  var vx = new Float32Array(MAX);
  var vy = new Float32Array(MAX);
  var rho = new Float32Array(MAX);
  var pr = new Float32Array(MAX);
  var fx = new Float32Array(MAX);
  var fy = new Float32Array(MAX);

  var gy = G0;
  var gx = 0;
  var cups = [];
  var won = false;
  var hold = 0;

  var cell = HLEN;
  var cols = 0;
  var heads = [];
  var next = new Int32Array(MAX);

  function makeCups() {
    cups = [
      { x: 150, y: H - 12, w: 100, h: 92, n: 0 },
      { x: 350, y: H - 12, w: 100, h: 92, n: 0 },
      { x: 550, y: H - 12, w: 100, h: 92, n: 0 },
    ];
  }

  function add(x, y, ovx, ovy) {
    if (n >= MAX) return;
    px[n] = x;
    py[n] = y;
    vx[n] = ovx || 0;
    vy[n] = ovy || 0;
    n += 1;
  }

  function spawn() {
    n = 0;
    var spacing = 7.2;
    var i;
    var j;
    for (j = 0; j < 16; j++) {
      for (i = 0; i < 58; i++) {
        add(
          42 + i * spacing + (j % 2) * 3.4,
          48 + j * spacing,
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 4,
        );
      }
    }
    gy = G0;
    gx = 0;
    won = false;
    hold = 0;
    makeCups();
  }

  function buildHash() {
    cols = ((W / cell) | 0) + 3;
    var rows = ((H / cell) | 0) + 3;
    var size = cols * rows;
    if (heads.length !== size) heads = new Int32Array(size);
    else heads.fill(-1);
    var i;
    var cx;
    var cy;
    var k;
    for (i = 0; i < n; i++) {
      cx = (px[i] / cell) | 0;
      cy = (py[i] / cell) | 0;
      if (cx < 0) cx = 0;
      if (cy < 0) cy = 0;
      k = cx + cy * cols;
      if (k < 0 || k >= heads.length) {
        next[i] = -1;
        continue;
      }
      next[i] = heads[k];
      heads[k] = i;
    }
  }

  function eachNeighbor(i, fn) {
    var cx = (px[i] / cell) | 0;
    var cy = (py[i] / cell) | 0;
    var ox;
    var oy;
    var k;
    var j;
    for (oy = -1; oy <= 1; oy++) {
      for (ox = -1; ox <= 1; ox++) {
        k = cx + ox + (cy + oy) * cols;
        if (k < 0 || k >= heads.length) continue;
        j = heads[k];
        while (j !== -1) {
          if (j !== i) fn(j);
          j = next[j];
        }
      }
    }
  }

  function densities() {
    var i;
    var j;
    var dx;
    var dy;
    var r2;
    var t;
    for (i = 0; i < n; i++) {
      rho[i] = MASS * POLY6 * H2 * H2 * H2;
      eachNeighbor(i, function (j) {
        dx = px[i] - px[j];
        dy = py[i] - py[j];
        r2 = dx * dx + dy * dy;
        if (r2 < H2) {
          t = H2 - r2;
          rho[i] += MASS * POLY6 * t * t * t;
        }
      });
      pr[i] = K_P * (rho[i] - RHO0);
      if (pr[i] < -K_P * 0.35) pr[i] = -K_P * 0.35;
    }
  }

  function forces() {
    var i;
    var dx;
    var dy;
    var r;
    var r2;
    var q;
    var w;
    var f;
    var inv;
    var pv;
    for (i = 0; i < n; i++) {
      fx[i] = 0;
      fy[i] = 0;
    }
    for (i = 0; i < n; i++) {
      eachNeighbor(i, function (j) {
        if (j <= i) return;
        dx = px[i] - px[j];
        dy = py[i] - py[j];
        r2 = dx * dx + dy * dy;
        if (r2 <= 0.0001 || r2 >= H2) return;
        r = Math.sqrt(r2);
        inv = 1 / r;
        q = HLEN - r;
        w = SPIKY * q * q;
        pv = MASS * (pr[i] / (rho[i] * rho[i]) + pr[j] / (rho[j] * rho[j]));
        f = -pv * w;
        fx[i] += f * dx * inv;
        fy[i] += f * dy * inv;
        fx[j] -= f * dx * inv;
        fy[j] -= f * dy * inv;
        f = MU * MASS * VISC_LAP * q;
        fx[i] += f * (vx[j] - vx[i]);
        fy[i] += f * (vy[j] - vy[i]);
        fx[j] += f * (vx[i] - vx[j]);
        fy[j] += f * (vy[i] - vy[j]);
        if (r > HLEN * 0.35) {
          f = -SIGMA * MASS * MASS * (r - HLEN * 0.45);
          fx[i] += f * dx * inv;
          fy[i] += f * dy * inv;
          fx[j] -= f * dx * inv;
          fy[j] -= f * dy * inv;
        }
      });
    }
  }

  function xsph() {
    var i;
    var dx;
    var dy;
    var r2;
    var t;
    var w;
    var ax;
    var ay;
    for (i = 0; i < n; i++) {
      ax = 0;
      ay = 0;
      eachNeighbor(i, function (j) {
        dx = px[i] - px[j];
        dy = py[i] - py[j];
        r2 = dx * dx + dy * dy;
        if (r2 >= H2) return;
        t = H2 - r2;
        w = POLY6 * t * t * t;
        ax += (vx[j] - vx[i]) * w;
        ay += (vy[j] - vy[i]) * w;
      });
      vx[i] += XSPH * ax;
      vy[i] += XSPH * ay;
    }
  }

  function collideParticle(i) {
    var wall = 14;
    var bounce = 0.18;
    if (px[i] < wall) {
      px[i] = wall;
      if (vx[i] < 0) vx[i] *= -bounce;
    } else if (px[i] > W - wall) {
      px[i] = W - wall;
      if (vx[i] > 0) vx[i] *= -bounce;
    }
    if (py[i] < wall) {
      py[i] = wall;
      if (vy[i] < 0) vy[i] *= -bounce;
    } else if (py[i] > H - wall) {
      py[i] = H - wall;
      if (vy[i] > 0) vy[i] *= -bounce;
      vx[i] *= 0.96;
    }
    var c;
    var left;
    var right;
    var top;
    var thick = 8;
    for (c = 0; c < cups.length; c++) {
      left = cups[c].x - cups[c].w / 2;
      right = cups[c].x + cups[c].w / 2;
      top = cups[c].y - cups[c].h;
      if (px[i] > left - 10 && px[i] < right + 10 && py[i] > top - 10 && py[i] < cups[c].y + 8) {
        if (py[i] > top && py[i] < cups[c].y) {
          if (px[i] < left + thick) {
            px[i] = left + thick;
            if (vx[i] < 0) vx[i] *= -bounce;
          } else if (px[i] > right - thick) {
            px[i] = right - thick;
            if (vx[i] > 0) vx[i] *= -bounce;
          }
        }
        if (px[i] > left && px[i] < right && py[i] > cups[c].y - thick) {
          py[i] = cups[c].y - thick;
          if (vy[i] > 0) vy[i] *= -bounce;
          vx[i] *= 0.92;
        }
      }
    }
  }

  function integrate() {
    var i;
    var ax;
    var ay;
    var invm = 1 / MASS;
    for (i = 0; i < n; i++) {
      ax = fx[i] * invm + gx;
      ay = fy[i] * invm + gy;
      if (ax > 18000) ax = 18000;
      if (ax < -18000) ax = -18000;
      if (ay > 18000) ay = 18000;
      if (ay < -18000) ay = -18000;
      vx[i] += ax * DT;
      vy[i] += ay * DT;
      px[i] += vx[i] * DT;
      py[i] += vy[i] * DT;
      collideParticle(i);
    }
  }

  function countCups() {
    var i;
    var c;
    for (c = 0; c < cups.length; c++) cups[c].n = 0;
    for (i = 0; i < n; i++) {
      for (c = 0; c < cups.length; c++) {
        if (
          px[i] > cups[c].x - cups[c].w / 2 + 10 &&
          px[i] < cups[c].x + cups[c].w / 2 - 10 &&
          py[i] > cups[c].y - cups[c].h + 8 &&
          py[i] < cups[c].y - 6
        ) {
          cups[c].n += 1;
        }
      }
    }
    if (gy > 0 && cups.every(function (cup) { return cup.n >= CUP_NEED; })) {
      hold += 1;
      if (hold > 80) won = true;
    } else hold = 0;
  }

  function step() {
    buildHash();
    densities();
    forces();
    integrate();
    buildHash();
    xsph();
    countCups();
  }

  function pack() {
    var out = new Float32Array(n * 3);
    var i;
    var s;
    for (i = 0; i < n; i++) {
      s = Math.hypot(vx[i], vy[i]);
      out[i * 3] = px[i];
      out[i * 3 + 1] = py[i];
      out[i * 3 + 2] = s;
    }
    return out;
  }

  function postState() {
    var particles = pack();
    self.postMessage(
      {
        type: "state",
        particles: particles,
        cups: cups.map(function (c) {
          return { x: c.x, y: c.y, w: c.w, h: c.h, n: c.n, need: CUP_NEED };
        }),
        gy: gy,
        won: won,
        count: n,
      },
      [particles.buffer],
    );
  }

  self.onmessage = function (ev) {
    var msg = ev.data || {};
    var i;
    if (msg.type === "init") {
      W = msg.w || W;
      H = msg.h || H;
      spawn();
      postState();
      return;
    }
    if (msg.type === "reset") {
      spawn();
      postState();
      return;
    }
    if (msg.type === "flip") {
      gy = -gy;
      return;
    }
    if (msg.type === "pour") {
      for (i = 0; i < 8 && n < MAX; i++) {
        add(
          msg.x + (Math.random() - 0.5) * 10,
          msg.y + (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 40,
          gy > 0 ? 80 : -80,
        );
      }
      return;
    }
    if (msg.type === "stir") {
      var sx = msg.x;
      var sy = msg.y;
      var fdx = (msg.dx || 0) * 28;
      var fdy = (msg.dy || 0) * 28;
      for (i = 0; i < n; i++) {
        var ddx = px[i] - sx;
        var ddy = py[i] - sy;
        var d2 = ddx * ddx + ddy * ddy;
        if (d2 < 55 * 55) {
          var fall = 1 - d2 / (55 * 55);
          vx[i] += fdx * fall;
          vy[i] += fdy * fall;
        }
      }
      return;
    }
    if (msg.type === "tick") {
      var steps = msg.steps || 3;
      for (i = 0; i < steps; i++) step();
      postState();
    }
  };
})();

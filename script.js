// ASCII Christmas Tree — canvas renderer + code reader.
// The whole script in <script id="src"> is shown in the editor; a highlight reads it line by line.
// When the highlight reaches a line containing phase("name"), that build step plays.
//
// Everything on the turntable (tree, tinsel, ornaments, star, floor grid, presents)
// is placed in 3D, rotated together, projected with a camera that looks down a little,
// and depth-tested per cell, so near things pass in front of far things.
(() => {
  'use strict';

  // ---------- config ----------
  const COLS = 80, ROWS = 56;
  const CX = 40, YTOP = 6, TH = 33, R = 27;  // apex row, cone height (rows), base radius (cells)
  const YB = YTOP + TH;                        // row of the base center
  const TILT = 6.5;                            // rows a point R cells toward us drops: looking down
  const SCR = '01{}<>#%&$/\\';
  const DARK = '.:-~^', MID = 'vx*=o+%~', BRIGHT = 'W&#@%XM';
  const HOLD = { // seconds the reader stays on each phase line, so the motion can play
    sky: 1.0, ground: 1.0, tree: 4.0, tinsel: 2.4, baubles: 3.8,
    star: 2.2, gifts: 2.6, lights: 1.2, message: 2.0, surprise: 6.0,
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- helpers ----------
  function mulberry32(a) {
    return () => {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const rnd = mulberry32(20261225);
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = x => 1 - Math.pow(1 - x, 3);
  function bounce(x) {
    const n = 7.5625, d = 2.75;
    if (x < 1 / d) return n * x * x;
    if (x < 2 / d) return n * (x -= 1.5 / d) * x + .75;
    if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + .9375;
    return n * (x -= 2.625 / d) * x + .984375;
  }
  const hash = (a, b) => {
    let n = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
  };
  const isWide = c => /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/.test(c); // Hangul takes two cells

  // ---------- 3D tree model: branches made of glyph points ----------
  const radius = h => R * (0.04 + 0.96 * Math.pow(h, 0.9));
  const LAYERS = 15;
  // lumpy silhouette: bulges that depend on angle + height, fixed to the tree so they turn with it
  const lump = (th, h) => 1 + 0.11 * Math.sin(th * 5 + h * 17) + 0.07 * Math.sin(th * 9 - h * 29) + 0.05 * Math.sin(th * 3 + h * 41);
  // mixed needle greens [hue, saturation, lightness offset]: pine, forest, olive, blue spruce, fresh tips
  const GREENS = [[148, 48, -4], [128, 55, 0], [96, 42, 2], [168, 34, -2], [108, 62, 8]];
  const treePts = [];
  for (let i = 0; i < 9000; i++) {
    const layer = Math.floor(Math.pow(rnd(), 0.8) * LAYERS);      // a few more points low down
    const spokes = 7 + layer;                                      // more branches on lower layers
    const spoke = Math.floor(rnd() * spokes);
    const reach = 0.82 + 0.34 * hash(spoke + 31, layer);          // every branch has its own length
    const q = (0.42 + 0.64 * Math.pow(rnd(), 0.4)) * reach;        // 0 = trunk, 1 = branch tip
    const h0 = (layer + 0.2 + rnd() * 0.6) / LAYERS;
    const h = Math.min(1, h0 + q * q * 0.05);                      // branch tips droop
    const th = (spoke + 0.5 + (rnd() - 0.5) * 0.6) / spokes * Math.PI * 2 + layer * 0.9;
    const kind = rnd();
    const fam = q > 1.0 && rnd() < 0.5 ? 4 : Math.floor(hash(spoke * 7 + layer, 3) * 4.999) % 4;
    treePts.push({
      h, th, rr: radius(h) * q * lump(th, h), q, g: rnd(), col: GREENS[fam],
      light: kind < 0.075 ? (kind < 0.02 ? '#ff4d5e' : kind < 0.05 ? '#ffd166' : '#ffb347') : null,
      tw: 1.5 + rnd() * 3, ph: rnd() * 6.28,
    });
  }

  // ---------- 3D star: a beveled five-pointed star sitting on the apex ----------
  const STAR_R = 3.3, STAR_IN = 0.42;   // outer radius in rows; inner radius ratio
  const STAR_CY = YTOP - 2.5;           // its two lower arms rest on the tree tip
  const starPts = (() => {
    const poly = [];
    for (let k = 0; k < 10; k++) {
      const ang = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? STAR_R * STAR_IN : STAR_R;
      poly.push([Math.cos(ang) * r, Math.sin(ang) * r]);
    }
    const inside = (x, y) => {
      let c = false;
      for (let i = 0, j = 9; i < 10; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    const pts = [], arm = Math.PI * 2 / 5;
    for (let v = -STAR_R; v <= STAR_R; v += 0.2) {
      for (let u = -STAR_R; u <= STAR_R; u += 0.12) {
        if (!inside(u, v)) continue;
        const ang = Math.atan2(v, u) + Math.PI / 2;
        const rel = ((ang % arm) + arm) % arm - arm / 2;          // angle from the nearest arm's ridge
        pts.push({ u, v, bevel: Math.cos(rel * 2.4), side: Math.sign(rel), d: Math.hypot(u, v) / STAR_R });
      }
    }
    return pts;
  })();

  // ---------- scene data ----------
  const N = COLS * ROWS;
  const cellRand = new Float32Array(N).map(() => rnd());
  const stars = Array.from({ length: 160 }, () => ({
    x: Math.floor(rnd() * COLS), y: Math.floor(rnd() * 34), sp: 0.6 + rnd() * 2.2, ph: rnd() * 6.28,
  }));
  // big, plain round baubles in two colors only: red and gold (hue, saturation)
  const BAUBLE_HUES = [[355, 85], [44, 95]];
  const baubles = Array.from({ length: 14 }, (_, i) => ({
    h: 0.22 + 0.72 * (i + rnd() * 0.6) / 14,
    a: i * 2.39996 + rnd() * 0.3,
    hue: BAUBLE_HUES[i % 2],
  }));
  const LIGHT_COLORS = ['#ff4d5e', '#ffd166', '#5aa8ff', '#ff8fd0', '#7dffb0'];
  const snow = Array.from({ length: 260 }, () => { // far = small/slow/dim, near = big/fast/bright
    const z = rnd();
    return { x: rnd() * COLS, y: rnd() * ROWS - ROWS, z, vy: 1.5 + z * 6, ph: rnd() * 6.28, c: z > 0.8 ? '*' : z > 0.45 ? "'" : '.' };
  });
  // presents on the turntable: angle/distance from the trunk, size (w, d in cells, h in rows),
  // own yaw so you see two sides + the top, paper color, ribbon color [hue, sat]
  const gifts = [
    { ang: 0.35, dist: 33, w: 7, d: 6, h: 3.2, yaw: 0.55, hue: 355, sat: 75, rib: [45, 95] },
    { ang: -0.6, dist: 34, w: 6, d: 6, h: 2.8, yaw: -0.6, hue: 140, sat: 55, rib: [355, 85] },
    { ang: 1.45, dist: 34, w: 5, d: 5, h: 2.6, yaw: 0.9, hue: 215, sat: 70, rib: [0, 0] },
    { ang: 2.6, dist: 33, w: 7, d: 5, h: 3.0, yaw: 0.25, hue: 45, sat: 90, rib: [355, 85] },
    { ang: -2.0, dist: 34, w: 6, d: 5, h: 3.0, yaw: 0.7, hue: 300, sat: 55, rib: [45, 95] },
    { ang: 3.9, dist: 36, w: 5, d: 4, h: 2.4, yaw: -0.35, hue: 15, sat: 80, rib: [0, 0] },
  ];
  const floorDots = Array.from({ length: 220 }, () => ({ th: rnd() * Math.PI * 2, r: 29 + rnd() * 30 }));
  const MSG = 'MERRY CHRISTMAS 2026'.split('').join(' ');
  const PAL = { R: '#ff4d5e', W: '#f5f1ff', G: '#b6f25a', L: '#e4ff8a', D: '#86d94a', Y: '#ffd166' };
  // a proper frog: bulging eyes on top, wide smile, red scarf, front legs and big feet
  const FROG_BIG = {
    rows: [
      '  .--.    .--.  ',
      ' (#OO#)##(#OO#) ',
      ' /############\\ ',
      '|##\\________/##|',
      " \\##'~~~~~~'##/ ",
      ' /_/########\\_\\ ',
      '(__)        (__)',
    ],
    cm: [
      '  GGGG    GGGG  ',
      ' GLWWLGGGGLWWLG ',
      ' GLLLLLLLLLLLLG ',
      'GLLDDDDDDDDDDLLG',
      ' GLLRRRRRRRRLLG ',
      ' GGGLLLLLLLLGGG ',
      'GGGG        GGGG',
    ],
  };
  const FROG_BLINK_ROW = ' (#--#)##(#--#) ';
  const BUBBLE_TEXT = ['앙', '기', '모', '띠', '!', '!'];

  // ---------- grid buffer with depth ----------
  const gc = new Array(N).fill(''), gcol = new Array(N), gglow = new Uint8Array(N), gz = new Float32Array(N), gwide = new Uint8Array(N);
  function clearGrid() { gc.fill(''); gglow.fill(0); gwide.fill(0); gz.fill(-1e9); }
  function put(x, y, c, col, glow, z = 1e6) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS || c === ' ') return false;
    const i = y * COLS + x;
    if (z < gz[i]) return false;
    gc[i] = c; gcol[i] = col; gglow[i] = glow ? 1 : 0; gz[i] = z; gwide[i] = 0;
    if (isWide(c) && x + 1 < COLS) { gwide[i] = 1; gc[i + 1] = '\0'; gz[i + 1] = z; gglow[i + 1] = 0; }
    return true;
  }

  // ---------- timeline ----------
  let t = 0, paused = false, speed = 1, rot = 0, litCount = 0;
  const phases = {};
  const age = n => (n in phases ? t - phases[n] : -1);
  const prog = (n, d) => (n in phases ? clamp((t - phases[n]) / d) : 0);

  // camera: turntable rotation, looking down a little, mild perspective
  function proj(h, th, rr) {
    const a = th + rot, sx = Math.sin(a), cz = Math.cos(a);
    const z = rr * cz;
    const persp = 1 + z / (R * 6);
    return { x: CX + rr * sx * persp, y: YTOP + h * TH + TILT * (z / R), z, sx, cz, s: persp };
  }
  const onTree = (h, a, k = 1) => proj(h, a, radius(h) * k);
  const onFloor = (th, r) => proj(1, th, r);
  // world (x, z) on the turntable -> view space, and a point `up` rows above the floor -> screen
  const toView = (x, z) => { const c = Math.cos(rot), s = Math.sin(rot); return [x * c + z * s, z * c - x * s]; };
  function projW(wx, wz, up) {
    const [vx, vz] = toView(wx, wz);
    const persp = 1 + vz / (R * 6);
    return { x: CX + vx * persp, y: YB + TILT * (vz / R) - up * persp, z: vz };
  }

  function materialize(cells, a, seed, glowWhite) {
    if (a < 0 || !cells.length) return;
    let mx = 0, my = 0, mz = -1e9;
    cells.forEach(c => { mx += c.x; my += c.y; mz = Math.max(mz, c.z ?? 1e6); });
    mx /= cells.length; my /= cells.length;
    if (a < 0.9) { // sparkle burst
      const f = 1 - a / 0.9;
      for (let j = 0; j < 8; j++) {
        const ang = j / 8 * Math.PI * 2 + seed + a * 2;
        const rad = 1.5 + a * 4 + (j % 2) * 1.2;
        if (Math.sin(t * 25 + j * 2 + seed) > -0.2) put(mx + Math.cos(ang) * rad * 1.6, my + Math.sin(ang) * rad * 0.6, j % 3 ? '+' : '*', `rgba(255,246,208,${f.toFixed(2)})`, true, mz + 1);
      }
    }
    cells.forEach((c, k) => {
      const r = cellRand[(k * 31 + Math.floor(seed * 97)) % N];
      const showAt = 0.12 + r * 0.3;
      if (a < showAt) return;
      if (a < showAt + 0.18) { put(c.x, c.y, SCR[(k + Math.floor(t * 24)) % SCR.length], '#ffffff', true, c.z); return; }
      put(c.x, c.y, c.c, c.col, c.glow || (glowWhite && c.col === PAL.W), c.z);
    });
  }
  function spriteCells(sp, x, y, z) {
    const out = [];
    sp.rows.forEach((row, r) => {
      for (let k = 0; k < row.length; k++) if (row[k] !== ' ') out.push({ x: x + k, y: y + r, c: row[k], col: PAL[sp.cm[r][k]] || '#fff', z });
    });
    return out;
  }

  // ---------- layers ----------
  function drawSky() {
    const p = prog('sky', 1.0);
    if (!p) return;
    stars.forEach((s, i) => {
      if (i / stars.length > p) return;
      const b = 0.5 + 0.5 * Math.sin(t * s.sp + s.ph);
      put(s.x, s.y, b > 0.92 ? '*' : b > 0.7 ? '+' : '.', `rgba(200,215,255,${(0.25 + b * 0.7).toFixed(2)})`, b > 0.92, -1e8);
    });
  }

  // rotating floor: concentric rings + spokes + scattered dots, all on the turntable
  function drawGround() {
    const p = prog('ground', 1.0);
    if (!p) return;
    const reach = ease(p);
    const fl = (q, c, a) => {
      const depth = 0.5 + 0.5 * q.cz;
      put(q.x, q.y, c, `rgba(150,170,215,${(a * (0.45 + 0.55 * depth)).toFixed(2)})`, false, -1e7 + q.z);
    };
    [31, 39, 47, 55].forEach((r, ri) => {
      if (ri / 4 > reach) return;
      for (let th = 0; th < Math.PI * 2; th += 0.6 / r) fl(onFloor(th, r), '-', 0.42);
    });
    for (let k = 0; k < 16; k++) {
      const th = k / 16 * Math.PI * 2;
      for (let r = 29; r < 29 + 28 * reach; r += 1.3) fl(onFloor(th, r), '.', 0.4);
    }
    floorDots.forEach((d, i) => { if (i / floorDots.length < reach) fl(onFloor(d.th, d.r), "'", 0.3); });
    for (let th = 0; th < Math.PI * 2; th += 0.03) fl(onFloor(th, R * 1.05), '~', 0.22); // shadow ring
  }

  // dense inner foliage behind the branch points, so the tree never looks hollow
  const CORE = '.:;~-^';
  function drawCore(p) {
    for (let y = YTOP + 1; y <= YTOP + TH + TILT * 0.8; y++) {
      const h = Math.min(1, (y - YTOP) / TH);
      if (p < (1 - h) * 0.8 + 0.16) continue;
      const r = radius(h) * 0.8; // stays inside the lumpy outer branches
      for (let x = Math.ceil(CX - r); x <= Math.floor(CX + r); x++) {
        const u = (x - CX) / r;
        const front = Math.sqrt(Math.max(0, 1 - u * u));
        if (h >= 1 && (y - YTOP - TH) > TILT * 0.8 * front) continue; // rounded base, seen from above
        const hv = hash(x * 7 + Math.floor(rot * 6), y);
        const l = 7 + (0.5 - u * 0.3) * 14 * front + hv * 5;
        const g0 = GREENS[Math.floor(hash(x, y * 5 + 1) * 4)];
        put(x, y, CORE[Math.floor(hv * CORE.length)], `hsl(${g0[0]},${g0[1]}%,${l.toFixed(0)}%)`, false, -R * 0.4 - 2);
      }
    }
  }

  function drawTree() {
    const a = age('tree');
    if (a < 0) return;
    const p = a / 3.4;
    const lightsOn = age('lights') >= 0;
    litCount = 0;
    drawCore(p);
    for (let i = 0; i < treePts.length; i++) {
      const pt = treePts[i];
      const thr = (1 - pt.h) * 0.8 + pt.g * 0.2; // grows from the bottom up
      if (p < thr) continue;
      const s = proj(pt.h, pt.th, pt.rr);
      if (p - thr < 0.06) { put(s.x, s.y, SCR[(i + Math.floor(t * 30)) % SCR.length], '#7dffb0', true, s.z); continue; }
      const diff = Math.max(0, -0.5 * s.sx + 0.75 * s.cz + 0.25); // light from front-left
      const depth = 0.5 + 0.5 * s.cz;
      const b = clamp((0.2 + 0.8 * diff * (0.7 + 0.3 * pt.g)) * (0.5 + 0.5 * depth) * (0.8 + 0.3 * pt.q));
      if (pt.light) {
        const tw = 0.5 + 0.5 * Math.sin(t * pt.tw + pt.ph);
        const lit = lightsOn && tw > 0.35;
        const front = s.cz > -0.1;
        if (lit && front) litCount++;
        put(s.x, s.y, lit ? (tw > 0.8 && front ? '@' : '*') : 'o',
          lit ? (front ? pt.light : 'rgba(255,190,90,0.45)') : `rgba(255,190,90,${(0.2 + b * 0.5).toFixed(2)})`,
          lit && front, s.z);
        continue;
      }
      const set = b > 0.55 ? BRIGHT : b > 0.3 ? MID : DARK;
      const [hue, sat, lo] = pt.col; // mixed natural greens, darker in the shadow and deep inside
      put(s.x, s.y, set[Math.floor(pt.g * set.length)],
        `hsl(${(hue + (pt.g - 0.5) * 12).toFixed(0)},${(sat + depth * 12).toFixed(0)}%,${clamp(5 + b * 55 + lo - (1 - Math.min(1, pt.q)) * 6, 4, 70).toFixed(0)}%)`,
        false, s.z);
    }
  }

  // extra-thick tinsel: five strands side by side, gold + white, wound from the bottom up
  function drawTinsel() {
    const p = prog('tinsel', 2.2);
    if (!p) return;
    const lightsOn = age('lights') >= 0;
    let k = 0;
    for (let s = 0; s <= p; s += 0.002, k++) {
      for (let strand = -2; strand <= 2; strand++) {
        const q = onTree(0.98 - s * 0.92 + strand * 0.0095, s * Math.PI * 2 * 3.2, 1.05 + Math.abs(strand) * 0.006);
        const front = q.cz > 0;
        const shade = 0.3 + 0.7 * (0.5 + 0.5 * q.cz);
        if (strand === 0 && lightsOn && k % 6 === 0) {
          if (Math.sin(t * 3 + k * 1.7) > -0.3 && put(q.x, q.y, front ? '@' : '*', LIGHT_COLORS[(k / 6) % LIGHT_COLORS.length], front, q.z + 0.8) && front) litCount++;
          continue;
        }
        const shimmer = Math.sin(s * 90 - t * 7 + strand);
        if (shimmer > 0.9 && front) { put(q.x, q.y, '*', '#ffffff', true, q.z + 0.6); continue; }
        const edge = Math.abs(strand) === 2;
        const base = strand === 0 ? '255,240,180' : (k + strand) % 2 ? '255,252,240' : '255,222,120';
        put(q.x, q.y, edge ? '~' : strand === 0 ? (shimmer > 0.5 ? '#' : '=') : '=',
          `rgba(${base},${(shade * (edge ? 0.8 : 1)).toFixed(2)})`, front && q.cz > 0.6 && !edge, q.z + 0.6);
      }
    }
    if (p < 1) { const q = onTree(0.98 - p * 0.92, p * Math.PI * 2 * 3.2, 1.05); put(q.x, q.y, '@', '#fff6d0', true, q.z + 1); }
  }

  // big plain round baubles (one solid color each), shaded so they read as spheres
  const BALL = [' @@@@@ ', '@@@@@@@', '@@@@@@@', ' @@@@@ '];
  const BALL_SIDE = [' @@@ ', '@@@@@', ' @@@ '];  // turned partly away
  function drawBaubles() {
    const a = age('baubles');
    if (a < 0) return;
    baubles.forEach((b, i) => {
      const ba = a - i * 0.2;
      if (ba < 0) return;
      const q = onTree(b.h, b.a, 1.05);
      if (q.cz <= -0.2) return;
      const z = q.z + 1.5, x = Math.round(q.x), y = Math.round(q.y);
      const [hue, sat] = b.hue;
      // twinkle-in: a 4-point sparkle flares and spins, the ball flashes white, then settles to its color
      if (ba < 0.9) {
        const f = ba < 0.25 ? ba / 0.25 : 1 - (ba - 0.25) / 0.65;
        const len = 1 + f * 5;
        const rays = ba > 0.45 ? [[1, 1, '\\'], [-1, -1, '\\'], [1, -1, '/'], [-1, 1, '/']] : [[1, 0, '-'], [-1, 0, '-'], [0, 1, '|'], [0, -1, '|']];
        rays.forEach(([dx, dy, c]) => {
          for (let s = 1; s <= len; s++) put(x + dx * s * 1.6, y + dy * s * 0.7, s >= len - 0.5 ? '+' : c, `rgba(255,246,208,${(f * (1 - s / (len + 1))).toFixed(2)})`, true, z + 0.5);
        });
        put(x, y, '*', '#ffffff', true, z + 1);
        if (ba < 0.3) return;
      }
      const flash = clamp(1 - (ba - 0.3) / 0.35); // white -> bauble color
      const shape = q.cz < 0.45 ? BALL_SIDE : BALL;
      const w = shape[0].length, hgt = shape.length;
      shape.forEach((row, r) => {
        for (let k = 0; k < w; k++) {
          if (row[k] === ' ') continue;
          const nx = (k - (w - 1) / 2) / (w / 2), ny = (r - (hgt - 1) / 2) / (hgt / 2);
          const light = clamp(0.62 - nx * 0.18 - ny * 0.2 + (q.cz - 0.5) * 0.12, 0.3, 0.75); // lit from top-left
          const L = light * 70 + flash * (95 - light * 70);
          put(x - Math.floor(w / 2) + k, y - Math.floor(hgt / 2) + r, light > 0.6 ? '@' : light > 0.45 ? '#' : '%',
            `hsl(${hue},${(sat * (1 - flash * 0.8)).toFixed(0)}%,${L.toFixed(0)}%)`, true, z);
        }
      });
      if (shape === BALL && Math.sin(t * 1.7 + i * 2.1) > 0.94) put(x - 2, y - 1, '*', '#ffffff', true, z + 0.5);
    });
  }

  // the star turns with the tree: wide when it faces us, a thin sliver when edge-on
  function drawStar() {
    const a = age('star');
    if (a < 0) return;
    const k = clamp(a / 1.0);
    const cy = STAR_CY - (1 - bounce(k)) * 12;              // drops in and bounces onto the tip
    let phi = rot + (1 - k) * 6;                             // spins fast while falling
    const sa = age('surprise');
    if (sa >= 0 && openIdx >= 0) phi = rotFrom + (starTo - rotFrom) * ease(clamp(sa / TURN)); // finale: turn to face us
    const cphi = Math.cos(phi), sphi = Math.sin(phi);
    const back = cphi < 0;
    starPts.forEach(p => {
      const hx = p.u * 1.62;                                 // rows -> cells
      const x = CX + hx * cphi, z = 500 + hx * sphi;
      const facing = Math.abs(cphi);
      const sideLight = p.side * (back ? 1 : -1) * 0.12;     // one half of each arm is lit, the other shaded
      const L = clamp((0.4 + 0.6 * facing) * (0.62 + 0.38 * p.bevel) + (1 - p.d) * 0.18 + sideLight) * (back ? 0.85 : 1);
      put(x, cy + p.v, L > 0.78 ? '@' : L > 0.62 ? '#' : L > 0.46 ? '*' : '+',
        `hsl(${(46 - (1 - L) * 8).toFixed(0)},96%,${(30 + L * 50).toFixed(0)}%)`, L > 0.66, z);
    });
    const fa = a - 1.0;
    if (fa > 0) { // long rays: burst on landing, then settle and shimmer
      const burst = Math.max(0, 1 - fa / 1.2);
      [[-90, '|'], [-62, '/'], [-118, '\\'], [-35, '/'], [-145, '\\'], [0, '-'], [180, '-']].forEach(([deg, c], j) => {
        const ang = deg * Math.PI / 180;
        const len = (deg === -90 ? 7 : 7.5) * (0.75 + 0.25 * Math.sin(t * 2.4 + j)) + burst * 10;
        for (let s = STAR_R + 1; s < len + STAR_R; s += 0.8) {
          put(CX + Math.cos(ang) * s * 1.6, cy + Math.sin(ang) * s, c, `rgba(255,224,150,${((1 - (s - STAR_R) / len) * (0.5 + 0.45 * burst)).toFixed(2)})`, s < STAR_R + 2, 400);
        }
      });
    }
    if (fa > 0 && fa < 0.9) { // shockwave ring
      const rad = STAR_R + ease(fa / 0.9) * 14, alpha = 1 - fa / 0.9;
      for (let j = 0; j < 48; j++) {
        const ang = j / 48 * Math.PI * 2;
        put(CX + Math.cos(ang) * rad * 1.6, cy + Math.sin(ang) * rad, j % 2 ? '+' : '*', `rgba(255,214,120,${alpha.toFixed(2)})`, true, 400);
      }
    }
  }

  // ---------- 3D presents ----------
  // Each present is a real box: its visible side faces and lid are sampled in 3D, projected and
  // depth-tested, so turning shows two sides + the top. Ribbons cross every face. No bows.
  const LDIR = [-0.55 / Math.hypot(0.55, 0.8), 0.8 / Math.hypot(0.55, 0.8)];
  const FILL = '#%&@8$X';
  function boxCells(g, gi, open) {
    const cxw = g.dist * Math.sin(g.ang), czw = g.dist * Math.cos(g.ang);
    const cy = Math.cos(g.yaw), sy = Math.sin(g.yaw);
    const P = (lx, lz, up) => projW(cxw + lx * cy + lz * sy, czw - lx * sy + lz * cy, up);
    const hw = g.w / 2, hd = g.d / 2, H = g.h;
    const paper = l => `hsl(${g.hue},${g.sat}%,${(clamp(l) * 100).toFixed(0)}%)`;
    const ribbon = l => `hsl(${g.rib[0]},${g.rib[1]}%,${(clamp(g.rib[1] === 0 ? 0.5 + l * 0.45 : 0.28 + l * 0.42) * 100).toFixed(0)}%)`;
    const out = [];
    const sample = (o, U, V, kind, light, lid) => {
      const lu = Math.hypot(U[0], U[1]);
      const lv = kind === 'side' ? V[2] : Math.hypot(V[0], V[1]);
      const nu = Math.ceil(lu * 2.2) + 1, nv = Math.ceil(lv * (kind === 'side' ? 2.6 : 2.2)) + 1;
      for (let a = 0; a < nu; a++) {
        for (let b = 0; b < nv; b++) {
          const u = (a + 0.5) / nu, v = (b + 0.5) / nv;
          const s = P(o[0] + U[0] * u + V[0] * v, o[1] + U[1] * u + V[1] * v, o[2] + U[2] * u + V[2] * v);
          const hv = hash(gi * 131 + a * 7 + (kind === 'top' ? 3 : 0), b * 13 + 1);
          const ribU = Math.abs(u - 0.5) < 0.1, ribV = Math.abs(v - 0.5) < (kind === 'side' ? 0.14 : 0.1);
          const edgeU = a === 0 || a === nu - 1, edgeV = b === 0 || b === nv - 1;
          let c, col;
          if (kind === 'in') { c = hv < 0.5 ? '.' : ':'; col = paper(0.12); }
          else if (ribU || ribV) { c = ribU && ribV ? '+' : ribU ? '|' : '='; col = ribbon(light); }
          else if (kind === 'side' && edgeU) { c = '|'; col = paper(light * 0.48); }
          else if (kind === 'side' && b === nv - 1) { c = '-'; col = paper(light * 0.7 + 0.12); }
          else if (kind === 'top' && (edgeU || edgeV)) { c = '='; col = paper(0.72); }
          else { c = FILL[Math.floor(hv * FILL.length)]; col = paper(light * (0.52 + hv * 0.1)); }
          out.push({ x: s.x, y: s.y, z: s.z + (kind === 'top' ? 0.05 : 0), c, col, lid });
        }
      }
    };
    [
      [[-hw, hd, 0], [g.w, 0, 0], [0, 0, H], [0, 1]],
      [[hw, -hd, 0], [-g.w, 0, 0], [0, 0, H], [0, -1]],
      [[hw, hd, 0], [0, -g.d, 0], [0, 0, H], [1, 0]],
      [[-hw, -hd, 0], [0, g.d, 0], [0, 0, H], [-1, 0]],
    ].forEach(([o, U, V, n]) => {
      const [vx, vz] = toView(n[0] * cy + n[1] * sy, -n[0] * sy + n[1] * cy);
      if (vz <= 0.03) return; // facing away
      sample(o, U, V, 'side', 0.35 + 0.6 * Math.max(0, vx * LDIR[0] + vz * LDIR[1]), false);
    });
    if (open) sample([-hw, -hd, H - 0.05], [g.w, 0, 0], [0, g.d, 0], 'in', 0, false); // dark inside
    sample([-hw, -hd, H + 0.02], [g.w, 0, 0], [0, g.d, 0], 'top', 0.95, true);         // lid
    return out;
  }

  // Finale: the turntable slows down and turns the present nearest the front toward the camera,
  // that present slides forward and opens, a frog leaps out and says something.
  let openIdx = -1, rotFrom = 0, rotTo = 0, starTo = 0;
  const TURN = 1.4; // seconds to bring the box to the front
  function updateRotation(dt) {
    const sa = age('surprise');
    if (sa < 0) { if ('ground' in phases) rot += dt * (reduce ? 0.08 : 0.3); return; }
    if (openIdx < 0) {
      let best = -2;
      gifts.forEach((g, i) => { const c = Math.cos(g.ang + rot); if (c > best) { best = c; openIdx = i; } });
      rotFrom = rot;
      rotTo = -gifts[openIdx].ang;
      while (rotTo < rotFrom) rotTo += Math.PI * 2;
      if (rotTo - rotFrom > Math.PI * 1.2) rotTo -= Math.PI * 2;
      starTo = Math.ceil(rotFrom / (Math.PI * 2)) * Math.PI * 2; // the star ends facing the camera
    }
    const k = clamp(sa / TURN);
    rot = rotFrom + (rotTo - rotFrom) * (1 - Math.pow(1 - k, 3));
  }

  function drawBubble(ba, bx, topRow, frogX, frogY, z) {
    if (ba < 0) return;
    const IN = 12, W = IN + 2;
    const x0 = Math.round(bx - W / 2), y0 = Math.max(1, topRow - 6);
    const headX = frogX + 8, headY = frogY - 1;
    // thought puffs float up from the frog first
    const puffs = [[0.35, '.'], [0.6, 'o'], [0.85, 'O']];
    puffs.forEach(([f, c], j) => {
      if (ba < j * 0.08) return;
      put(headX + (x0 + W - 3 - headX) * f, headY + (y0 + 3 - headY) * f, c, '#f5f1ff', false, z);
    });
    const g = clamp((ba - 0.25) / 0.2);
    if (g <= 0) return;
    const bob = Math.sin(t * 3) > 0.6 ? -1 : 0;
    const yy = y0 + bob;
    const half = Math.round((W / 2) * g);                     // bubble grows out from its center
    const cxB = x0 + W / 2;
    const BORDER = '#f5f1ff', BLANK = '\u00a0';
    for (let x = Math.round(cxB - half); x < Math.round(cxB + half); x++) {
      const left = x === x0, right = x === x0 + W - 1;
      put(x, yy, left || right ? '.' : '-', BORDER, false, z);
      put(x, yy + 1, left ? '(' : right ? ')' : BLANK, BORDER, false, z);
      put(x, yy + 2, left || right ? "'" : '-', BORDER, false, z);
    }
    if (g < 1) return;
    put(x0 + W - 4, yy + 3, '\\', BORDER, false, z);          // tail points down to the frog
    // text types in one glyph at a time
    let cx = x0 + 2;
    BUBBLE_TEXT.forEach((ch, i) => {
      if (ba - 0.5 < i * 0.14) return;
      const wide = isWide(ch);
      put(cx, yy + 1, ch, ch === '!' ? '#ff4d5e' : '#ffd166', true, z + 1);
      cx += wide ? 2 : 1;
    });
  }

  function drawGifts() {
    const a = age('gifts');
    if (a < 0) return;
    const sa = age('surprise') - TURN;
    gifts.forEach((g0, i) => {
      const isOpen = i === openIdx;
      const g = isOpen ? { ...g0, dist: g0.dist + 9 * ease(clamp(age('surprise') / TURN)) } : g0;
      const opened = isOpen && sa >= 0;
      let cells = boxCells(g, i, opened);
      if (!opened) { materialize(cells, a - i * 0.25, i * 2.3 + 5, false); return; }
      const body = cells.filter(c => !c.lid);
      const topRow = Math.min(...body.map(c => Math.round(c.y)));
      const boxL = Math.min(...body.map(c => Math.round(c.x))), boxR = Math.max(...body.map(c => Math.round(c.x)));
      const boxBottom = Math.max(...body.map(c => Math.round(c.y)));
      const boxCx = (boxL + boxR) / 2, boxZ = Math.max(...body.map(c => c.z));
      // lid pops straight up, then slides off to the left and lands on the floor
      const k1 = ease(clamp(sa / 0.45)), k2 = ease(clamp((sa - 0.45) / 0.6));
      const lidDx = -k2 * (boxR - boxL + 3), lidDy = -k1 * 4 + k2 * (4 + boxBottom - topRow - 1);
      cells = cells.map(c => (c.lid ? { ...c, x: c.x + lidDx, y: c.y + lidDy } : c));
      materialize(cells, 5, 0, false);
      if (sa < 1.6) { // confetti
        for (let j = 0; j < 22; j++) {
          const ang = -Math.PI / 2 + (hash(j, 3) - 0.5) * 2.4, sp = 6 + hash(j, 9) * 10;
          put(boxCx + Math.cos(ang) * sp * sa * 1.6, topRow + Math.sin(ang) * sp * sa + 9 * sa * sa, '*+o.'[j % 4], LIGHT_COLORS[j % LIGHT_COLORS.length], true, boxZ + 3);
        }
      }
      // frog leaps out on an arc and lands on the floor right beside the box
      const fk = clamp((sa - 0.4) / 1.0);
      if (fk <= 0) return;
      const FH = FROG_BIG.rows.length;
      const sx = boxCx - 8, sy = topRow;
      const ex = boxR + 3, ey = boxBottom - FH + 1;
      const k = ease(fk);
      const fx = sx + (ex - sx) * k;
      const fy = sy + (ey - sy) * k - Math.sin(fk * Math.PI) * 9 - (1 - fk) * FH * Math.min(1, fk * 6);
      const blink = Math.sin(t * 1.3) > 0.97;
      const sp2 = blink ? { rows: FROG_BIG.rows.map((r, j) => (j === 1 ? FROG_BLINK_ROW : r)), cm: FROG_BIG.cm } : FROG_BIG;
      spriteCells(sp2, Math.round(fx), Math.round(fy), boxZ + 4)
        .filter(c => fk > 0.35 || c.y < topRow) // still inside the box: hidden
        .forEach(c => put(c.x, c.y, c.c, c.col, true, c.z));
      if (fk >= 1) drawBubble(sa - 1.6, boxCx, topRow, Math.round(fx), Math.round(fy), 900);
    });
  }

  function drawSnow(dt, front) { // starts with the sky and never stops; heavier once lights are on
    if (age('sky') < 0) return;
    const density = age('lights') >= 0 ? 1 : 0.55;
    snow.forEach((s, i) => {
      if (front !== (s.z > 0.6)) return;
      s.y += s.vy * dt;
      s.x += (Math.sin(t * 0.8 + s.ph) * 0.5 + 0.35) * dt * (0.6 + s.z);
      if (s.y > ROWS) { s.y = -1 - rnd() * 4; s.x = rnd() * COLS; }
      if (s.x > COLS) s.x -= COLS;
      if (i / snow.length > density || s.y < 0) return;
      put(s.x, s.y, s.c, `rgba(235,242,255,${(0.35 + s.z * 0.6).toFixed(2)})`, s.z > 0.92, front ? 200 : -1e8 + 1);
    });
  }

  function drawMessage() {
    const a = age('message');
    if (a < 0) return;
    const x0 = CX - Math.floor(MSG.length / 2);
    const cols = ['#ff4d5e', '#ffd166', '#7dffb0', '#f5f1ff'];
    for (let i = 0; i < MSG.length; i++) {
      if (a < i * 0.05) break;
      const fresh = a - i * 0.05 < 0.12;
      put(x0 + i, 52, fresh ? SCR[(i + Math.floor(t * 20)) % SCR.length] : MSG[i], fresh ? '#ffffff' : cols[(i + Math.floor(t * 1.5)) % 4], true, 1000);
    }
  }

  // ---------- canvas ----------
  const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
  let cw = 6, chh = 10, fontPx = 10;
  function resize() {
    const w = document.getElementById('scene').clientWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = w / COLS; chh = cw * 1.62; fontPx = chh * 0.98;
    cv.style.height = (chh * ROWS) + 'px';
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(chh * ROWS * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function paint() {
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const mono = `600 ${fontPx}px "JetBrains Mono", Consolas, monospace`;
    const hangul = `700 ${fontPx * 0.95}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;
    let letters = 0;
    for (let pass = 0; pass < 2; pass++) { // pass 1 = glowing cells
      ctx.shadowBlur = pass ? chh * 0.9 : 0;
      ctx.font = mono;
      for (let i = 0; i < N; i++) {
        const c = gc[i];
        if (!c || c === '\0' || gglow[i] !== pass) continue;
        letters++;
        ctx.fillStyle = gcol[i];
        if (pass) ctx.shadowColor = gcol[i];
        if (gwide[i]) {
          ctx.font = hangul;
          ctx.fillText(c, (i % COLS + 1) * cw, (Math.floor(i / COLS) + 0.5) * chh);
          ctx.font = mono;
        } else {
          ctx.fillText(c, (i % COLS + 0.5) * cw, (Math.floor(i / COLS) + 0.5) * chh);
        }
      }
    }
    ctx.shadowBlur = 0;
    return letters;
  }

  // ---------- code reader ----------
  const SRC = document.getElementById('src').textContent.replace(/^\n/, '').replace(/\n\s*$/, '').split('\n');
  const codeEl = document.getElementById('code');
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const KW = /^(const|let|for|of|new|return|then|loop|map|find)$/;
  function hl(s) {
    return s.replace(/(\/\/.*$)|("[^"]*"?)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_]\w*\b)(\s*\()?|([^\w"\/]+|\/)/g,
      (m, com, str, num, id, call) => {
        if (com) return `<span class="c">${esc(com)}</span>`;
        if (str) return `<span class="s">${esc(str)}</span>`;
        if (num) return `<span class="n">${num}</span>`;
        if (id) {
          const tail = call ? esc(call) : '';
          if (id === 'phase') return `<span class="p">${id}</span>${tail}`;
          if (KW.test(id)) return `<span class="k">${id}</span>${tail}`;
          if (call) return `<span class="f">${id}</span>${tail}`;
          return esc(id);
        }
        return esc(m);
      });
  }
  // the full script is on screen from the start
  codeEl.innerHTML = SRC.map((s, i) => `<div class="ln todo"><span class="no">${i + 1}</span><span class="tx">${hl(s) || '&nbsp;'}</span></div>`).join('');
  const lineEls = Array.from(codeEl.children);
  let li = -1, lineT = 0, hold = 0, shownLi = -2;
  const lineDur = s => { const tr = s.trim(); return tr ? 0.2 + tr.length * 0.007 : 0.06; };
  function trigger(name) { if (!(name in phases)) phases[name] = t; }
  function enterLine(i) {
    li = i; lineT = 0;
    if (i < SRC.length) {
      const m = SRC[i].match(/phase\("(\w+)"\)/);
      if (m) { trigger(m[1]); hold = HOLD[m[1]] || 1; }
    }
  }
  function stepReading(dt) {
    if (li < 0) enterLine(0);
    let left = dt;
    while (li < SRC.length && left > 0) {
      if (hold > 0) { const u = Math.min(hold, left); hold -= u; left -= u; continue; }
      const d = lineDur(SRC[li]);
      const need = d - lineT;
      if (left < need) { lineT += left; return; }
      left -= need;
      enterLine(li + 1);
    }
  }
  function renderCode() {
    if (shownLi === li) return;
    const from = Math.max(0, Math.min(shownLi, li) - 1), to = Math.min(lineEls.length - 1, Math.max(shownLi, li) + 1);
    for (let i = shownLi < 0 ? 0 : from; i <= (shownLi < 0 ? lineEls.length - 1 : to); i++) {
      lineEls[i].className = 'ln ' + (i < li ? 'done' : i === li ? 'on' : 'todo');
    }
    shownLi = li;
    const on = lineEls[Math.min(li, lineEls.length - 1)];
    if (on) codeEl.scrollTop = Math.max(0, on.offsetTop - codeEl.clientHeight * 0.4);
  }

  // ---------- main loop ----------
  const clockEl = document.getElementById('clock');
  const statsEl = document.getElementById('stats');
  const stateEl = document.getElementById('state');
  let last = performance.now(), fps = 60, hudTimer = 0;

  function restart() {
    t = 0; li = -1; lineT = 0; hold = 0; rot = 0; openIdx = -1; shownLi = -2;
    for (const k in phases) delete phases[k];
    if (reduce) {
      SRC.forEach(l => { const m = l.match(/phase\("(\w+)"\)/); if (m) phases[m[1]] = -30; });
      li = SRC.length;
    }
  }

  function frame(now) {
    const raw = Math.min(0.05, (now - last) / 1000);
    last = now;
    fps = fps * 0.95 + (1 / Math.max(raw, 1e-3)) * 0.05;
    const dt = paused ? 0 : raw * speed;
    t += dt;
    stepReading(dt);
    updateRotation(dt);

    clearGrid();
    drawSky(); drawSnow(dt, false); drawGround(); drawTree(); drawTinsel(); drawBaubles();
    drawGifts(); drawStar(); drawSnow(dt, true); drawMessage();
    const letters = paint();
    renderCode();

    hudTimer -= raw;
    if (hudTimer <= 0) {
      hudTimer = 0.1;
      const done = li >= SRC.length;
      clockEl.textContent = `● t ${t.toFixed(2)}s`;
      statsEl.textContent = `rotation ${(((rot * 180 / Math.PI) % 360) + 360) % 360 | 0}° · lights ${litCount} · letters ${letters.toLocaleString()}`;
      stateEl.textContent = paused ? '❚❚ paused' : `${done ? '✓ done' : '● running'} · ${Math.round(fps)} fps`;
      stateEl.classList.toggle('done', done && !paused);
    }
    requestAnimationFrame(frame);
  }

  // ---------- controls ----------
  const btnPause = document.getElementById('btnPause');
  const btnSpeed = document.getElementById('btnSpeed');
  function togglePause() {
    paused = !paused;
    btnPause.firstChild.textContent = paused ? '재생' : '일시정지';
  }
  document.getElementById('btnRestart').addEventListener('click', restart);
  btnPause.addEventListener('click', togglePause);
  btnSpeed.addEventListener('click', () => {
    speed = speed === 1 ? 2 : 1;
    btnSpeed.textContent = `속도 ${speed}×`;
  });
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('button') && (e.key === ' ' || e.key === 'Enter')) return;
    if (e.key === ' ') { e.preventDefault(); togglePause(); }
    if (e.key === 'r' || e.key === 'R') restart();
  });
  addEventListener('resize', resize);

  const start = () => {
    resize();
    restart();
    requestAnimationFrame(t0 => { last = t0; requestAnimationFrame(frame); });
  };
  const fontReady = document.fonts && document.fonts.load
    ? document.fonts.load('600 12px "JetBrains Mono"').catch(() => {})
    : Promise.resolve();
  fontReady.then(start);
})();

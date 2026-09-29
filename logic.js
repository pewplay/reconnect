/*
 * Reconnect - game rules.
 * Rebuilt for PewPlay from "Connect" (js13kGames 2018) by AviKKi & Gilbishkosma.
 * Licensed under the Apache License 2.0 (see LICENSE).
 *
 * This file only holds the rules (no drawing, no input), so it can also be
 * loaded outside the browser. All coordinates live in a 600x600 board.
 *
 * The rules follow the original game:
 *  - One arrow press moves every piece by 5 pixels.
 *  - The computer moves the way you press. The network signal moves the
 *    opposite way (Silly Sam scrambled the controls).
 *  - Bring the computer and the signal onto the exact same spot to connect.
 *  - Touching a firewall (green bricks) ends the attempt.
 *  - Day 2: grab both keys. The computer's key flips all controls, the
 *    network's key flips them back.
 *  - Days 3-5: two Ice Walkers copy your moves (one normal, one reversed).
 *    If they touch you, each other, or a firewall, the attempt is over.
 *  - Day 4: some firewalls slide back and forth on their own.
 */
(function (root) {
  'use strict';

  var SIZE = 600;
  var EDGE = 10;          // grey border thickness
  var PIECE = 20;         // size of every moving piece
  var MIN = EDGE;
  var MAX = SIZE - EDGE - PIECE; // 570
  var STEP = 5;
  var DAYS = 5;

  var BASE_WALLS = [
    [80, 50, 30, 160], [490, 440, 30, 150], [170, 220, 30, 160], [400, 330, 30, 160],
    [285, 200, 30, 80], [285, 320, 30, 80], [225, 420, 30, 80], [330, 220, 90, 30],
    [80, 380, 30, 160], [130, 80, 80, 30], [135, 540, 80, 30], [490, 50, 30, 160]
  ];
  var DAY2_GATE = [130, 80, 80, 30];

  var LEVELS = {
    1: {
      walls: BASE_WALLS,
      computer: [570, 570], network: [10, 10]
    },
    2: {
      walls: BASE_WALLS.filter(function (w) { return w.join() !== DAY2_GATE.join(); }),
      gate: DAY2_GATE,
      keys: true,
      computer: [570, 570], network: [10, 10]
    },
    3: {
      walls: [
        [80, 50, 30, 160], [490, 440, 30, 150], [490, 50, 30, 150], [285, 200, 30, 80],
        [285, 320, 30, 80], [220, 260, 30, 80], [350, 260, 30, 80], [80, 350, 30, 160],
        [340, 180, 80, 30]
      ],
      computer: [10, 10], network: [570, 570],
      walkers: [[300, 10], [300, 570]]
    },
    4: {
      walls: [[100, 270, 30, 80], [470, 270, 30, 80], [240, 250, 120, 20], [240, 340, 120, 20]],
      movers: [
        { x: 80, y: 70, w: 30, h: 160, v: 3, min: 80, max: 250 },
        { x: 480, y: 380, w: 30, h: 160, v: -3, min: 315, max: 480 },
        { x: 480, y: 70, w: 30, h: 175, v: -5, min: 315, max: 480 }
      ],
      computer: [570, 570], network: [10, 10],
      walkers: [[300, 570], [300, 10]]
    },
    5: {
      walls: BASE_WALLS,
      computer: [570, 570], network: [10, 10],
      walkers: [[300, 10], [300, 570]]
    }
  };

  // Where the keys are drawn and the zones that pick them up (Day 2).
  var KEYS = {
    computer: { drawX: 125, drawY: 25, x0: 120, x1: 140, y0: 10, y1: 30 },
    network: { drawX: 540, drawY: 575, x0: 520, x1: 555, y0: 550, y1: 570 }
  };

  var DIRS = {
    up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0]
  };

  function clamp(v) { return v < MIN ? MIN : v > MAX ? MAX : v; }

  function createLevel(day) {
    var def = LEVELS[day];
    var s = {
      day: day,
      walls: def.walls.map(function (w) { return w.slice(); }),
      gate: def.gate ? def.gate.slice() : null,
      hasKeys: !!def.keys,
      keyComputer: false,
      keyNetwork: false,
      sign: 1, // 1 = normal controls, -1 = flipped by the Day 2 key
      computer: { x: def.computer[0], y: def.computer[1] },
      network: { x: def.network[0], y: def.network[1] },
      walkers: (def.walkers || []).map(function (p, i) {
        return { x: p[0], y: p[1], reversed: i === 1 };
      }),
      movers: (def.movers || []).map(function (m) {
        return { x: m.x, y: m.y, w: m.w, h: m.h, v: m.v, min: m.min, max: m.max };
      }),
      moves: 0,
      over: null, // null | 'firewall' | 'walker'
      won: false
    };
    return s;
  }

  // Generous hitbox used by the original game for walls.
  function hitsRect(p, x, y, w, h) {
    return p.x - 2 < x + w && p.x + 25 > x && p.y - 2 < y + h && p.y + 25 > y;
  }
  function overlaps(a, b) {
    return a.x < b.x + PIECE && a.x + PIECE > b.x && a.y < b.y + PIECE && a.y + PIECE > b.y;
  }
  function allWalls(s) {
    var list = s.walls.slice();
    if (s.gate) list.push(s.gate);
    for (var i = 0; i < s.movers.length; i++) {
      var m = s.movers[i];
      list.push([m.x, m.y, m.w, m.h]);
    }
    return list;
  }

  function checkKeys(s) {
    if (!s.hasKeys || (s.keyComputer && s.keyNetwork)) return;
    var c = s.computer, n = s.network, kc = KEYS.computer, kn = KEYS.network;
    if (c.x >= kc.x0 && c.x <= kc.x1 && c.y >= kc.y0 && c.y <= kc.y1) {
      s.keyComputer = true;
      s.gate = null;   // the extra firewall disappears
      s.sign = -1;     // ...and the controls flip
    }
    if (n.x >= kn.x0 && n.x <= kn.x1 && n.y >= kn.y0 && n.y <= kn.y1) {
      s.keyNetwork = true;
      s.sign = 1;
    }
  }

  function evaluate(s) {
    if (s.over || s.won) return;
    checkKeys(s);
    var walls = allWalls(s);
    var i, j;
    // Ice Walkers: touching you, each other, or a firewall.
    for (i = 0; i < s.walkers.length; i++) {
      var w = s.walkers[i];
      if (overlaps(w, s.computer) || overlaps(w, s.network)) { s.over = 'walker'; return; }
      for (j = 0; j < s.walkers.length; j++) {
        if (j !== i && overlaps(w, s.walkers[j])) { s.over = 'walker'; return; }
      }
      for (j = 0; j < walls.length; j++) {
        if (hitsRect(w, walls[j][0], walls[j][1], walls[j][2], walls[j][3])) { s.over = 'walker'; return; }
      }
    }
    // Firewalls.
    for (j = 0; j < walls.length; j++) {
      var r = walls[j];
      if (hitsRect(s.computer, r[0], r[1], r[2], r[3]) || hitsRect(s.network, r[0], r[1], r[2], r[3])) {
        s.over = 'firewall';
        return;
      }
    }
    if (s.computer.x === s.network.x && s.computer.y === s.network.y &&
        (!s.hasKeys || (s.keyComputer && s.keyNetwork))) {
      s.won = true;
    }
  }

  function movePiece(p, dir, amount) {
    p.x = clamp(p.x + dir[0] * amount);
    p.y = clamp(p.y + dir[1] * amount);
  }

  // One arrow press.
  function move(s, dirName) {
    if (s.over || s.won) return false;
    var d = DIRS[dirName];
    if (!d) return false;
    movePiece(s.computer, d, STEP * s.sign);
    movePiece(s.network, d, -STEP * s.sign);
    for (var i = 0; i < s.walkers.length; i++) {
      var w = s.walkers[i];
      movePiece(w, d, w.reversed ? -STEP : STEP);
    }
    s.moves++;
    evaluate(s);
    return true;
  }

  // One 30 ms game tick (only the sliding firewalls of Day 4 move on their own).
  function tick(s) {
    if (s.over || s.won || !s.movers.length) return;
    for (var i = 0; i < s.movers.length; i++) {
      var m = s.movers[i];
      m.x += m.v;
      if (m.x < m.min || m.x > m.max) m.v = -m.v;
    }
    evaluate(s);
  }

  root.ReconnectLogic = {
    SIZE: SIZE, EDGE: EDGE, PIECE: PIECE, DAYS: DAYS, TICK_MS: 30,
    KEYS: KEYS,
    createLevel: createLevel,
    move: move,
    tick: tick,
    evaluate: evaluate
  };
})(typeof window !== 'undefined' ? window : globalThis);

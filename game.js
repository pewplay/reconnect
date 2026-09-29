/*
 * Reconnect - drawing, screens and input.
 * Rebuilt for PewPlay from "Connect" (js13kGames 2018) by AviKKi & Gilbishkosma.
 * Licensed under the Apache License 2.0 (see LICENSE).
 */
(function () {
  'use strict';

  var L = window.ReconnectLogic;
  var SIZE = L.SIZE;
  var STORAGE_KEY = 'reconnect:day';

  var STORIES = {
    1: 'DAY 1: Silly Sam, my colleague, has run some shady commands on my work computer again. ' +
       'Please help me get back on the network, and find a way past the firewalls without touching them.',
    2: 'DAY 2: Sam is learning about authentication. He wrote me a nice little login program, ' +
       'but I lost the keys. Find both keys, then connect to the network. ' +
       '(You will run into some of his anti-trespassing code along the way.)',
    3: 'DAY 3: Sam has been binge-watching a fantasy show, and now he has built some AI Ice Walkers. ' +
       'Stay away from them, and don\'t let them touch the firewalls either. ' +
       '(Luckily, Ice Walkers are not that smart.)',
    4: 'DAY 4: Sam is done with TV and has moved on to advanced security. Now the firewalls move.',
    5: 'DAY 5: Sadly, Sam is leaving the company, so he has made one last masterpiece ' +
       'to keep me busy for days.'
  };

  var WIN_LINES = {
    1: ['Well done!'],
    2: ['Good work!', 'Keys stolen.'],
    3: ['Congrats!', 'You survived the winter!'],
    4: ['#HackerMan', 'You sneaked past', 'all the firewalls.'],
    5: ['You won!']
  };

  // ---------------------------------------------------------------- state
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var pad = document.getElementById('pad');

  var mode = 'title';      // title | story | play | dead | cleared | victory
  var day = 1;
  var level = null;
  var story = { text: '', lines: [], shown: 0, total: 0, timer: 0 };
  var modeTime = 0;        // ms since the current screen appeared
  var tickTimer = 0;
  var titleChoice = 0;     // 0 = first button
  var savedDay = loadDay();
  var touchUI = false;

  var held = [];           // held directions, last one wins
  var repeatAt = 0;
  var REPEAT_DELAY = 190;
  var REPEAT_EVERY = 45;

  function loadDay() {
    try {
      var v = parseInt(localStorage.getItem(STORAGE_KEY), 10);
      return v >= 1 && v <= L.DAYS ? v : 1;
    } catch (e) {
      return 1;
    }
  }
  function saveDay(d) {
    savedDay = d;
    try {
      if (d > 1) localStorage.setItem(STORAGE_KEY, String(d));
      else localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* storage unavailable */ }
  }

  // ---------------------------------------------------------------- layout
  var view = { size: SIZE, x: 0, y: 0, dpr: 1 };

  function detectTouch() {
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return !!coarse || (navigator.maxTouchPoints > 0 && !(window.matchMedia && window.matchMedia('(pointer: fine)').matches));
  }

  function layout() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    var size, cx, cy, padSize = 0, px = 0, py = 0;

    if (!touchUI) {
      size = Math.min(w, h);
      cx = (w - size) / 2;
      cy = (h - size) / 2;
    } else if (h >= w * 1.15) {
      // Portrait: board on top, pad below.
      var area = Math.max(170, Math.min(h * 0.32, 280));
      size = Math.min(w, h - area);
      padSize = Math.min(area - 20, w * 0.7, 260);
      var used = size + padSize + 20;
      var spare = Math.max(0, h - used);
      cy = spare / 3;
      cx = (w - size) / 2;
      px = (w - padSize) / 2;
      py = cy + size + 10 + (h - (cy + size + 10) - padSize) / 2;
    } else {
      // Landscape / square: board in the middle, pad on the right.
      // Landscape / square: board on the left, pad on the right, centred as a group.
      padSize = Math.max(120, Math.min(h * 0.55, 230));
      var gap = 24;
      size = Math.min(h, w - padSize - gap * 2);
      if (size < h * 0.6) {
        // Very narrow: shrink the pad instead.
        padSize = Math.max(120, w - h * 0.6 - gap * 2);
        size = Math.min(h, w - padSize - gap * 2);
      }
      var groupW = size + gap + padSize;
      cx = (w - groupW) / 2;
      cy = (h - size) / 2;
      px = cx + size + gap;
      py = h - padSize - Math.max(12, (h - padSize) * 0.25);
    }

    size = Math.max(50, Math.floor(size));
    view.size = size;
    view.x = Math.round(cx);
    view.y = Math.round(cy);
    view.dpr = Math.min(window.devicePixelRatio || 1, 3);

    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    canvas.style.left = view.x + 'px';
    canvas.style.top = view.y + 'px';
    var px2 = Math.round(size * view.dpr);
    if (canvas.width !== px2) {
      canvas.width = px2;
      canvas.height = px2;
    }

    pad.hidden = !touchUI;
    if (touchUI) {
      padSize = Math.floor(padSize);
      pad.style.width = padSize + 'px';
      pad.style.height = padSize + 'px';
      pad.style.left = Math.round(px) + 'px';
      pad.style.top = Math.round(py) + 'px';
      pad.style.gap = Math.round(padSize * 0.03) + 'px';
    }
    if (story.text) wrapStory();
  }

  function setTouchUI(on) {
    if (touchUI === on) return;
    touchUI = on;
    layout();
  }

  // ---------------------------------------------------------------- flow
  function setMode(m) {
    mode = m;
    modeTime = 0;
  }

  function showStory(d) {
    day = d;
    story.text = STORIES[d];
    wrapStory();
    story.shown = 0;
    story.timer = 0;
    setMode('story');
  }

  function wrapStory() {
    ctx.save();
    ctx.font = '25px sans-serif';
    var words = story.text.split(' ');
    var lines = [];
    var line = '';
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > SIZE - 70 && line) {
        lines.push(line);
        line = words[i];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    ctx.restore();
    story.lines = lines;
    story.total = lines.join('').length;
  }

  function startLevel(d) {
    day = d;
    level = L.createLevel(d);
    tickTimer = 0;
    repeatAt = performance.now() + REPEAT_DELAY;
    setMode('play');
  }

  function startGame(fromDay) {
    showStory(fromDay);
  }

  function action() {
    if (mode === 'title') {
      var opts = titleOptions();
      startGame(opts[titleChoice].day);
    } else if (mode === 'story') {
      if (story.shown < story.total) story.shown = story.total;
      else startLevel(day);
    } else if (mode === 'dead') {
      if (modeTime > 250) startLevel(day);
    } else if (mode === 'cleared') {
      if (modeTime > 700) afterCleared();
    } else if (mode === 'victory') {
      if (modeTime > 1200) {
        titleChoice = 0;
        setMode('title');
      }
    }
  }

  function restartDay() {
    if (mode === 'play' || mode === 'dead') startLevel(day);
  }

  function afterCleared() {
    if (day < L.DAYS) showStory(day + 1);
    else setMode('victory');
  }

  function onMoved() {
    if (level.won) {
      if (day < L.DAYS) saveDay(day + 1);
      else saveDay(1);
      held.length = 0;
      setMode('cleared');
    } else if (level.over) {
      held.length = 0;
      setMode('dead');
    }
  }

  function doMove(dir) {
    if (mode !== 'play') return;
    if (L.move(level, dir)) onMoved();
  }

  function titleOptions() {
    var list = [];
    if (savedDay > 1) list.push({ label: 'Continue: Day ' + savedDay, day: savedDay });
    list.push({ label: savedDay > 1 ? 'New game' : 'Start', day: 1 });
    return list;
  }
  function titleButtonRect(i, count) {
    var w = 330, h = 70, gap = 18;
    var top = count > 1 ? 400 : 440;
    return { x: (SIZE - w) / 2, y: top + i * (h + gap), w: w, h: h };
  }

  // ---------------------------------------------------------------- input
  var KEY_DIRS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right'
  };

  function pressDir(dir) {
    if (mode === 'title') {
      var n = titleOptions().length;
      if (dir === 'up') titleChoice = (titleChoice + n - 1) % n;
      if (dir === 'down') titleChoice = (titleChoice + 1) % n;
      return;
    }
    var i = held.indexOf(dir);
    if (i >= 0) held.splice(i, 1);
    held.push(dir);
    doMove(dir);
    repeatAt = performance.now() + REPEAT_DELAY;
  }
  function releaseDir(dir) {
    var i = held.indexOf(dir);
    if (i >= 0) held.splice(i, 1);
  }

  window.addEventListener('keydown', function (e) {
    var dir = KEY_DIRS[e.code];
    if (dir) {
      e.preventDefault();
      if (!e.repeat) pressDir(dir);
      return;
    }
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      if (!e.repeat) action();
    } else if (e.code === 'KeyR') {
      restartDay();
    }
  });
  window.addEventListener('keyup', function (e) {
    var dir = KEY_DIRS[e.code];
    if (dir) releaseDir(dir);
  });
  window.addEventListener('blur', function () { held.length = 0; clearPadState(); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { held.length = 0; clearPadState(); }
  });

  function toBoard(e) {
    var r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width * SIZE,
      y: (e.clientY - r.top) / r.height * SIZE
    };
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') setTouchUI(true);
    e.preventDefault();
    if (mode === 'title') {
      var p = toBoard(e);
      var opts = titleOptions();
      for (var i = 0; i < opts.length; i++) {
        var b = titleButtonRect(i, opts.length);
        if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
          titleChoice = i;
          action();
          return;
        }
      }
      return;
    }
    action();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (mode !== 'title' || e.pointerType !== 'mouse') return;
    var p = toBoard(e);
    var opts = titleOptions();
    var hover = false;
    for (var i = 0; i < opts.length; i++) {
      var b = titleButtonRect(i, opts.length);
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        titleChoice = i;
        hover = true;
      }
    }
    canvas.style.cursor = hover ? 'pointer' : 'default';
  });

  var padPointers = {};
  function clearPadState() {
    padPointers = {};
    var btns = pad.querySelectorAll('.pad-btn');
    for (var i = 0; i < btns.length; i++) btns[i].classList.remove('is-down');
  }
  pad.addEventListener('pointerdown', function (e) {
    var btn = e.target.closest('.pad-btn');
    if (!btn) return;
    e.preventDefault();
    try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    btn.classList.add('is-down');
    padPointers[e.pointerId] = btn;
    if (btn.dataset.dir) {
      if (mode === 'title' || mode === 'play') pressDir(btn.dataset.dir);
    } else if (btn.dataset.action === 'ok') {
      action();
    } else if (btn.dataset.action === 'restart') {
      restartDay();
    }
  });
  function padUp(e) {
    var btn = padPointers[e.pointerId];
    if (!btn) return;
    delete padPointers[e.pointerId];
    btn.classList.remove('is-down');
    if (btn.dataset.dir) releaseDir(btn.dataset.dir);
  }
  pad.addEventListener('pointerup', padUp);
  pad.addEventListener('pointercancel', padUp);
  pad.addEventListener('lostpointercapture', padUp);
  pad.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // ---------------------------------------------------------------- drawing
  function drawBorder() {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, SIZE, 10);
    ctx.fillRect(0, SIZE - 10, SIZE, 10);
    ctx.fillRect(0, 0, 10, SIZE);
    ctx.fillRect(SIZE - 10, 0, 10, SIZE);
  }

  function drawBricks(x, y, w, h, color) {
    var bh = 10, bw = 20;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    ctx.beginPath();
    for (var yy = y + bh; yy < y + h; yy += bh) {
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy);
    }
    for (var i = 0; i < h / bh; i++) {
      var start = (i % 2 === 0 ? 0.5 : 1) * bw + x;
      for (; start < x + w; start += bw) {
        ctx.moveTo(start, y + i * bh);
        ctx.lineTo(start, Math.min(y + h, y + (i + 1) * bh));
      }
    }
    ctx.stroke();
  }

  function drawComputer(x, y) {
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(x, y, 20, 16);
    ctx.strokeStyle = '#808080';
    ctx.strokeRect(x + 2, y + 2, 16, 12);
    ctx.fillStyle = '#10c010';
    ctx.fillRect(x + 3, y + 5, 3, 3);
    ctx.fillRect(x + 7.5, y + 5, 5, 3);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 5, y + 16, 10, 4);
  }

  function drawNetwork(x, y) {
    var c = '#3a6dff';
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = c;
    ctx.strokeRect(x, y, 20, 20);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x + 10, y + 12.5, 3, 0, Math.PI, true);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 10, y + 11, 7, 0, Math.PI, true);
    ctx.stroke();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x + 10, y + 16, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawKey(x, y, color) {
    x -= 5;
    y -= 4;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color;
    ctx.strokeRect(x, y, 6, 10);
    ctx.fillStyle = color;
    ctx.fillRect(x + 6, y + 3, 14, 2);
    ctx.fillRect(x + 11, y + 3, 2, 6);
    ctx.fillRect(x + 16, y + 3, 2, 9);
  }

  function drawWalker(w) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(w.x, w.y, 20, 20);
    ctx.fillStyle = '#4fb8ff';
    ctx.fillRect(w.x + 4, w.y + 6, 4, 4);
    ctx.fillRect(w.x + 12, w.y + 6, 4, 4);
  }

  function drawLevel(s) {
    drawBorder();
    var i;
    for (i = 0; i < s.walls.length; i++) {
      var r = s.walls[i];
      drawBricks(r[0], r[1], r[2], r[3], '#1f9d1f');
    }
    if (s.gate) drawBricks(s.gate[0], s.gate[1], s.gate[2], s.gate[3], '#1f9d1f');
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#2bd12b';
    for (i = 0; i < s.movers.length; i++) {
      var m = s.movers[i];
      ctx.fillStyle = 'rgba(43, 209, 43, 0.14)';
      ctx.fillRect(m.x, m.y, m.w, m.h);
      ctx.strokeRect(m.x, m.y, m.w, m.h);
    }
    if (s.hasKeys) {
      if (!s.keyComputer) drawKey(L.KEYS.computer.drawX, L.KEYS.computer.drawY, '#fff');
      if (!s.keyNetwork) drawKey(L.KEYS.network.drawX, L.KEYS.network.drawY, '#3a6dff');
    }
    drawComputer(s.computer.x, s.computer.y);
    drawNetwork(s.network.x, s.network.y);
    for (i = 0; i < s.walkers.length; i++) drawWalker(s.walkers[i]);

    // HUD
    ctx.font = 'bold 20px "Courier New", Courier, monospace';
    ctx.fillStyle = '#ffd700';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Day ' + s.day + '/' + L.DAYS, SIZE / 2, 30);
    if (s.hasKeys) {
      ctx.font = '15px "Courier New", Courier, monospace';
      ctx.fillStyle = s.sign < 0 ? '#ff6060' : '#9a9a9a';
      var keysTxt = 'Keys ' + ((s.keyComputer ? 1 : 0) + (s.keyNetwork ? 1 : 0)) + '/2';
      if (s.sign < 0) keysTxt += '  controls flipped!';
      ctx.fillText(keysTxt, SIZE / 2, 50);
    }
  }

  function panel(y, h) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
    ctx.fillRect(40, y, SIZE - 80, h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, y, SIZE - 80, h);
  }

  function promptText(verb) {
    return (touchUI ? 'Tap' : 'Press Space') + ' to ' + verb;
  }

  function blink() {
    return Math.floor(modeTime / 500) % 2 === 0 ? 1 : 0.55;
  }

  function drawTitle() {
    drawBorder();
    // Icons: computer ... signal
    ctx.save();
    ctx.translate(SIZE / 2 - 150, 120);
    ctx.scale(4, 4);
    drawComputer(0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(SIZE / 2 + 70, 120);
    ctx.scale(4, 4);
    drawNetwork(0, 0);
    ctx.restore();
    // dashed link that "pulses"
    ctx.strokeStyle = '#1f9d1f';
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 10]);
    ctx.lineDashOffset = -modeTime / 40;
    ctx.beginPath();
    ctx.moveTo(SIZE / 2 - 60, 160);
    ctx.lineTo(SIZE / 2 + 60, 160);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 60px "Courier New", Courier, monospace';
    ctx.fillText('Reconnect', SIZE / 2, 270);
    ctx.fillStyle = '#1fcf1f';
    ctx.font = '21px "Courier New", Courier, monospace';
    ctx.fillText('Silly Sam knocked me offline again.', SIZE / 2, 318);
    ctx.fillText('Help me get back on the network!', SIZE / 2, 346);

    var opts = titleOptions();
    if (titleChoice >= opts.length) titleChoice = 0;
    for (var i = 0; i < opts.length; i++) {
      var b = titleButtonRect(i, opts.length);
      var active = i === titleChoice;
      ctx.fillStyle = active ? 'rgba(31, 157, 31, 0.35)' : 'rgba(255, 255, 255, 0.06)';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = active ? '#2bd12b' : '#5a5a5a';
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = active ? '#fff' : '#bbb';
      ctx.font = 'bold 26px "Courier New", Courier, monospace';
      ctx.fillText(opts[i].label, SIZE / 2, b.y + b.h / 2 + 1);
    }
    ctx.fillStyle = '#8a8a8a';
    ctx.font = '17px "Courier New", Courier, monospace';
    ctx.fillText(touchUI ? 'D-pad: move   Tap: continue' : 'Arrows: move   Space: continue   R: restart',
      SIZE / 2, 568);
  }

  function drawStory() {
    ctx.fillStyle = '#1fcf1f';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '25px sans-serif';
    var left = story.shown;
    var y = 60;
    for (var i = 0; i < story.lines.length && left > 0; i++) {
      var ln = story.lines[i];
      ctx.fillText(ln.slice(0, left), 35, y);
      left -= ln.length;
      y += 36;
    }
    if (story.shown >= story.total) {
      ctx.textAlign = 'center';
      if (day === 1) {
        ctx.fillStyle = '#bbb';
        ctx.font = '19px "Courier New", Courier, monospace';
        ctx.fillText('Goal: bring the computer and the', SIZE / 2, 440);
        ctx.fillText('Wi-Fi signal onto the same spot.', SIZE / 2, 466);
        ctx.fillText('Beware: Sam messed with the controls!', SIZE / 2, 492);
      }
      ctx.globalAlpha = blink();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px "Courier New", Courier, monospace';
      ctx.fillText(promptText('start Day ' + day), SIZE / 2, 555);
      ctx.globalAlpha = 1;
    }
  }

  function drawDead() {
    drawLevel(level);
    panel(205, 190);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff3b3b';
    ctx.font = 'bold 32px "Courier New", Courier, monospace';
    ctx.fillText(level.over === 'walker' ? 'Caught by an Ice Walker!' : 'Burned by a firewall!', SIZE / 2, 250);
    ctx.font = '26px "Courier New", Courier, monospace';
    ctx.fillText('Game over :(', SIZE / 2, 300);
    ctx.globalAlpha = blink();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 21px "Courier New", Courier, monospace';
    ctx.fillText(promptText('retry Day ' + day), SIZE / 2, 350);
    ctx.globalAlpha = 1;
  }

  function drawCleared() {
    drawLevel(level);
    var lines = WIN_LINES[day];
    // Pulse around the spot where computer and network met.
    var c = level.computer;
    var pulse = (modeTime % 900) / 900;
    ctx.strokeStyle = 'rgba(43, 209, 43, ' + (1 - pulse).toFixed(2) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(c.x + 10, c.y + 10, 16 + pulse * 40, 0, Math.PI * 2);
    ctx.stroke();

    var h = 40 + lines.length * 45;
    var top = c.y > SIZE / 2 ? 90 : 370;
    panel(top, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 35px "Courier New", Courier, monospace';
    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], SIZE / 2, top + 42 + i * 45);
    }
  }

  function drawVictory() {
    drawBorder();
    ctx.save();
    ctx.translate(SIZE / 2 - 150, 110);
    ctx.scale(4, 4);
    drawComputer(0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(SIZE / 2 + 70, 110);
    ctx.scale(4, 4);
    drawNetwork(0, 0);
    ctx.restore();
    ctx.strokeStyle = '#2bd12b';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(SIZE / 2 - 64, 150);
    ctx.lineTo(SIZE / 2 + 64, 150);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 52px "Courier New", Courier, monospace';
    ctx.fillText('You won!', SIZE / 2, 280);
    ctx.fillStyle = '#1fcf1f';
    ctx.font = '23px "Courier New", Courier, monospace';
    ctx.fillText('I\'m back online, all five days.', SIZE / 2, 335);
    ctx.fillText('Silly Sam has run out of pranks.', SIZE / 2, 367);
    if (modeTime > 1200) {
      ctx.globalAlpha = blink();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px "Courier New", Courier, monospace';
      ctx.fillText(promptText('play again'), SIZE / 2, 470);
      ctx.globalAlpha = 1;
    }
  }

  function render() {
    var k = canvas.width / SIZE;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SIZE, SIZE);
    if (mode === 'title') drawTitle();
    else if (mode === 'story') drawStory();
    else if (mode === 'play') drawLevel(level);
    else if (mode === 'dead') drawDead();
    else if (mode === 'cleared') drawCleared();
    else if (mode === 'victory') drawVictory();
  }

  // ---------------------------------------------------------------- loop
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(100, Math.max(0, now - last));
    last = now;
    modeTime += dt;

    if (mode === 'story' && story.shown < story.total) {
      story.timer += dt;
      while (story.timer >= 28 && story.shown < story.total) {
        story.timer -= 28;
        story.shown++;
      }
    } else if (mode === 'play') {
      if (held.length && now >= repeatAt) {
        repeatAt = now + REPEAT_EVERY;
        doMove(held[held.length - 1]);
      }
      if (mode === 'play') {
        tickTimer += dt;
        while (tickTimer >= L.TICK_MS && mode === 'play') {
          tickTimer -= L.TICK_MS;
          L.tick(level);
          onMoved();
        }
      }
    } else if (mode === 'cleared' && modeTime >= 2500) {
      afterCleared();
    }

    render();
    requestAnimationFrame(frame);
  }

  // Small hooks used by automated tests and screenshots.
  window.reconnectDebug = {
    get mode() { return mode; },
    get level() { return level; },
    startLevel: startLevel,
    showStory: showStory,
    move: doMove,
    tick: function () { if (mode === 'play') { L.tick(level); onMoved(); } }
  };

  touchUI = detectTouch();
  layout();
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', function () { setTimeout(layout, 50); });
  requestAnimationFrame(frame);
})();

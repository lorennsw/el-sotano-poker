import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newDeck } from '../shared/cards.js';
import { evaluate3, CAT3, dealerQualifies, shouldPlay } from '../shared/eval3.js';
import { evaluate5, CAT5 } from '../shared/eval5.js';
import { settleThree } from '../shared/three.js';
import { computePots, DrawGame } from '../shared/draw.js';
import { Room } from '../shared/room.js';
import { drawPlan } from '../shared/bots.js';

const C = (str) =>
  str.split(' ').map((t) => {
    const s = t.slice(-1);
    const rs = t.slice(0, -1);
    const r = { J: 11, Q: 12, K: 13, A: 14, T: 10 }[rs] || Number(rs);
    return { r, s };
  });

// ------------------------------------------------------------ evaluadores

test('3 cartas: frecuencias exactas de las 22.100 manos', () => {
  const d = newDeck();
  const counts = new Array(6).fill(0);
  for (let a = 0; a < 52; a++)
    for (let b = a + 1; b < 52; b++)
      for (let c = b + 1; c < 52; c++) counts[evaluate3([d[a], d[b], d[c]]).cat]++;
  assert.deepEqual(counts, [16440, 3744, 1096, 720, 52, 48]);
});

test('3 cartas: orden y casos límite', () => {
  const v = (s) => evaluate3(C(s)).score;
  assert.ok(v('Ah 2c 3d') < v('2h 3c 4d'), 'A-2-3 es la escalera más baja');
  assert.ok(v('Qh Kc Ad') > v('Jh Qc Kd'), 'Q-K-A es la escalera más alta');
  assert.ok(v('2h 3c 4d') > v('Ah Kh 9h'), 'escalera gana a color');
  assert.ok(v('2h 2c 2d') > v('Qh Kc Ad'), 'trío gana a escalera');
  assert.ok(v('2h 3h 4h') > v('Ah Ac Ad'), 'escalera de color gana a trío');
  assert.ok(v('Kh Kc 2d') > v('Qh Qc Ad'), 'pareja mayor gana');
  assert.ok(v('Kh Kc 5d') > v('Ks Kd 4d'), 'desempate por kicker');
  assert.equal(v('Kh Kc 5d'), v('Ks Kd 5h'), 'empate exacto');
  assert.equal(evaluate3(C('Ah 2h 3h')).cat, CAT3.STRAIGHT_FLUSH);
  assert.equal(evaluate3(C('Ah Kh 2h')).cat, CAT3.FLUSH, 'K-A-2 no es escalera');
});

test('3 cartas: calificación del crupier y estrategia Q-6-4', () => {
  assert.equal(dealerQualifies(evaluate3(C('Qh 3c 2d'))), true);
  assert.equal(dealerQualifies(evaluate3(C('Jh 9c 7d'))), false);
  assert.equal(dealerQualifies(evaluate3(C('2h 2c 3d'))), true);
  assert.equal(shouldPlay(evaluate3(C('Qh 6c 4d'))), true);
  assert.equal(shouldPlay(evaluate3(C('Qh 6c 3d'))), false);
  assert.equal(shouldPlay(evaluate3(C('Qh 5c 4d'))), false);
  assert.equal(shouldPlay(evaluate3(C('Qh 7c 2d'))), true);
  assert.equal(shouldPlay(evaluate3(C('Kh 3c 2d'))), true);
  assert.equal(shouldPlay(evaluate3(C('Jh 9c 8d'))), false);
});

test('5 cartas: frecuencias exactas de las 2.598.960 manos y 7.462 clases', () => {
  const d = newDeck();
  const counts = new Array(9).fill(0);
  const scores = new Set();
  const h = new Array(5);
  for (let a = 0; a < 52; a++) {
    h[0] = d[a];
    for (let b = a + 1; b < 52; b++) {
      h[1] = d[b];
      for (let c = b + 1; c < 52; c++) {
        h[2] = d[c];
        for (let e = c + 1; e < 52; e++) {
          h[3] = d[e];
          for (let f = e + 1; f < 52; f++) {
            h[4] = d[f];
            const ev = evaluate5(h);
            counts[ev.cat]++;
            scores.add(ev.score);
          }
        }
      }
    }
  }
  assert.deepEqual(counts, [1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40]);
  assert.equal(scores.size, 7462);
});

test('5 cartas: orden y descripciones', () => {
  const v = (s) => evaluate5(C(s)).score;
  assert.ok(v('Ah 2c 3d 4s 5h') < v('2c 3d 4s 5h 6h'), 'la rueda es la escalera más baja');
  assert.ok(v('Th Jc Qd Ks Ah') > v('9h Tc Jd Qs Kh'));
  assert.ok(v('2h 4h 6h 8h Th') > v('Ah Kc Qd Js Th'), 'color gana a escalera');
  assert.ok(v('Kh Kc Kd 2s 2h') > v('Qh Qc Qd As Ah'), 'full: manda el trío');
  assert.ok(v('Ah Ac 3d 3s 2h') > v('Kh Kc Qd Qs Ah'), 'doble pareja: manda la mayor');
  assert.ok(v('Ah Ac 3d 3s 5h') > v('As Ad 3c 3h 4h'), 'doble pareja: kicker');
  assert.ok(v('Ah Kh Qh Jh 9h') > v('Ac Kc Qc Jc 8c'), 'color: quinta carta');
  assert.equal(v('Ah Kh Qh Jh 9h'), v('As Ks Qs Js 9s'));
  assert.equal(evaluate5(C('Th Jh Qh Kh Ah')).name, 'Escalera real');
  assert.equal(evaluate5(C('Kh Kc Kd 2s 2h')).desc, 'Full de Reyes y Doses');
  assert.equal(evaluate5(C('Ah 2h 3h 4h 5h')).desc, 'Escalera de color al 5');
  assert.equal(evaluate5(C('Qh Qc 3d 3s 9h')).desc, 'Doble pareja: Reinas y Treses');
  assert.equal(evaluate5(C('Jh Qc Kd As 2h')).cat, CAT5.HIGH, 'J-Q-K-A-2 no es escalera');
});

// -------------------------------------------------------- pagos 3 cartas

test('3 cartas: liquidación de apuestas', () => {
  const dealerQ = evaluate3(C('Qs 8d 3c')); // califica con Reina
  const dealerNo = evaluate3(C('Js 8d 3c')); // no califica
  const mk = (cards, ante, pp, play, folded = false) => ({ ante, pp, play, folded, ev: evaluate3(C(cards)) });

  // Retirarse pierde Ante y Pair Plus
  assert.deepEqual(
    { back: settleThree(mk('2h 7c 9d', 10, 5, 0, true), dealerQ, true).back, net: settleThree(mk('2h 7c 9d', 10, 5, 0, true), dealerQ, true).net },
    { back: 0, net: -15 },
  );
  // Crupier no califica: Ante 1:1, Play se devuelve
  let r = settleThree(mk('Kh 7c 2d', 10, 0, 10), dealerNo, false);
  assert.equal(r.net, 10);
  // Gana al crupier: Ante y Play 1:1
  r = settleThree(mk('Kh 9c 2d', 10, 0, 10), dealerQ, true);
  assert.equal(r.net, 20);
  // Pierde contra el crupier
  r = settleThree(mk('Qh 6c 4d', 10, 0, 10), dealerQ, true);
  assert.equal(r.net, -20);
  // Empate exacto
  r = settleThree(mk('Qh 8c 3s', 10, 0, 10), dealerQ, true);
  assert.equal(r.net, 0);
  // Trío: bono Ante 4:1 + gana Ante/Play + Pair Plus 30:1
  r = settleThree(mk('7h 7c 7d', 10, 5, 10), dealerQ, true);
  assert.equal(r.net, 40 + 10 + 10 + 150);
  // Escalera de color pierde?? imposible contra Q alta; probamos bono con crupier mejor
  const dealerSF = evaluate3(C('Qd Kd Ad'));
  r = settleThree(mk('2s 3s 4s', 10, 10, 10), dealerSF, true);
  assert.equal(r.net, 50 - 10 - 10 + 400, 'el bono Ante y el Pair Plus se pagan aunque gane el crupier');
  // Sólo Pair Plus, sin pareja
  r = settleThree(mk('2s 9h Kd', 0, 25, 0), dealerQ, true);
  assert.equal(r.net, -25);
  // Escalera: bono 1:1, PP 6:1, crupier no califica
  r = settleThree(mk('9s Th Jd', 20, 10, 20), dealerNo, false);
  assert.equal(r.net, 20 + 20 + 0 + 60);
});

// --------------------------------------------------------- botes 5 cartas

test('botes secundarios', () => {
  // A all-in 50, B all-in 200, C cubre 200, D se retiró tras poner 30
  const pots = computePots([
    { pid: 'A', amount: 50, folded: false },
    { pid: 'B', amount: 200, folded: false },
    { pid: 'C', amount: 200, folded: false },
    { pid: 'D', amount: 30, folded: true },
  ]);
  assert.deepEqual(pots, [
    { amount: 180, eligible: ['A', 'B', 'C'] },
    { amount: 300, eligible: ['B', 'C'] },
  ]);
  const total = pots.reduce((a, p) => a + p.amount, 0);
  assert.equal(total, 480);
});

test('plan de descarte de los bots respeta las reglas', () => {
  assert.deepEqual(drawPlan(C('Ah 7c 4d 9s 2h')).discard.length, 4);
  assert.deepEqual(drawPlan(C('Kh 7c 4d 9s 2h')).discard.length, 3);
  assert.deepEqual(drawPlan(C('Kh Kc 4d 9s 2h')).discard.length, 3);
  assert.deepEqual(drawPlan(C('5h 6c 7d 8s Kh')).discard, [4]);
  assert.deepEqual(drawPlan(C('2h 6h 9h Jh Kc')).discard, [4]);
  assert.deepEqual(drawPlan(C('2h 3c 4d 5s 6h')).discard, []);
});

// ------------------------------------------------- simulación con relojes falsos

class TestRoom extends Room {
  constructor(opts) {
    super(opts);
    this.clock = 0;
    this.queue = new Map();
  }
  now() {
    return this.clock;
  }
  setTimer(key, ms, fn) {
    this.queue.set(key, { at: this.clock + ms, fn });
    this.timers.set(key, true);
  }
  clearTimer(key) {
    this.queue.delete(key);
    this.timers.delete(key);
  }
  step() {
    let best = null;
    for (const [k, t] of this.queue) if (!best || t.at < best[1].at) best = [k, t];
    if (!best) return false;
    this.queue.delete(best[0]);
    this.timers.delete(best[0]);
    this.clock = Math.max(this.clock, best[1].at);
    best[1].fn();
    return true;
  }
}

test('5 cartas: 400 manos entre bots sin errores y sin crear ni perder fichas', () => {
  const room = new TestRoom({ mode: 'draw' });
  for (let i = 0; i < 6; i++) room.addBot();
  // Pilas desiguales para provocar all-ins y botes secundarios
  room.players.forEach((p, i) => (p.chips = [40, 75, 300, 1000, 15, 520][i]));
  let checked = 0;
  let before = null;
  const origStart = DrawGame.prototype.startHand;
  const sum = () => room.players.reduce((a, p) => a + p.chips, 0);
  DrawGame.prototype.startHand = function (players) {
    before = sum();
    origStart.call(this, players);
    // cartas únicas
    const seen = new Set();
    for (const s of this.ps.values()) for (const c of s.cards) {
      const k = c.r + c.s;
      assert.ok(!seen.has(k), 'carta repetida');
      seen.add(k);
    }
  };
  try {
    room.startGame();
    let guard = 0;
    while (room.game.hand < 400 && guard++ < 200000) {
      const g = room.game;
      const wasShow = g.phase === 'showdown';
      room.step();
      if (!wasShow && g.phase === 'showdown') {
        assert.equal(sum(), before, `fichas conservadas en la mano ${g.hand}`);
        // cartas únicas tras el descarte
        const seen = new Set();
        for (const s of g.ps.values()) for (const c of s.cards) {
          const k = c.r + c.s;
          assert.ok(!seen.has(k), 'carta repetida tras descarte');
          seen.add(k);
        }
        for (const p of room.players) assert.ok(p.chips >= 0);
        checked++;
      }
    }
    assert.ok(checked >= 399, `manos comprobadas: ${checked}`);
  } finally {
    DrawGame.prototype.startHand = origStart;
  }
});

test('5 cartas: all-in corto no reabre la subida', () => {
  const room = new TestRoom({ mode: 'draw' });
  const a = room.addHuman('Ana').player;
  const b = room.addHuman('Beto').player;
  const c = room.addHuman('Cris').player;
  a.chips = 1000;
  b.chips = 1000;
  c.chips = 35; // tras el ante (10) le quedan 25
  room.startGame();
  const g = room.game;
  // botón = Ana (asiento 0) → habla primero Beto, luego Cris, luego Ana
  assert.equal(g.buttonPid, a.id);
  assert.equal(g.turn, b.id);
  assert.equal(room.handle(b.id, { t: 'act', a: 'raise', to: 20 }), null);
  assert.equal(g.turn, c.id);
  assert.equal(room.handle(c.id, { t: 'act', a: 'raise', to: 25 }), null); // all-in corto (+5)
  assert.equal(g.turn, a.id);
  // Ana no ha actuado: puede subir (mínimo 25 + 20)
  assert.equal(g.options(a.id).minTo, 45);
  assert.equal(room.handle(a.id, { t: 'act', a: 'call' }), null);
  // Beto ya actuó y el all-in fue corto: sólo puede igualar o retirarse
  assert.equal(g.turn, b.id);
  assert.equal(g.options(b.id).canRaise, false);
  assert.notEqual(room.handle(b.id, { t: 'act', a: 'raise', to: 100 }), null);
  assert.equal(room.handle(b.id, { t: 'act', a: 'call' }), null);
  assert.equal(g.phase, 'draw');
  assert.equal(g.pot, 30 + 25 * 3);
});

test('5 cartas: descarte de 4 sólo con As', () => {
  const room = new TestRoom({ mode: 'draw' });
  const a = room.addHuman('Ana').player;
  const b = room.addHuman('Beto').player;
  room.startGame();
  const g = room.game;
  // Beto habla primero (Ana es botón); pasan los dos
  room.handle(b.id, { t: 'act', a: 'check' });
  room.handle(a.id, { t: 'act', a: 'check' });
  assert.equal(g.phase, 'draw');
  assert.equal(g.turn, b.id);
  const s = g.ps.get(b.id);
  s.cards = C('Ah 2c 3d 4s 6h');
  assert.match(room.handle(b.id, { t: 'draw', idx: [0, 1, 2, 3] }), /As/);
  assert.equal(room.handle(b.id, { t: 'draw', idx: [1, 2, 3, 4] }), null);
  assert.equal(g.turn, a.id);
  assert.notEqual(room.handle(a.id, { t: 'draw', idx: [0, 1, 2, 3, 4] }), null);
  assert.notEqual(room.handle(a.id, { t: 'draw', idx: [0, 0] }), null);
  assert.equal(room.handle(a.id, { t: 'draw', idx: [] }), null);
  assert.equal(g.phase, 'bet2');
});

test('3 cartas: rondas completas con un humano y bots', () => {
  const room = new TestRoom({ mode: 'three' });
  const me = room.addHuman('Yo').player;
  room.addBot();
  room.addBot();
  room.startGame();
  const g = room.game;
  const sum0 = () => room.players.reduce((a, p) => a + p.chips, 0);
  for (let round = 0; round < 50; round++) {
    assert.equal(g.phase, 'betting');
    if (me.chips < 30) room.handle(me.id, { t: 'rebuy' });
    assert.match(room.handle(me.id, { t: 'bet', ante: 10, pp: me.chips }) || '', /fichas|Pair Plus/);
    assert.equal(room.handle(me.id, { t: 'bet', ante: 10, pp: 5 }), null);
    assert.equal(me.chips >= 10, true);
    while (g.phase === 'betting') room.step();
    assert.equal(g.phase, 'deciding');
    const view = room.view(me.id).game;
    assert.equal(view.seats.find((s) => s.id === me.id).cards.length, 3);
    assert.equal(view.seats.find((s) => s.id !== me.id).cards, null, 'no se ven cartas ajenas');
    assert.deepEqual(view.dealer.cards, [null, null, null], 'el crupier va tapado');
    const play = round % 2 === 0;
    assert.equal(room.handle(me.id, { t: 'decide', play }), null);
    while (g.phase === 'deciding') room.step();
    assert.equal(g.phase, 'showdown');
    const res = room.view(me.id).game.seats.find((s) => s.id === me.id).result;
    assert.ok(res && Number.isInteger(res.net));
    if (!play) assert.equal(res.net, -15);
    room.step(); // siguiente ronda
    assert.ok(sum0() > 0);
  }
});

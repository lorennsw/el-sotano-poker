// Póker de 5 Cartas con descarte (Five Card Draw), sin límite, entre jugadores.
//
//  1. Todos ponen la apuesta inicial obligatoria (ante). El botón de repartidor rota.
//  2. Cinco cartas tapadas a cada uno.
//  3. Primera ronda de apuestas (empieza el jugador a la izquierda del botón).
//  4. Descarte: cada uno cambia de 0 a 3 cartas (4 si se queda con un As).
//  5. Segunda ronda de apuestas.
//  6. Enseñanza: la mejor mano se lleva el bote (con botes secundarios si hubo all-in).

import { shuffledDeck, shuffle } from './cards.js';
import { evaluate5 } from './eval5.js';
import { botDrawAction, drawPlan, rand } from './bots.js';

export const DRAW_RULES = { ante: 10, minBet: 20, maxDiscard: 3, maxDiscardWithAce: 4 };
const TURN_MS = 30000;
const AWAY_TURN_MS = 4000;
const DRAW_MS = 25000;
const SHOWDOWN_MS = 9000;
const FOLDWIN_MS = 5000;

export class DrawGame {
  constructor(room, rules = DRAW_RULES) {
    this.room = room;
    this.rules = rules;
    this.mode = 'draw';
    this.phase = 'waiting';
    this.hand = 0;
    this.buttonSeat = -1;
    this.buttonPid = null;
    this.order = []; // pids en orden de asiento
    this.ps = new Map();
    this.deck = [];
    this.muck = [];
    this.pot = 0;
    this.currentBet = 0;
    this.minRaise = rules.minBet;
    this.fullSeq = 0;
    this.turn = null;
    this.deadline = null;
    this.stopRequested = false;
    this.results = null;
    this.history = [];
  }

  start() {
    this.tryStartHand();
  }

  destroy() {
    this.room.clearGameTimers();
  }

  requestStop() {
    this.stopRequested = true;
    if (this.phase === 'waiting' || this.phase === 'showdown') {
      this.room.endGame();
      return;
    }
    this.room.emit();
  }

  inHand(pid) {
    return this.ps.has(pid) && ['bet1', 'draw', 'bet2'].includes(this.phase);
  }

  canRebuy(pid) {
    return !this.inHand(pid);
  }

  note(text) {
    this.history.push(text);
    if (this.history.length > 30) this.history.shift();
  }

  // ------------------------------------------------------------------ manos

  tryStartHand() {
    this.room.clearGameTimers();
    if (this.stopRequested) {
      this.room.endGame();
      return;
    }
    for (const p of this.room.players) {
      if (p.isBot && p.chips < this.rules.ante) p.chips = this.room.startChips;
    }
    const eligible = this.room.players
      .filter((p) => p.chips > 0 && (p.isBot || p.connected))
      .sort((a, b) => a.seat - b.seat);
    if (eligible.length < 2) {
      this.phase = 'waiting';
      this.turn = null;
      this.deadline = null;
      this.ps = new Map();
      this.results = null;
      this.pot = 0;
      this.room.emit();
      return;
    }
    this.startHand(eligible);
  }

  startHand(players) {
    this.hand++;
    this.results = null;
    this.order = players.map((p) => p.id);
    const next = players.find((p) => p.seat > this.buttonSeat) || players[0];
    this.buttonSeat = next.seat;
    this.buttonPid = next.id;
    this.ps = new Map();
    this.pot = 0;
    this.deck = shuffledDeck();
    this.muck = [];
    this.note(`— Mano #${this.hand} · reparte ${next.name} —`);
    for (const p of players) {
      const s = {
        cards: [], folded: false, allIn: false, bet: 0, total: 0, acted: false, seenSeq: -1,
        drew: null, newIdx: [], lastAction: '', won: 0, show: false, ev: null,
      };
      this.ps.set(p.id, s);
      const ante = Math.min(this.rules.ante, p.chips);
      p.chips -= ante;
      s.total = ante;
      this.pot += ante;
      if (p.chips === 0) s.allIn = true;
    }
    for (let k = 0; k < 5; k++) for (const pid of this.leftOfButton()) this.ps.get(pid).cards.push(this.deck.pop());
    this.startBetting('bet1');
  }

  /** pids empezando por la izquierda del botón y terminando en el botón. */
  leftOfButton() {
    const b = this.order.indexOf(this.buttonPid);
    const out = [];
    for (let k = 1; k <= this.order.length; k++) out.push(this.order[(b + k) % this.order.length]);
    return out;
  }

  live() {
    return this.order.filter((pid) => !this.ps.get(pid).folded);
  }

  active() {
    return this.order.filter((pid) => {
      const s = this.ps.get(pid);
      return !s.folded && !s.allIn;
    });
  }

  needsAction(pid) {
    const s = this.ps.get(pid);
    return !s.folded && !s.allIn && (!s.acted || s.bet < this.currentBet);
  }

  // ------------------------------------------------------------- apuestas

  startBetting(phase) {
    this.phase = phase;
    this.currentBet = 0;
    this.minRaise = this.rules.minBet;
    this.fullSeq = 0;
    for (const pid of this.order) {
      const s = this.ps.get(pid);
      s.bet = 0;
      s.acted = false;
      s.seenSeq = -1;
      if (!s.folded && !s.allIn) s.lastAction = '';
    }
    this.advance(this.buttonPid);
  }

  roundOver() {
    const act = this.active();
    if (act.length === 0) return true;
    if (act.length === 1 && this.ps.get(act[0]).bet >= this.currentBet) return true;
    return !this.order.some((pid) => this.needsAction(pid));
  }

  advance(afterPid) {
    this.room.clearGameTimers();
    if (this.live().length <= 1) {
      this.winByFold();
      return;
    }
    if (this.roundOver()) {
      this.endBettingRound();
      return;
    }
    const start = this.order.indexOf(afterPid);
    for (let k = 1; k <= this.order.length; k++) {
      const pid = this.order[(start + k) % this.order.length];
      if (this.needsAction(pid)) {
        this.setTurn(pid);
        return;
      }
    }
    this.endBettingRound();
  }

  setTurn(pid) {
    this.turn = pid;
    const p = this.room.getPlayer(pid);
    const ms = p && (p.isBot || p.connected) ? (this.phase === 'draw' ? DRAW_MS : TURN_MS) : AWAY_TURN_MS;
    this.deadline = this.room.now() + ms;
    this.room.setTimer('g:turn', ms, () => this.timeout(pid));
    if (p && p.isBot) this.room.setTimer('g:bot', rand(800, 2000), () => this.botMove(pid));
    this.room.emit();
  }

  timeout(pid) {
    if (this.turn !== pid) return;
    const p = this.room.getPlayer(pid);
    if (this.phase === 'draw') {
      this.doDraw(pid, []);
    } else {
      const s = this.ps.get(pid);
      const a = s.bet >= this.currentBet ? 'check' : 'fold';
      if (p) this.room.log(`${p.name} se quedó sin tiempo.`);
      this.doAct(pid, { a });
    }
    this.room.emit();
  }

  options(pid) {
    const s = this.ps.get(pid);
    const p = this.room.getPlayer(pid);
    if (!s || !p) return null;
    const toCall = Math.max(0, this.currentBet - s.bet);
    const maxTo = s.bet + p.chips;
    const othersCanAct = this.order.some((o) => o !== pid && !this.ps.get(o).folded && !this.ps.get(o).allIn);
    const canRaise = p.chips > toCall && s.seenSeq < this.fullSeq && othersCanAct;
    const minTo = Math.min(maxTo, this.currentBet === 0 ? this.rules.minBet : this.currentBet + this.minRaise);
    return {
      toCall,
      callAmount: Math.min(toCall, p.chips),
      canCheck: toCall === 0,
      canRaise,
      minTo,
      maxTo,
      isBet: this.currentBet === 0,
    };
  }

  handle(p, msg) {
    if (msg.t === 'act') {
      if (this.phase !== 'bet1' && this.phase !== 'bet2') return 'No es una ronda de apuestas.';
      if (this.turn !== p.id) return 'No es tu turno.';
      const err = this.doAct(p.id, msg);
      return err;
    }
    if (msg.t === 'draw') {
      if (this.phase !== 'draw') return 'No es momento de descartar.';
      if (this.turn !== p.id) return 'No es tu turno.';
      return this.doDraw(p.id, msg.idx);
    }
    return 'Acción no válida en Póker de 5 Cartas.';
  }

  put(pid, amount) {
    const p = this.room.getPlayer(pid);
    const s = this.ps.get(pid);
    p.chips -= amount;
    s.bet += amount;
    s.total += amount;
    this.pot += amount;
    if (p.chips === 0) s.allIn = true;
  }

  doAct(pid, msg) {
    const s = this.ps.get(pid);
    const p = this.room.getPlayer(pid);
    const o = this.options(pid);
    if (!s || !p || !o) return 'No estás en esta mano.';
    switch (msg.a) {
      case 'fold':
        this.fold(pid);
        s.lastAction = 'No va';
        break;
      case 'check':
        if (!o.canCheck) return 'No puedes pasar: hay una apuesta que igualar.';
        s.lastAction = 'Pasa';
        break;
      case 'call':
        if (o.toCall === 0) return 'No hay nada que igualar.';
        this.put(pid, o.callAmount);
        s.lastAction = s.allIn ? `All-in ${s.bet}` : `Iguala ${s.bet}`;
        break;
      case 'raise': {
        if (!o.canRaise) return 'No puedes subir ahora.';
        let to = msg.to;
        if (!Number.isInteger(to)) return 'Cantidad no válida.';
        if (to >= o.maxTo) to = o.maxTo;
        if (to <= this.currentBet) return 'Tienes que superar la apuesta actual.';
        if (to < o.minTo && to !== o.maxTo) return `La subida mínima es hasta ${o.minTo}.`;
        const opening = this.currentBet === 0;
        const inc = to - this.currentBet;
        const full = opening ? to >= this.rules.minBet : inc >= this.minRaise;
        if (full) {
          this.minRaise = opening ? to : inc;
          this.fullSeq++;
        }
        this.put(pid, to - s.bet);
        this.currentBet = to;
        s.lastAction = s.allIn ? `All-in ${to}` : opening ? `Apuesta ${to}` : `Sube a ${to}`;
        break;
      }
      default:
        return 'Acción desconocida.';
    }
    s.acted = true;
    s.seenSeq = this.fullSeq;
    this.note(`${p.name}: ${s.lastAction}`);
    this.advance(pid);
    return null;
  }

  fold(pid) {
    const s = this.ps.get(pid);
    s.folded = true;
    this.muck.push(...s.cards);
    s.cards = [];
  }

  /** Devuelve la parte de la apuesta que nadie igualó. */
  refundUncalled() {
    let top = null;
    let topBet = -1;
    let second = 0;
    for (const pid of this.order) {
      const b = this.ps.get(pid).bet;
      if (b > topBet) {
        second = Math.max(second, topBet);
        topBet = b;
        top = pid;
      } else {
        second = Math.max(second, b);
      }
    }
    if (top && topBet > second) {
      const diff = topBet - second;
      const s = this.ps.get(top);
      const p = this.room.getPlayer(top);
      s.bet -= diff;
      s.total -= diff;
      this.pot -= diff;
      if (p) {
        p.chips += diff;
        if (p.chips > 0) s.allIn = false;
      }
    }
  }

  endBettingRound() {
    this.room.clearGameTimers();
    this.refundUncalled();
    this.turn = null;
    if (this.phase === 'bet1') this.startDraw();
    else this.showdown();
  }

  // -------------------------------------------------------------- descarte

  startDraw() {
    this.phase = 'draw';
    this.drawQueue = this.leftOfButton().filter((pid) => !this.ps.get(pid).folded);
    this.nextDrawer();
  }

  nextDrawer() {
    this.room.clearGameTimers();
    if (this.live().length <= 1) {
      this.winByFold();
      return;
    }
    const pid = this.drawQueue.shift();
    if (!pid) {
      this.startBetting('bet2');
      return;
    }
    if (this.ps.get(pid).folded) {
      this.nextDrawer();
      return;
    }
    this.setTurn(pid);
  }

  takeCard() {
    if (this.deck.length === 0) {
      this.deck = shuffle(this.muck);
      this.muck = [];
    }
    return this.deck.pop();
  }

  doDraw(pid, idx) {
    const s = this.ps.get(pid);
    const p = this.room.getPlayer(pid);
    if (!Array.isArray(idx) || idx.length > 5) return 'Descarte no válido.';
    const set = new Set(idx);
    if (set.size !== idx.length || idx.some((i) => !Number.isInteger(i) || i < 0 || i > 4)) return 'Descarte no válido.';
    if (idx.length > DRAW_RULES.maxDiscardWithAce) return 'Como máximo puedes cambiar 4 cartas (y sólo si te quedas un As).';
    if (idx.length === DRAW_RULES.maxDiscardWithAce) {
      const kept = [0, 1, 2, 3, 4].find((i) => !set.has(i));
      if (s.cards[kept].r !== 14) return 'Sólo puedes cambiar 4 cartas si la que te quedas es un As.';
    }
    const old = [];
    for (const i of idx) {
      old.push(s.cards[i]);
      s.cards[i] = this.takeCard();
    }
    this.muck.push(...old); // los descartes propios no vuelven a la misma mano
    s.drew = idx.length;
    s.newIdx = idx.slice();
    s.lastAction = idx.length === 0 ? 'Se sirve' : `Cambia ${idx.length}`;
    if (p) this.note(`${p.name}: ${s.lastAction.toLowerCase()}`);
    this.nextDrawer();
    return null;
  }

  // ------------------------------------------------------------- resolución

  winByFold() {
    this.room.clearGameTimers();
    this.refundUncalled();
    const [winner] = this.live();
    const s = this.ps.get(winner);
    const p = this.room.getPlayer(winner);
    s.won = this.pot;
    if (p) p.chips += this.pot;
    this.results = {
      byFold: true,
      pots: [{ amount: this.pot, winners: [winner], desc: null }],
    };
    if (p) this.note(`${p.name} se lleva ${this.pot} (los demás no van)`);
    this.finishHand(FOLDWIN_MS);
  }

  showdown() {
    this.room.clearGameTimers();
    const live = this.live();
    for (const pid of live) {
      const s = this.ps.get(pid);
      s.ev = this.evalFor(pid);
      s.show = true;
    }
    const pots = computePots(this.order.map((pid) => ({ pid, amount: this.ps.get(pid).total, folded: this.ps.get(pid).folded })));
    const left = this.leftOfButton();
    const resPots = [];
    for (const pot of pots) {
      const best = Math.max(...pot.eligible.map((pid) => this.ps.get(pid).ev.score));
      const winners = left.filter((pid) => pot.eligible.includes(pid) && this.ps.get(pid).ev.score === best);
      const share = Math.floor(pot.amount / winners.length);
      let odd = pot.amount - share * winners.length; // fichas sobrantes: al primero a la izquierda del botón
      for (const w of winners) {
        const amt = share + (odd > 0 ? 1 : 0);
        if (odd > 0) odd--;
        this.ps.get(w).won += amt;
        const p = this.room.getPlayer(w);
        if (p) p.chips += amt;
      }
      resPots.push({ amount: pot.amount, winners, desc: this.ps.get(winners[0]).ev.desc });
    }
    this.results = { byFold: false, pots: resPots };
    resPots.forEach((rp, i) => {
      const names = rp.winners.map((w) => this.room.getPlayer(w)?.name || '¿?').join(' y ');
      const label = resPots.length > 1 ? (i === 0 ? 'bote principal' : `bote secundario ${i}`) : 'el bote';
      this.note(`${names} ${rp.winners.length > 1 ? 'reparten' : 'gana'} ${label} (${rp.amount}) con ${rp.desc}`);
      this.room.log(`🏆 ${names} ${rp.winners.length > 1 ? 'reparten' : 'gana'} ${rp.amount} con ${rp.desc}.`);
    });
    this.finishHand(SHOWDOWN_MS);
  }

  finishHand(ms) {
    this.phase = 'showdown';
    this.turn = null;
    this.deadline = this.room.now() + ms;
    this.room.setTimer('g:next', ms, () => this.tryStartHand());
    this.room.emit();
  }

  /** Mano de un jugador (la variante Hold'em la combina con la mesa). */
  evalFor(pid) {
    return evaluate5(this.ps.get(pid).cards);
  }

  // ---------------------------------------------------------------- bots

  botMove(pid) {
    if (this.turn !== pid) return;
    const s = this.ps.get(pid);
    const p = this.room.getPlayer(pid);
    if (!s || !p) return;
    if (this.phase === 'draw') {
      this.doDraw(pid, drawPlan(s.cards).discard);
      this.room.emit();
      return;
    }
    const o = this.options(pid);
    const choice = botDrawAction({
      cards: s.cards,
      preDraw: this.phase === 'bet1',
      toCall: o.toCall,
      pot: this.pot,
      chips: p.chips,
      bet: s.bet,
      currentBet: this.currentBet,
      minTo: o.minTo,
      maxTo: o.maxTo,
      canRaise: o.canRaise,
    });
    let err = this.doAct(pid, choice);
    if (err) err = this.doAct(pid, { a: o.canCheck ? 'check' : 'call' });
    if (err) this.doAct(pid, { a: 'fold' });
    this.room.emit();
  }

  // ----------------------------------------------------------- jugadores

  onPlayerJoined() {
    if (this.phase === 'waiting') this.room.setTimer('g:start', 1200, () => this.tryStartHand());
  }

  onConnectionChange(p) {
    if (this.phase === 'waiting' && p.connected) this.onPlayerJoined();
    // Si se desconecta en su turno, acortamos su reloj.
    if (!p.connected && this.turn === p.id && this.deadline - this.room.now() > AWAY_TURN_MS) {
      this.deadline = this.room.now() + AWAY_TURN_MS;
      this.room.setTimer('g:turn', AWAY_TURN_MS, () => this.timeout(p.id));
    }
  }

  onRebuy() {
    if (this.phase === 'waiting') this.onPlayerJoined();
  }

  onPlayerLeft(p) {
    const s = this.ps.get(p.id);
    if (!s || !this.inHand(p.id) || s.folded) return;
    this.fold(p.id);
    s.lastAction = 'Se fue';
    if (this.turn === p.id) {
      if (this.phase === 'draw') this.nextDrawer();
      else this.advance(p.id);
    } else if (this.live().length <= 1) {
      this.winByFold();
    }
  }

  // ---------------------------------------------------------------- vista

  view(pid) {
    const showdown = this.phase === 'showdown';
    const seats = this.room.players.map((p) => {
      const s = this.ps.get(p.id);
      if (!s) return { id: p.id, inHand: false };
      const mine = p.id === pid;
      const visible = s.cards.length > 0 && (mine || (showdown && s.show));
      const ev = visible ? s.ev || this.evalFor(p.id) : null;
      return {
        id: p.id,
        inHand: true,
        bet: s.bet,
        total: s.total,
        folded: s.folded,
        allIn: s.allIn,
        lastAction: s.lastAction,
        drew: s.drew,
        newIdx: mine || showdown ? s.newIdx : [],
        cardCount: s.cards.length,
        cards: visible ? s.cards : null,
        hand: ev ? { cat: ev.cat, desc: ev.desc, name: ev.name } : null,
        won: showdown ? s.won : 0,
      };
    });
    const me = this.turn === pid ? (this.phase === 'draw' ? { draw: true } : this.options(pid)) : null;
    return {
      mode: this.mode,
      hand: this.hand,
      phase: this.phase,
      deadline: this.deadline,
      stopRequested: this.stopRequested,
      rules: this.rules,
      pot: this.pot,
      currentBet: this.currentBet,
      button: this.buttonPid,
      turn: this.turn,
      me,
      results: showdown ? this.results : null,
      history: this.history.slice(-12),
      seats,
    };
  }
}

/**
 * Reparte las aportaciones en bote principal y botes secundarios.
 * contrib: [{ pid, amount, folded }] → [{ amount, eligible: [pid] }]
 */
export function computePots(contrib) {
  const c = contrib.map((x) => ({ ...x }));
  const pots = [];
  for (;;) {
    const live = c.filter((x) => !x.folded && x.amount > 0);
    if (live.length === 0) {
      const rest = c.reduce((a, x) => a + x.amount, 0);
      if (rest > 0 && pots.length) pots[pots.length - 1].amount += rest;
      break;
    }
    const level = Math.min(...live.map((x) => x.amount));
    let amount = 0;
    for (const x of c) {
      const take = Math.min(x.amount, level);
      amount += take;
      x.amount -= take;
    }
    const eligible = live.map((x) => x.pid);
    const prev = pots[pots.length - 1];
    if (prev && prev.eligible.length === eligible.length && prev.eligible.every((e) => eligible.includes(e))) prev.amount += amount;
    else pots.push({ amount, eligible });
  }
  return pots;
}

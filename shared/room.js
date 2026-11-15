// Una sala (mesa) del garito: jugadores, chat, anfitrión y la partida en curso.
// La misma clase corre en el servidor (partidas online) y en el navegador (partida en solitario).

import { HoldemGame } from './holdem.js';
import { DrawGame } from './draw.js';
import { BOT_NAMES, AVATARS } from './bots.js';
import { randomInt } from './cards.js';

export const MAX_SEATS = 6;
export const START_CHIPS = 1000;
export const MODES = { holdem: 'Texas Hold’em', draw: 'Póker de 5 Cartas' };
export const isMode = (m) => m === 'holdem' || m === 'draw';

const ID_ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789';
export function randomId(len = 12) {
  let s = '';
  for (let i = 0; i < len; i++) s += ID_ALPHABET[randomInt(ID_ALPHABET.length)];
  return s;
}

export function cleanName(name) {
  const n = String(name ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
  return n || 'Forastero';
}

export class Room {
  constructor({ id = randomId(5).toUpperCase(), mode = 'holdem', onUpdate = () => {}, onRemove = () => {} } = {}) {
    this.id = id;
    this.mode = isMode(mode) ? mode : 'holdem';
    this.onUpdate = onUpdate;
    this.onRemove = onRemove;
    this.players = [];
    this.chat = [];
    this.game = null;
    this.hostId = null;
    this.timers = new Map();
    this.startChips = START_CHIPS;
    this.version = 0;
    this.destroyed = false;
    this.emitQueued = false;
  }

  // ------------------------------------------------------------- utilidades
  now() {
    return Date.now();
  }

  setTimer(key, ms, fn) {
    this.clearTimer(key);
    const h = setTimeout(() => {
      this.timers.delete(key);
      if (this.destroyed) return;
      try {
        fn();
      } catch (e) {
        console.error('[sala]', e);
      }
    }, ms);
    this.timers.set(key, h);
  }

  hasTimer(key) {
    return this.timers.has(key);
  }

  clearTimer(key) {
    const h = this.timers.get(key);
    if (h) clearTimeout(h);
    this.timers.delete(key);
  }

  clearGameTimers() {
    for (const key of [...this.timers.keys()]) if (key.startsWith('g:')) this.clearTimer(key);
  }

  destroy() {
    this.destroyed = true;
    for (const key of [...this.timers.keys()]) this.clearTimer(key);
    this.game = null;
  }

  /** Agrupa varios cambios del mismo instante en una sola actualización. */
  emit() {
    this.version++;
    if (this.emitQueued || this.destroyed) return;
    this.emitQueued = true;
    queueMicrotask(() => {
      this.emitQueued = false;
      if (!this.destroyed) this.onUpdate(this);
    });
  }

  log(text, from = null) {
    this.chat.push({ id: randomId(8), ts: this.now(), from, text: String(text).slice(0, 240) });
    if (this.chat.length > 60) this.chat.shift();
    this.emit();
  }

  getPlayer(pid) {
    return this.players.find((p) => p.id === pid) || null;
  }

  humans() {
    return this.players.filter((p) => !p.isBot);
  }

  freeSeat() {
    for (let i = 0; i < MAX_SEATS; i++) if (!this.players.some((p) => p.seat === i)) return i;
    return -1;
  }

  pickAvatar() {
    const used = new Set(this.players.map((p) => p.avatar));
    const free = AVATARS.filter((a) => !used.has(a));
    const pool = free.length ? free : AVATARS;
    return pool[randomInt(pool.length)];
  }

  // -------------------------------------------------------------- jugadores
  addHuman(name) {
    const seat = this.freeSeat();
    if (seat < 0) return { error: 'La mesa está llena (máximo 6 jugadores).' };
    const p = {
      id: randomId(12),
      token: randomId(24),
      name: cleanName(name),
      chips: this.startChips,
      seat,
      isBot: false,
      connected: true,
      avatar: this.pickAvatar(),
      lastChat: 0,
    };
    // Nombres repetidos: añadimos un número
    if (this.players.some((o) => o.name.toLowerCase() === p.name.toLowerCase())) {
      let k = 2;
      while (this.players.some((o) => o.name.toLowerCase() === `${p.name} ${k}`.toLowerCase())) k++;
      p.name = `${p.name.slice(0, 13)} ${k}`;
    }
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    this.log(`${p.avatar} ${p.name} entra en el local.`);
    this.game?.onPlayerJoined(p);
    this.emit();
    return { player: p };
  }

  addBot() {
    const seat = this.freeSeat();
    if (seat < 0) return 'La mesa está llena.';
    const used = new Set(this.players.map((p) => p.name));
    const names = BOT_NAMES.filter((n) => !used.has(n));
    const name = names.length ? names[randomInt(names.length)] : `Bot ${seat + 1}`;
    const p = {
      id: 'bot-' + randomId(8),
      token: null,
      name,
      chips: this.startChips,
      seat,
      isBot: true,
      connected: true,
      avatar: this.pickAvatar(),
      lastChat: 0,
    };
    this.players.push(p);
    this.log(`${p.avatar} ${p.name} se sienta a la mesa.`);
    this.game?.onPlayerJoined(p);
    this.emit();
    return null;
  }

  removePlayer(pid, reason = 'se marcha') {
    const p = this.getPlayer(pid);
    if (!p) return;
    this.players = this.players.filter((x) => x.id !== pid);
    this.onRemove(pid, reason);
    this.game?.onPlayerLeft(p);
    this.log(`${p.name} ${reason}.`);
    if (this.hostId === pid) {
      const next = this.humans().find((h) => h.connected) || this.humans()[0];
      this.hostId = next ? next.id : null;
      if (next) this.log(`${next.name} es ahora quien manda en la mesa.`);
    }
    this.emit();
  }

  setConnected(pid, connected) {
    const p = this.getPlayer(pid);
    if (!p || p.connected === connected) return;
    p.connected = connected;
    this.game?.onConnectionChange?.(p);
    this.emit();
  }

  // ---------------------------------------------------------------- partida
  startGame() {
    if (this.game) return 'La partida ya está en marcha.';
    if (this.players.length < 2) return `El ${MODES[this.mode]} necesita al menos 2 jugadores (sienta a un habitual).`;
    this.game = this.mode === 'holdem' ? new HoldemGame(this) : new DrawGame(this);
    this.log(`Empieza la partida: ${MODES[this.mode]}.`);
    this.game.start();
    this.emit();
    return null;
  }

  endGame() {
    if (!this.game) return;
    this.game.destroy();
    this.game = null;
    this.clearGameTimers();
    this.log('La partida se detiene. Volvemos a la sala.');
    this.emit();
  }

  /** Procesa un mensaje de un jugador. Devuelve un texto de error o null. */
  handle(pid, msg) {
    const p = this.getPlayer(pid);
    if (!p) return 'No estás en esta mesa.';
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return 'Mensaje no válido.';
    const isHost = pid === this.hostId;
    switch (msg.t) {
      case 'chat': {
        const text = String(msg.text ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200);
        if (!text) return null;
        if (this.now() - p.lastChat < 600) return 'Más despacio, que esto no es una subasta.';
        p.lastChat = this.now();
        this.log(text, { name: p.name, avatar: p.avatar, id: p.id });
        return null;
      }
      case 'mode':
        if (!isHost) return 'Sólo quien manda en la mesa puede cambiar el juego.';
        if (this.game) return 'Detén la partida antes de cambiar de juego.';
        if (!isMode(msg.mode)) return 'Modo desconocido.';
        this.mode = msg.mode;
        this.log(`Juego elegido: ${MODES[this.mode]}.`);
        return null;
      case 'addBot':
        if (!isHost) return 'Sólo quien manda en la mesa puede sentar bots.';
        return this.addBot();
      case 'removeBot': {
        if (!isHost) return 'Sólo quien manda en la mesa puede levantar bots.';
        const b = this.getPlayer(msg.id);
        if (!b || !b.isBot) return 'Ese bot no existe.';
        this.removePlayer(b.id, 'se levanta de la mesa');
        return null;
      }
      case 'kick': {
        if (!isHost) return 'Sólo quien manda en la mesa puede echar a alguien.';
        const k = this.getPlayer(msg.id);
        if (!k || k.id === pid) return 'Jugador no válido.';
        this.removePlayer(k.id, 'ha sido acompañado a la salida');
        return null;
      }
      case 'start':
        if (!isHost) return 'Sólo quien manda en la mesa puede empezar.';
        return this.startGame();
      case 'stop':
        if (!isHost) return 'Sólo quien manda en la mesa puede detener la partida.';
        if (!this.game) return null;
        this.game.requestStop();
        return null;
      case 'rebuy':
        if (p.chips >= this.startChips / 10) return 'Sólo puedes recargar cuando te quedan menos de 100 fichas.';
        if (this.game && !this.game.canRebuy(pid)) return 'Espera a que termine la mano para recargar.';
        p.chips = this.startChips;
        this.log(`💰 ${p.name} recarga ${this.startChips} fichas.`);
        this.game?.onRebuy?.(p);
        return null;
      case 'bet':
      case 'decide':
      case 'act':
      case 'draw': {
        if (!this.game) return 'No hay ninguna partida en marcha.';
        const err = this.game.handle(p, msg);
        this.emit();
        return err;
      }
      default:
        return 'Acción desconocida.';
    }
  }

  view(pid) {
    return {
      roomId: this.id,
      you: pid,
      hostId: this.hostId,
      mode: this.mode,
      modeName: MODES[this.mode],
      serverNow: this.now(),
      startChips: this.startChips,
      maxSeats: MAX_SEATS,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        seat: p.seat,
        isBot: p.isBot,
        connected: p.connected,
        avatar: p.avatar,
      })),
      chat: this.chat.slice(-40),
      game: this.game ? this.game.view(pid) : null,
    };
  }
}

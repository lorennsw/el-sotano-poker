// El Sótano — cliente web.
// Dos formas de jugar con la misma interfaz:
//  · Online: el servidor (WebSocket) manda el estado de la mesa.
//  · En solitario: la misma lógica de sala corre en el navegador con bots.

import { Room } from '../shared/room.js';
import { evaluate3, shouldPlay } from '../shared/eval3.js';
import { drawPlan } from '../shared/bots.js';
import { createCard, setCardFront, cardKey, parseCards, renderStatic } from './cards-ui.js';
import { sfx, isMuted, setMuted } from './sound.js';
import { initTutorial } from './tutorial.js';
import { startBackground } from './bg.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const fmt = (n) => Number(n || 0).toLocaleString('es-ES', { useGrouping: true });
const signed = (n) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '±0');

const store = {
  get(k, def = null) {
    try {
      const v = localStorage.getItem(k);
      return v === null ? def : v;
    } catch {
      return def;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};
const session = {
  get() {
    try {
      return JSON.parse(sessionStorage.getItem('sotano.seat') || 'null');
    } catch {
      return null;
    }
  },
  set(v) {
    try {
      if (v) sessionStorage.setItem('sotano.seat', JSON.stringify(v));
      else sessionStorage.removeItem('sotano.seat');
    } catch {}
  },
};

// ------------------------------------------------------------------ estado

const S = {
  mode: store.get('sotano.mode', 'three') === 'draw' ? 'draw' : 'three',
  online: false,
  transport: null,
  offline: false,
  view: null,
  prev: null,
  offset: 0,
  three: { target: 'ante', ante: 0, pp: 0, last: null, round: -1, history: [] },
  draw: { sel: new Set(), raise: 0, hand: -1 },
  ctlKey: '',
  chatSeen: new Set(),
  unread: 0,
  drawerOpen: false,
  screen: 'home',
};

const now = () => Date.now() + S.offset;

// --------------------------------------------------------------- utilidades

let toastTimer = null;
function toast(msg, kind = 'info', ms = 2800) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), ms);
}

/** Diálogo de confirmación propio (los nativos no encajan con el local ni funcionan en todos los visores). */
function askConfirm(text, yesLabel = 'Sí') {
  return new Promise((resolve) => {
    const m = $('#confirm');
    const yes = $('#confirm-yes');
    const no = $('#confirm-no');
    $('#confirm-text').textContent = text;
    yes.textContent = yesLabel;
    const done = (v) => {
      m.hidden = true;
      m.classList.remove('open');
      yes.onclick = no.onclick = m.onclick = null;
      document.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        done(false);
      }
    };
    yes.onclick = () => done(true);
    no.onclick = () => done(false);
    m.onclick = (e) => e.target === m && done(false);
    document.addEventListener('keydown', onKey, true);
    m.hidden = false;
    m.classList.add('open');
    no.focus();
  });
}

function showScreen(name) {
  if (S.screen === name) return;
  S.screen = name;
  // Los avisos pendientes de la pantalla anterior no deben tapar la nueva
  clearTimeout(toastTimer);
  $('#toast').className = 'toast';
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${name}`));
  document.body.dataset.screen = name;
  if (name !== 'table') closeDrawer();
}

function inviteURL(code) {
  const u = new URL(location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('sala', code);
  return u.toString();
}

async function copyInvite() {
  if (!S.view || S.offline) return;
  const url = inviteURL(S.view.roomId);
  const text = `🃏 Te espero en El Sótano. Mesa ${S.view.roomId}: ${url}`;
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ title: 'El Sótano · Póker', text, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast('Invitación copiada. ¡Pásala a la banda!');
  } catch {
    toast(`Comparte este enlace: ${url}`, 'info', 9000);
  }
}

const DENOMS = [
  [1000, 'c1000'],
  [500, 'c500'],
  [100, 'c100'],
  [25, 'c25'],
  [5, 'c5'],
  [1, 'c1'],
];
function chipStack(amount, max = 8) {
  const wrap = document.createElement('span');
  wrap.className = 'stack';
  let rest = amount;
  const chips = [];
  for (const [v, c] of DENOMS) {
    while (rest >= v && chips.length < max) {
      chips.push(c);
      rest -= v;
    }
  }
  chips.forEach((c, i) => {
    const ch = document.createElement('i');
    ch.className = `chip ${c}`;
    ch.style.setProperty('--i', i);
    wrap.appendChild(ch);
  });
  wrap.style.setProperty('--n', chips.length);
  return wrap;
}

// --------------------------------------------------------------- transporte

class LocalTransport {
  constructor(name, mode, h) {
    this.h = h;
    this.pid = null;
    this.room = new Room({ id: 'SOLO', mode, onUpdate: (r) => this.pid && h.state(r.view(this.pid)) });
    const { player } = this.room.addHuman(name);
    this.pid = player.id;
    const bots = mode === 'three' ? 2 : 3;
    for (let i = 0; i < bots; i++) this.room.addBot();
    h.joined({ room: 'SOLO', pid: this.pid, offline: true });
    this.room.startGame();
  }
  send(msg) {
    if (msg.t === 'leave') {
      this.close();
      return;
    }
    const err = this.room.handle(this.pid, msg);
    if (err) this.h.error(err);
  }
  close() {
    this.room.destroy();
  }
}

class OnlineTransport {
  constructor(first, h) {
    this.h = h;
    this.first = first; // { t:'create'|'join', ... } o null si sólo reconectamos
    this.closed = false;
    this.retry = 0;
    this.connect();
  }
  url() {
    const u = new URL('ws', location.href);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.search = '';
    u.hash = '';
    return u.toString();
  }
  connect() {
    if (this.closed) return;
    const ws = new WebSocket(this.url());
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      const seat = session.get();
      if (seat && !this.first) ws.send(JSON.stringify({ t: 'rejoin', ...seat }));
      else if (this.first) ws.send(JSON.stringify(this.first));
    };
    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      switch (msg.t) {
        case 'joined':
          this.first = null;
          session.set({ room: msg.room, pid: msg.pid, token: msg.token });
          this.h.joined(msg);
          break;
        case 'state':
          this.h.state(msg.view);
          break;
        case 'error':
          if (msg.fatal) {
            this.close();
            this.h.fatal(msg.msg);
          } else this.h.error(msg.msg);
          break;
        case 'rejoinFailed':
          session.set(null);
          this.close();
          this.h.fatal('Tu silla ya no existe: la mesa se cerró o pasó demasiado tiempo.');
          break;
        default:
      }
    };
    ws.onclose = (ev) => {
      if (this.closed) return;
      if (ev.code === 4000) {
        this.closed = true;
        this.h.fatal('Has abierto esta mesa en otra pestaña.');
        return;
      }
      this.retry++;
      if (this.retry > 8) {
        this.closed = true;
        this.h.fatal('Se ha perdido la conexión con el local.');
        return;
      }
      this.h.reconnecting();
      setTimeout(() => this.connect(), Math.min(5000, 400 * 2 ** this.retry));
    };
  }
  send(msg) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
    else if (msg.t !== 'leave') toast('Sin conexión… reintentando', 'error');
  }
  close() {
    this.closed = true;
    try {
      this.ws?.close();
    } catch {}
  }
}

const handlers = {
  joined(msg) {
    closeSetup();
    S.offline = !!msg.offline;
    S.chatSeen = new Set();
    S.unread = 0;
    S.three.history = [];
    document.body.classList.toggle('offline', S.offline);
  },
  state(view) {
    render(view);
  },
  error(msg) {
    toast(msg, 'error');
  },
  fatal(msg) {
    S.transport?.close();
    S.transport = null;
    session.set(null);
    S.view = null;
    showScreen('home');
    toast(msg, 'error', 5000);
  },
  reconnecting() {
    toast('Se cortó la conexión. Reconectando…', 'error', 2000);
  },
};

function send(msg) {
  S.transport?.send(msg);
}

async function leave() {
  const g = S.view?.game;
  const me = g?.seats?.find((s) => s.id === S.view.you);
  const busy = g && me && (me.inRound || me.inHand) && g.phase !== 'showdown' && g.phase !== 'betting' && g.phase !== 'waiting';
  if (busy && !(await askConfirm('Estás en mitad de una mano. Si sales, la pierdes. ¿Salir igualmente?', 'Salir'))) return;
  send({ t: 'leave' });
  S.transport?.close();
  S.transport = null;
  S.view = null;
  session.set(null);
  showScreen('home');
}

// ------------------------------------------------------- móvil en horizontal

const isTouchPhone = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 600;
const canLockLandscape = () => !!(document.documentElement.requestFullscreen && screen.orientation && screen.orientation.lock);

/**
 * En el móvil intenta pantalla completa + horizontal (Android). Debe llamarse desde un toque.
 * iPhone no lo permite desde una web: allí queda el aviso para girarlo a mano.
 */
function goLandscape() {
  if (!isTouchPhone() || !canLockLandscape()) return Promise.resolve(false);
  const lock = () => screen.orientation.lock('landscape').then(() => true, () => false);
  if (document.fullscreenElement) return lock();
  return document.documentElement
    .requestFullscreen({ navigationUI: 'hide' })
    .then(lock, () => false);
}

function startSolo(mode = S.mode) {
  goLandscape();
  if (S.transport) S.transport.close();
  resetTableUI();
  S.transport = new LocalTransport(playerName(), mode, handlers);
}

function startOnline(first) {
  if (!S.online) {
    toast('El modo online necesita el servidor de El Sótano en marcha.', 'error', 4000);
    return;
  }
  goLandscape();
  if (S.transport) S.transport.close();
  session.set(null);
  resetTableUI();
  S.transport = new OnlineTransport(first, handlers);
}

function playerName() {
  const v = $('#name-input').value.trim();
  const name = v || 'Forastero';
  store.set('sotano.name', name);
  return name;
}

function resetTableUI() {
  S.view = null;
  S.prev = null;
  S.ctlKey = '';
  S.three.round = -1;
  S.draw.hand = -1;
  S.draw.sel.clear();
  ['#dealer-cards', '#my-cards', '#seats'].forEach((s) => ($(s).textContent = ''));
  $$('[data-chat] .chat-log').forEach((l) => (l.textContent = ''));
  $('#history').textContent = '';
}

// ------------------------------------------------------------------ render

function render(view) {
  if (!view.players.some((p) => p.id === view.you)) {
    handlers.fatal('Ya no estás en esta mesa.');
    return;
  }
  S.prev = S.view;
  S.view = view;
  S.offset = view.serverNow - Date.now();
  if (!view.game) {
    showScreen('lobby');
    renderLobby(view);
  } else {
    showScreen('table');
    renderTable(view);
  }
  renderChat(view);
}

// ------------------------------------------------------------------- sala

function renderLobby(v) {
  const isHost = v.hostId === v.you;
  $('#lobby-code').textContent = S.offline ? 'SOLO' : v.roomId;
  $('.lobby-share').hidden = S.offline;
  $$('#lobby-modes button').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === v.mode);
    b.disabled = !isHost;
  });
  $('#lobby-count').textContent = `(${v.players.length}/${v.maxSeats})`;
  const list = $('#lobby-players');
  list.textContent = '';
  for (const p of [...v.players].sort((a, b) => a.seat - b.seat)) {
    const li = document.createElement('li');
    li.className = 'player-row' + (p.id === v.you ? ' me' : '') + (p.connected ? '' : ' away');
    const av = document.createElement('span');
    av.className = 'avatar';
    av.textContent = p.avatar;
    const name = document.createElement('span');
    name.className = 'pl-name';
    name.textContent = p.name;
    const tags = document.createElement('span');
    tags.className = 'pl-tags';
    if (p.id === v.hostId) tags.append(tag('👑 anfitrión', 'host'));
    if (p.isBot) tags.append(tag('habitual', 'bot'));
    if (p.id === v.you) tags.append(tag('tú', 'you'));
    if (!p.connected) tags.append(tag('desconectado', 'away'));
    const chips = document.createElement('span');
    chips.className = 'pl-chips';
    chips.textContent = `${fmt(p.chips)} ◉`;
    li.append(av, name, tags, chips);
    if (isHost && p.id !== v.you) {
      const x = document.createElement('button');
      x.className = 'pl-remove';
      x.title = p.isBot ? 'Levantar de la mesa' : 'Echar de la mesa';
      x.textContent = '✕';
      x.addEventListener('click', () => {
        if (p.isBot) send({ t: 'removeBot', id: p.id });
        else askConfirm(`¿Acompañar a ${p.name} a la salida?`, 'Echar').then((ok) => ok && send({ t: 'kick', id: p.id }));
      });
      li.append(x);
    }
    list.appendChild(li);
  }
  $('#btn-add-bot').hidden = !isHost;
  $('#btn-start').hidden = !isHost;
  $('#btn-add-bot').disabled = v.players.length >= v.maxSeats;
  const host = v.players.find((p) => p.id === v.hostId);
  const wait = $('#lobby-wait');
  wait.hidden = isHost;
  wait.textContent = host ? `Esperando a que ${host.name} empiece la partida…` : 'Esperando…';
}

function tag(text, cls) {
  const t = document.createElement('span');
  t.className = `tag ${cls}`;
  t.textContent = text;
  return t;
}

// ------------------------------------------------------------------- chat

const QUICK = ['¡Suerte!', 'Buena mano 👏', 'Eso es un farol 😏', 'Voy con todo', 'Otra ronda 🥃', 'GG'];

function setupChat(container) {
  container.innerHTML = `
    <div class="chat-log" aria-live="polite"></div>
    <div class="chat-quick">${QUICK.map((q) => `<button type="button">${q}</button>`).join('')}</div>
    <form class="chat-form">
      <input maxlength="200" placeholder="Escribe al resto de la mesa…" aria-label="Mensaje">
      <button class="btn btn-gold btn-sm" type="submit">Enviar</button>
    </form>`;
  const input = $('input', container);
  $('.chat-form', container).addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    send({ t: 'chat', text });
    input.value = '';
  });
  $$('.chat-quick button', container).forEach((b) => b.addEventListener('click', () => send({ t: 'chat', text: b.textContent })));
}

function renderChat(v) {
  let fresh = 0;
  for (const box of $$('[data-chat]')) {
    const log = $('.chat-log', box);
    const have = new Set([...log.children].map((c) => c.dataset.id));
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    for (const m of v.chat) {
      if (have.has(m.id)) continue;
      const row = document.createElement('div');
      row.dataset.id = m.id;
      if (m.from) {
        row.className = 'msg' + (m.from.id === v.you ? ' mine' : '');
        const who = document.createElement('b');
        who.textContent = `${m.from.avatar} ${m.from.name}`;
        const txt = document.createElement('span');
        txt.textContent = m.text;
        row.append(who, txt);
      } else {
        row.className = 'msg sys';
        row.textContent = m.text;
      }
      log.appendChild(row);
      while (log.children.length > 80) log.firstChild.remove();
    }
    if (nearBottom || log.dataset.init !== '1') log.scrollTop = log.scrollHeight;
    log.dataset.init = '1';
  }
  for (const m of v.chat) {
    if (S.chatSeen.has(m.id)) continue;
    S.chatSeen.add(m.id);
    if (m.from && m.from.id !== v.you) fresh++;
  }
  if (fresh && !S.drawerOpen && S.screen === 'table') {
    S.unread += fresh;
    const b = $('#chat-badge');
    b.hidden = false;
    b.textContent = S.unread > 9 ? '9+' : String(S.unread);
  }
}

function openDrawer() {
  S.drawerOpen = true;
  $('#drawer').classList.add('open');
  S.unread = 0;
  $('#chat-badge').hidden = true;
}
function closeDrawer() {
  S.drawerOpen = false;
  $('#drawer').classList.remove('open');
}

// ------------------------------------------------------------------- mesa

function renderTable(v) {
  const g = v.game;
  const table = $('#table');
  table.classList.toggle('mode-three', g.mode === 'three');
  table.classList.toggle('mode-draw', g.mode === 'draw');
  document.body.dataset.mode = g.mode;
  $('#tb-mode').textContent = v.modeName;
  $('#tb-room').textContent = S.offline ? 'Partida en solitario' : `Mesa ${v.roomId}`;
  const me = v.players.find((p) => p.id === v.you);
  const isHost = v.hostId === v.you;
  $('#menu-rebuy').hidden = !(me && me.chips < v.startChips / 10);
  $('#menu-addbot').hidden = !isHost || v.players.length >= v.maxSeats;
  $('#menu-stop').hidden = !isHost;
  $('#menu-stop').textContent = g.stopRequested ? '⏳ Se detendrá al acabar la mano' : '⏹ Detener partida (volver a la sala)';
  $('#menu-copy').hidden = S.offline;

  renderSeats(v);
  if (g.mode === 'three') renderThree(v);
  else renderDraw(v);
  renderMyStrip(v, me);
  tick();
}

/** En móvil mi silla se oculta y mis datos van bajo mis cartas. */
function renderMyStrip(v, me) {
  const g = v.game;
  const strip = $('#my-strip');
  if (!me) return;
  const s = g.seats.find((x) => x.id === v.you) || {};
  let extra = '';
  if (g.mode === 'draw') {
    if (g.button === v.you && g.phase !== 'waiting') extra += ' · Repartes';
    if ((g.phase === 'bet1' || g.phase === 'bet2') && s.bet) extra += ` · Apuesta ${fmt(s.bet)}`;
    if (s.allIn) extra += ' · All-in';
  }
  strip.textContent = `${me.avatar} ${me.name} · ${fmt(me.chips)} ◉${extra}`;
}

// Ángulo de cada silla (0 = yo, abajo; sentido horario). En 3 cartas dejamos libre
// el arco superior, que es el sitio del crupier.
const SEAT_ANGLES = {
  three: [90, 145, 180, 225, 315, 0],
  draw: [90, 150, 210, 270, 330, 30],
};
// En el móvil mis cartas flotan sobre el borde de abajo: subimos las sillas laterales bajas.
const SEAT_ANGLES_NARROW = {
  three: [90, 160, 195, 215, 325, 20],
  draw: [90, 160, 205, 270, 335, 20],
};
// Móvil en horizontal: en 5 cartas las sillas laterales van a media altura para separar sus filas.
const SEAT_ANGLES_LANDSCAPE = {
  three: SEAT_ANGLES.three,
  draw: [90, 155, 205, 270, 335, 25],
};
const narrow = matchMedia('(max-width: 640px)');
const landscapePhone = matchMedia('(orientation: landscape) and (max-height: 500px)');
function seatAngle(mode, rel) {
  const set = narrow.matches ? SEAT_ANGLES_NARROW : landscapePhone.matches ? SEAT_ANGLES_LANDSCAPE : SEAT_ANGLES;
  return set[mode][rel];
}
for (const mq of [narrow, landscapePhone]) mq.addEventListener?.('change', () => S.view?.game && renderTable(S.view));

function buildSeat(p) {
  const el = document.createElement('div');
  el.className = 'seat';
  el.dataset.pid = p.id;
  el.innerHTML = `
    <div class="plate">
      <div class="avatar"></div>
      <div class="pinfo"><div class="pname"></div><div class="pchips"></div></div>
      <div class="dealer-btn" title="Repartidor">D</div>
      <div class="ptimer"><i></i></div>
    </div>
    <div class="seat-status"></div>
    <div class="seat-stack">
      <div class="seat-cards cards-row"></div>
      <div class="seat-hand"></div>
      <div class="seat-bet"></div>
    </div>
    <div class="seat-pop"></div>`;
  return el;
}

function renderSeats(v) {
  const g = v.game;
  const wrap = $('#seats');
  const me = v.players.find((p) => p.id === v.you);
  const existing = new Map([...wrap.children].map((el) => [el.dataset.pid, el]));
  for (const p of v.players) {
    let el = existing.get(p.id);
    if (!el) {
      el = buildSeat(p);
      wrap.appendChild(el);
    }
    existing.delete(p.id);
    const rel = (p.seat - (me ? me.seat : 0) + 6) % 6;
    const a = (seatAngle(g.mode, rel) * Math.PI) / 180;
    const x = 50 + 50 * Math.cos(a);
    const y = 50 + 50 * Math.sin(a);
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    el.classList.toggle('pos-top', y < 50);
    el.classList.toggle('pos-bottom', y >= 50);
    el.classList.toggle('pos-left', x < 15);
    el.classList.toggle('pos-right', x > 85);
    el.classList.toggle('is-me', p.id === v.you);
    el.classList.toggle('away', !p.connected);
    el.classList.toggle('bot', p.isBot);
    el.dataset.rel = rel;
    $('.avatar', el).textContent = p.avatar;
    $('.pname', el).textContent = p.name;
    $('.pchips', el).textContent = `${fmt(p.chips)} ◉`;

    const s = g.seats.find((x) => x.id === p.id) || {};
    if (g.mode === 'three') renderSeatThree(el, p, s, g, v, rel);
    else renderSeatDraw(el, p, s, g, v, rel);
  }
  for (const el of existing.values()) el.remove();
}

function setStatus(el, text, cls = '') {
  const st = $('.seat-status', el);
  st.textContent = text;
  st.className = `seat-status ${cls}`;
  st.hidden = !text;
}

function setHandLabel(el, hand) {
  const box = $('.seat-hand', el);
  const key = hand ? hand.desc : '';
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  box.textContent = '';
  box.hidden = !hand;
  if (!hand) return;
  const long = document.createElement('span');
  long.className = 'long';
  long.textContent = hand.desc;
  const short = document.createElement('span');
  short.className = 'short';
  short.textContent = hand.name;
  box.append(long, short);
}

function setPop(el, amount, key) {
  const pop = $('.seat-pop', el);
  if (!amount || amount === 0) {
    pop.className = 'seat-pop';
    pop.dataset.key = '';
    return;
  }
  if (pop.dataset.key === key) return;
  pop.dataset.key = key;
  pop.textContent = signed(amount);
  pop.className = `seat-pop show ${amount > 0 ? 'win' : 'lose'}`;
}

function setBet(el, amount, label = '') {
  const b = $('.seat-bet', el);
  const key = `${amount}|${label}`;
  if (b.dataset.key === key) return;
  b.dataset.key = key;
  b.textContent = '';
  if (!amount) {
    b.hidden = true;
    return;
  }
  b.hidden = false;
  b.append(chipStack(amount, 5));
  const n = document.createElement('span');
  n.className = 'bet-amt';
  n.textContent = label ? `${label} ${fmt(amount)}` : fmt(amount);
  b.append(n);
}

function dealDelay(rel, i) {
  return i * 260 + rel * 45;
}

function renderSeatThree(el, p, s, g, v, rel) {
  const mine = p.id === v.you;
  el.classList.toggle('is-turn', false);
  el.classList.toggle('folded', !!s.folded && g.phase !== 'betting');
  el.classList.toggle('winner', g.phase === 'showdown' && s.result?.net > 0);
  $('.dealer-btn', el).hidden = true;
  $('.ptimer', el).hidden = true;
  // Cartas: las mías van al panel inferior
  const cardsBox = $('.seat-cards', el);
  if (!mine) {
    const cards = s.cardCount ? s.cards || [null, null, null] : [];
    syncCards(cardsBox, cards, 'sm', { delay: (i) => dealDelay(rel, i), reveal: (i) => 500 + rel * 140 + i * 90 });
  } else cardsBox.textContent = '';
  setHandLabel(el, !mine && g.phase === 'showdown' ? s.hand : null);
  let status = '';
  let cls = '';
  if (g.phase === 'betting') {
    if (s.ready) [status, cls] = ['Apuesta hecha', 'ok'];
    else if (!p.connected) status = 'Desconectado';
    else status = p.isBot ? 'Pensando…' : 'Apostando…';
  } else if (s.inRound) {
    if (g.phase === 'deciding') {
      if (s.ante === 0) status = 'Sólo Pair Plus';
      else if (!s.decided) status = 'Decidiendo…';
      else if (s.folded) [status, cls] = ['Se retira', 'bad'];
      else [status, cls] = ['Juega', 'ok'];
    } else if (g.phase === 'showdown') {
      if (s.folded) [status, cls] = ['Se retiró', 'bad'];
    }
  } else status = 'Mirando';
  setStatus(el, mine ? '' : status, cls);
  const total = (s.ante || 0) + (s.pp || 0) + (s.play || 0);
  if (mine) setBet(el, 0);
  else setBet(el, s.inRound ? total : 0);
  setPop(el, g.phase === 'showdown' && s.result ? s.result.net : 0, `${g.round}`);
}

function renderSeatDraw(el, p, s, g, v, rel) {
  const mine = p.id === v.you;
  el.classList.toggle('is-turn', g.turn === p.id);
  el.classList.toggle('folded', !!s.folded);
  el.classList.toggle('winner', g.phase === 'showdown' && s.won > 0);
  $('.dealer-btn', el).hidden = g.button !== p.id || g.phase === 'waiting';
  $('.ptimer', el).hidden = g.turn !== p.id;
  const cardsBox = $('.seat-cards', el);
  if (!mine) {
    const cards = s.inHand && s.cardCount ? s.cards || new Array(s.cardCount).fill(null) : [];
    syncCards(cardsBox, cards, 'sm', { delay: (i) => dealDelay(rel, i), reveal: (i) => 300 + rel * 160 + i * 70 });
  } else cardsBox.textContent = '';
  setHandLabel(el, !mine && g.phase === 'showdown' ? s.hand : null);
  let status = '';
  let cls = '';
  if (!s.inHand) status = p.chips <= 0 ? 'Sin fichas' : g.phase === 'waiting' ? '' : 'Próxima mano';
  else if (s.folded) [status, cls] = [s.lastAction === 'Se fue' ? 'Se fue' : 'No va', 'bad'];
  else if (s.allIn) [status, cls] = ['All-in', 'hot'];
  else if (g.turn === p.id) [status, cls] = [g.phase === 'draw' ? 'Descartando…' : 'Pensando…', 'turn'];
  else if (s.lastAction) status = s.lastAction;
  if (g.phase === 'draw' && s.inHand && !s.folded && s.drew !== null && g.turn !== p.id) status = s.drew === 0 ? 'Se sirve' : `Cambia ${s.drew}`;
  setStatus(el, status, cls);
  const betting = g.phase === 'bet1' || g.phase === 'bet2';
  setBet(el, s.inHand && betting ? s.bet : 0);
  setPop(el, g.phase === 'showdown' && s.won ? s.won : 0, `${g.hand}`);
}

// ------------------------------------------------------------ cartas animadas

function dealIn(el, from, delay) {
  const src = from || $('#shoe');
  const r = el.getBoundingClientRect();
  const f = src.getBoundingClientRect();
  el.style.setProperty('--dx', `${f.left + f.width / 2 - (r.left + r.width / 2)}px`);
  el.style.setProperty('--dy', `${f.top + f.height / 2 - (r.top + r.height / 2)}px`);
  el.style.animationDelay = `${delay}ms`;
  el.classList.add('dealing');
  el._readyAt = performance.now() + delay + 420;
  el.addEventListener(
    'animationend',
    () => {
      el.classList.remove('dealing');
      el.style.animationDelay = '';
    },
    { once: true },
  );
  setTimeout(() => sfx.card(), delay);
}

function dealSource() {
  return S.view?.game?.mode === 'draw' ? $('#pot-chips') : $('#shoe');
}

/**
 * Sincroniza una fila de cartas con el estado: reparte las nuevas, voltea las que se
 * descubren, sustituye las descartadas y retira las que sobran.
 */
function syncCards(box, cards, size, { delay = (i) => i * 120, reveal = (i) => i * 120 } = {}) {
  const kids = [...box.children].filter((k) => !k.classList.contains('leaving'));
  cards.forEach((c, i) => {
    let el = kids[i];
    const key = cardKey(c);
    if (el && c && (el.classList.contains('up') || el._pending) && (el._pending || el.dataset.key) !== key) {
      const fresh = createCard(null, { size });
      box.replaceChild(fresh, el);
      el = fresh;
      dealIn(el, dealSource(), 80 + i * 90);
    }
    if (!el) {
      el = createCard(null, { size });
      box.appendChild(el);
      dealIn(el, dealSource(), delay(i));
    }
    if (c) {
      if (!el.classList.contains('up') && el._pending !== key) {
        setCardFront(el, c);
        el._pending = key;
        const wait = Math.max(0, (el._readyAt || 0) - performance.now()) + reveal(i);
        setTimeout(() => {
          if (!el.isConnected || el._pending !== key) return;
          el._pending = null;
          el.classList.add('up');
          sfx.flip();
        }, wait);
      }
    } else if (el.classList.contains('up') || el._pending) {
      el._pending = null;
      el.classList.remove('up');
    }
  });
  [...box.children].forEach((k, i) => k.style.setProperty('--k', i));
  kids.slice(cards.length).forEach((k) => {
    k.classList.add('leaving');
    setTimeout(() => k.remove(), 320);
  });
}

// ------------------------------------------------------------ 3 cartas: mesa

const PAYTABLE_THREE = `
  <div><b>PAIR PLUS</b> Pareja 1:1 · Color 4:1 · Escalera 6:1 · Trío 30:1 · Escalera de color 40:1</div>
  <div><b>BONO ANTE</b> Escalera 1:1 · Trío 4:1 · Escalera de color 5:1</div>`;

function renderThree(v) {
  const g = v.game;
  const me = v.players.find((p) => p.id === v.you);
  const s = g.seats.find((x) => x.id === v.you) || {};
  $('#felt-arc-text').textContent = 'EL CRUPIER CALIFICA CON REINA O MEJOR';
  if ($('#felt-paytable').dataset.mode !== 'three') {
    $('#felt-paytable').innerHTML = PAYTABLE_THREE;
    $('#felt-paytable').dataset.mode = 'three';
  }

  // Nueva ronda: preparamos la apuesta (repetimos la anterior si se puede)
  if (g.round !== S.three.round) {
    S.three.round = g.round;
    const last = S.three.last;
    if (last && 2 * last.ante + last.pp <= me.chips) {
      S.three.ante = last.ante;
      S.three.pp = last.pp;
    } else {
      S.three.ante = 0;
      S.three.pp = 0;
    }
    S.ctlKey = '';
  }

  // Crupier
  syncCards($('#dealer-cards'), g.dealer.cards, 'md', {
    delay: (i) => dealDelay(6, i),
    reveal: (i) => 150 + i * 220,
  });
  const dh = $('#dealer-hand');
  if (g.phase === 'showdown' && g.dealer.hand) {
    dh.innerHTML = '';
    const a = document.createElement('span');
    a.textContent = g.dealer.hand.desc;
    const b = document.createElement('em');
    b.className = g.dealer.qualifies ? 'ok' : 'bad';
    b.textContent = g.dealer.qualifies ? 'califica' : 'no califica';
    dh.append(a, b);
  } else dh.textContent = g.phase === 'deciding' ? 'Esperando decisiones…' : '';

  // Mis casillas
  const editing = g.phase === 'betting' && !s.ready;
  const ante = editing ? S.three.ante : s.ante || 0;
  const pp = editing ? S.three.pp : s.pp || 0;
  const play = s.play || 0;
  setSpot('ante', ante, editing && S.three.target === 'ante');
  setSpot('pp', pp, editing && S.three.target === 'pp');
  setSpot('play', play, false);
  $('#bet-spots').classList.toggle('editing', editing);
  const res = g.phase === 'showdown' ? s.result : null;
  $('#bet-spots').classList.toggle('won', !!res && res.net > 0);
  $('#bet-spots').classList.toggle('lost', !!res && res.net < 0);

  // Mis cartas
  const mine = s.cardCount ? s.cards || [null, null, null] : [];
  syncCards($('#my-cards'), mine, 'lg', { delay: (i) => dealDelay(0, i), reveal: (i) => 120 + i * 120 });
  $('#my-hand-name').textContent = s.hand ? s.hand.desc : '';
  $('#my-hand-name').classList.toggle('strong', !!s.hand && s.hand.cat >= 1);

  // Efectos de fin de mano
  if (g.phase === 'showdown' && S.prev?.game?.phase !== 'showdown' && res) {
    setTimeout(() => (res.net > 0 ? sfx.win() : res.net < 0 ? sfx.lose() : null), 900);
    S.three.history.unshift({ round: g.round, hand: s.hand?.desc || '', dealer: g.dealer.hand?.desc || '', net: res.net, folded: s.folded });
    S.three.history = S.three.history.slice(0, 20);
  }
  if (g.phase === 'deciding' && S.prev?.game?.phase === 'betting' && s.inRound && s.ante > 0) {
    setTimeout(() => sfx.turn(), 1400);
  }
  // Fichas al tapete
  const readyNow = g.seats.filter((x) => x.ready).length;
  const readyBefore = S.prev?.game?.mode === 'three' && S.prev.game.round === g.round ? S.prev.game.seats.filter((x) => x.ready).length : 0;
  if (readyNow > readyBefore) sfx.chips();

  renderThreeControls(v, s, me);
  renderHistoryThree();
}

function setSpot(name, amount, selected) {
  const spot = $(`#bet-spots [data-spot="${name}"]`);
  spot.classList.toggle('selected', selected);
  spot.classList.toggle('has-bet', amount > 0);
  const box = $('.spot-chips', spot);
  if (box.dataset.amount === String(amount)) return;
  box.dataset.amount = String(amount);
  box.textContent = '';
  if (amount > 0) {
    box.append(chipStack(amount, 6));
    const n = document.createElement('b');
    n.textContent = fmt(amount);
    box.append(n);
  }
}

function renderThreeControls(v, s, me) {
  const g = v.game;
  const box = $('#controls');
  const L = g.limits;
  let key;
  if (g.phase === 'betting') key = s.ready ? 'bet-ready' : me.chips < L.anteMin && me.chips < L.ppMin ? 'bet-broke' : 'bet-edit';
  else if (g.phase === 'deciding') key = !s.inRound ? 'dec-out' : s.ante > 0 && !s.decided ? 'dec-choose' : 'dec-wait';
  else key = `show-${g.round}-${s.inRound ? 'in' : 'out'}`;
  key += `|${g.stopRequested}`;

  if (key !== S.ctlKey) {
    S.ctlKey = key;
    box.className = 'dock-controls';
    if (key.startsWith('bet-edit')) {
      box.innerHTML = `
        <div class="ctl-row targets">
          <button data-target="ante">ANTE <b data-v="ante"></b></button>
          <button data-target="pp">PAIR PLUS <b data-v="pp"></b></button>
        </div>
        <div class="chip-rack">
          ${[5, 25, 100, 500].map((c) => `<button class="chip-btn c${c}" data-chip="${c}" title="Añadir ${c}"><span>${c}</span></button>`).join('')}
        </div>
        <div class="ctl-row">
          <button class="btn btn-ghost btn-sm" data-act="clear">Borrar</button>
          <button class="btn btn-ghost btn-sm" data-act="double">×2</button>
          <button class="btn btn-gold btn-deal" data-act="deal">REPARTIR</button>
        </div>
        <div class="ctl-note" data-note></div>
        <div class="ctl-timer" data-timer></div>`;
    } else if (key.startsWith('bet-ready')) {
      box.innerHTML = `<div class="ctl-msg">✔ Apuesta hecha: Ante <b>${fmt(s.ante)}</b> · Pair Plus <b>${fmt(s.pp)}</b></div>
        <div class="ctl-sub">Esperando al resto de la mesa…</div><div class="ctl-timer" data-timer></div>`;
    } else if (key.startsWith('bet-broke')) {
      box.innerHTML = `<div class="ctl-msg">Te has quedado sin fichas.</div>
        <div class="ctl-row"><button class="btn btn-gold" data-act="rebuy">💰 Recargar ${fmt(v.startChips)}</button></div>`;
    } else if (key.startsWith('dec-choose')) {
      const ev = s.cards ? evaluate3(s.cards) : null;
      const play = ev ? shouldPlay(ev) : true;
      const tip = ev
        ? ev.cat > 0
          ? `Con ${ev.name.toLowerCase()} se juega siempre.`
          : play
            ? 'Supera Q-6-4: un profesional jugaría.'
            : 'No llega a Q-6-4: un profesional se retiraría.'
        : '';
      box.innerHTML = `
        <div class="advice"><span>El crupier susurra:</span> “${tip}”</div>
        <div class="ctl-row decide">
          <button class="btn btn-red ${play ? '' : 'suggest'}" data-act="fold">RETIRARSE<small>pierdes ${fmt(s.ante + s.pp)}</small></button>
          <button class="btn btn-gold ${play ? 'suggest' : ''}" data-act="play">JUGAR<small>pones ${fmt(s.ante)} en Play</small></button>
        </div>
        <div class="ctl-timer" data-timer></div>`;
    } else if (key.startsWith('dec-wait')) {
      box.innerHTML = `<div class="ctl-msg">${s.folded ? 'Te has retirado.' : s.ante === 0 ? 'Juegas sólo el Pair Plus.' : 'Juegas. ¡Que hable el crupier!'}</div>
        <div class="ctl-sub">Esperando a que decidan los demás…</div><div class="ctl-timer" data-timer></div>`;
    } else if (key.startsWith('dec-out')) {
      box.innerHTML = `<div class="ctl-msg">Esta mano la ves desde la barra 🥃</div><div class="ctl-sub">Podrás apostar en la siguiente.</div>`;
    } else if (key.startsWith('show')) {
      const r = s.result;
      if (r) {
        box.className = `dock-controls result ${r.net > 0 ? 'win' : r.net < 0 ? 'lose' : 'push'}`;
        box.innerHTML = `
          <div class="result-head">${r.net > 0 ? '¡Cobras!' : r.net < 0 ? (s.folded ? 'Te retiraste' : 'Gana la casa') : 'Empate'} <b>${signed(r.net)}</b></div>
          <ul class="result-lines">${r.lines.map((l) => `<li><span>${esc(l.label)}</span><b class="${l.amount > 0 ? 'win' : l.amount < 0 ? 'lose' : ''}">${signed(l.amount)}</b></li>`).join('')}</ul>
          <div class="ctl-timer" data-timer data-label="Siguiente mano en"></div>`;
      } else {
        box.innerHTML = `<div class="ctl-msg">Fin de la mano.</div><div class="ctl-timer" data-timer data-label="Siguiente mano en"></div>`;
      }
    }
    if (g.stopRequested) box.insertAdjacentHTML('beforeend', '<div class="ctl-sub stop">La partida se detendrá al acabar esta mano.</div>');
  }
  updateThreeBetUI(v, me);
}

function updateThreeBetUI(v, me) {
  const g = v.game;
  const box = $('#controls');
  if (!$('[data-chip]', box)) return;
  const L = g.limits;
  const T = S.three;
  $$('[data-target]', box).forEach((b) => b.classList.toggle('active', b.dataset.target === T.target));
  $('[data-v="ante"]', box).textContent = fmt(T.ante);
  $('[data-v="pp"]', box).textContent = fmt(T.pp);
  const need = 2 * T.ante + T.pp;
  const note = $('[data-note]', box);
  let err = '';
  if (T.ante === 0 && T.pp === 0) err = 'Elige casilla y toca las fichas.';
  else if (T.ante > 0 && T.ante < L.anteMin) err = `El Ante mínimo es ${L.anteMin}.`;
  else if (T.pp > 0 && T.pp < L.ppMin) err = `El Pair Plus mínimo es ${L.ppMin}.`;
  else if (need > me.chips) err = `Necesitas ${fmt(need)} fichas (el Ante se reserva doble para poder jugar).`;
  note.textContent = err || (T.ante > 0 ? `Reservas ${fmt(T.ante)} para la apuesta Play.` : 'Sólo Pair Plus: no tendrás que decidir.');
  note.classList.toggle('bad', !!err && !(T.ante === 0 && T.pp === 0));
  $('[data-act="deal"]', box).disabled = !!err;
  $$('[data-chip]', box).forEach((b) => {
    const c = Number(b.dataset.chip);
    const cur = T[T.target];
    const max = T.target === 'ante' ? L.anteMax : L.ppMax;
    const cost = T.target === 'ante' ? 2 * c : c;
    b.disabled = cur + c > max || need + cost > me.chips;
  });
  $('[data-act="double"]', box).disabled = need === 0 || 2 * need > me.chips || T.ante * 2 > L.anteMax || T.pp * 2 > L.ppMax;
}

function renderHistoryThree() {
  const h = $('#history');
  h.textContent = '';
  if (!S.three.history.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'Aquí verás tus últimas manos.';
    h.appendChild(li);
    return;
  }
  for (const r of S.three.history) {
    const li = document.createElement('li');
    li.innerHTML = `<b class="${r.net > 0 ? 'win' : r.net < 0 ? 'lose' : ''}">${signed(r.net)}</b> <span></span>`;
    li.querySelector('span').textContent = `#${r.round} · ${r.folded ? 'Te retiraste con ' : ''}${r.hand}${r.dealer ? ` · crupier: ${r.dealer}` : ''}`;
    h.appendChild(li);
  }
}

// ------------------------------------------------------------ 5 cartas: mesa

const PHASE_LABEL = {
  waiting: 'Esperando jugadores',
  bet1: 'Primera ronda de apuestas',
  draw: 'Descarte',
  bet2: 'Segunda ronda de apuestas',
  showdown: 'Enseñanza',
};

function renderDraw(v) {
  const g = v.game;
  const me = v.players.find((p) => p.id === v.you);
  const s = g.seats.find((x) => x.id === v.you) || {};
  if ($('#felt-paytable').dataset.mode !== 'draw') {
    $('#felt-paytable').innerHTML = `<div><b>PÓKER DE CINCO CARTAS</b> SIN LÍMITE</div><div>ANTE ${g.rules.ante} · APUESTA MÍNIMA ${g.rules.minBet} · DESCARTE HASTA 3 (4 CON AS)</div>`;
    $('#felt-paytable').dataset.mode = 'draw';
  }
  if (g.hand !== S.draw.hand) {
    S.draw.hand = g.hand;
    S.draw.sel.clear();
    S.ctlKey = '';
  }
  $('#phase-label').textContent = PHASE_LABEL[g.phase] || '';
  const potBox = $('#pot-chips');
  if (potBox.dataset.amount !== String(g.pot)) {
    potBox.dataset.amount = String(g.pot);
    potBox.textContent = '';
    if (g.pot > 0) potBox.append(chipStack(g.pot, 10));
  }
  $('#pot-amount').textContent = g.pot > 0 ? `Bote ${fmt(g.pot)}` : '';

  const res = $('#pot-result');
  res.textContent = '';
  if (g.phase === 'showdown' && g.results) {
    g.results.pots.forEach((pot, i) => {
      const names = pot.winners.map((w) => v.players.find((p) => p.id === w)?.name || '¿?').join(' y ');
      const line = document.createElement('div');
      const label = g.results.pots.length > 1 ? (i === 0 ? 'Bote principal' : `Bote secundario ${i}`) : '';
      line.textContent = `🏆 ${label ? label + ': ' : ''}${names} ${pot.winners.length > 1 ? 'reparten' : 'gana'} ${fmt(pot.amount)}${pot.desc ? ` con ${pot.desc}` : ''}`;
      res.appendChild(line);
    });
  }

  // Mis cartas
  const mine = s.inHand && s.cardCount ? s.cards || new Array(s.cardCount).fill(null) : [];
  syncCards($('#my-cards'), mine, 'lg', { delay: (i) => dealDelay(0, i), reveal: (i) => 100 + i * 80 });
  const kids = [...$('#my-cards').children].filter((k) => !k.classList.contains('leaving'));
  const canPick = g.phase === 'draw' && g.turn === v.you;
  kids.forEach((k, i) => {
    k.classList.toggle('selectable', canPick);
    k.classList.toggle('selected', canPick && S.draw.sel.has(i));
    k.dataset.idx = i;
  });
  $('#my-hand-name').textContent = s.hand && !s.folded ? s.hand.desc : s.folded ? 'No vas en esta mano' : '';
  $('#my-hand-name').classList.toggle('strong', !!s.hand && s.hand.cat >= 2);

  // Sonidos
  const pg = S.prev?.game;
  if (pg?.mode === 'draw' && pg.hand === g.hand && g.pot > pg.pot) sfx.chips();
  if (g.turn === v.you && pg?.turn !== v.you) {
    sfx.turn();
    if (navigator.vibrate) navigator.vibrate(40);
  }
  if (g.phase === 'showdown' && pg?.phase !== 'showdown' && s.won > 0) setTimeout(() => sfx.win(), 600);

  renderDrawControls(v, s, me);
  renderHistoryDraw(g);
}

function renderDrawControls(v, s, me) {
  const g = v.game;
  const box = $('#controls');
  const myTurn = g.turn === v.you;
  let key;
  if (g.phase === 'waiting') key = `wait-${me.chips > 0}-${v.hostId === v.you}`;
  else if (!s.inHand) key = `out-${me.chips > 0}`;
  else if (g.phase === 'showdown') key = `show-${g.hand}`;
  else if (s.folded) key = 'folded';
  else if (myTurn && g.phase === 'draw') key = `draw-${g.hand}`;
  else if (myTurn) key = `bet-${g.hand}-${g.phase}-${g.currentBet}-${s.bet}-${JSON.stringify(g.me)}`;
  else key = `watch-${s.allIn}`;
  key += `|${g.stopRequested}`;

  if (key !== S.ctlKey) {
    S.ctlKey = key;
    box.className = 'dock-controls';
    if (key.startsWith('wait')) {
      box.innerHTML = `<div class="ctl-msg">Esperando a más jugadores…</div>
        <div class="ctl-sub">Hacen falta al menos 2 con fichas.</div>
        <div class="ctl-row">
          ${me.chips <= 0 ? `<button class="btn btn-gold" data-act="rebuy">💰 Recargar ${fmt(v.startChips)}</button>` : ''}
          ${v.hostId === v.you ? '<button class="btn btn-ghost" data-act="addbot">🤖 Sentar un habitual</button>' : ''}
        </div>`;
    } else if (key.startsWith('out')) {
      box.innerHTML = me.chips > 0
        ? `<div class="ctl-msg">Entras en la próxima mano.</div><div class="ctl-sub">Mientras, observa a tus rivales.</div>`
        : `<div class="ctl-msg">Te has quedado sin fichas.</div><div class="ctl-row"><button class="btn btn-gold" data-act="rebuy">💰 Recargar ${fmt(v.startChips)}</button></div>`;
    } else if (key.startsWith('folded')) {
      box.innerHTML = `<div class="ctl-msg">No vas en esta mano.</div><div class="ctl-sub">Paciencia: las buenas cartas llegan.</div>`;
    } else if (key.startsWith('draw')) {
      box.innerHTML = `
        <div class="ctl-msg">Toca las cartas que quieres cambiar</div>
        <div class="ctl-sub">Hasta 3 · o 4 si te quedas con un As</div>
        <div class="ctl-row">
          <button class="btn btn-ghost btn-sm" data-act="suggest">💡 Sugerencia</button>
          <button class="btn btn-gold" data-act="draw"></button>
        </div>
        <div class="ctl-note" data-note></div>
        <div class="ctl-timer" data-timer></div>`;
    } else if (key.startsWith('bet')) {
      const o = g.me;
      const callLabel = o.canCheck ? 'Pasar' : o.callAmount >= me.chips ? `All-in ${fmt(o.callAmount)}` : `Igualar ${fmt(o.callAmount)}`;
      S.draw.raise = o.minTo;
      box.innerHTML = `
        <div class="ctl-row">
          <button class="btn btn-red" data-act="fold">No ir</button>
          <button class="btn btn-ghost" data-act="${o.canCheck ? 'check' : 'call'}">${callLabel}</button>
        </div>
        ${o.canRaise ? `
        <div class="raise-box">
          <div class="raise-quick">
            <button data-q="min">Mín</button><button data-q="half">½ bote</button><button data-q="pot">Bote</button><button data-q="all">All-in</button>
          </div>
          <div class="raise-line">
            <input type="range" min="${o.minTo}" max="${o.maxTo}" step="5" value="${o.minTo}" aria-label="Cantidad">
            <button class="btn btn-gold" data-act="raise"></button>
          </div>
        </div>` : ''}
        <div class="ctl-timer" data-timer></div>`;
    } else if (key.startsWith('watch')) {
      box.innerHTML = `<div class="ctl-msg" data-watch></div><div class="ctl-sub">${s.allIn ? 'Estás all-in: ya sólo queda rezar.' : ''}</div><div class="ctl-timer" data-timer></div>`;
    } else if (key.startsWith('show')) {
      const won = s.won || 0;
      box.className = `dock-controls result ${won > 0 ? 'win' : 'push'}`;
      const lines = (g.results?.pots || []).map((pot) => {
        const names = pot.winners.map((w) => (w === v.you ? 'Tú' : v.players.find((p) => p.id === w)?.name || '¿?')).join(' y ');
        return `<li><span>${esc(names)}${pot.desc ? ` · ${esc(pot.desc)}` : ''}</span><b>${fmt(pot.amount)}</b></li>`;
      });
      box.innerHTML = `
        <div class="result-head">${won > 0 ? `¡Te llevas ${fmt(won)}!` : s.folded ? 'No ibas en esta mano' : 'Esta vez no'}</div>
        <ul class="result-lines">${lines.join('')}</ul>
        <div class="ctl-timer" data-timer data-label="Siguiente mano en"></div>`;
    }
    if (g.stopRequested) box.insertAdjacentHTML('beforeend', '<div class="ctl-sub stop">La partida se detendrá al acabar esta mano.</div>');
  }
  updateDrawUI(v, s, me);
}

function updateDrawUI(v, s, me) {
  const g = v.game;
  const box = $('#controls');
  const watch = $('[data-watch]', box);
  if (watch) {
    const p = v.players.find((x) => x.id === g.turn);
    watch.textContent = p ? `Turno de ${p.name}…` : g.phase === 'draw' ? 'Descartando…' : 'Un momento…';
  }
  const drawBtn = $('[data-act="draw"]', box);
  if (drawBtn) {
    const n = S.draw.sel.size;
    drawBtn.textContent = n === 0 ? 'Me sirvo (no cambio)' : `Cambiar ${n} carta${n > 1 ? 's' : ''}`;
    const err = drawError(s);
    $('[data-note]', box).textContent = err;
    $('[data-note]', box).classList.toggle('bad', !!err);
    drawBtn.disabled = !!err;
  }
  const raiseBtn = $('[data-act="raise"]', box);
  if (raiseBtn && g.me) {
    const o = g.me;
    const to = S.draw.raise;
    raiseBtn.textContent = to >= o.maxTo ? `All-in ${fmt(o.maxTo)}` : o.isBet ? `Apostar ${fmt(to)}` : `Subir a ${fmt(to)}`;
    const range = $('input[type=range]', box);
    if (range && Number(range.value) !== to) range.value = String(to);
  }
}

function drawError(s) {
  const n = S.draw.sel.size;
  if (n <= 3) return '';
  if (n >= 5) return 'No puedes cambiar las 5.';
  const kept = [0, 1, 2, 3, 4].find((i) => !S.draw.sel.has(i));
  if (!s.cards || s.cards[kept]?.r !== 14) return 'Sólo puedes cambiar 4 si te quedas con un As.';
  return '';
}

function renderHistoryDraw(g) {
  const h = $('#history');
  h.textContent = '';
  for (const line of [...g.history].reverse()) {
    const li = document.createElement('li');
    li.textContent = line;
    if (line.startsWith('—')) li.className = 'sep';
    h.appendChild(li);
  }
}

// ------------------------------------------------------------------ reloj

function tick() {
  const g = S.view?.game;
  if (!g || S.screen !== 'table') return;
  const left = g.deadline ? Math.max(0, g.deadline - now()) : 0;
  const secs = Math.ceil(left / 1000);
  $$('#controls [data-timer]').forEach((t) => {
    if (!g.deadline || left <= 0) {
      t.textContent = '';
      return;
    }
    const label = t.dataset.label || (g.mode === 'three' && g.phase === 'betting' ? 'Repartimos en' : 'Tiempo');
    t.textContent = `${label} ${secs} s`;
    t.classList.toggle('urgent', secs <= 5 && !t.dataset.label);
  });
  if (g.mode === 'draw' && g.turn) {
    const el = $(`#seats .seat[data-pid="${CSS.escape(g.turn)}"] .ptimer i`);
    if (el) {
      const total = g.phase === 'draw' ? 25000 : 30000;
      el.style.width = `${Math.min(100, (left / total) * 100)}%`;
      el.parentElement.classList.toggle('urgent', left < 6000);
    }
  }
}
setInterval(tick, 250);

function esc(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

// --------------------------------------------------------------- acciones

function onControlsClick(e) {
  const v = S.view;
  if (!v?.game) return;
  const g = v.game;
  const me = v.players.find((p) => p.id === v.you);
  const t = e.target.closest('button');
  if (!t || t.disabled) return;

  if (t.dataset.target) {
    S.three.target = t.dataset.target;
    renderThree(v);
    return;
  }
  if (t.dataset.chip) {
    const c = Number(t.dataset.chip);
    S.three[S.three.target] += c;
    sfx.chips();
    renderThree(v);
    return;
  }
  if (t.dataset.q && g.me) {
    const o = g.me;
    const potAfterCall = g.pot + o.toCall;
    let to;
    if (t.dataset.q === 'min') to = o.minTo;
    else if (t.dataset.q === 'all') to = o.maxTo;
    else {
      const frac = t.dataset.q === 'half' ? 0.5 : 1;
      to = g.currentBet + Math.round((potAfterCall * frac) / 5) * 5;
    }
    S.draw.raise = Math.max(o.minTo, Math.min(o.maxTo, to));
    updateDrawUI(v, g.seats.find((x) => x.id === v.you), me);
    return;
  }
  switch (t.dataset.act) {
    case 'clear':
      S.three.ante = 0;
      S.three.pp = 0;
      renderThree(v);
      break;
    case 'double':
      S.three.ante *= 2;
      S.three.pp *= 2;
      sfx.chips();
      renderThree(v);
      break;
    case 'deal':
      S.three.last = { ante: S.three.ante, pp: S.three.pp };
      send({ t: 'bet', ante: S.three.ante, pp: S.three.pp });
      break;
    case 'play':
      send({ t: 'decide', play: true });
      sfx.chips();
      break;
    case 'fold':
      if (g.mode === 'three') send({ t: 'decide', play: false });
      else send({ t: 'act', a: 'fold' });
      break;
    case 'check':
      send({ t: 'act', a: 'check' });
      break;
    case 'call':
      send({ t: 'act', a: 'call' });
      break;
    case 'raise':
      send({ t: 'act', a: 'raise', to: S.draw.raise });
      break;
    case 'suggest': {
      const s = g.seats.find((x) => x.id === v.you);
      if (s?.cards) {
        S.draw.sel = new Set(drawPlan(s.cards).discard);
        renderDraw(v);
      }
      break;
    }
    case 'draw':
      send({ t: 'draw', idx: [...S.draw.sel].sort() });
      S.draw.sel.clear();
      break;
    case 'rebuy':
      send({ t: 'rebuy' });
      break;
    case 'addbot':
      send({ t: 'addBot' });
      break;
    default:
  }
}

function onRangeInput(e) {
  if (e.target.type !== 'range') return;
  const g = S.view?.game;
  if (!g?.me) return;
  let to = Number(e.target.value);
  if (g.me.maxTo - to < 5) to = g.me.maxTo;
  S.draw.raise = to;
  updateDrawUI(S.view, g.seats.find((x) => x.id === S.view.you), S.view.players.find((p) => p.id === S.view.you));
}

function onMyCardClick(e) {
  const card = e.target.closest('.card.selectable');
  if (!card) return;
  const i = Number(card.dataset.idx);
  if (S.draw.sel.has(i)) S.draw.sel.delete(i);
  else S.draw.sel.add(i);
  sfx.flip();
  renderDraw(S.view);
}

function onSpotClick(e) {
  const spot = e.target.closest('[data-spot]');
  if (!spot || spot.dataset.spot === 'play') return;
  const v = S.view;
  if (v?.game?.mode !== 'three' || v.game.phase !== 'betting') return;
  S.three.target = spot.dataset.spot;
  renderThree(v);
}

// ------------------------------------------------------------------ inicio

async function checkServer() {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(new URL('api/health', location.href), { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(to);
    const j = await r.json();
    return !!j.online;
  } catch {
    return false;
  }
}

function selectMode(mode) {
  S.mode = mode;
  store.set('sotano.mode', mode);
  $$('.mode-card').forEach((c) => {
    const on = c.dataset.mode === mode;
    c.classList.toggle('selected', on);
    c.setAttribute('aria-checked', String(on));
  });
}

// ------------------------------------------------------------ menú y juice

function openSetup(kind) {
  const setup = $('#setup');
  setup.dataset.kind = kind;
  $('#setup-title').textContent = kind === 'online' ? 'MESA CON AMIGOS' : 'NUEVA PARTIDA';
  setup.hidden = false;
  setup.classList.remove('open');
  void setup.offsetWidth;
  setup.classList.add('open');
  const name = $('#name-input');
  if (!name.value) name.focus();
  else if (kind === 'online') ($('#code-input').value ? $('#btn-join') : $('#btn-create')).focus();
  else $('#btn-solo').focus();
}

function closeSetup() {
  const setup = $('#setup');
  setup.hidden = true;
  setup.classList.remove('open');
}

/** Parte un texto en letras sueltas para que bailen por separado. */
function wobble(el) {
  const text = el.textContent;
  el.textContent = '';
  [...text].forEach((ch, i) => {
    const s = document.createElement('span');
    s.className = 'ch';
    s.style.setProperty('--i', i);
    s.textContent = ch;
    el.appendChild(s);
  });
}

/** Las cartas boca arriba se inclinan hacia el puntero, con un brillo que lo sigue. */
function setupTilt() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let current = null;
  const reset = () => {
    if (!current) return;
    current.classList.remove('tilt');
    current = null;
  };
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const card = e.target.closest ? e.target.closest('.card.up') : null;
    if (card !== current) reset();
    if (!card || !card.closest('#my-cards, #home-fan, .tut-cards, .mode-mini, #dealer-cards')) return;
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    card.style.setProperty('--ry', `${(px - 0.5) * 26}deg`);
    card.style.setProperty('--rx', `${(0.5 - py) * 26}deg`);
    card.style.setProperty('--mx', `${px * 100}%`);
    card.style.setProperty('--my', `${py * 100}%`);
    card.classList.add('tilt');
    current = card;
  });
  document.addEventListener('pointerleave', reset);
}

async function init() {
  document.body.dataset.screen = S.screen;
  startBackground($('#bg-canvas'));
  $$('[data-wobble]').forEach(wobble);
  setupTilt();
  $$('[data-menu]').forEach((b) => b.addEventListener('click', () => openSetup(b.dataset.menu)));
  $('#setup-back').addEventListener('click', closeSetup);
  // Aviso de girar el móvil
  if (!canLockLandscape()) $('#rotate-go').hidden = true;
  else $('#rotate-manual').hidden = true;
  $('#rotate-go').addEventListener('click', async () => {
    const ok = await goLandscape();
    if (!ok) {
      $('#rotate-go').hidden = true;
      $('#rotate-manual').hidden = false;
    }
  });
  // "Seguir en vertical" se recuerda durante la sesión (también si recargas en mitad de una mano)
  try {
    if (sessionStorage.getItem('sotano.portrait') === '1') document.body.classList.add('portrait-ok');
  } catch {}
  $('#rotate-skip').addEventListener('click', () => {
    document.body.classList.add('portrait-ok');
    try {
      sessionStorage.setItem('sotano.portrait', '1');
    } catch {}
  });
  $('#setup').addEventListener('click', (e) => e.target.id === 'setup' && closeSetup());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && !$('#setup').hidden && closeSetup());

  // Portada
  renderStatic($('#home-fan'), parseCards('As Kh Qd Jc Ts'), 'md');
  $$('#home-fan .card').forEach((c, i) => c.style.setProperty('--k', i));
  $$('.mode-mini').forEach((el) => renderStatic(el, parseCards(el.dataset.cards), 'xs'));
  $('#name-input').value = store.get('sotano.name', '') || '';
  selectMode(S.mode);
  $$('.mode-card').forEach((c) => c.addEventListener('click', () => selectMode(c.dataset.mode)));
  $$('[data-chat]').forEach(setupChat);

  const tutorial = initTutorial({ onPractice: (mode) => {
    selectMode(mode);
    if (!S.view) startSolo(mode);
    else if (S.offline && S.view.mode !== mode && S.view.hostId === S.view.you) {
      startSolo(mode);
    }
  } });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-open-tutorial]');
    if (!b) return;
    let which = b.dataset.openTutorial;
    if (which === 'auto') which = S.view?.game?.mode || S.view?.mode || S.mode;
    tutorial.open(which);
  });

  $('#btn-solo').addEventListener('click', () => startSolo());
  $('#btn-create').addEventListener('click', () => startOnline({ t: 'create', name: playerName(), mode: S.mode }));
  const join = () => {
    const code = $('#code-input').value.trim().toUpperCase();
    if (code.length !== 4) {
      toast('El código tiene 4 letras.', 'error');
      $('#code-input').focus();
      return;
    }
    startOnline({ t: 'join', room: code, name: playerName() });
  };
  $('#btn-join').addEventListener('click', join);
  $('#code-input').addEventListener('keydown', (e) => e.key === 'Enter' && join());
  $('#code-input').addEventListener('input', (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '')));

  // Sala
  $$('#lobby-modes button').forEach((b) => b.addEventListener('click', () => send({ t: 'mode', mode: b.dataset.mode })));
  $('#btn-add-bot').addEventListener('click', () => send({ t: 'addBot' }));
  $('#btn-start').addEventListener('click', () => send({ t: 'start' }));
  $('#btn-copy-link').addEventListener('click', copyInvite);
  $('#btn-lobby-leave').addEventListener('click', leave);

  // Mesa
  $('#btn-leave').addEventListener('click', leave);
  $('#controls').addEventListener('click', onControlsClick);
  $('#controls').addEventListener('input', onRangeInput);
  $('#my-cards').addEventListener('click', onMyCardClick);
  $('#bet-spots').addEventListener('click', onSpotClick);
  $('#btn-chat').addEventListener('click', () => (S.drawerOpen ? closeDrawer() : openDrawer()));
  $('#drawer-close').addEventListener('click', closeDrawer);
  $$('.drawer-tabs [data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      $$('.drawer-tabs [data-tab]').forEach((x) => x.classList.toggle('active', x === b));
      $$('[data-tabpane]').forEach((p) => (p.hidden = p.dataset.tabpane !== b.dataset.tab));
    }),
  );
  const soundBtn = $('#btn-sound');
  const syncSound = () => (soundBtn.textContent = isMuted() ? '🔇' : '🔊');
  syncSound();
  soundBtn.addEventListener('click', () => {
    setMuted(!isMuted());
    syncSound();
    if (!isMuted()) sfx.chips();
  });
  const menu = $('#menu');
  $('#btn-menu').addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && (!e.target.closest('#menu') || e.target.closest('#menu button'))) menu.hidden = true;
  });
  $('#menu-rebuy').addEventListener('click', () => send({ t: 'rebuy' }));
  $('#menu-addbot').addEventListener('click', () => send({ t: 'addBot' }));
  $('#menu-stop').addEventListener('click', () => send({ t: 'stop' }));
  $('#menu-copy').addEventListener('click', copyInvite);

  // Atajos de teclado en la mesa
  document.addEventListener('keydown', (e) => {
    if (S.screen !== 'table' || tutorial.isOpen() || e.target.closest('input, textarea')) return;
    const box = $('#controls');
    const click = (sel) => {
      const b = $(sel, box);
      if (b && !b.disabled) b.click();
    };
    if (e.key === 'Enter') click('[data-act="deal"], [data-act="play"], [data-act="draw"], [data-act="check"], [data-act="call"]');
    if (e.key === 'Escape') closeDrawer();
  });

  // ¿Hay servidor? (si no, sólo modo en solitario)
  S.online = await checkServer();
  const note = $('#online-note');
  if (!S.online) {
    $('#online-block').classList.add('disabled');
    $$('#online-block button, #online-block input').forEach((x) => (x.disabled = true));
    note.hidden = false;
    note.textContent = 'Las mesas privadas online necesitan el servidor de El Sótano (npm start). Aquí puedes jugar contra la casa.';
  }

  // Invitación por enlace
  const params = new URLSearchParams(location.search);
  const sala = (params.get('sala') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (sala) {
    $('#code-input').value = sala;
    $('.join-row').classList.add('invited');
    openSetup('online');
    toast(`Te han invitado a la mesa ${sala}. Escribe tu apodo y pulsa Entrar.`, 'info', 5000);
    $('#name-input').focus();
  }

  // ¿Recargaste la página en mitad de una partida online?
  const seat = session.get();
  if (S.online && seat) {
    resetTableUI();
    S.transport = new OnlineTransport(null, handlers);
  }

  // Primera visita: ofrecemos el tutorial
  if (!store.get('sotano.visited')) {
    store.set('sotano.visited', '1');
    setTimeout(() => {
      if (S.screen === 'home' && !tutorial.isOpen() && $('#setup').hidden) toast('¿Primera vez en El Sótano? Pulsa TUTORIAL y te enseñamos.', 'info', 6000);
    }, 1200);
  }
}

init();

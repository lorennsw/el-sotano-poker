// El Sótano — servidor de póker online.
// Sirve la web (public/ y shared/) y gestiona las salas por WebSocket en /ws.
//   npm install && npm start   →   http://localhost:3000

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room, isMode, cleanName } from './shared/room.js';
import { randomInt } from './shared/cards.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_ROOMS = 500;
const DISCONNECT_GRACE_MS = 90_000; // tiempo para volver tras perder la conexión
const EMPTY_ROOM_MS = 120_000;

const STATIC = [
  { prefix: '/shared/', dir: path.join(ROOT, 'shared') },
  { prefix: '/', dir: path.join(ROOT, 'public') },
];
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

// ------------------------------------------------------------------ HTTP

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, online: true, rooms: rooms.size }));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    for (const { prefix, dir } of STATIC) {
      if (!pathname.startsWith(prefix)) continue;
      const file = path.normalize(path.join(dir, pathname.slice(prefix.length)));
      if (!file.startsWith(dir + path.sep)) break; // nada de salir de la carpeta
      const info = await stat(file).catch(() => null);
      if (!info || !info.isFile()) continue;
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
        'cache-control': 'no-cache',
        'x-content-type-options': 'nosniff',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('No existe esa puerta.');
  } catch {
    res.writeHead(400).end();
  }
});

// ------------------------------------------------------------------ salas

/** code → { room, sockets: Map<pid, ws>, timers: Map<pid, timeout>, emptyTimer } */
const rooms = new Map();

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += A[randomInt(A.length)];
    if (!rooms.has(c)) return c;
  }
}

function createRoom(mode) {
  const code = newCode();
  const entry = { room: null, sockets: new Map(), timers: new Map(), emptyTimer: null };
  entry.room = new Room({
    id: code,
    mode,
    onUpdate: (room) => {
      for (const [pid, ws] of entry.sockets) send(ws, { t: 'state', view: room.view(pid) });
    },
    // Si echan a alguien (o se le retira), su conexión deja de recibir la mesa.
    onRemove: (pid) => {
      const ws = entry.sockets.get(pid);
      if (!ws) return;
      entry.sockets.delete(pid);
      ws.session = null;
      send(ws, { t: 'error', msg: 'Te han acompañado a la salida de la mesa.', fatal: true });
    },
  });
  rooms.set(code, entry);
  return entry;
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function checkEmpty(code) {
  const entry = rooms.get(code);
  if (!entry) return;
  const anyone = entry.room.humans().some((p) => p.connected);
  clearTimeout(entry.emptyTimer);
  if (!anyone) {
    entry.emptyTimer = setTimeout(() => {
      const e = rooms.get(code);
      if (e && !e.room.humans().some((p) => p.connected)) {
        e.room.destroy();
        for (const t of e.timers.values()) clearTimeout(t);
        rooms.delete(code);
      }
    }, entry.room.humans().length ? EMPTY_ROOM_MS : 5_000);
  }
}

function bind(ws, entry, player) {
  const old = entry.sockets.get(player.id);
  if (old && old !== ws) {
    old.session = null;
    old.close(4000, 'Sesión abierta en otra pestaña');
  }
  entry.sockets.set(player.id, ws);
  ws.session = { code: entry.room.id, pid: player.id };
  clearTimeout(entry.timers.get(player.id));
  entry.timers.delete(player.id);
  send(ws, { t: 'joined', room: entry.room.id, pid: player.id, token: player.token });
  entry.room.setConnected(player.id, true);
  entry.room.emit();
}

function unbind(ws, { remove }) {
  const sess = ws.session;
  if (!sess) return;
  ws.session = null;
  const entry = rooms.get(sess.code);
  if (!entry) return;
  if (entry.sockets.get(sess.pid) === ws) entry.sockets.delete(sess.pid);
  if (remove) {
    entry.room.removePlayer(sess.pid);
  } else {
    entry.room.setConnected(sess.pid, false);
    entry.timers.set(
      sess.pid,
      setTimeout(() => {
        entry.timers.delete(sess.pid);
        const p = entry.room.getPlayer(sess.pid);
        if (p && !p.connected) entry.room.removePlayer(sess.pid, 'perdió la conexión');
        checkEmpty(sess.code);
      }, DISCONNECT_GRACE_MS),
    );
  }
  checkEmpty(sess.code);
}

// ------------------------------------------------------------- WebSocket

const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (pathname !== '/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.session = null;
  ws.msgCount = 0;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (data) => {
    // Límite sencillo contra inundaciones: 40 mensajes por cada 5 segundos.
    if (++ws.msgCount > 40) return;
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    try {
      handleMessage(ws, msg);
    } catch (e) {
      console.error(e);
      send(ws, { t: 'error', msg: 'Algo ha fallado en el servidor.' });
    }
  });

  ws.on('close', () => unbind(ws, { remove: false }));
});

function handleMessage(ws, msg) {
  switch (msg.t) {
    case 'create': {
      if (ws.session) unbind(ws, { remove: true });
      if (rooms.size >= MAX_ROOMS) return send(ws, { t: 'error', msg: 'El local está a reventar. Prueba en un rato.' });
      const entry = createRoom(isMode(msg.mode) ? msg.mode : 'holdem');
      const { player } = entry.room.addHuman(cleanName(msg.name));
      bind(ws, entry, player);
      return;
    }
    case 'join': {
      if (ws.session) unbind(ws, { remove: true });
      const code = String(msg.room || '').toUpperCase().trim();
      const entry = rooms.get(code);
      if (!entry) return send(ws, { t: 'error', msg: `No hay ninguna mesa con el código ${code.slice(0, 8)}.`, fatal: true });
      const r = entry.room.addHuman(cleanName(msg.name));
      if (r.error) return send(ws, { t: 'error', msg: r.error, fatal: true });
      bind(ws, entry, r.player);
      return;
    }
    case 'rejoin': {
      const entry = rooms.get(String(msg.room || '').toUpperCase());
      const p = entry?.room.getPlayer(msg.pid);
      if (!entry || !p || p.isBot || p.token !== msg.token) {
        return send(ws, { t: 'rejoinFailed' });
      }
      bind(ws, entry, p);
      return;
    }
    case 'leave':
      unbind(ws, { remove: true });
      send(ws, { t: 'left' });
      return;
    case 'ping':
      return send(ws, { t: 'pong', now: Date.now() });
    default: {
      const sess = ws.session;
      const entry = sess && rooms.get(sess.code);
      if (!entry) return send(ws, { t: 'error', msg: 'No estás en ninguna mesa.' });
      const err = entry.room.handle(sess.pid, msg);
      if (err) send(ws, { t: 'error', msg: err });
    }
  }
}

setInterval(() => {
  for (const ws of wss.clients) {
    ws.msgCount = 0;
  }
}, 5000).unref();

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000).unref();

server.listen(PORT, HOST, () => {
  console.log(`🃏  El Sótano abierto en http://localhost:${PORT}`);
});

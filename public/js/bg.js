// Fondo animado: plasma de baja resolución, posterizado con tramado ordenado (Bayer 4×4)
// y escalado sin suavizar para que se vean los píxeles. Paleta del local: verdes de tapete,
// turquesa y un toque de ciruela.

const PALETTE = [
  [8, 20, 19],
  [11, 33, 29],
  [15, 50, 41],
  [20, 70, 55],
  [28, 92, 72],
  [33, 84, 98],
  [52, 55, 96],
  [74, 44, 88],
].map(([r, g, b]) => (255 << 24) | (b << 16) | (g << 8) | r); // ABGR para Uint32 little-endian

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);
const PIXEL = 7; // píxeles de pantalla por píxel del plasma

export function startBackground(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;
  let w = 0;
  let h = 0;
  let img = null;
  let buf = null;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    w = Math.max(16, Math.ceil(innerWidth / PIXEL));
    h = Math.max(16, Math.ceil(innerHeight / PIXEL));
    canvas.width = w;
    canvas.height = h;
    img = ctx.createImageData(w, h);
    buf = new Uint32Array(img.data.buffer);
  }

  function draw(t) {
    const n = PALETTE.length;
    const cx = w * 0.5 + Math.sin(t * 0.21) * w * 0.25;
    const cy = h * 0.45 + Math.cos(t * 0.17) * h * 0.2;
    let i = 0;
    for (let y = 0; y < h; y++) {
      const sy = Math.sin(y * 0.09 + t * 0.9);
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dy = y - cy;
        let v =
          Math.sin(x * 0.07 + t * 0.6) +
          sy +
          Math.sin((x * 0.05 - y * 0.06) + t * 0.45) +
          Math.sin(Math.sqrt(dx * dx + dy * dy) * 0.11 - t * 1.1);
        // v ∈ [-4, 4] → índice de paleta con tramado
        let k = ((v + 4) / 8) * n + BAYER[((y & 3) << 2) | (x & 3)];
        k = k < 0 ? 0 : k >= n ? n - 1 : k | 0;
        buf[i++] = PALETTE[k];
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  resize();
  addEventListener('resize', resize);
  if (reduce) {
    draw(3);
    addEventListener('resize', () => draw(3));
    return;
  }
  let last = 0;
  const start = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    if (document.hidden || now - last < 50) return; // ~20 fps: suficiente y barato
    last = now;
    draw((now - start) / 1000);
  }
  requestAnimationFrame(loop);
}

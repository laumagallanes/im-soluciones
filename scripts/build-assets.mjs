// Genera los assets de marca a partir de brand/logo-origen.png, sin dependencias.
//
//   node scripts/build-assets.mjs
//
// Salida (en public/):
//   img/logo.png            Logo completo (isotipo + "SOLUCIONES"), recortado, fondo transparente.
//   img/logo-mark.png       Solo el isotipo "IM", recortado, fondo transparente (header/footer).
//   img/og-image.png        1200x630 para Open Graph / redes.
//   favicon.ico             16/32/48 px.
//   favicon-16x16.png, favicon-32x32.png, apple-touch-icon.png (180), icon-192.png, icon-512.png,
//   icon-maskable-512.png
//
// El diseño no se altera: solo se recorta el margen blanco, se escala con filtro de área
// y se convierte el blanco del fondo en transparencia ("des-multiplicando" el blanco),
// de modo que sobre fondo blanco el resultado es idéntico al original.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { decodePNG, encodePNG, encodeICO } from './lib/png.mjs';

const root = new URL('../', import.meta.url);
const out = (p) => new URL(`public/${p}`, root);
mkdirSync(out('img/'), { recursive: true });

const src = decodePNG(readFileSync(new URL('brand/logo-origen.png', root)));

// ---------- utilidades de imagen (RGBA Uint8Array) ----------
const make = (width, height, fill = [0, 0, 0, 0]) => {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(fill, i);
  return { width, height, data };
};

function crop(img, x0, y0, w, h) {
  const res = make(w, h);
  for (let y = 0; y < h; y++) {
    const s = ((y0 + y) * img.width + x0) * 4;
    res.data.set(img.data.subarray(s, s + w * 4), y * w * 4);
  }
  return res;
}

// Fondo blanco -> alfa. alfa = 1 - min(r,g,b)/255 (con umbral para limpiar ruido del fondo).
function whiteToAlpha(img) {
  const res = make(img.width, img.height);
  const d = img.data, o = res.data;
  for (let i = 0; i < d.length; i += 4) {
    const m = Math.min(d[i], d[i + 1], d[i + 2]);
    let a = (255 - m) / 255;
    a = a < 0.03 ? 0 : Math.min(1, (a - 0.03) / 0.97);
    if (a === 0) continue;
    for (let c = 0; c < 3; c++) {
      const v = (d[i + c] - 255 * (1 - a)) / a;
      o[i + c] = Math.max(0, Math.min(255, Math.round(v)));
    }
    o[i + 3] = Math.round(a * 255);
  }
  return res;
}

// Escalado por promedio de área con alfa premultiplicado (calidad buena para reducir).
function resize(img, W, H) {
  const res = make(W, H);
  const sx = img.width / W, sy = img.height / H;
  for (let y = 0; y < H; y++) {
    const y0 = y * sy, y1 = y0 + sy;
    for (let x = 0; x < W; x++) {
      const x0 = x * sx, x1 = x0 + sx;
      let r = 0, g = 0, b = 0, a = 0, area = 0;
      for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) {
        const wy = Math.min(yy + 1, y1) - Math.max(yy, y0);
        for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
          const wx = Math.min(xx + 1, x1) - Math.max(xx, x0);
          const wgt = wx * wy;
          const o = (Math.min(yy, img.height - 1) * img.width + Math.min(xx, img.width - 1)) * 4;
          const al = img.data[o + 3] / 255;
          r += img.data[o] * al * wgt; g += img.data[o + 1] * al * wgt; b += img.data[o + 2] * al * wgt;
          a += al * wgt; area += wgt;
        }
      }
      const o = (y * W + x) * 4;
      if (a > 0) { res.data[o] = Math.round(r / a); res.data[o + 1] = Math.round(g / a); res.data[o + 2] = Math.round(b / a); }
      res.data[o + 3] = Math.round((a / area) * 255);
    }
  }
  return res;
}

// Compone `top` sobre `base` en (dx, dy) con blending alfa normal.
function over(base, top, dx, dy) {
  for (let y = 0; y < top.height; y++) for (let x = 0; x < top.width; x++) {
    const bx = x + dx, by = y + dy;
    if (bx < 0 || by < 0 || bx >= base.width || by >= base.height) continue;
    const t = (y * top.width + x) * 4, b = (by * base.width + bx) * 4;
    const ta = top.data[t + 3] / 255, ba = base.data[b + 3] / 255;
    const oa = ta + ba * (1 - ta);
    if (oa === 0) continue;
    for (let c = 0; c < 3; c++) base.data[b + c] = Math.round((top.data[t + c] * ta + base.data[b + c] * ba * (1 - ta)) / oa);
    base.data[b + 3] = Math.round(oa * 255);
  }
  return base;
}

// Encaja img en una caja de W x H manteniendo proporción.
const fit = (img, W, H) => {
  const k = Math.min(W / img.width, H / img.height);
  return resize(img, Math.max(1, Math.round(img.width * k)), Math.max(1, Math.round(img.height * k)));
};
const centered = (canvas, img) => over(canvas, img, Math.round((canvas.width - img.width) / 2), Math.round((canvas.height - img.height) / 2));

// Cuadrado blanco con esquinas redondeadas (antialias simple) para íconos de app.
function roundedSquare(size, radius, color = [255, 255, 255]) {
  const img = make(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const cx = Math.min(Math.max(x + 0.5, radius), size - radius), cy = Math.min(Math.max(y + 0.5, radius), size - radius);
    const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    const a = Math.max(0, Math.min(1, radius - dist + 0.5));
    if (a > 0) img.data.set([...color, Math.round(a * 255)], (y * size + x) * 4);
  }
  return img;
}

// ---------- detectar regiones del logo ----------
const INK = 200;
const isInk = (x, y) => {
  const o = (y * src.width + x) * 4;
  return Math.min(src.data[o], src.data[o + 1], src.data[o + 2]) < INK;
};
const bands = [];
{
  let start = -1;
  for (let y = 0; y <= src.height; y++) {
    let any = false;
    if (y < src.height) for (let x = 0; x < src.width && !any; x++) any = isInk(x, y);
    if (any && start < 0) start = y;
    if (!any && start >= 0) { bands.push([start, y - 1]); start = -1; }
  }
}
const bbox = (y0, y1) => {
  let x0 = src.width, x1 = 0;
  for (let y = y0; y <= y1; y++) for (let x = 0; x < src.width; x++) if (isInk(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  return { x0, x1, y0, y1 };
};
// Se espera: banda grande (isotipo) + banda chica (texto). Se descartan motas de 1-2 px.
const real = bands.filter(([a, b]) => b - a > 4);
if (real.length < 2) throw new Error(`Se esperaban 2 bandas (isotipo + texto), hay ${real.length}: ${JSON.stringify(bands)}`);
const mark = bbox(...real[0]);
const text = bbox(...real[real.length - 1]);
const full = { x0: Math.min(mark.x0, text.x0), x1: Math.max(mark.x1, text.x1), y0: mark.y0, y1: text.y1 };
console.log('isotipo', mark, '\ntexto', text);

const PAD = 6; // margen de seguridad para no cortar el antialias
const cut = (b) => whiteToAlpha(crop(src, b.x0 - PAD, b.y0 - PAD, b.x1 - b.x0 + 1 + PAD * 2, b.y1 - b.y0 + 1 + PAD * 2));
const fullImg = cut(full);
const markImg = cut(mark);

const write = (p, img, opts) => {
  const buf = encodePNG(img, opts);
  writeFileSync(out(p), buf);
  console.log(`${p.padEnd(26)} ${img.width}x${img.height}  ${(buf.length / 1024).toFixed(1)} KB`);
  return buf;
};

// Logos para la web (2x del tamaño de render máximo).
write('img/logo.png', fit(fullImg, 640, 640));
write('img/logo-mark.png', fit(markImg, 160, 112));

// Íconos: isotipo sobre cuadrado blanco redondeado (legible en pestañas claras y oscuras).
const icon = (size, { pad = 0.14, radius = 0.22, bg = true } = {}) => {
  const canvas = bg ? roundedSquare(size, size * radius) : make(size, size);
  const inner = Math.round(size * (1 - pad * 2));
  return centered(canvas, fit(markImg, inner, inner));
};
const ico = [16, 32, 48].map((s) => ({ size: s, png: encodePNG(icon(s, { pad: 0.08, radius: 0.18 })) }));
writeFileSync(out('favicon.ico'), encodeICO(ico));
console.log('favicon.ico'.padEnd(26), '16/32/48');
write('favicon-16x16.png', icon(16, { pad: 0.08, radius: 0.18 }));
write('favicon-32x32.png', icon(32, { pad: 0.08, radius: 0.18 }));
// apple-touch-icon: opaco (iOS ignora transparencias y aplica su propia máscara).
write('apple-touch-icon.png', centered(make(180, 180, [255, 255, 255, 255]), fit(markImg, 132, 132)), { opaque: true });
write('icon-192.png', icon(192));
write('icon-512.png', icon(512));
// maskable: zona segura del 80% => isotipo al ~56%, fondo opaco completo.
write('icon-maskable-512.png', centered(make(512, 512, [255, 255, 255, 255]), fit(markImg, 288, 288)), { opaque: true });

// Open Graph 1200x630: logo completo centrado sobre blanco con una franja inferior con el degradé de marca.
{
  const og = make(1200, 630, [255, 255, 255, 255]);
  const stops = [[0x6b, 0xd8, 0x0f], [0x2e, 0x9a, 0x5a], [0x02, 0x4f, 0x95]];
  for (let y = 618; y < 630; y++) for (let x = 0; x < 1200; x++) {
    const t = x / 1199, seg = t < 0.5 ? 0 : 1, lt = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    const c = stops[seg].map((v, i) => Math.round(v + (stops[seg + 1][i] - v) * lt));
    og.data.set([...c, 255], (y * 1200 + x) * 4);
  }
  centered(og, fit(fullImg, 760, 440));
  write('img/og-image.png', og, { opaque: true });
}

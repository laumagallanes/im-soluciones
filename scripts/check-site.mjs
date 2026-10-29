// Verificaciones del sitio, sin dependencias.
//
//   node scripts/check-site.mjs                         # chequeos estáticos sobre public/
//   node scripts/check-site.mjs http://127.0.0.1:8080   # + chequeos HTTP contra el contenedor
//
// Sale con código 1 si algún chequeo falla.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PUB = join(ROOT, 'public');
const base = process.argv[2]?.replace(/\/$/, '');

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '  ok ' : 'FAIL '} ${msg}`);
  if (!cond) failures++;
};
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const pngSize = (p) => {
  const b = readFileSync(p);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)].slice(1).map((m) => [m[1], m[2] ?? '']));
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((m) => attrs(m[0]));

// ---------- Estáticos ----------
console.log('\n# Archivos requeridos');
for (const f of ['index.html', '404.html', 'robots.txt', 'sitemap.xml', 'site.webmanifest', 'favicon.ico',
  'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png',
  'icon-maskable-512.png', 'css/styles.css', 'js/config.js', 'js/main.js', 'img/logo.png', 'img/logo-mark.png', 'img/og-image.png']) {
  ok(existsSync(join(PUB, f)), `public/${f}`);
}

for (const page of ['index.html', '404.html']) {
  console.log(`\n# ${page}`);
  const html = read(`public/${page}`);
  ok(/<html lang="es-AR">/.test(html), 'lang es-AR');
  ok((html.match(/<h1\b/g) || []).length === 1, 'un único <h1>');
  ok(/<meta name="viewport"/.test(html), 'meta viewport');

  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  ok(new Set(ids).size === ids.length, `ids únicos (${ids.length})`);

  for (const a of tags(html, 'a')) {
    const href = a.href;
    if (!href) continue;
    if (href.startsWith('#')) ok(ids.includes(href.slice(1)), `ancla ${href} existe`);
    else if (/^https?:/.test(href)) {
      ok(/^https:\/\//.test(href), `externo en https: ${href}`);
      if (a.target === '_blank') ok(/noopener/.test(a.rel || ''), `rel=noopener en ${href}`);
    } else if (href.startsWith('/')) ok(existsSync(join(PUB, href === '/' ? 'index.html' : href)), `enlace local ${href}`);
  }
  for (const t of [...tags(html, 'link'), ...tags(html, 'script'), ...tags(html, 'img')]) {
    const ref = t.href ?? t.src;
    if (ref && ref.startsWith('/')) ok(existsSync(join(PUB, ref)), `recurso ${ref}`);
  }
  for (const img of tags(html, 'img')) {
    ok('alt' in img, `alt en ${img.src}`);
    if (img.width && img.height && existsSync(join(PUB, img.src))) {
      const { w, h } = pngSize(join(PUB, img.src));
      ok(Math.abs(w / h - img.width / img.height) < 0.02, `proporción width/height de ${img.src} (${img.width}x${img.height} vs real ${w}x${h})`);
    }
  }
  const labels = tags(html, 'label').map((l) => l.for);
  for (const f of [...tags(html, 'input'), ...tags(html, 'select'), ...tags(html, 'textarea')]) {
    ok(labels.includes(f.id), `campo #${f.id} con <label>`);
  }
  ok(!/style="/.test(html), 'sin estilos inline (CSP style-src self)');
  ok(!/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>/.test(html), 'sin scripts inline ejecutables (CSP)');
}

console.log('\n# SEO / metadatos');
{
  const html = read('public/index.html');
  for (const re of [/<title>[^<]*IM Soluciones[^<]*<\/title>/, /<meta name="description" content="[^"]{70,170}">/,
    /<link rel="canonical" href="https:\/\/im-soluciones\.com\/">/, /property="og:image" content="https:\/\/im-soluciones\.com\/img\/og-image\.png"/,
    /property="og:url" content="https:\/\/im-soluciones\.com\/"/, /name="twitter:card" content="summary_large_image"/]) {
    ok(re.test(html), `presente: ${re.source.slice(0, 60)}`);
  }
  const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  let parsed = null;
  try { parsed = JSON.parse(ld[1]); } catch { /* falla abajo */ }
  ok(parsed?.name === 'IM Soluciones' && parsed?.url === 'https://im-soluciones.com/', 'JSON-LD válido');
  const og = pngSize(join(PUB, 'img/og-image.png'));
  ok(og.w === 1200 && og.h === 630, `og-image 1200x630 (${og.w}x${og.h})`);
  const manifest = JSON.parse(read('public/site.webmanifest'));
  for (const i of manifest.icons) {
    const s = pngSize(join(PUB, i.src));
    ok(i.sizes === `${s.w}x${s.h}`, `manifest ${i.src} ${i.sizes}`);
  }
  ok(/Sitemap: https:\/\/im-soluciones\.com\/sitemap\.xml/.test(read('public/robots.txt')), 'robots.txt apunta al sitemap');
  ok(/<loc>https:\/\/im-soluciones\.com\/<\/loc>/.test(read('public/sitemap.xml')), 'sitemap con URL canónica');
}

console.log('\n# Contenido y configuración');
{
  const files = walk(PUB).filter((f) => ['.html', '.css', '.js', '.txt', '.xml', '.webmanifest'].includes(extname(f)));
  const leftovers = files.filter((f) => /vivir\s*plenamente|vivirplenamente|adicci[oó]n|cabalgata/i.test(readFileSync(f, 'utf8')));
  ok(leftovers.length === 0, `sin restos del template anterior ${leftovers.join(', ')}`);
  const cfg = read('public/js/config.js');
  ok(/whatsappNumber:\s*''/.test(cfg), 'whatsappNumber sin número inventado (vacío por defecto)');
  ok(/contactEmail:\s*''/.test(cfg), 'contactEmail sin email inventado (vacío por defecto)');
  const compose = read('docker-compose.yaml');
  ok(!/^\s*ports:/m.test(compose), 'docker-compose.yaml sin port binding al host');
  ok(!/container_name/.test(compose), 'docker-compose.yaml sin container_name fijo');
  const size = walk(PUB).reduce((s, f) => s + statSync(f).size, 0);
  ok(size < 600 * 1024, `peso total de public/ ${(size / 1024).toFixed(0)} KB (< 600 KB)`);
}

// ---------- HTTP ----------
if (base) {
  console.log(`\n# HTTP contra ${base}`);
  const get = async (p) => {
    const r = await fetch(base + p, { redirect: 'manual', headers: { 'accept-encoding': 'gzip' } });
    return { status: r.status, h: r.headers, body: await r.text() };
  };
  const home = await get('/');
  ok(home.status === 200, `GET / -> ${home.status}`);
  ok(home.body.includes('IM Soluciones'), 'home contiene la marca');
  ok(/default-src 'self'/.test(home.h.get('content-security-policy') || ''), 'cabecera CSP');
  ok(home.h.get('x-content-type-options') === 'nosniff', 'cabecera nosniff');
  ok(home.h.get('cache-control') === 'no-cache', `HTML no-cache (${home.h.get('cache-control')})`);
  ok(!/nginx\//.test(home.h.get('server') || ''), `server_tokens off (${home.h.get('server')})`);
  for (const p of ['/css/styles.css', '/js/main.js', '/js/config.js', '/img/logo.png', '/img/logo-mark.png', '/img/og-image.png',
    '/favicon.ico', '/apple-touch-icon.png', '/site.webmanifest', '/robots.txt', '/sitemap.xml', '/healthz']) {
    const r = await get(p);
    ok(r.status === 200, `GET ${p} -> ${r.status} ${r.h.get('content-type')} ${r.h.get('cache-control') ?? ''}`);
  }
  const css = await get('/css/styles.css');
  ok(css.h.get('content-encoding') === 'gzip', 'CSS servido con gzip');
  ok(css.h.get('x-frame-options') === 'DENY', 'cabeceras de seguridad también en assets');
  const missing = await get('/no-existe');
  ok(missing.status === 404 && missing.body.includes('Página no encontrada'), `404 personalizado -> ${missing.status}`);
  const old = await get('/estilos.css');
  ok(old.status === 404, `asset viejo /estilos.css eliminado -> ${old.status}`);
}

console.log(failures ? `\n${failures} chequeo(s) fallaron.` : '\nTodos los chequeos pasaron.');
process.exit(failures ? 1 : 0);

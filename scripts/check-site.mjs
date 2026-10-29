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
// Dimensiones intrínsecas de PNG, WebP (VP8/VP8L/VP8X) y SVG (viewBox).
const imgSize = (p) => {
  const b = readFileSync(p);
  if (b.toString('ascii', 1, 4) === 'PNG') return pngSize(p);
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (chunk === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') { const n = b.readUInt32LE(21); return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 }; }
  }
  const vb = b.toString('utf8').match(/<svg\b[^>]*viewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"/);
  if (vb) return { w: Number(vb[1]), h: Number(vb[2]) };
  return null;
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
    if (ref && ref.startsWith('/')) {
      const assetPath = ref.split(/[?#]/, 1)[0];
      ok(existsSync(join(PUB, assetPath)), `recurso ${ref}`);
    }
  }
  const stylesheet = tags(html, 'link').find((l) => l.rel === 'stylesheet' && l.href.startsWith('/css/styles.css'));
  ok(/^\/css\/styles\.css\?v=[a-f0-9]{12}$/i.test(stylesheet?.href || ''), `CSS con versionado por contenido (${stylesheet?.href ?? 'faltante'})`);
  for (const img of tags(html, 'img')) {
    ok('alt' in img, `alt en ${img.src}`);
    if (img.width && img.height && existsSync(join(PUB, img.src))) {
      const { w, h } = imgSize(join(PUB, img.src)) ?? { w: 0, h: 1 };
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
  ok(/whatsappNumber:\s*'5493415963582',/.test(cfg), "whatsappNumber exactamente '5493415963582'");
  ok(/contactEmail:\s*''/.test(cfg), 'contactEmail sin email inventado (vacío por defecto)');
  const html = read('public/index.html');
  ok(/<a class="wa-float"[^>]*data-cta="whatsapp"/.test(html), 'botón flotante de WhatsApp presente (data-cta="whatsapp")');
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
  ok(!/5493415963582|341\s*-?\s*596\s*-?\s*3582|\+54 9/.test(visible), 'el número de WhatsApp no se muestra como texto (solo CTA)');
  const compose = read('docker-compose.yaml');
  ok(!/^\s*ports:/m.test(compose), 'docker-compose.yaml sin port binding al host');
  ok(!/container_name/.test(compose), 'docker-compose.yaml sin container_name fijo');
  const size = walk(PUB).reduce((s, f) => s + statSync(f).size, 0);
  ok(size < 600 * 1024, `peso total de public/ ${(size / 1024).toFixed(0)} KB (< 600 KB)`);
}

console.log('\n# Portfolio y producto');
{
  const html = read('public/index.html');
  const section = (id) => html.match(new RegExp(`<section\\b[^>]*id="${id}"[\\s\\S]*?</section>`))?.[0] ?? '';
  const portfolio = section('portfolio');
  const servicios = section('servicios');
  const qontrol = section('qontrol');
  ok(portfolio.length > 0 && qontrol.length > 0, 'secciones #portfolio y #qontrol presentes');

  const projectTitles = [...portfolio.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
  ok(JSON.stringify(projectTitles) === JSON.stringify(['Sistema Warriors', 'Escudero Mecanizados', 'Taller Suárez Hermanos', 'Tribu Habitar', 'Parada Verde']),
    `portfolio con solo los cinco proyectos previstos (${projectTitles.join(', ')})`);
  const description = (title) => {
    const heading = `<h3>${title}</h3>`;
    const after = portfolio.slice(portfolio.indexOf(heading) + heading.length);
    const start = after.indexOf('<p>');
    const end = after.indexOf('</p>', start + 3);
    return start >= 0 && end >= 0 ? after.slice(start + 3, end) : '';
  };
  const warriorDescription = description('Sistema Warriors').toLowerCase();
  ok(['control de ingreso', 'turnos web', 'historial de consultas', 'profesionales'].every((s) => warriorDescription.includes(s)),
    'descripción funcional de Sistema Warriors');
  ok(description('Escudero Mecanizados').toLowerCase().includes('landing page'), 'descripción funcional de Escudero Mecanizados');
  ok(description('Taller Suárez Hermanos').toLowerCase().includes('landing page'), 'descripción funcional de Taller Suárez Hermanos');
  const tribuDescription = description('Tribu Habitar').toLowerCase();
  ok(tribuDescription.includes('turnero web') && tribuDescription.includes('carrito de compras'), 'descripción funcional de Tribu Habitar');
  const paradaDescription = description('Parada Verde').toLowerCase();
  ok(['stock', 'ventas presenciales', 'ventas online'].every((s) => paradaDescription.includes(s)), 'descripción funcional de Parada Verde');

  const hrefs = tags(portfolio, 'a').map((a) => a.href);
  const warriors = hrefs.filter((h) => /warriors/i.test(h));
  ok(warriors.length === 1 && warriors[0] === 'https://warriors.im-soluciones.com/',
    `un único proyecto Warriors -> https://warriors.im-soluciones.com/ (${warriors.join(', ')})`);
  ok((portfolio.match(/<article class="project-card\b/g) || []).length === 5, 'portfolio con 5 proyectos');
  for (const h of ['https://escuderosas.im-soluciones.com/', 'https://tallersuarez.im-soluciones.com/',
    'https://tribuhabitar.im-soluciones.com/', 'https://paradaverde.im-soluciones.com/']) {
    ok(hrefs.includes(h), `link intacto ${h}`);
  }

  const imgs = tags(portfolio, 'img');
  for (const [name, src] of [['Warriors', '/img/portfolio/warriors.webp'], ['Escudero', '/img/portfolio/escudero.webp'],
    ['Tribu Habitar', '/img/portfolio/tribu-habitar.webp'], ['Parada Verde', '/img/portfolio/parada-verde.svg']]) {
    const img = imgs.find((i) => i.src === src);
    ok(existsSync(join(PUB, src)), `existe public${src}`);
    ok(Boolean(img), `tarjeta de ${name} usa ${src}`);
    ok(Boolean(img) && new RegExp(`logo.*${name}`, 'i').test(img.alt || ''), `alt descriptivo para ${name} ("${img?.alt ?? ''}")`);
    ok(Boolean(img?.width && img?.height), `width/height en ${src}`);
  }
  const taller = portfolio.match(/<article class="project-card\b(?:(?!<\/article>)[\s\S])*tallersuarez(?:(?!<\/article>)[\s\S])*<\/article>/)?.[0] ?? '';
  ok(/class="[^"]*\bbrand-tsh\b/.test(taller), 'Taller Suárez Hermanos con marca tipográfica (.brand-tsh)');
  ok(/>TSH</.test(taller) && /TALLER SUÁREZ HERMANOS/.test(taller) && /MECÁNICA · TORNERÍA/.test(taller),
    'marca TSH / TALLER SUÁREZ HERMANOS / MECÁNICA · TORNERÍA');
  ok(!/<img\b/.test(taller), 'Taller Suárez Hermanos sin imagen inventada');
  const styles = read('public/css/styles.css');
  const logoRule = styles.match(/\.project-logo\s*\{([^}]*)\}/)?.[1] ?? '';
  ok(/object-fit:\s*contain/.test(logoRule), 'logos del portfolio con object-fit: contain');
  ok(/width:\s*auto/.test(logoRule) && /height:\s*auto/.test(logoRule) && /max-width:\s*100%/.test(logoRule) && /max-height:\s*190px/.test(logoRule),
    'logos del portfolio limitados por su tamaño intrínseco (sin crecer más que el preview)');

  const q = tags(qontrol, 'img').find((i) => i.src === '/img/portfolio/qontrol-wordmark.png');
  ok(Boolean(q) && existsSync(join(PUB, q.src)), 'sección Qontrol usa /img/portfolio/qontrol-wordmark.png');
  ok(Boolean(q) && /qontrol/i.test(q.alt || ''), `alt descriptivo en wordmark de Qontrol ("${q?.alt ?? ''}")`);
  ok(!/qontrol/i.test(portfolio) && !/qontrol/i.test(servicios), 'Qontrol solo como producto (no en portfolio ni servicios)');
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
  const stylesheet = tags(home.body, 'link').find((l) => l.rel === 'stylesheet' && l.href.startsWith('/css/styles.css'))?.href ?? '/css/styles.css';
  for (const p of [stylesheet, '/js/main.js', '/js/config.js', '/img/logo.png', '/img/logo-mark.png', '/img/og-image.png',
    '/favicon.ico', '/apple-touch-icon.png', '/site.webmanifest', '/robots.txt', '/sitemap.xml', '/healthz']) {
    const r = await get(p);
    ok(r.status === 200, `GET ${p} -> ${r.status} ${r.h.get('content-type')} ${r.h.get('cache-control') ?? ''}`);
  }
  const css = await get(stylesheet);
  ok(css.body.includes('max-height: 190px') && css.body.includes('object-fit: contain'), 'CSS versionado contiene el sizing actual de logos');
  ok(css.h.get('content-encoding') === 'gzip', 'CSS servido con gzip');
  ok(css.h.get('x-frame-options') === 'DENY', 'cabeceras de seguridad también en assets');
  const missing = await get('/no-existe');
  ok(missing.status === 404 && missing.body.includes('Página no encontrada'), `404 personalizado -> ${missing.status}`);
  const old = await get('/estilos.css');
  ok(old.status === 404, `asset viejo /estilos.css eliminado -> ${old.status}`);
}

console.log(failures ? `\n${failures} chequeo(s) fallaron.` : '\nTodos los chequeos pasaron.');
process.exit(failures ? 1 : 0);

# IM Soluciones — sitio institucional

Landing estática de **IM Soluciones** (dominio canónico `https://im-soluciones.com/`), servida con Nginx en Docker y pensada para desplegarse con **Dokploy** detrás de **Cloudflare Tunnel**.

Sin frameworks ni dependencias: HTML + CSS + JS plano. Node solo se usa (opcionalmente) para regenerar los assets del logo y correr los chequeos.

## Estructura

```
public/                  Todo lo que se publica (raíz del sitio)
  index.html             Landing (servicios, portfolio, Qontrol.ar, proceso, FAQ, contacto)
  404.html               Página de error
  css/styles.css         Estilos (paleta derivada del logo)
  js/config.js           ⚙️  Configuración de contacto (WhatsApp / email)
  js/main.js             Menú móvil, CTAs, formulario, animaciones
  img/                   logo.png, logo-mark.png, og-image.png (generados)
  img/portfolio/         Logos de proyectos y wordmark de Qontrol.ar (assets locales, no generados)
  favicon.ico, favicon-*.png, apple-touch-icon.png, icon-*.png (generados)
  site.webmanifest, robots.txt, sitemap.xml
brand/logo-origen.png    Logo fuente provisto (no se publica)
scripts/build-assets.mjs Genera logos recortados, favicons y OG desde el logo fuente
scripts/check-site.mjs   Chequeos estáticos y HTTP
scripts/lib/png.mjs      Códec PNG mínimo (sin dependencias)
nginx/                   Configuración de Nginx y cabeceras de seguridad
Dockerfile               nginx:stable-alpine + public/
docker-compose.yaml      Producción (Dokploy): sin puertos publicados en el host
docker-compose.local.yaml Override solo para pruebas locales (127.0.0.1:8080)
```

## Personalización

### Contacto: WhatsApp y email

Editá **`public/js/config.js`** (está documentado dentro del archivo):

```js
window.IM_CONFIG = {
  whatsappNumber: '5493415963582', // solo dígitos, formato internacional (549 + área + número)
  contactEmail: '',                // casilla que recibe las consultas (vacía por ahora)
  preferredChannel: 'whatsapp',// canal del formulario si ambos están configurados
  messages: { general: '…', emailSubject: '…' },
};
```

Comportamiento:

| Configuración            | Botones "Hablemos" / "Contanos tu proyecto" | Botón flotante WhatsApp | Formulario |
|--------------------------|----------------------------------------------|-------------------------|------------|
| Nada configurado         | Llevan a `#contacto`                         | Oculto                  | Muestra aviso, no envía |
| Solo email               | Llevan a `#contacto`                         | Oculto                  | Abre `mailto:` con los datos |
| WhatsApp válido (actual) | Abren `wa.me` con mensaje precargado         | Visible                 | Abre WhatsApp con los datos |

> Configuración actual: WhatsApp activo y email vacío. Al cargar `main.js` se habilitan los CTAs existentes y el botón flotante. El número **no se muestra como texto** en la página: solo se usa dentro de los enlaces `wa.me` (el chequeo lo verifica).

### Textos, portfolio y producto

Todo el contenido está en `public/index.html`, separado por comentarios (`<!-- SERVICIOS -->`, `<!-- PORTFOLIO -->`, `<!-- PRODUCTO PROPIO -->`, etc.).

- **Servicios** = capacidades ofrecidas.
- **Portfolio** = sitios y sistemas de proyectos realizados (Warriors, Escudero Mecanizados, Taller Suárez Hermanos, Tribu Habitar y Parada Verde). Para sumar uno, duplicá un `<article class="project-card">`. Las descripciones son deliberadamente neutrales; ampliarlas solo con información verificable.
- **Qontrol.ar**: producto propio con enlace a `https://qontrolar.im-soluciones.com/`. El texto no afirma integraciones ni hardware instalado.

#### Logos del portfolio

Cada tarjeta muestra el logo real del proyecto desde `public/img/portfolio/`, como `<img class="project-logo">` con `width`/`height` iguales a las medidas intrínsecas del archivo, `alt` descriptivo ("Logo de …") y `object-fit: contain` (escala sin recortar ni deformar en cualquier ancho). El fondo de cada preview acompaña el contraste de la marca:

| Proyecto | Asset | Fondo del preview |
|----------|-------|-------------------|
| Warriors (`https://warriors.im-soluciones.com/`) | `warriors.webp` (730×520) | Oscuro (logo blanco) |
| Escudero Mecanizados | `escudero.webp` (900×251) | Claro (logo oscuro) |
| Taller Suárez Hermanos | — | Marca tipográfica `.brand-tsh`: TSH / TALLER SUÁREZ HERMANOS / MECÁNICA · TORNERÍA, sin imagen |
| Tribu Habitar | `tribu-habitar.webp` (360×360) | Crema |
| Parada Verde | `parada-verde.svg` (64×80) | Verde claro |

La sección `#qontrol` usa `qontrol-wordmark.png` (252×72), que tiene letras claras: va siempre sobre fondo oscuro. Qontrol.ar no aparece en portfolio ni en servicios.

Si reemplazás un logo, actualizá `width`/`height` con las medidas reales del nuevo archivo (el chequeo compara la proporción en PNG, WebP y SVG).

Si cambiás el dominio, actualizá `canonical`, `og:*`, JSON-LD en `index.html`, `robots.txt` y `sitemap.xml` (y su `<lastmod>`).

### Logo, favicons e imagen para redes

Se generan desde `brand/logo-origen.png` (requiere Node ≥ 18, sin `npm install`):

```bash
node scripts/build-assets.mjs
```

Recorta el margen blanco, convierte el fondo blanco en transparencia sin alterar colores ni formas, y genera `img/logo.png` (logo completo), `img/logo-mark.png` (isotipo "IM"), `img/og-image.png` (1200×630), `favicon.ico` (16/32/48), `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png` e `icon-maskable-512.png`. Los archivos generados se versionan en `public/`, así el build de Docker no necesita Node.

Si las dimensiones del logo cambian, ajustá los `width`/`height` de los `<img>` (el chequeo te avisa si no coinciden).

## Probar en local

Cuando cambies `public/css/styles.css`, actualizá el query `?v=` de su `<link>` en `public/index.html` y `public/404.html` para que los navegadores y Cloudflare no reutilicen una hoja anterior. Usá los primeros 12 caracteres de `sha256sum public/css/styles.css`; el chequeo valida el formato y contra el CSS servido cuando recibe una URL.

```bash
sha256sum public/css/styles.css
# Reemplazá v=... en ambos HTML con los primeros 12 caracteres del hash
```

```bash
# 1) Chequeos estáticos (enlaces, anclas, alt, metadatos, sitemap, compose sin puertos…)
node scripts/check-site.mjs

# 2) Build y servidor local en http://127.0.0.1:8080
docker compose -f docker-compose.yaml -f docker-compose.local.yaml up -d --build

# 3) Chequeos HTTP contra el contenedor (status, cabeceras, gzip, 404, healthcheck)
node scripts/check-site.mjs http://127.0.0.1:8080
curl -I http://127.0.0.1:8080/

# 4) Bajar
docker compose -f docker-compose.yaml -f docker-compose.local.yaml down
```

## Deployment (Dokploy + Cloudflare Tunnel)

El contenedor web escucha **HTTP en el puerto 80 interno** y no publica puertos del host. El servicio `cloudflared` comparte la red Compose con `web`, sale a internet y conecta el hostname directamente a `http://web:80`.

1. Crear en Cloudflare un túnel remoto dedicado para `IM-Soluciones` y configurar el hostname `im-soluciones.com` hacia `http://web:80`; mantener el catch-all final en `http_status:404`.
2. Crear el DNS del apex como CNAME proxied hacia `<tunnel-id>.cfargotunnel.com`. La ruta de ingreso del túnel y el registro DNS son configuraciones distintas: verificar ambas.
3. En Dokploy crear un proyecto/servicio Compose desde este repo, rama `main`, archivo `docker-compose.yaml`.
4. Guardar el token del conector como variable secreta `CLOUDFLARED_TUNNEL_TOKEN` en el entorno del Compose de Dokploy. No agregarlo al repositorio ni imprimirlo. `cloudflared` lo lee desde `TUNNEL_TOKEN`.
5. Desplegar y verificar el estado `healthy` del conector, DNS, HTTPS y la página servida.

No hace falta agregar el dominio al router de Traefik de Dokploy: el túnel llega directo al servicio web dentro de la red Compose. `www.im-soluciones.com` queda fuera del alcance inicial hasta decidir si se quiere ese alias.

## Notas técnicas

- CSP estricta (`script-src 'self'`, `style-src 'self'`): no agregues scripts ni estilos inline; usá archivos en `css/` y `js/`.
- Contenedor `read_only` con `tmpfs` para caché/pid de Nginx y `no-new-privileges`.
- Accesibilidad: skip link, foco visible, menú con `aria-expanded`, labels en el formulario, `prefers-reduced-motion` respetado, contenido visible sin JavaScript.

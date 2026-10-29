# Sitio estático de IM Soluciones servido por Nginx.
# Los assets de marca (logo, favicons, OG) se generan con `node scripts/build-assets.mjs`
# y se versionan en public/, así la imagen no necesita Node para construirse.
FROM nginx:stable-alpine

RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx/default.conf /etc/nginx/conf.d/site.conf
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY public/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1

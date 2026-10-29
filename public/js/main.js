/* IM Soluciones — interacciones del sitio. Sin dependencias. */
(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.add('js');

  var cfg = window.IM_CONFIG || {};
  var messages = cfg.messages || {};

  // ---------- Contacto configurable ----------
  var phone = String(cfg.whatsappNumber || '').replace(/\D/g, '');
  var hasWhatsApp = /^[1-9]\d{9,14}$/.test(phone);
  var email = String(cfg.contactEmail || '').trim();
  var hasEmail = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email);

  if (cfg.whatsappNumber && !hasWhatsApp) console.warn('[IM] whatsappNumber inválido en js/config.js:', cfg.whatsappNumber);
  if (cfg.contactEmail && !hasEmail) console.warn('[IM] contactEmail inválido en js/config.js:', cfg.contactEmail);

  function waLink(text) {
    return 'https://wa.me/' + phone + (text ? '?text=' + encodeURIComponent(text) : '');
  }
  function mailLink(subject, body) {
    return 'mailto:' + email + '?subject=' + encodeURIComponent(subject || '') + '&body=' + encodeURIComponent(body || '');
  }

  document.querySelectorAll('[data-cta="whatsapp"]').forEach(function (el) {
    if (!hasWhatsApp) return; // conserva el href de respaldo (#contacto) y, si es data-cta-only, sigue oculto
    el.href = waLink(messages[el.getAttribute('data-cta-message')] || messages.general || '');
    el.target = '_blank';
    el.rel = 'noopener';
    el.hidden = false;
  });

  document.querySelectorAll('[data-cta="email"]').forEach(function (el) {
    if (!hasEmail) return;
    el.href = mailLink(messages.emailSubject, '');
    el.hidden = false;
  });

  // ---------- Formulario ----------
  var form = document.querySelector('[data-contact-form]');
  if (form) {
    var status = form.querySelector('[data-form-status]');
    var setStatus = function (text, kind) {
      status.textContent = text;
      status.dataset.kind = kind || '';
    };
    var channel = hasWhatsApp && hasEmail ? (cfg.preferredChannel === 'email' ? 'email' : 'whatsapp')
      : hasWhatsApp ? 'whatsapp' : hasEmail ? 'email' : null;
    var submit = form.querySelector('[data-submit]');
    if (channel === 'whatsapp') submit.textContent = 'Enviar por WhatsApp';
    if (channel === 'email') submit.textContent = 'Enviar por email';

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var invalid = Array.prototype.filter.call(form.elements, function (f) {
        if (!f.willValidate) return false;
        var bad = !f.checkValidity() || (f.required && !f.value.trim());
        f.setAttribute('aria-invalid', bad ? 'true' : 'false');
        return bad;
      });
      if (invalid.length) {
        setStatus('Completá tu nombre y un breve mensaje para enviar la consulta.', 'error');
        invalid[0].focus();
        return;
      }
      var d = new FormData(form);
      var lines = [
        messages.general || 'Hola IM Soluciones.',
        '',
        'Nombre: ' + d.get('nombre').trim(),
        d.get('empresa').trim() ? 'Empresa: ' + d.get('empresa').trim() : null,
        'Servicio: ' + d.get('servicio'),
        '',
        d.get('mensaje').trim(),
      ].filter(function (l) { return l !== null; }).join('\n');

      if (channel === 'whatsapp') {
        window.open(waLink(lines), '_blank', 'noopener');
        setStatus('Abrimos WhatsApp con tu consulta lista para enviar.', 'ok');
      } else if (channel === 'email') {
        window.location.href = mailLink(messages.emailSubject, lines);
        setStatus('Abrimos tu programa de correo con la consulta lista para enviar.', 'ok');
      } else {
        setStatus('El canal de contacto todavía no está disponible. Volvé a intentarlo más tarde.', 'error');
        console.warn('[IM] Configurá whatsappNumber o contactEmail en js/config.js para habilitar el formulario.');
      }
    });
  }

  // ---------- Navegación móvil ----------
  var toggle = document.querySelector('[data-nav-toggle]');
  var nav = document.querySelector('[data-nav]');
  if (toggle && nav) {
    var label = toggle.querySelector('.sr-only');
    var setOpen = function (open) {
      toggle.setAttribute('aria-expanded', String(open));
      label.textContent = open ? 'Cerrar menú' : 'Abrir menú';
      root.classList.toggle('nav-open', open);
    };
    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (ev) {
      if (ev.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && root.classList.contains('nav-open')) {
        setOpen(false);
        toggle.focus();
      }
    });
    window.matchMedia('(min-width: 900px)').addEventListener('change', function (mq) {
      if (mq.matches) setOpen(false);
    });
  }

  // ---------- Header con sombra al scrollear ----------
  var header = document.querySelector('[data-header]');
  if (header) {
    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 8); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ---------- Aparición sutil al hacer scroll ----------
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var items = document.querySelectorAll('.reveal');
  if (!reduce && 'IntersectionObserver' in window) {
    root.classList.add('reveal-ready');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  }

  // ---------- Año del footer ----------
  var year = document.querySelector('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());
})();

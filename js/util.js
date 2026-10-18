/* util.js — utilidades de interfaz compartidas por la app y el panel */
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function uuid() {
  if (self.crypto && crypto.randomUUID) return crypto.randomUUID();
  var b = new Uint8Array(16); crypto.getRandomValues(b); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}
var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
var DIAS_C = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** Hora de Colombia (UTC-5) a partir de ms */
function local(ms) {
  var d = new Date(ms - 5 * 3600000);
  return { fecha: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes(), dow: d.getUTCDay(), hh: d.getUTCHours(), mm: d.getUTCMinutes(), d: d.getUTCDate(), mes: d.getUTCMonth() };
}
function hm2min(s) { if (!s) return null; var m = String(s).match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; }
/** '07:30' -> '7:30 a. m.' */
function hora12(s) {
  var m = typeof s === 'number' ? s : hm2min(s); if (m === null) return '—';
  var h = Math.floor(m / 60), mi = m % 60, ap = h < 12 ? 'a. m.' : 'p. m.';
  return (h % 12 || 12) + ':' + ('0' + mi).slice(-2) + ' ' + ap;
}
function mayus(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }
function fechaLarga(f) { var p = f.split('-'); var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); return DIAS[d.getUTCDay()] + ' ' + (+p[2]) + ' de ' + MESES[+p[1] - 1]; }
function fechaCorta(f) { var p = f.split('-'); var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); return DIAS_C[d.getUTCDay()] + ' ' + (+p[2]); }
function dowDe(f) { var p = f.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay(); }
function sumDias(f, n) { var p = f.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)).toISOString().slice(0, 10); }
/** minutos -> '8 h 30 min' */
function duracion(min) {
  min = Math.round(min || 0); if (!min) return '0 h';
  var h = Math.floor(min / 60), m = min % 60;
  return (h ? h + ' h' : '') + (h && m ? ' ' : '') + (m ? m + ' min' : '');
}
function horasDec(min) { return (Math.round((min || 0) / 6) / 10).toString().replace('.', ','); }
function distTxt(m) { if (m === null || m === undefined || m === '') return ''; return m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(m) + ' m'; }
function distancia(lat1, lng1, lat2, lng2) {
  var r = Math.PI / 180, R = 6371000, a = Math.sin((lat2 - lat1) * r / 2), b = Math.sin((lng2 - lng1) * r / 2);
  return Math.round(2 * R * Math.asin(Math.sqrt(a * a + Math.cos(lat1 * r) * Math.cos(lat2 * r) * b * b)));
}
function iniciales(n) { return String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); }
function primerNombre(n) { return String(n || '').split(/\s+/)[0]; }

function toast(txt, tipo) {
  var t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.className = 'toast ' + (tipo || ''); t.textContent = txt; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 3800);
}
/** Hoja modal inferior */
function abrirHoja(html, opts) {
  cerrarHoja();
  var s = document.createElement('div'); s.className = 'scrim'; s.id = 'hoja';
  s.innerHTML = '<div class="hoja' + (opts && opts.ancha ? ' ancha' : '') + '" role="dialog" aria-modal="true">' + html + '</div>';
  document.body.appendChild(s);
  document.body.classList.add('con-hoja');
  s.addEventListener('click', function (e) { if (e.target === s && !(opts && opts.fija)) cerrarHoja(); });
  var f = s.querySelector('[autofocus]'); if (f) f.focus();
  return s.firstChild;
}
function cerrarHoja() {
  var s = $('#hoja'); if (s) { s.remove(); }
  document.body.classList.remove('con-hoja');
  if (self.Camara) Camara.detener();
}
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('#hoja') && !$('#hoja .hoja[data-fija]')) cerrarHoja(); });

/** Hash del PIN para desbloquear sin señal (SHA-256 con sal local, 20.000 rondas PBKDF2) */
function hashPinLocal(pin, sal) {
  var enc = new TextEncoder();
  return crypto.subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveBits']).then(function (k) {
    return crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(sal), iterations: 20000, hash: 'SHA-256' }, k, 256);
  }).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); });
}

var ICON = {
  entrar: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>',
  salir: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  pin: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  ok: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  qr: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M21 14v7h-7"/></svg>',
  cam: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  nube: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z"/></svg>',
  sinred: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M7 18a5 5 0 0 1-1.5-9.7M10.5 6.2A6 6 0 0 1 19 10a4 4 0 0 1 1.2 7.8"/></svg>',
  reloj: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  alerta: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  cambio: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3"/></svg>',
  almuerzo: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 2-3 4-3 7h3v11"/></svg>',
  descarga: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
  imprimir: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M6 14h12v7H6z"/></svg>'
};

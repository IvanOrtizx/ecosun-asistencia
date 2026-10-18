/* api.js — llamadas al servidor (Apps Script). Text/plain para evitar el preflight CORS. */
self.API = (function () {
  function ErrorRed(msg) { this.message = msg; this.red = true; }
  function post(accion, datos, opciones) {
    opciones = opciones || {};
    var cuerpo = Object.assign({}, datos || {}, { accion: accion });
    return (opciones.token !== undefined ? Promise.resolve(opciones.token) : DB.get('sesion').then(function (s) { return s ? s.token : null; }))
      .then(function (token) {
        if (token) cuerpo.token = token;
        var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, opciones.timeout || 25000);
        var envio = Date.now();
        return fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cuerpo), signal: ctrl ? ctrl.signal : undefined, redirect: 'follow' })
          .then(function (r) { clearTimeout(t); if (!r.ok) throw new ErrorRed('Servidor no disponible (' + r.status + ')'); return r.json(); },
            function () { clearTimeout(t); throw new ErrorRed('Sin conexión'); })
          .then(function (res) {
            if (res && res.ahora && self.Reloj) self.Reloj.anclar(res.ahora, envio, Date.now());
            if (!res.ok) { var e = new Error(res.error || 'Error'); e.codigo = res.codigo; throw e; }
            return res;
          });
      });
  }
  return { post: post, ErrorRed: ErrorRed };
})();

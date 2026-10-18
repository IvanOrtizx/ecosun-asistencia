/* cola.js — marcas pendientes. Primero se guardan en el celular y luego se envían.
 * Lo usan la app y el service worker (Background Sync en Android). */
self.Cola = (function () {
  var enviando = null;
  function agregar(marca, selfie) {
    return DB.poner('cola', { id: marca.id, m: marca, selfie: selfie || null, creada: Date.now(), intentos: 0 });
  }
  function pendientes() { return DB.todos('cola').then(function (l) { return l.sort(function (a, b) { return a.m.t_dispositivo - b.m.t_dispositivo; }); }); }

  /** Envía en orden. Devuelve { enviadas, quedan, error } */
  function enviar() {
    if (enviando) return enviando;
    var res = { enviadas: 0, quedan: 0, resultados: [] };
    enviando = pendientes().then(function (lista) {
      var i = 0;
      function siguiente() {
        if (i >= lista.length) return res;
        var item = lista[i++];
        item.m.t_envio = Date.now();
        return API.post('marcar', { m: item.m, selfie: item.selfie, ua: (self.navigator && navigator.userAgent || '').slice(0, 150) }, { timeout: 30000 })
          .then(function (r) {
            res.enviadas++;
            res.resultados.push(r.marca);
            return DB.poner('marcas', Object.assign({ local_id: item.id, t_dispositivo: item.m.t_dispositivo }, r.marca)).then(function () { return DB.quitar('cola', item.id); }).then(siguiente);
          }, function (e) {
            if (e.red) { res.quedan = lista.length - i + 1; res.error = 'red'; return res; }
            if (e.codigo === 'sesion') { res.quedan = lista.length - i + 1; res.error = 'sesion'; return res; }
            // Error de validación: se guarda aparte para no bloquear la cola
            item.intentos++; item.error = e.message;
            return DB.poner('marcas', { id: item.id, tipo: item.m.tipo, fecha: '', hora: '', t_dispositivo: item.m.t_dispositivo, rechazada: true, error: e.message })
              .then(function () { return DB.quitar('cola', item.id); }).then(siguiente);
          });
      }
      return siguiente();
    }).then(function (r) { enviando = null; return r; }, function (e) { enviando = null; throw e; });
    return enviando;
  }
  return { agregar: agregar, pendientes: pendientes, enviar: enviar };
})();

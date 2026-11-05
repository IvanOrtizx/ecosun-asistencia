/* db.js — IndexedDB: sesión, cola de marcas sin enviar, marcas enviadas e historial en caché.
 * Funciona en la página y en el service worker. */
self.DB = (function () {
  var NOMBRE = 'ecosun-asistencia', VERSION = 1, dbp = null;
  // Si el almacenamiento del navegador se traba o no existe (iPhone con fallas, poco espacio, modo incógnito),
  // no se espera para siempre: a los 6 s se reintenta y luego se usa un respaldo en localStorage/memoria.
  var respaldo = null;
  function intentar() {
    return new Promise(function (ok, mal) {
      var listo = false, t = setTimeout(function () { if (!listo) { listo = true; mal(new Error('timeout')); } }, 6000);
      var r;
      try { r = indexedDB.open(NOMBRE, VERSION); } catch (e) { clearTimeout(t); return mal(e); }
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('cola')) d.createObjectStore('cola', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('marcas')) d.createObjectStore('marcas', { keyPath: 'id' });
      };
      r.onsuccess = function () { if (listo) { try { r.result.close(); } catch (e) { } return; } listo = true; clearTimeout(t); ok(r.result); };
      r.onerror = function () { if (listo) return; listo = true; clearTimeout(t); mal(r.error); };
      r.onblocked = function () { /* otra pestaña vieja abierta: se espera al timeout */ };
    });
  }
  function abrir() {
    if (dbp) return dbp;
    dbp = (self.indexedDB ? intentar().catch(function () { return intentar(); }) : Promise.reject(new Error('sin indexedDB')))
      .catch(function (e) { usarRespaldo(); throw e; });
    return dbp;
  }
  function usarRespaldo() {
    if (respaldo) return respaldo;
    API_DB.memoria = true;
    var ls = null, datos = { kv: {}, cola: {}, marcas: {} };
    try { self.localStorage.setItem('_p', '1'); self.localStorage.removeItem('_p'); ls = self.localStorage; } catch (e) { }
    try { if (ls && ls.getItem('ecosun-db')) datos = JSON.parse(ls.getItem('ecosun-db')); } catch (e) { }
    var guardar = function () { try { if (ls) ls.setItem('ecosun-db', JSON.stringify(datos)); } catch (e) { } };
    var copia = function (v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); };
    respaldo = {
      get: function (k) { return copia(datos.kv[k]); },
      set: function (k, v) { datos.kv[k] = copia(v); guardar(); },
      del: function (k) { delete datos.kv[k]; guardar(); },
      poner: function (st, o) { datos[st][o.id] = copia(o); guardar(); },
      quitar: function (st, id) { delete datos[st][id]; guardar(); },
      todos: function (st) { return Object.keys(datos[st]).map(function (k) { return copia(datos[st][k]); }); },
      vaciar: function (st) { datos[st] = {}; guardar(); }
    };
    return respaldo;
  }
  function op(nombre, args, fnIdb) {
    if (respaldo) return Promise.resolve(respaldo[nombre].apply(null, args));
    return abrir().then(fnIdb, function () { return usarRespaldo()[nombre].apply(null, args); });
  }
  function tx(store, modo, fn) {
    return abrir().then(function (d) {
      return new Promise(function (ok, mal) {
        var t = d.transaction(store, modo), s = t.objectStore(store), res;
        var req = fn(s);
        if (req) req.onsuccess = function () { res = req.result; };
        t.oncomplete = function () { ok(res); };
        t.onerror = function () { mal(t.error); };
        t.onabort = function () { mal(t.error); };
      });
    });
  }
  var API_DB = {
    memoria: false,
    get: function (k) { return op('get', [k], function () { return tx('kv', 'readonly', function (s) { return s.get(k); }); }); },
    set: function (k, v) { return op('set', [k, v], function () { return tx('kv', 'readwrite', function (s) { return s.put(v, k); }); }); },
    del: function (k) { return op('del', [k], function () { return tx('kv', 'readwrite', function (s) { return s.delete(k); }); }); },
    poner: function (st, o) { return op('poner', [st, o], function () { return tx(st, 'readwrite', function (s) { return s.put(o); }); }); },
    quitar: function (st, id) { return op('quitar', [st, id], function () { return tx(st, 'readwrite', function (s) { return s.delete(id); }); }); },
    todos: function (st) { return op('todos', [st], function () { return tx(st, 'readonly', function (s) { return s.getAll(); }); }); },
    vaciar: function (st) { return op('vaciar', [st], function () { return tx(st, 'readwrite', function (s) { return s.clear(); }); }); }
  };
  return API_DB;
})();

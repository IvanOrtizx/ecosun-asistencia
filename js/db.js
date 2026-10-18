/* db.js — IndexedDB: sesión, cola de marcas sin enviar, marcas enviadas e historial en caché.
 * Funciona en la página y en el service worker. */
self.DB = (function () {
  var NOMBRE = 'ecosun-asistencia', VERSION = 1, dbp = null;
  function abrir() {
    if (dbp) return dbp;
    dbp = new Promise(function (ok, mal) {
      var r = indexedDB.open(NOMBRE, VERSION);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('cola')) d.createObjectStore('cola', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('marcas')) d.createObjectStore('marcas', { keyPath: 'id' });
      };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { mal(r.error); };
    });
    return dbp;
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
  return {
    get: function (k) { return tx('kv', 'readonly', function (s) { return s.get(k); }); },
    set: function (k, v) { return tx('kv', 'readwrite', function (s) { return s.put(v, k); }); },
    del: function (k) { return tx('kv', 'readwrite', function (s) { return s.delete(k); }); },
    poner: function (store, obj) { return tx(store, 'readwrite', function (s) { return s.put(obj); }); },
    quitar: function (store, id) { return tx(store, 'readwrite', function (s) { return s.delete(id); }); },
    todos: function (store) { return tx(store, 'readonly', function (s) { return s.getAll(); }); },
    vaciar: function (store) { return tx(store, 'readwrite', function (s) { return s.clear(); }); }
  };
})();

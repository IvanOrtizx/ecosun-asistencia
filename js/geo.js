/* geo.js — ubicación GPS. Funciona sin datos: el GPS del celular no necesita internet. */
self.Geo = (function () {
  /** Lee la ubicación hasta lograr buena precisión o agotar el tiempo. progreso(pos) se llama con cada lectura. */
  function leer(progreso, opciones) {
    opciones = opciones || {};
    var objetivo = opciones.precision || 30, limite = opciones.timeout || 20000;
    return new Promise(function (ok, mal) {
      if (!navigator.geolocation) return mal(new Error('Este celular no tiene GPS disponible en el navegador.'));
      var mejor = null, fin = false, id;
      function terminar() {
        if (fin) return; fin = true;
        navigator.geolocation.clearWatch(id); clearTimeout(t);
        if (mejor) ok(mejor); else { var er = new Error('No se pudo obtener la ubicación. Revisa que la ubicación esté encendida y sal a cielo abierto.'); er.apagado = true; mal(er); }
      }
      var t = setTimeout(terminar, limite);
      id = navigator.geolocation.watchPosition(function (p) {
        var pos = { lat: p.coords.latitude, lng: p.coords.longitude, precision: Math.round(p.coords.accuracy) };
        if (!mejor || pos.precision < mejor.precision) mejor = pos;
        if (progreso) progreso(mejor);
        if (mejor.precision <= objetivo) terminar();
      }, function (e) {
        if (e.code === 1) { fin = true; clearTimeout(t); navigator.geolocation.clearWatch(id); var er = new Error('El celular no le da permiso de ubicación a la app.'); er.permiso = true; mal(er); }
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: limite });
    });
  }
  /** Sede donde está: la que lo contiene, o la programada con su distancia */
  function ubicar(pos, sedes, programadaId) {
    var cerca = null;
    sedes.forEach(function (s) { var d = distancia(pos.lat, pos.lng, s.lat, s.lng); if (!cerca || d < cerca.dist) cerca = { sede: s, dist: d }; });
    if (cerca && cerca.dist <= cerca.sede.radio_m) return { sede: cerca.sede, dist: cerca.dist, dentro: true };
    var prog = sedes.filter(function (s) { return s.id === programadaId; })[0];
    var s = prog || (cerca && cerca.sede);
    if (!s) return { sede: null, dist: null, dentro: false };
    return { sede: s, dist: distancia(pos.lat, pos.lng, s.lat, s.lng), dentro: false };
  }
  return { leer: leer, ubicar: ubicar };
})();

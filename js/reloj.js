/* reloj.js — hora anclada al servidor.
 * Cada respuesta del servidor trae su hora. Con performance.now() (que no se puede cambiar desde Ajustes)
 * se estima la hora real aunque no haya señal. Si el reloj del celular se movió hacia atrás respecto al
 * tiempo transcurrido, la marca viaja con la hora estimada y el servidor la marca como "hora alterada". */
self.Reloj = (function () {
  var ancla = null;   // { server, perf, device }
  function perf() { return (self.performance && performance.now) ? performance.now() : null; }
  return {
    anclar: function (ahoraServidor, envio, recibido) {
      var p = perf(); if (p === null) return;
      var latencia = Math.max(0, (recibido - envio) / 2);
      ancla = { server: ahoraServidor + latencia, perf: p, device: recibido };
      if (self.DB) DB.set('ancla_reloj', { desfase: recibido - (ahoraServidor + latencia), en: recibido }).catch(function () { });
    },
    /** Hora estimada del servidor o null si no hay ancla confiable en esta sesión */
    estimada: function () {
      if (!ancla) return null;
      var dPerf = perf() - ancla.perf, dDev = Date.now() - ancla.device;
      if (dDev < dPerf - 120000) return Math.round(ancla.server + dPerf);          // el reloj se movió hacia atrás
      if (Math.abs(dDev - dPerf) <= 120000) return Math.round(ancla.server + dPerf); // consistente
      return null;                                                                // el celular durmió: no se puede estimar
    },
    /** Hora para mostrar en pantalla: estimada si existe, si no la del celular */
    ahora: function () { return this.estimada() || Date.now(); },
    tieneAncla: function () { return !!ancla; }
  };
})();

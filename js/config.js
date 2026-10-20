/* Configuración de la app. API_URL = URL /exec de la implementación de Apps Script en la cuenta de ECOSUN. */
self.CFG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbyMt-ry3GTt5I_M9JRLTd279b5BdQ_WdUBwObXuPcjNOa-d1dOrw1gDQzL-SeETf_2ukg/exec',
  VERSION: '1.0.4',
  EMPRESA: 'ECOSUN Solutions'
};
// Solo para pruebas en el computador (localhost): ?api=/api cambia el servidor. En producción no se permite,
// para que nadie pueda mandar un enlace que desvíe los PIN a otro servidor.
try {
  if (self.location && /^(localhost|127\.0\.0\.1)$/.test(self.location.hostname)) {
    var p = new URLSearchParams(self.location.search).get('api');
    if (p) self.localStorage.setItem('api_url', p);
    var guardada = self.localStorage.getItem('api_url');
    if (guardada) self.CFG.API_URL = guardada;
  }
} catch (e) { }

/* Configuración de la app. API_URL = URL /exec de la implementación de Apps Script en la cuenta de ECOSUN. */
self.CFG = {
  API_URL: 'PEGAR_AQUI_URL_DE_APPS_SCRIPT',
  VERSION: '1.0.0',
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

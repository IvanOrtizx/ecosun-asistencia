/* camara.js — cámara en vivo (getUserMedia). No existe opción de subir fotos de la galería.
 * Selfie: cámara frontal, captura y compresión a ~40 KB.
 * QR: cámara trasera + jsQR. */
self.Camara = (function () {
  var stream = null, loop = null;
  function detener() {
    if (loop) { cancelAnimationFrame(loop); loop = null; }
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
  }
  function abrir(video, frontal) {
    detener();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('Este celular no permite usar la cámara desde la app. Actualiza el navegador.'));
    return navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: frontal ? 'user' : { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then(function (s) {
        stream = s; video.srcObject = s; video.setAttribute('playsinline', ''); video.muted = true;
        return video.play().then(function () { return s; });
      }, function (e) {
        var msg = e && e.name === 'NotAllowedError' ? 'Diste "no permitir" a la cámara. Actívala en los permisos del navegador para esta página.' : 'No se pudo abrir la cámara.';
        throw new Error(msg);
      });
  }
  /** Toma la foto del video y la devuelve como dataURL JPEG reducido */
  function capturar(video, lado) {
    lado = lado || 480;
    var w = video.videoWidth, h = video.videoHeight; if (!w || !h) return null;
    var esc = lado / Math.max(w, h), cw = Math.round(w * esc), ch = Math.round(h * esc);
    var c = document.createElement('canvas'); c.width = cw; c.height = ch;
    var g = c.getContext('2d');
    g.translate(cw, 0); g.scale(-1, 1);            // espejo, como se ve en pantalla
    g.drawImage(video, 0, 0, cw, ch);
    g.setTransform(1, 0, 0, 1, 0, 0);
    // Sello de hora y lugar sobre la foto
    var sello = arguments[2];
    if (sello) {
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, ch - 26, cw, 26);
      g.fillStyle = '#fff'; g.font = '600 13px Inter, sans-serif'; g.fillText(sello, 8, ch - 9);
    }
    var q = 0.62, url = c.toDataURL('image/jpeg', q);
    while (url.length > 90000 && q > 0.3) { q -= 0.08; url = c.toDataURL('image/jpeg', q); }
    return url;
  }
  /** Escanea hasta encontrar un QR; llama a alEncontrar(texto) */
  function escanear(video, alEncontrar) {
    var c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true });
    var ultimo = 0;
    function paso(t) {
      loop = requestAnimationFrame(paso);
      if (t - ultimo < 180 || video.readyState < 2) return;
      ultimo = t;
      var w = video.videoWidth, h = video.videoHeight, k = Math.min(1, 640 / Math.max(w, h));
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      g.drawImage(video, 0, 0, c.width, c.height);
      var img = g.getImageData(0, 0, c.width, c.height);
      var r = self.jsQR ? jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' }) : null;
      if (r && r.data) { cancelAnimationFrame(loop); loop = null; alEncontrar(r.data); }
    }
    loop = requestAnimationFrame(paso);
  }
  return { abrir: abrir, capturar: capturar, escanear: escanear, detener: detener };
})();

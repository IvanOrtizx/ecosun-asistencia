/* app.js — app del empleado */
(function () {
  'use strict';
  var S = { sesion: null, disp: null, pinActual: null, tab: 'hoy', instalarEvt: null, sinRed: !navigator.onLine, sesionVencida: false, intentosPin: 0 };
  var TEXTO = { fuera_geocerca: 'Fuera del lugar', gps_impreciso: 'GPS impreciso', sin_gps: 'Sin GPS', sin_sede: 'Sin lugar', qr_invalido: 'QR inválido',
    sin_selfie: 'Sin selfie', reloj_alterado: 'Hora del celular alterada', hora_futura: 'Hora en el futuro', sync_tardio: 'Enviada con mucho retraso',
    dispositivo_distinto: 'Celular distinto', salida_sin_marcar: 'Salida sin marcar', salida_sin_entrada: 'Salida sin entrada', almuerzo_sin_marcar: 'Almuerzo sin marcar', selfie_no_guardada: 'Selfie no guardada' };
  var ES_IOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var VISTAS = ['carga', 'login', 'pin', 'consent', 'bloqueo', 'app'];

  function mostrar(v) { VISTAS.forEach(function (x) { $('#v-' + x).hidden = x !== v; }); window.scrollTo(0, 0); }
  function err(sel, msg) { var e = $(sel); e.textContent = msg || ''; e.hidden = !msg; }

  /* ---------------- Arranque ---------------- */
  async function iniciar() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () { });
      navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.tipo === 'cola') render(); });
    }
    $('#b-menu').innerHTML = ICON.menu;
    $$('.tabs button')[0].innerHTML = ICON.reloj + '<span>Hoy</span>';
    $$('.tabs button')[1].innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg><span>Mi semana</span>';
    $('#consent-txt').innerHTML = CONSENTIMIENTO.html;

    S.disp = await DB.get('dispositivo_id');
    if (!S.disp) { S.disp = uuid(); await DB.set('dispositivo_id', S.disp); }
    S.sesion = await DB.get('sesion');
    if (navigator.onLine) API.post('hora', {}, { token: null, timeout: 8000 }).catch(function () { });
    siguientePaso();
  }

  async function siguientePaso() {
    if (!S.sesion) return mostrar('login');
    if (S.sesion.debe_cambiar_pin) { if (!S.pinActual) return mostrar('login'); return mostrar('pin'); }
    if (S.sesion.consentimiento_pendiente) return mostrar('consent');
    var hasta = await DB.get('desbloqueo');
    if (hasta && hasta > Date.now() && S.pinActual !== undefined) return entrarApp();
    $('#bl-hola').textContent = 'Hola, ' + primerNombre(S.sesion.perfil.nombre);
    mostrar('bloqueo');
    setTimeout(function () { $('#bl-pin').focus(); }, 50);
  }

  async function guardarSesion(res, pin) {
    var s = Object.assign({}, res); delete s.ok; delete s.ahora;
    S.sesion = s;
    await DB.set('sesion', s);
    if (pin) {
      var sal = uuid();
      await DB.set('pin_local', { sal: sal, hash: await hashPinLocal(pin, sal), usuario: s.perfil.id });
    }
  }

  /* ---------------- Login ---------------- */
  $('#f-login').addEventListener('submit', async function (e) {
    e.preventDefault(); err('#login-err');
    var u = $('#l-usuario').value.replace(/\D/g, ''), pin = $('#l-pin').value.trim();
    if (!u || !pin) return err('#login-err', 'Escribe tu cédula y tu PIN.');
    var b = $('#b-login'); b.disabled = true; b.innerHTML = '<span class="spin"></span> Entrando…';
    try {
      var anterior = S.sesion && S.sesion.perfil.id;
      var res = await API.post('login', { usuario: u, pin: pin, dispositivo_id: S.disp, ua: navigator.userAgent.slice(0, 150) }, { token: null });
      if (res.perfil.rol === 'jefe') {
        if (!res.debe_cambiar_pin) await DB.set('sesion_panel', { token: res.token, perfil: res.perfil });
        location.href = 'panel.html'; return;
      }
      if (anterior && anterior !== res.perfil.id) {
        if ((await Cola.pendientes()).length) throw new Error('Este celular tiene marcas sin enviar de ' + S.sesion.perfil.nombre + '. Esa persona debe entrar y enviarlas primero.');
        await DB.vaciar('marcas'); await DB.del('historial');
      }
      S.pinActual = pin;
      await guardarSesion(res, pin);
      await DB.set('desbloqueo', Date.now() + 12 * 3600000);
      S.sesionVencida = false;
      $('#l-pin').value = '';
      siguientePaso();
    } catch (ex) {
      err('#login-err', ex.red ? 'No hay conexión. Para entrar la primera vez necesitas internet (datos o wifi).' : ex.message);
    } finally { b.disabled = false; b.textContent = 'Entrar'; }
  });

  /* ---------------- PIN nuevo ---------------- */
  $('#f-pin').addEventListener('submit', async function (e) {
    e.preventDefault(); err('#pin-err');
    var a = $('#p-nuevo').value.trim(), c = $('#p-conf').value.trim();
    if (!/^\d{4,6}$/.test(a)) return err('#pin-err', 'El PIN debe tener de 4 a 6 números.');
    if (a !== c) return err('#pin-err', 'Los dos PIN no coinciden.');
    try {
      var res = await API.post('cambiar_pin', { pin_actual: S.pinActual, pin_nuevo: a });
      S.pinActual = a;
      await guardarSesion(res, a);
      toast('PIN guardado', 'ok');
      siguientePaso();
    } catch (ex) { err('#pin-err', ex.red ? 'Necesitas conexión para guardar el PIN.' : ex.message); }
  });

  /* ---------------- Consentimiento ---------------- */
  $('#c-acepto').addEventListener('change', function () { $('#b-consent').disabled = !this.checked; });
  $('#b-consent').addEventListener('click', async function () {
    err('#consent-err');
    try {
      await API.post('consentir', { version: S.sesion.version_consentimiento || CONSENTIMIENTO.version });
      S.sesion.consentimiento_pendiente = false; await DB.set('sesion', S.sesion);
      siguientePaso();
    } catch (ex) { err('#consent-err', ex.red ? 'Necesitas conexión para registrar tu autorización.' : ex.message); }
  });
  $('#b-no-acepto').addEventListener('click', function () {
    abrirHoja('<h2>No aceptaste</h2><p>Sin la autorización no puedes marcar con la app. Habla con el área de Talento Humano de ECOSUN para acordar otra forma de registrar tu asistencia.</p><div class="acciones"><button class="btn" data-cerrar>Volver a leer</button></div>');
  });

  /* ---------------- Desbloqueo ---------------- */
  $('#f-bloqueo').addEventListener('submit', async function (e) {
    e.preventDefault(); err('#bl-err');
    var pin = $('#bl-pin').value.trim(), local = await DB.get('pin_local');
    if (!local) return cerrarSesion(true);
    if (await hashPinLocal(pin, local.sal) === local.hash) {
      S.intentosPin = 0; S.pinActual = pin; $('#bl-pin').value = '';
      await DB.set('desbloqueo', Date.now() + 12 * 3600000);
      return entrarApp();
    }
    S.intentosPin++;
    $('#bl-pin').value = '';
    if (S.intentosPin >= 5) { await DB.del('pin_local'); await DB.del('desbloqueo'); err('#bl-err', 'Demasiados intentos. Entra de nuevo con tu cédula y PIN (necesitas conexión).'); setTimeout(function () { mostrar('login'); }, 1800); return; }
    err('#bl-err', 'PIN incorrecto. Te quedan ' + (5 - S.intentosPin) + ' intentos.');
  });
  $('#b-otro').addEventListener('click', function () { cerrarSesion(); });

  async function cerrarSesion(forzar) {
    var pend = await Cola.pendientes();
    if (pend.length && !forzar) {
      return abrirHoja('<h2>Tienes marcas sin enviar</h2><p>Hay ' + pend.length + ' marca(s) guardadas en este celular que aún no llegan a la empresa. Envíalas antes de cerrar sesión.</p><div class="acciones"><button class="btn" data-cerrar>Entendido</button></div>');
    }
    await DB.del('sesion'); await DB.del('pin_local'); await DB.del('desbloqueo'); await DB.del('historial'); await DB.vaciar('marcas');
    S.sesion = null; S.pinActual = null; cerrarHoja(); mostrar('login');
  }

  /* ---------------- App ---------------- */
  var timer = null, sincTimer = null;
  function entrarApp() {
    mostrar('app');
    $('#hola').textContent = 'Hola, ' + primerNombre(S.sesion.perfil.nombre);
    render();
    if (!timer) timer = setInterval(tic, 1000);
    if (!sincTimer) sincTimer = setInterval(function () { sincronizar(true); }, 60000);
    sincronizar(true);
    refrescarSesion();
    limpiarViejas();
  }
  async function refrescarSesion() {
    if (!navigator.onLine) return;
    try { var r = await API.post('sesion', {}); await guardarSesion(r); S.sinRed = false; await traerMarcasHoy(); render(); }
    catch (ex) { if (ex.codigo === 'sesion') { S.sesionVencida = true; render(); } else if (ex.red) { S.sinRed = true; pintarRed(); } }
  }
  /** Trae del servidor las marcas de hoy (por si se marcó desde otro celular, desde Safari o se borraron los datos) */
  async function traerMarcasHoy() {
    try {
      var hoy = hoyL().fecha;
      var r = await API.post('mi_historial', { desde: hoy, hasta: hoy });
      var locales = {}; (await DB.todos('marcas')).forEach(function (m) { locales[m.id] = true; });
      for (var i = 0; i < r.marcas.length; i++) {
        var m = r.marcas[i];
        if (locales[m.id]) continue;
        var p = m.fecha.split('-'), h = hm2min(m.hora);
        m.t_dispositivo = Date.UTC(+p[0], +p[1] - 1, +p[2]) + h * 60000 + 5 * 3600000;
        await DB.poner('marcas', m);
      }
    } catch (e) { }
  }
  async function limpiarViejas() {
    var lim = Date.now() - 40 * 86400000;
    (await DB.todos('marcas')).forEach(function (m) { if ((m.t_dispositivo || 0) < lim) DB.quitar('marcas', m.id); });
  }

  /* Datos del día */
  function hoyL() { return local(Reloj.ahora()); }
  function horarioDe(fecha) {
    if ((S.sesion.festivos || []).indexOf(fecha) >= 0) return null;
    var dia = DIAS[dowDe(fecha)];
    return (S.sesion.horario || []).filter(function (h) { return h.dia === dia; })[0] || null;
  }
  function sedeProgramada(fecha) {
    var p = (S.sesion.programacion || []).filter(function (x) { return x.fecha === fecha; })[0];
    var id = p ? p.sede_id : S.sesion.perfil.sede_base;
    return (S.sesion.sedes || []).filter(function (s) { return s.id === id; })[0] || null;
  }
  function nombreSede(id) { var s = (S.sesion.sedes || []).filter(function (x) { return x.id === id; })[0]; return s ? s.nombre : 'Fuera de los lugares registrados'; }
  async function marcasDeHoy() {
    var hoy = hoyL().fecha;
    var env = (await DB.todos('marcas')).filter(function (m) { return (m.fecha || local(m.t_dispositivo).fecha) === hoy; })
      .map(function (m) { return { id: m.id, tipo: m.tipo, min: m.hora ? hm2min(m.hora) : local(m.t_dispositivo).min, t: m.t_dispositivo, sede_id: m.sede_id, metodo: m.metodo, textos: m.textos || [], offline: m.offline, rechazada: m.rechazada, error: m.error }; });
    var cola = (await Cola.pendientes()).map(function (c) { var t = c.m.t_estimada || c.m.t_dispositivo; return { id: c.id, tipo: c.m.tipo, t: t, min: local(t).min, fecha: local(t).fecha, sede_id: c.m.sede_id, metodo: c.m.metodo_local, pendiente: true }; })
      .filter(function (c) { return c.fecha === hoy; });
    return env.concat(cola).filter(function (m) { return !m.rechazada; }).sort(function (a, b) { return a.t - b.t; })
      .concat(env.filter(function (m) { return m.rechazada; }));
  }

  function tic() {
    if ($('#v-app').hidden) return;
    var l = hoyL(), h = l.hh % 12 || 12;
    $('#clk').textContent = h + ':' + ('0' + l.mm).slice(-2);
    $('#clk-ap').textContent = l.hh < 12 ? 'a. m.' : 'p. m.';
    if (tic.fecha !== l.fecha) { tic.fecha = l.fecha; render(); }
  }
  function pintarRed() {
    var off = S.sinRed || !navigator.onLine, r = $('#red');
    r.className = 'red ' + (off ? 'off' : 'on'); r.lastChild.textContent = off ? 'Sin señal' : 'Con señal';
  }

  async function render() {
    if (!S.sesion || $('#v-app').hidden) return;
    pintarRed();
    var l = hoyL(), hd = horarioDe(l.fecha), sede = sedeProgramada(l.fecha);
    $('#hoy-fecha').textContent = mayus(fechaLarga(l.fecha));
    tic();
    // Hoy te toca
    var festivo = (S.sesion.festivos || []).indexOf(l.fecha) >= 0;
    $('#toca').innerHTML = '<div class="pin">' + ICON.pin + '</div><div>' + (hd && sede
      ? '<b>Hoy te toca: ' + esc(sede.nombre) + '</b><span>Entrada ' + hora12(hd.entrada) + (hd.salida_almuerzo ? ' · almuerzo ' + hora12(hd.salida_almuerzo).replace(' p. m.', '') + '–' + hora12(hd.regreso_almuerzo) : '') + ' · salida ' + hora12(hd.salida) + '</span>' + (sede.direccion ? '<span>' + esc(sede.direccion) + '</span>' : '')
      : '<b>' + (festivo ? 'Hoy es festivo' : 'Hoy no tienes jornada programada') + '</b><span>Si trabajas, marca igual: queda para que tu jefe lo revise.</span>') + '</div>';
    // Instalar
    pintarInstalar();
    // Marcas
    var ms = await marcasDeHoy(), validas = ms.filter(function (m) { return !m.rechazada; });
    var ult = validas[validas.length - 1], dentro = ult && ult.tipo === 'in', ahora = l.min;
    var sa = hd && hm2min(hd.salida_almuerzo), ra = hd && hm2min(hd.regreso_almuerzo);
    var yaAlmorzo = sa !== null && sa !== undefined && validas.some(function (m) { return m.tipo === 'out' && m.min >= sa - 60 && m.min < ra + 60; });
    var est = $('#estado');
    if (!ult) { est.textContent = 'Aún no has marcado llegada'; est.style.color = 'var(--muted)'; }
    else if (dentro) { est.textContent = 'En ' + nombreSede(ult.sede_id) + ' desde las ' + hora12(ult.min); est.style.color = 'var(--ok)'; }
    else { est.textContent = 'Marcaste salida a las ' + hora12(ult.min); est.style.color = 'var(--muted)'; }
    // Botones
    var A = $('#acciones'), html = '';
    if (!dentro) {
      var volviendo = ult && sa !== null && sa !== undefined && ult.min >= sa - 60 && ult.min < ra + 60 && hd && ahora < hm2min(hd.salida);
      html = '<button class="btn prim big" data-marcar="in" data-et="' + (volviendo ? 'Regreso del almuerzo' : 'Llegada') + '">' + ICON.entrar + (volviendo ? 'Marcar regreso del almuerzo' : 'Marcar llegada') + '</button>';
    } else {
      var horaAlm = sa !== null && sa !== undefined && !yaAlmorzo && ahora >= sa - 45 && ahora < ra;
      html = '<button class="btn big sal" data-marcar="out" data-et="' + (horaAlm ? 'Salida a almorzar' : 'Salida') + '">' + (horaAlm ? ICON.almuerzo + 'Salir a almorzar' : ICON.salir + 'Marcar salida') + '</button>';
      if (horaAlm) html += '<button class="btn bloque" data-marcar="out" data-et="Salida">' + ICON.salir + 'Marcar salida del día</button>';
      else if (sa !== null && sa !== undefined && !yaAlmorzo && ahora < sa - 45) html += '<button class="btn bloque" data-marcar="out" data-et="Salida a almorzar">' + ICON.almuerzo + 'Salir a almorzar</button>';
      html += '<button class="btn bloque" data-marcar="in" data-et="Llegada (traslado)">' + ICON.cambio + 'Llegué a otro lugar (traslado)</button>';
    }
    A.innerHTML = html;
    // Pendientes
    var pend = (await Cola.pendientes()).length, P = $('#pend');
    if (S.sesionVencida) { P.hidden = false; P.innerHTML = ICON.alerta + '<span>Tu sesión venció. Entra de nuevo para enviar tus marcas.</span><button class="btn chico" id="b-reentrar">Entrar</button>'; }
    else if (pend) { P.hidden = false; P.innerHTML = ICON.reloj + '<span>' + (pend === 1 ? '1 marca guardada' : pend + ' marcas guardadas') + ' en el celular. ' + (ES_IOS ? 'Abre la app cuando tengas señal para enviarlas.' : 'Se envían solas cuando haya señal.') + '</span><button class="btn chico" id="b-enviar">Enviar</button>'; }
    else P.hidden = true;
    // Lista
    $('#hoy-lista').innerHTML = ms.length ? ms.map(function (m) {
      var tags = m.rechazada ? '<span class="tag t-bad">No se registró</span>'
        : m.pendiente ? '<span class="tag t-warn">Pendiente de enviar</span>'
        : (m.textos && m.textos.length ? m.textos.map(function (t) { return '<span class="tag t-bad">' + esc(t) + '</span>'; }).join('') : '<span class="tag t-ok">' + ICON.ok + ' Registrada</span>') + (m.offline ? '<span class="tag t-info">Enviada después</span>' : '');
      return '<div class="r"><div><b>' + (m.tipo === 'in' ? 'Llegada' : 'Salida') + ' · <span class="num">' + hora12(m.min) + '</span></b><span>' + esc(m.rechazada ? m.error : nombreSede(m.sede_id)) + (m.metodo ? ' · ' + esc(m.metodo) : '') + '</span></div><div class="tags">' + tags + '</div></div>';
    }).join('') : '<p class="vacio">Aún no has marcado hoy.</p>';
  }

  function pintarInstalar() {
    var standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    var I = $('#instalar');
    if (standalone || S.ocultarInstalar) { I.hidden = true; return; }
    if (S.instalarEvt) { I.hidden = false; I.innerHTML = '<div style="flex:1"><b>Instala la app</b><span class="small muted">Queda en tu pantalla de inicio y funciona sin señal.</span></div><button class="btn prim chico" id="b-instalar">Instalar</button>'; }
    else if (ES_IOS) { I.hidden = false; I.innerHTML = '<div style="flex:1"><b>Instala la app en tu iPhone</b><span class="small muted">En Safari toca <b>Compartir</b> y luego <b>Agregar a inicio</b>.</span></div><button class="btn chico" id="b-no-inst">Listo</button>'; }
    else I.hidden = true;
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); S.instalarEvt = e; pintarInstalar(); });

  /* ---------------- Envío ---------------- */
  async function sincronizar(silencioso) {
    var pend = await Cola.pendientes();
    if (!pend.length) return;
    try {
      var r = await Cola.enviar();
      if (r.error === 'red') { S.sinRed = true; if (!silencioso) toast('Sigues sin señal. Tus marcas siguen guardadas.'); }
      else if (r.error === 'sesion') { S.sesionVencida = true; }
      else { S.sinRed = false; }
      if (r.enviadas) {
        var malas = r.resultados.filter(function (m) { return m.banderas && m.banderas.length; });
        toast(r.enviadas === 1 ? 'Marca enviada a la empresa' : r.enviadas + ' marcas enviadas a la empresa', malas.length ? '' : 'ok');
      }
    } catch (e) { }
    render();
  }
  window.addEventListener('online', function () { S.sinRed = false; pintarRed(); sincronizar(true); refrescarSesion(); });
  window.addEventListener('offline', function () { S.sinRed = true; pintarRed(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && S.sesion && !$('#v-app').hidden) { sincronizar(true); render(); } });

  /* ---------------- Flujo de marcación ---------------- */
  async function marcar(tipo, etiqueta) {
    var l = hoyL(), prog = sedeProgramada(l.fecha), sedes = S.sesion.sedes || [];
    var F = { tipo: tipo, pos: null, ub: null, qr: null, selfie: null, t: null, te: null, metodo: null };
    var hoja = abrirHoja(
      '<h2>' + esc(etiqueta) + '</h2>' +
      '<div class="paso" id="p-gps"><div class="ic wait"><span class="spin"></span></div><div><b>Buscando tu ubicación…</b><span class="d" id="gps-d">El GPS funciona aunque no tengas datos.</span><div id="gps-ayuda"></div></div></div>' +
      '<div class="paso" id="p-ver"><div class="ic">' + ICON.cam + '</div><div><b id="ver-t">Verificación</b><span class="d" id="ver-d">Espera la ubicación.</span><div id="ver-x"></div></div></div>' +
      '<div class="paso" id="p-env"><div class="ic">' + (navigator.onLine ? ICON.nube : ICON.sinred) + '</div><div><b>' + (navigator.onLine ? 'Se envía de inmediato' : 'Se guarda en el celular') + '</b><span class="d">' + (navigator.onLine ? 'Queda registrada en el panel de la empresa.' : 'Sin datos no pasa nada: se envía con la hora de ahora cuando vuelva la señal.') + '</span></div></div>' +
      '<div id="f-aviso"></div>' +
      '<div class="acciones"><button class="btn" data-cerrar>Cancelar</button><button class="btn prim" id="b-confirmar" disabled>Registrar</button></div>', { fija: true });

    function pasoGps(ok, titulo, desc, nivel) {
      var p = $('#p-gps', hoja); p.querySelector('.ic').className = 'ic ' + (nivel || (ok ? 'ok' : 'bad'));
      p.querySelector('.ic').innerHTML = ok ? ICON.ok : ICON.alerta; p.querySelector('b').textContent = titulo; $('#gps-d', hoja).textContent = desc;
    }
    try {
      F.pos = await Geo.leer(function (pos) { if ($('#gps-d', hoja)) $('#gps-d', hoja).textContent = 'Precisión ' + pos.precision + ' m… acércate a un lugar abierto si tarda.'; }, { precision: 30, timeout: 20000 });
      if (!$('#hoja')) return;
      F.ub = Geo.ubicar(F.pos, sedes, prog && prog.id);
      if (F.ub.sede && F.ub.dentro) pasoGps(true, 'Estás en ' + F.ub.sede.nombre, 'A ' + distTxt(F.ub.dist) + ' del punto · precisión ' + F.pos.precision + ' m');
      else if (F.ub.sede) {
        pasoGps(false, 'No estás en ' + F.ub.sede.nombre, 'Estás a ' + distTxt(F.ub.dist) + ' · precisión ' + F.pos.precision + ' m');
        $('#f-aviso', hoja).innerHTML = '<p class="aviso" style="margin:12px 0 0">' + ICON.alerta + '<span>Si marcas desde aquí, la empresa verá el aviso "Fuera del lugar".</span></p>';
      } else pasoGps(false, 'No hay lugares registrados', 'Avísale a tu coordinador.');
    } catch (ex) {
      if (!$('#hoja')) return;
      F.ub = { sede: prog, dist: null, dentro: false };
      pasoGps(false, 'Sin ubicación', ex.message, 'warn');
      $('#gps-ayuda', hoja).innerHTML = '<div class="nota" style="margin:10px 0 0"><b>Cómo activarla:</b><ol style="margin:6px 0 0;padding-left:20px">' + pasosUbicacion(ex) + '</ol>' +
        '<button class="btn prim bloque" id="b-reintentar-gps" style="margin-top:10px">Ya la activé, intentar de nuevo</button></div>';
      $('#f-aviso', hoja).innerHTML = '<p class="aviso" style="margin:10px 0 0">' + ICON.alerta + '<span>Si marcas sin ubicación, la empresa verá el aviso "Sin GPS".</span></p>';
      $('#b-reintentar-gps', hoja).onclick = function () { cerrarHoja(); marcar(tipo, etiqueta); };
    }
    var sede = F.ub.sede, oficina = sede && sede.tipo === 'oficina';
    var vx = $('#ver-x', hoja), vi = $('#p-ver .ic', hoja);
    function listo(desc) { vi.className = 'ic ok'; vi.innerHTML = ICON.ok; $('#ver-d', hoja).textContent = desc; $('#b-confirmar', hoja).disabled = false; F.t = Date.now(); F.te = Reloj.estimada(); }

    if (oficina) {
      F.metodo = 'QR + GPS';
      $('#ver-t', hoja).textContent = 'Escanea el QR de la entrada';
      $('#ver-d', hoja).textContent = 'Apunta la cámara al código pegado en la oficina.';
      vi.className = 'ic wait'; vi.innerHTML = ICON.qr;
      vx.innerHTML = '<div class="visor"><video muted playsinline></video><div class="marco"></div><div class="msg">Buscando el código…</div></div>';
      var v = vx.querySelector('video');
      try {
        await Camara.abrir(v, false);
        Camara.escanear(v, function onQR(txt) {
          var partes = String(txt).split('|');
          if (partes[0] !== 'ECOSUN-ASIS' || partes.length !== 3) { vx.querySelector('.msg').textContent = 'Ese no es el código de asistencia de ECOSUN'; return setTimeout(function () { Camara.escanear(v, onQR); }, 900); }
          var sedeQR = sedes.filter(function (s) { return s.id === partes[1]; })[0];
          if (!sedeQR) { vx.querySelector('.msg').textContent = 'Código de un lugar que no existe'; return setTimeout(function () { Camara.escanear(v, onQR); }, 900); }
          F.qr = txt; F.ub.sede = sedeQR;
          if (F.pos) { F.ub.dist = distancia(F.pos.lat, F.pos.lng, sedeQR.lat, sedeQR.lng); F.ub.dentro = F.ub.dist <= sedeQR.radio_m; }
          Camara.detener();
          vx.innerHTML = '';
          listo('Código de ' + sedeQR.nombre + ' leído.');
        });
      } catch (ex) { vx.innerHTML = '<p class="error" style="margin-top:10px">' + esc(ex.message) + '</p>'; }
    } else {
      F.metodo = 'GPS + selfie';
      $('#ver-t', hoja).textContent = 'Tómate una selfie';
      $('#ver-d', hoja).textContent = 'Que se vea tu cara y, si se puede, la obra detrás.';
      vi.className = 'ic wait'; vi.innerHTML = ICON.cam;
      var abrirSelfie = async function () {
        vx.innerHTML = '<div class="visor espejo"><video muted playsinline></video><div class="ovalo"></div></div><button class="btn prim bloque" id="b-foto" style="margin-top:10px">' + ICON.cam + ' Tomar selfie</button>';
        var v2 = vx.querySelector('video');
        try {
          await Camara.abrir(v2, true);
          $('#b-foto', hoja).onclick = function () {
            var hl = hoyL();
            var sello = primerNombre(S.sesion.perfil.nombre) + ' · ' + hora12(hl.min) + ' · ' + (sede ? sede.nombre : '');
            var url = Camara.capturar(v2, 480, sello);
            if (!url) return toast('Espera a que se vea la imagen.');
            F.selfie = url; Camara.detener();
            vx.innerHTML = '<div class="visor"><img alt="Tu selfie" src="' + url + '"></div><button class="btn bloque" id="b-repetir" style="margin-top:10px">Repetir foto</button>';
            $('#b-repetir', hoja).onclick = function () { F.selfie = null; $('#b-confirmar', hoja).disabled = true; vi.className = 'ic wait'; vi.innerHTML = ICON.cam; abrirSelfie(); };
            listo('Selfie lista.');
          };
        } catch (ex) { vx.innerHTML = '<p class="error" style="margin-top:10px">' + esc(ex.message) + '</p>'; }
      };
      abrirSelfie();
    }

    $('#b-confirmar', hoja).onclick = async function () {
      this.disabled = true;
      var m = {
        id: uuid(), tipo: tipo, sede_id: F.ub.sede ? F.ub.sede.id : '', lat: F.pos ? F.pos.lat : null, lng: F.pos ? F.pos.lng : null,
        precision_m: F.pos ? F.pos.precision : null, qr: F.qr || '', t_dispositivo: F.t || Date.now(), t_estimada: F.te || null,
        dispositivo_id: S.disp, metodo_local: F.metodo
      };
      await Cola.agregar(m, F.selfie);
      if ('serviceWorker' in navigator) navigator.serviceWorker.ready.then(function (r) { if (r.sync) r.sync.register('cola').catch(function () { }); });
      cerrarHoja();
      toast(etiqueta + ' guardada · ' + hora12(local(m.t_estimada || m.t_dispositivo).min), 'ok');
      await render();
      sincronizar(true);
    };
  }

  /** Pasos para activar la ubicación según el celular y si está instalada */
  function pasosUbicacion(ex) {
    var inst = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (ES_IOS) return '<li><b>Ajustes > Privacidad y seguridad > Localización</b>: actívala.</li>' +
      '<li>En esa misma lista, entra a <b>' + (inst ? 'ECOSUN' : 'Safari') + '</b> (o "Sitios web de Safari") y elige <b>Al usar la app</b>.</li>' +
      (inst ? '' : '<li>En Safari, toca <b>aA</b> en la barra de dirección > <b>Configuración del sitio web</b> > <b>Ubicación</b> > <b>Permitir</b>.</li>') +
      '<li>Vuelve aquí y toca el botón de abajo.</li>';
    return '<li>Baja la cortina de arriba del celular y enciende la <b>Ubicación</b>.</li>' +
      (inst ? '<li>Mantén presionado el ícono de ECOSUN > <b>Información de la app</b> > <b>Permisos</b> > <b>Ubicación</b> > <b>Permitir mientras se usa la app</b>.</li>'
        : '<li>En Chrome, toca el ícono a la izquierda de la dirección (candado) > <b>Permisos</b> > <b>Ubicación</b> > <b>Permitir</b>.</li>') +
      '<li>Vuelve aquí y toca el botón de abajo.</li>';
  }

  /* ---------------- Semana ---------------- */
  async function cargarSemana() {
    var cache = await DB.get('historial');
    if (cache) pintarSemana(cache);
    try {
      var r = await API.post('mi_historial', {});
      r.actualizado = Date.now(); await DB.set('historial', r); pintarSemana(r); S.sinRed = false;
    } catch (ex) {
      if (!cache) $('#sem-dias').innerHTML = '<p class="vacio">' + (ex.red ? 'Sin señal. Conéctate para ver tu semana.' : esc(ex.message)) + '</p>';
      if (ex.codigo === 'sesion') S.sesionVencida = true;
    }
  }
  function pintarSemana(r) {
    $('#sem-rango').textContent = 'Del ' + fechaLarga(r.desde).replace(/^\w+ /, '') + ' al ' + fechaLarga(r.hasta).replace(/^\w+ /, '');
    var t = r.totales;
    $('#sem-tot').innerHTML = '<div class="tot"><b>' + horasDec(t.trabajado_min) + '</b><span>horas trabajadas</span></div><div class="tot"><b>' + horasDec(t.extra_min) + '</b><span>horas extra</span></div><div class="tot"><b>' + t.tardanzas + '</b><span>' + (t.tardanzas === 1 ? 'llegada tarde' : 'llegadas tarde') + '</span></div>';
    $('#sem-dias').innerHTML = r.dias.map(function (d) {
      var tags = [];
      if (d.estado === 'ausente') tags.push('<span class="tag t-bad">Sin marcas</span>');
      if (d.estado === 'justificado') tags.push('<span class="tag t-mute">' + esc(d.justificado) + '</span>');
      if (d.festivo) tags.push('<span class="tag t-mute">Festivo</span>');
      if (d.tarde_entrada_min) tags.push('<span class="tag t-warn">Tarde ' + d.tarde_entrada_min + ' min</span>');
      if (d.tarde_regreso_min) tags.push('<span class="tag t-warn">Almuerzo +' + d.tarde_regreso_min + ' min</span>');
      d.extras.forEach(function (x) { tags.push('<span class="tag t-info">Extra ' + duracion(x.minutos) + (x.estado === 'aprobada' ? ' ✓' : x.estado === 'rechazada' ? ' ✗' : '') + '</span>'); });
      (d.banderas || []).forEach(function (b) { tags.push('<span class="tag t-bad">' + esc(TEXTO[b] || b) + '</span>'); });
      if (!tags.length && d.trabajado_min) tags.push('<span class="tag t-ok">A tiempo</span>');
      var p = d.fecha.split('-');
      return '<div class="dia"><div class="f">' + DIAS_C[dowDe(d.fecha)] + '<small>' + (+p[2]) + ' ' + MESES[+p[1] - 1].slice(0, 3) + '</small></div><div class="h">' +
        (d.primera ? '<b class="num">' + hora12(d.primera) + '</b> → <b class="num">' + (d.ultima ? hora12(d.ultima) : (d.abierto ? 'en curso' : '—')) + '</b><br>' + duracion(d.trabajado_min) : (d.laboral ? (d.estado === 'programado' ? 'Programado' : d.estado === 'por_llegar' ? 'Por llegar' : '—') : 'No laboral')) +
        '</div><div class="x">' + tags.join('') + '</div></div>';
    }).join('');
    $('#sem-act').textContent = r.actualizado ? 'Actualizado ' + new Date(r.actualizado).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) + ' · Las horas extra solo cuentan si tu jefe las aprueba.' : '';
  }

  /* ---------------- Menú ---------------- */
  function menu() {
    var p = S.sesion.perfil;
    abrirHoja('<h2>' + esc(p.nombre) + '</h2><p class="muted" style="margin:-8px 0 16px">' + esc(p.cargo) + '</p><div class="menu-op">' +
      '<button class="btn" id="m-act">' + ICON.nube + ' Actualizar mis datos</button>' +
      '<button class="btn" id="m-pin">' + ICON.pin + ' Cambiar mi PIN</button>' +
      (S.instalarEvt ? '<button class="btn" id="m-inst">' + ICON.descarga + ' Instalar la app</button>' : '') +
      (p.rol === 'coordinador' ? '<a class="btn" href="panel.html">' + ICON.pin + ' Obras y programación</a>' : '') +
      '<button class="btn peligro" id="m-salir">' + ICON.salir + ' Cerrar sesión</button></div>' +
      '<p class="small muted" style="margin-top:18px">Versión ' + CFG.VERSION + ' · Celular ' + S.disp.slice(0, 8) + '</p>');
    $('#m-act').onclick = async function () { cerrarHoja(); await refrescarSesion(); await sincronizar(); toast(navigator.onLine ? 'Datos actualizados' : 'Sin señal: se usan los últimos datos guardados'); };
    $('#m-pin').onclick = cambiarPin;
    if ($('#m-inst')) $('#m-inst').onclick = instalar;
    $('#m-salir').onclick = function () { cerrarSesion(); };
  }
  function cambiarPin() {
    var h = abrirHoja('<h2>Cambiar PIN</h2><div class="error" id="cp-err" hidden></div><div class="campo"><label for="cp-a">PIN actual</label><input id="cp-a" class="inp pin" type="password" inputmode="numeric" maxlength="6"></div><div class="campo"><label for="cp-n">PIN nuevo</label><input id="cp-n" class="inp pin" type="password" inputmode="numeric" maxlength="6"></div><div class="acciones"><button class="btn" data-cerrar>Cancelar</button><button class="btn prim" id="cp-ok">Guardar</button></div>');
    $('#cp-ok', h).onclick = async function () {
      var a = $('#cp-a', h).value.trim(), n = $('#cp-n', h).value.trim();
      try { var r = await API.post('cambiar_pin', { pin_actual: a, pin_nuevo: n }); await guardarSesion(r, n); cerrarHoja(); toast('PIN cambiado', 'ok'); }
      catch (ex) { err('#cp-err', ex.red ? 'Necesitas conexión para cambiar el PIN.' : ex.message); }
    };
  }
  function instalar() { if (!S.instalarEvt) return; S.instalarEvt.prompt(); S.instalarEvt.userChoice.then(function () { S.instalarEvt = null; cerrarHoja(); render(); }); }

  /* ---------------- Eventos ---------------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-cerrar')) return cerrarHoja();
    if (b.dataset.marcar) return marcar(b.dataset.marcar, b.dataset.et);
    if (b.dataset.tab) {
      S.tab = b.dataset.tab;
      $$('.tabs button').forEach(function (x) { x.setAttribute('aria-selected', x === b); });
      $('#t-hoy').hidden = S.tab !== 'hoy'; $('#t-semana').hidden = S.tab !== 'semana';
      if (S.tab === 'semana') cargarSemana(); else render();
      return;
    }
    if (b.id === 'b-menu') return menu();
    if (b.id === 'b-enviar') { b.disabled = true; b.innerHTML = '<span class="spin"></span>'; return sincronizar(false); }
    if (b.id === 'b-reentrar') { mostrar('login'); $('#l-usuario').value = ''; return; }
    if (b.id === 'b-instalar') return instalar();
    if (b.id === 'b-no-inst') { S.ocultarInstalar = true; return pintarInstalar(); }
  });

  iniciar();
})();

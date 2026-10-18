/* panel.js — panel de jefes (Karen, Luis Miguel) y vista del coordinador (Diego) */
(function () {
  'use strict';
  var S = { sesion: null, pinActual: null, sec: null, base: null, cache: {} };
  var TEXTO = { fuera_geocerca: 'Fuera del lugar', gps_impreciso: 'GPS impreciso', sin_gps: 'Sin GPS', sin_sede: 'Sin lugar', qr_invalido: 'QR inválido',
    sin_selfie: 'Sin selfie', reloj_alterado: 'Hora alterada', hora_futura: 'Hora en el futuro', sync_tardio: 'Enviada con mucho retraso',
    dispositivo_distinto: 'Celular distinto', salida_sin_marcar: 'Salida sin marcar', salida_sin_entrada: 'Salida sin entrada', almuerzo_sin_marcar: 'Almuerzo sin marcar', selfie_no_guardada: 'Selfie no guardada' };
  var ORIGEN = { despues_de_salida: 'Después de la salida', almuerzo_sin_marcar: 'Almuerzo sin marcar', dia_no_laboral: 'Día no laboral', dominical_festivo: 'Domingo o festivo', programada: 'Programada', antes_de_entrada: 'Antes de la entrada' };
  var SECCIONES_JEFE = [['hoy', 'Hoy'], ['semana', 'Semana'], ['extras', 'Horas extra'], ['horas', 'Horas por obra'], ['personal', 'Personal'], ['lugares', 'Oficina y obras'], ['programacion', 'Programación'], ['nomina', 'Nómina'], ['ajustes', 'Ajustes']];
  var SECCIONES_COORD = [['programacion', 'Programación'], ['lugares', 'Obras']];
  var KEY = 'sesion_panel';

  function api(accion, datos) { return API.post(accion, datos, { token: S.sesion ? S.sesion.token : null, timeout: 60000 }); }
  function err(sel, msg) { var e = $(sel); e.textContent = msg || ''; e.hidden = !msg; }
  function mostrar(v) { ['login', 'pin', 'panel'].forEach(function (x) { $('#v-' + x).hidden = x !== v; }); }
  function jefe() { return S.sesion && S.sesion.perfil.rol === 'jefe'; }
  function P() { return $('#pagina'); }
  function cargando() { P().innerHTML = '<div class="cargando"><span class="spin"></span> Cargando…</div>'; }
  function fallo(ex) {
    if (ex.codigo === 'sesion') { return salir(); }
    P().innerHTML = '<div class="card"><p class="error" style="margin:0">' + esc(ex.red ? 'Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.' : ex.message) + '</p><button class="btn" style="margin-top:12px" data-ir="' + S.sec + '">Reintentar</button></div>';
  }
  function hoy() { return local(Reloj.ahora()).fecha; }
  function sedeNombre(id) { var s = S.base && S.base.sedes.filter(function (x) { return x.id === id; })[0]; return s ? s.nombre : (id || '—'); }
  function corto(n) { return String(n || '').replace(/^Obra\s+/i, '').replace(/^Oficina\s+/i, 'Of. '); }
  function empNombre(id) { var e = S.base && S.base.empleados.filter(function (x) { return x.id === id; })[0]; return e ? e.nombre : id; }

  /* ---------------- Sesión ---------------- */
  async function iniciar() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { });
    S.sesion = await DB.get(KEY);
    if (!S.sesion) return mostrar('login');
    entrar();
  }
  $('#f-login').addEventListener('submit', async function (e) {
    e.preventDefault(); err('#login-err');
    var u = $('#l-usuario').value.replace(/\D/g, ''), pin = $('#l-pin').value.trim();
    if (!u || !pin) return err('#login-err', 'Escribe tu usuario y PIN.');
    var b = $('#b-login'); b.disabled = true; b.innerHTML = '<span class="spin"></span> Entrando…';
    try {
      var r = await API.post('login', { usuario: u, pin: pin, ua: navigator.userAgent.slice(0, 150) }, { token: null });
      if (r.perfil.rol === 'empleado') throw new Error('Tu usuario no tiene acceso al panel. Usa la app para marcar.');
      S.pinActual = pin; await guardar(r);
      if (r.debe_cambiar_pin) return mostrar('pin');
      entrar();
    } catch (ex) { err('#login-err', ex.red ? 'Sin conexión.' : ex.message); }
    finally { b.disabled = false; b.textContent = 'Entrar'; }
  });
  $('#f-pin').addEventListener('submit', async function (e) {
    e.preventDefault(); err('#pin-err');
    var a = $('#p-nuevo').value.trim(), c = $('#p-conf').value.trim();
    if (!/^\d{4,6}$/.test(a)) return err('#pin-err', 'El PIN debe tener de 4 a 6 números.');
    if (a !== c) return err('#pin-err', 'Los dos PIN no coinciden.');
    try { var r = await api('cambiar_pin', { pin_actual: S.pinActual, pin_nuevo: a }); await guardar(r); entrar(); }
    catch (ex) { err('#pin-err', ex.message); }
  });
  async function guardar(r) { var s = { token: r.token, perfil: r.perfil }; S.sesion = s; await DB.set(KEY, s); }
  async function salir() { await DB.del(KEY); S.sesion = null; S.base = null; mostrar('login'); }
  $('#b-salir').addEventListener('click', salir);

  function entrar() {
    mostrar('panel');
    $('#quien').textContent = S.sesion.perfil.nombre;
    var secs = jefe() ? SECCIONES_JEFE : SECCIONES_COORD;
    $('#nav').innerHTML = secs.map(function (s) { return '<button data-ir="' + s[0] + '">' + s[1] + (s[0] === 'extras' ? ' <span class="cnt" id="cnt-extras" hidden></span>' : '') + '</button>'; }).join('');
    var inicial = (location.hash || '').slice(1);
    ir(secs.some(function (s) { return s[0] === inicial; }) ? inicial : secs[0][0]);
  }
  async function cargarBase(forzar) {
    if (S.base && !forzar) return S.base;
    S.base = await api('base', {});
    return S.base;
  }
  var refresco = null;
  async function ir(sec) {
    S.sec = sec; history.replaceState(null, '', '#' + sec);
    $$('#nav button').forEach(function (b) { b.setAttribute('aria-current', b.dataset.ir === sec); });
    clearInterval(refresco); refresco = null;
    cargando();
    try {
      await cargarBase();
      await VISTA[sec]();
    } catch (ex) { fallo(ex); }
  }

  /* ---------------- HOY ---------------- */
  var VISTA = {};
  VISTA.hoy = async function () {
    var r = await api('panel_hoy', {});
    S.cache.hoy = r;
    var k = r.kpis;
    contarExtras(r.extras_pendientes);
    // Los "sin marcar" se agrupan en una sola alerta para no tapar lo importante
    var aus = r.alertas.filter(function (a) { return a.tipo === 'ausente'; });
    var alertas = r.alertas.filter(function (a) { return a.tipo !== 'ausente'; });
    if (aus.length > 3) alertas.unshift({ nivel: 'ausente', tipo: 'resumen', nombre: aus.length + ' personas', texto: 'aún no marcan llegada', detalle: aus.slice(0, 6).map(function (a) { return primerNombre(a.nombre); }).join(', ') + (aus.length > 6 ? ' y ' + (aus.length - 6) + ' más' : '') + '. Ver la lista de personas.', fecha: r.fecha });
    else alertas = aus.concat(alertas);
    var ord = { presente: 0, trabajado: 1, por_llegar: 2, ausente: 3, justificado: 4, no_laboral: 5, programado: 6, sin_sistema: 7 };
    var pers = r.personas.slice().sort(function (a, b) { return (ord[a.dia.estado] - ord[b.dia.estado]) || a.nombre.localeCompare(b.nombre); });
    P().innerHTML =
      '<div class="cab"><div><h1>Hoy</h1><p>' + esc(mayus(fechaLarga(r.fecha))) + ' · ' + k.programados + ' personas programadas · ' + r.obras_activas + ' obras activas</p></div>' +
      '<div class="herr"><span class="small muted" id="act"></span><button class="btn chico" data-ir="hoy">Actualizar</button></div></div>' +
      '<div class="kpis">' +
      kpi(k.presentes, 'Marcaron llegada', 'de ' + k.programados + ' programados', 'var(--verde)') +
      kpi(k.tarde, 'Llegaron tarde', 'tolerancia incluida', 'var(--naranja)') +
      kpi(k.ausentes, 'Sin marcar', k.por_llegar ? k.por_llegar + ' aún dentro de la hora' : 'ya pasó su hora de entrada', 'var(--bad)') +
      kpi(k.en_obra, 'Ahora en obra', 'con entrada abierta', 'var(--azul)') +
      kpi(r.extras_pendientes, 'Extras por aprobar', '<button class="enlace" style="padding:0" data-ir="extras">Revisar</button>', 'var(--sol)') +
      '</div>' +
      '<div class="dos"><div class="card"><h3>Para revisar (' + alertas.length + ')</h3><div id="alertas">' +
      (alertas.length ? alertas.map(alertaHtml).join('') : '<p class="vacio">Nada pendiente. Todo en orden.</p>') + '</div></div>' +
      '<div class="card"><h3>Personas hoy</h3><div class="tbl"><table><thead><tr><th>Persona</th><th>Estado</th><th class="num">Llegada</th><th class="num">Horas</th></tr></thead><tbody>' +
      pers.map(function (p) {
        var d = p.dia, est = estadoTag(d);
        return '<tr class="clic" data-dia="' + p.id + '|' + r.fecha + '"><td class="n"><b>' + esc(p.nombre) + '</b><span>' + esc(p.lugar_actual ? 'En ' + p.lugar_actual : 'Prog.: ' + p.sede_prog_nombre) + '</span></td><td>' + est + '</td><td class="num">' + (d.primera ? hora12(d.primera) : '—') + '</td><td class="num">' + (d.trabajado_min ? horasDec(d.trabajado_min) : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div></div></div>';
    $('#act').textContent = 'Actualizado ' + hora12(local(Reloj.ahora()).min);
    refresco = setInterval(function () { if (S.sec === 'hoy' && !$('#hoja')) VISTA.hoy().catch(function () { }); }, 120000);
  };
  function kpi(v, t, s, c) { return '<div class="kpi" style="--c:' + c + '"><b>' + v + '</b><span>' + t + '</span><small>' + s + '</small></div>'; }
  function estadoTag(d) {
    var t = { presente: ['t-ok', 'En jornada'], trabajado: ['t-mute', 'Salió'], por_llegar: ['t-mute', 'Por llegar'], ausente: ['t-bad', 'Sin marcar'], justificado: ['t-info', d.justificado || 'Justificado'], no_laboral: ['t-mute', 'No laboral'], programado: ['t-mute', 'Programado'], sin_sistema: ['t-mute', '—'] }[d.estado] || ['t-mute', d.estado];
    var out = '<span class="tag ' + t[0] + '">' + esc(t[1]) + '</span>';
    if (d.tarde_entrada_min) out += ' <span class="tag t-warn">Tarde ' + d.tarde_entrada_min + ' min</span>';
    return out;
  }
  function alertaHtml(a) {
    var nivel = { grave: 'bad', ausente: 'bad', salida: 'warn', tarde: 'warn', revisar: 'wait', info: 'wait' }[a.nivel] || 'wait';
    return '<div class="alerta"><div class="ic ' + nivel + '">' + (nivel === 'bad' ? ICON.alerta : ICON.reloj) + '</div><div><b>' + esc(a.nombre) + ' · ' + esc(a.texto) + '</b><span>' + esc(a.detalle || '') + (a.fecha !== hoy() ? ' · ' + fechaCorta(a.fecha) : '') + '</span></div>' +
      (a.marca_id ? '<button class="btn chico" data-marca="' + a.marca_id + '" data-emp="' + a.empleado_id + '" data-fecha="' + a.fecha + '">Revisar</button>'
        : a.tipo === 'salida' || a.tipo === 'ausente' ? '<button class="btn chico" data-dia="' + a.empleado_id + '|' + a.fecha + '">Ver día</button>' : '') + '</div>';
  }
  function contarExtras(n) { var c = $('#cnt-extras'); if (c) { c.textContent = n; c.hidden = !n; } }

  /* Detalle de una marca: selfie, ubicación, aceptar o rechazar */
  async function verMarca(id, emp, fecha) {
    var h = abrirHoja('<h2>Revisar marca</h2><div class="cargando"><span class="spin"></span></div>', { ancha: true });
    try {
      var r = await api('marcaciones', { empleado_id: emp, desde: fecha, hasta: fecha });
      var m = r.marcas.filter(function (x) { return x.id === id; })[0];
      if (!m) throw new Error('No se encontró la marca.');
      h.innerHTML = '<h2>' + esc(m.nombre) + ' · ' + (m.tipo === 'in' ? 'llegada' : 'salida') + ' ' + hora12(m.hora) + '</h2>' +
        '<div class="grid2"><div>' + (m.tiene_selfie ? '<img class="foto" id="selfie" alt="Selfie de la marca">' : '<div class="nota">Esta marca no tiene selfie' + (m.metodo.indexOf('QR') >= 0 ? ' (se hizo con QR en oficina).' : '.') + '</div>') + '</div>' +
        '<div><div>' + (m.textos.length ? m.textos.map(function (t) { return '<span class="tag t-bad">' + esc(t) + '</span> '; }).join('') : '<span class="tag t-ok">Sin observaciones</span>') + '</div>' +
        '<dl class="det"><dt>Fecha</dt><dd>' + esc(fechaLarga(m.fecha)) + '</dd><dt>Lugar</dt><dd>' + esc(m.sede || '—') + '</dd><dt>Distancia</dt><dd>' + (m.distancia_m !== '' ? distTxt(+m.distancia_m) + ' del punto' : '—') + '</dd>' +
        '<dt>Precisión GPS</dt><dd>' + (m.precision_m ? m.precision_m + ' m' : '—') + '</dd><dt>Método</dt><dd>' + esc(m.metodo) + '</dd><dt>Envío</dt><dd>' + (m.offline ? 'Sin señal, enviada ' + duracion(m.retraso_min) + ' después' : 'Al momento') + '</dd>' +
        (m.lat ? '<dt>Mapa</dt><dd><a class="enlace" style="padding:0" target="_blank" rel="noopener" href="https://www.google.com/maps?q=' + m.lat + ',' + m.lng + '">Ver dónde marcó</a></dd>' : '') +
        (m.estado_revision && m.estado_revision !== 'pendiente' ? '<dt>Revisión</dt><dd>' + esc(m.estado_revision) + ' por ' + esc(m.revisado_por) + (m.nota_admin ? ': ' + esc(m.nota_admin) : '') + '</dd>' : '') + '</dl>' +
        '<div class="campo"><label for="rv-nota">Nota (opcional)</label><input class="inp" id="rv-nota" placeholder="Ej.: autorizado por el supervisor"></div></div></div>' +
        '<p class="small muted">Aceptar: la marca cuenta normal. Rechazar: la marca no se tiene en cuenta para horas ni asistencia.</p>' +
        '<div class="acciones"><button class="btn" data-cerrar>Cerrar</button><button class="btn peligro" id="rv-no">Rechazar</button><button class="btn prim" id="rv-si">Aceptar</button></div>';
      if (m.tiene_selfie) api('selfie', { marca_id: id }).then(function (s) { var i = $('#selfie'); if (i) i.src = s.imagen; }, function (e) { var i = $('#selfie'); if (i) i.outerHTML = '<div class="nota">' + esc(e.message) + '</div>'; });
      var decidir = async function (estado) {
        try { await api('revisar_marcacion', { id: id, estado: estado, nota: $('#rv-nota').value }); cerrarHoja(); toast(estado === 'aceptada' ? 'Marca aceptada' : 'Marca rechazada', 'ok'); ir(S.sec); }
        catch (ex) { toast(ex.message, 'bad'); }
      };
      $('#rv-si').onclick = function () { decidir('aceptada'); };
      $('#rv-no').onclick = function () { decidir('rechazada'); };
    } catch (ex) { h.innerHTML = '<h2>Revisar marca</h2><p class="error">' + esc(ex.message) + '</p><div class="acciones"><button class="btn" data-cerrar>Cerrar</button></div>'; }
  }

  /* Detalle de un día de una persona: marcas + agregar marca manual o novedad */
  async function verDia(emp, fecha) {
    var h = abrirHoja('<h2>' + esc(empNombre(emp)) + '</h2><div class="cargando"><span class="spin"></span></div>', { ancha: true });
    try {
      var r = await api('marcaciones', { empleado_id: emp, desde: fecha, hasta: fecha });
      var ms = r.marcas.slice().reverse();
      h.innerHTML = '<h2>' + esc(empNombre(emp)) + '</h2><p class="muted" style="margin:-8px 0 12px">' + esc(mayus(fechaLarga(fecha))) + '</p>' +
        '<div class="card" style="box-shadow:none"><h3>Marcas</h3>' + (ms.length ? ms.map(function (m) {
          return '<div class="alerta"><div><b>' + (m.tipo === 'in' ? 'Llegada' : 'Salida') + ' · ' + hora12(m.hora) + '</b><span>' + esc(m.sede || '—') + ' · ' + esc(m.metodo) + (m.estado_revision === 'rechazada' ? ' · RECHAZADA' : '') + '</span><div>' + m.textos.map(function (t) { return '<span class="tag t-bad">' + esc(t) + '</span> '; }).join('') + '</div></div><button class="btn chico" data-marca="' + m.id + '" data-emp="' + emp + '" data-fecha="' + fecha + '">Ver</button></div>';
        }).join('') : '<p class="vacio">No hay marcas este día.</p>') + '</div>' +
        '<h3 class="tit" style="margin-top:18px">Registrar novedad</h3>' +
        '<div class="grid2"><div class="campo"><label for="nv-tipo">Tipo</label><select class="inp" id="nv-tipo"><option value="marca">Marca manual (olvidó marcar)</option><option value="permiso">Permiso</option><option value="incapacidad">Incapacidad</option><option value="vacaciones">Vacaciones</option><option value="licencia">Licencia</option><option value="ausencia_justificada">Ausencia justificada</option></select></div>' +
        '<div class="campo" id="nv-mt"><label for="nv-marca">Marca</label><select class="inp" id="nv-marca"><option value="out">Salida</option><option value="in">Llegada</option></select></div>' +
        '<div class="campo" id="nv-hr"><label for="nv-hora">Hora</label><input class="inp" type="time" id="nv-hora" value="18:00"></div>' +
        '<div class="campo" id="nv-hs" hidden><label for="nv-hasta">Hasta (incluido)</label><input class="inp" type="date" id="nv-hasta" value="' + fecha + '"></div></div>' +
        '<div class="campo"><label for="nv-motivo">Motivo</label><input class="inp" id="nv-motivo" placeholder="Ej.: olvidó marcar la salida, confirmado por el supervisor"></div>' +
        '<div class="acciones"><button class="btn" data-cerrar>Cerrar</button><button class="btn prim" id="nv-ok">Guardar novedad</button></div>';
      $('#nv-tipo').onchange = function () { var m = this.value === 'marca'; $('#nv-mt').hidden = !m; $('#nv-hr').hidden = !m; $('#nv-hs').hidden = m; };
      $('#nv-ok').onclick = async function () {
        var t = $('#nv-tipo').value;
        try {
          await api('crear_novedad', { empleado_id: emp, fecha: fecha, tipo: t, marca_tipo: $('#nv-marca').value, hora: $('#nv-hora').value, hasta: t === 'marca' ? '' : $('#nv-hasta').value, motivo: $('#nv-motivo').value.trim() });
          cerrarHoja(); toast('Novedad guardada', 'ok'); ir(S.sec);
        } catch (ex) { toast(ex.message, 'bad'); }
      };
    } catch (ex) { h.innerHTML = '<p class="error">' + esc(ex.message) + '</p><div class="acciones"><button class="btn" data-cerrar>Cerrar</button></div>'; }
  }

  /* ---------------- SEMANA ---------------- */
  VISTA.semana = async function (desde) {
    var r = await api('semana', { desde: desde || S.semDesde || hoy() });
    S.semDesde = r.desde;
    var grupos = {}; r.filas.forEach(function (f) { (grupos[f.grupo || 'Otros'] = grupos[f.grupo || 'Otros'] || []).push(f); });
    var filas = Object.keys(grupos).map(function (g) {
      return '<tr><th colspan="' + (r.fechas.length + 2) + '" style="padding-top:16px;color:var(--ink)">' + esc(g) + '</th></tr>' + grupos[g].map(function (f) {
        return '<tr><td class="n"><b>' + esc(f.nombre) + '</b><span>' + esc(f.cargo) + '</span></td>' + f.dias.map(function (d, i) {
          var cls = 'c' + (r.fechas[i] === r.hoy ? ' hoy' : '');
          if (!d.primera) {
            var t = d.estado === 'ausente' ? '<span class="tag t-bad">Sin marcas</span>' : d.estado === 'justificado' ? '<span class="tag t-info">' + esc(d.justificado) + '</span>' : d.estado === 'por_llegar' ? '<span class="tag t-mute">Por llegar</span>' : '<span class="muted small">' + (d.laboral ? '' : '—') + '</span>';
            return '<td class="' + cls + '" data-dia="' + f.id + '|' + d.fecha + '">' + t + (d.laboral && d.sede_prog ? '<span class="pl">' + esc(corto(sedeNombre(d.sede_prog))) + '</span>' : '') + '</td>';
          }
          var lugares = Object.keys(d.por_sede).map(function (s) { return corto(sedeNombre(s)); }).join(' → ');
          var tags = [];
          if (d.tarde_min) tags.push('<span class="tag t-warn">Tarde ' + d.tarde_min + '′</span>');
          if (d.extra_min) tags.push('<span class="tag t-info">Extra ' + horasDec(d.extra_min) + ' h</span>');
          (d.banderas || []).forEach(function (b) { tags.push('<span class="tag t-bad">' + esc(TEXTO[b] || b) + '</span>'); });
          if (!tags.length) tags.push('<span class="tag t-ok">Bien</span>');
          return '<td class="' + cls + '" data-dia="' + f.id + '|' + d.fecha + '"><span class="tm">' + hora12(d.primera) + '</span><span class="pl">' + esc(lugares) + (d.ultima ? ' · sale ' + hora12(d.ultima) : d.abierto ? ' · en curso' : '') + '</span><div class="tags">' + tags.join('') + '</div></td>';
        }).join('') + '<td class="num"><b>' + horasDec(f.totales.trabajado_min) + ' h</b><br><span class="small muted">' + (f.totales.extra_min ? '+' + horasDec(f.totales.extra_min) + ' extra' : '') + '</span></td></tr>';
      }).join('');
    }).join('');
    P().innerHTML = '<div class="cab"><div><h1>Semana</h1><p>Del ' + esc(fechaLarga(r.desde)) + ' al ' + esc(fechaLarga(r.hasta)) + '</p></div><div class="herr">' +
      '<button class="btn chico" data-sem="' + sumDias(r.desde, -7) + '">← Anterior</button><button class="btn chico" data-sem="' + hoy() + '">Esta semana</button><button class="btn chico" data-sem="' + sumDias(r.desde, 7) + '">Siguiente →</button></div></div>' +
      '<div class="card"><div class="tbl"><table class="semana"><thead><tr><th>Persona</th>' + r.fechas.map(function (f) { return '<th class="' + (f === r.hoy ? 'hoy' : '') + '">' + fechaCorta(f) + '</th>'; }).join('') + '<th class="num">Total</th></tr></thead><tbody>' + filas + '</tbody></table></div>' +
      '<p class="small muted" style="margin:12px 0 0">Toca una casilla para ver las marcas del día o registrar una novedad (salida olvidada, permiso, incapacidad).</p></div>';
  };

  /* ---------------- EXTRAS ---------------- */
  VISTA.extras = async function () {
    var estado = S.extrasEstado || 'pendiente';
    var r = await api('extras', { estado: estado });
    if (estado === 'pendiente') contarExtras(r.extras.length);
    var tot = r.extras.reduce(function (a, x) { return a + x.minutos; }, 0);
    P().innerHTML = '<div class="cab"><div><h1>Horas extra</h1><p>Solo las aprobadas pasan al Excel de nómina. Nocturna desde las 7:00 p. m.</p></div><div class="herr filtros">' +
      '<select class="inp" id="ex-estado">' + [['pendiente', 'Por aprobar'], ['aprobada', 'Aprobadas'], ['rechazada', 'Rechazadas'], ['todas', 'Todas']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === estado ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="card">' + (r.extras.length ? '<div class="tbl"><table><thead><tr>' + (estado === 'pendiente' ? '<th><input type="checkbox" class="chk" id="ex-todas" aria-label="Seleccionar todas"></th>' : '') + '<th>Persona</th><th>Fecha</th><th>Horario</th><th class="num">Total</th><th class="num">Diurna</th><th class="num">Nocturna</th><th>Motivo</th><th>Estado</th></tr></thead><tbody>' +
        r.extras.map(function (x) {
          return '<tr>' + (estado === 'pendiente' ? '<td><input type="checkbox" class="chk ex-sel" value="' + esc(x.id) + '" aria-label="Seleccionar"></td>' : '') + '<td class="n"><b>' + esc(x.nombre) + '</b></td><td>' + mayus(fechaCorta(x.fecha)) + (x.dominical_festivo ? ' <span class="tag t-info">Dom/fest</span>' : '') + '</td><td class="num">' + hora12(x.inicio) + ' – ' + hora12(x.fin) + '</td><td class="num"><b>' + duracion(x.minutos) + '</b></td><td class="num">' + duracion(x.diurna_min) + '</td><td class="num">' + duracion(x.nocturna_min) + '</td><td>' + esc(ORIGEN[x.origen] || x.origen) + '</td><td>' + ({ pendiente: '<span class="tag t-warn">Por aprobar</span>', aprobada: '<span class="tag t-ok">Aprobada</span>', rechazada: '<span class="tag t-bad">Rechazada</span>', obsoleta: '<span class="tag t-mute">Ya no aplica</span>' }[x.estado] || x.estado) + (x.decidido_por ? '<br><span class="small muted">' + esc(x.decidido_por) + '</span>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div><p class="small muted" style="margin:12px 0 0">' + r.extras.length + ' registros · ' + duracion(tot) + ' en total. "Almuerzo sin marcar" significa que la persona no marcó la salida al almuerzo.</p>'
        : '<p class="vacio">No hay horas extra en este estado.</p>') + '</div>' +
      (estado === 'pendiente' && r.extras.length ? '<div class="barra-acc" id="ex-barra" hidden><span id="ex-n"></span><span class="esp"></span><button class="btn chico peligro" style="background:#fff" id="ex-rech">Rechazar</button><button class="btn chico prim" id="ex-apr">Aprobar</button></div>' : '');
    $('#ex-estado').onchange = function () { S.extrasEstado = this.value; ir('extras'); };
    if (estado !== 'pendiente' || !r.extras.length) return;
    var sel = function () { return $$('.ex-sel').filter(function (c) { return c.checked; }).map(function (c) { return c.value; }); };
    var upd = function () { var n = sel().length; $('#ex-barra').hidden = !n; $('#ex-n').textContent = n + ' seleccionada' + (n === 1 ? '' : 's'); };
    $('#ex-todas').onchange = function () { var v = this.checked; $$('.ex-sel').forEach(function (c) { c.checked = v; }); upd(); };
    $$('.ex-sel').forEach(function (c) { c.onchange = upd; });
    var decidir = async function (estado) {
      var ids = sel(); if (!ids.length) return;
      var nota = estado === 'rechazada' ? prompt('Motivo del rechazo (opcional):') : '';
      if (nota === null) return;
      try { var x = await api('decidir_extras', { ids: ids, estado: estado, nota: nota || '' }); toast(x.actualizadas + (estado === 'aprobada' ? ' aprobadas' : ' rechazadas'), 'ok'); ir('extras'); }
      catch (ex) { toast(ex.message, 'bad'); }
    };
    $('#ex-apr').onclick = function () { decidir('aprobada'); };
    $('#ex-rech').onclick = function () { decidir('rechazada'); };
  };

  /* ---------------- HORAS POR OBRA ---------------- */
  VISTA.horas = async function () {
    var h0 = hoy(), desde = S.hDesde || h0.slice(0, 8) + '01', hasta = S.hHasta || h0;
    var r = await api('horas', { desde: desde, hasta: hasta });
    var mx = Math.max.apply(null, r.por_sede.map(function (s) { return s.minutos; }).concat([1]));
    P().innerHTML = '<div class="cab"><div><h1>Horas por obra</h1><p>Cuánta mano de obra se fue a cada lugar.</p></div><div class="herr filtros">' +
      '<label class="sr" for="h-d">Desde</label><input type="date" class="inp" id="h-d" value="' + desde + '"><span class="muted">a</span><label class="sr" for="h-h">Hasta</label><input type="date" class="inp" id="h-h" value="' + hasta + '"><button class="btn chico" id="h-ok">Ver</button></div></div>' +
      '<div class="card"><h3>Por lugar</h3><div class="barras">' + (r.por_sede.length ? r.por_sede.map(function (s) {
        return '<div class="barra-h"><div class="l"><span>' + esc(s.nombre) + '</span><span class="num"><b>' + horasDec(s.minutos) + ' h</b></span></div><div class="tr"><div class="fi" style="width:' + (s.minutos / mx * 100) + '%"></div></div></div>';
      }).join('') : '<p class="vacio">Sin horas en este periodo.</p>') + '</div></div>' +
      '<div class="card"><h3>Por persona</h3><div class="tbl"><table><thead><tr><th>Persona</th><th class="num">Días</th><th class="num">Horas</th><th class="num">Ordinarias</th><th class="num">Tardanzas</th><th class="num">Extra diurna</th><th class="num">Extra nocturna</th><th class="num">Extra dom/fest</th><th class="num">Por aprobar</th><th class="num">Ausencias</th></tr></thead><tbody>' +
      r.por_empleado.map(function (e) {
        var a = e.extras.aprobada;
        return '<tr><td class="n"><b>' + esc(e.nombre) + '</b><span>' + esc(e.cargo) + '</span></td><td class="num">' + e.dias_trabajados + '</td><td class="num"><b>' + horasDec(e.trabajado_min) + '</b></td><td class="num">' + horasDec(e.ordinario_min) + '</td><td class="num">' + (e.tardanzas ? e.tardanzas + ' (' + e.tarde_min + ' min)' : '0') + '</td><td class="num">' + horasDec(a.ed) + '</td><td class="num">' + horasDec(a.en) + '</td><td class="num">' + horasDec(a.edf + a.enf) + '</td><td class="num">' + (e.extras.pendiente ? '<span class="tag t-warn">' + horasDec(e.extras.pendiente) + ' h</span>' : '0') + '</td><td class="num">' + (e.ausencias ? '<span class="tag t-bad">' + e.ausencias + '</span>' : '0') + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="small muted" style="margin:12px 0 0">Horas en decimales (7,5 = 7 h 30 min). Las extras de estas columnas son solo las aprobadas.</p></div>';
    $('#h-ok').onclick = function () { S.hDesde = $('#h-d').value; S.hHasta = $('#h-h').value; ir('horas'); };
  };

  /* ---------------- PERSONAL ---------------- */
  VISTA.personal = async function () {
    var b = await cargarBase(true);
    var tipos = { oficina: 'Oficina', obra: 'Obra', ambos: 'Oficina y obra', ninguno: 'No marca' };
    P().innerHTML = '<div class="cab"><div><h1>Personal</h1><p>' + b.empleados.filter(function (e) { return e.activo && e.tipo !== 'ninguno'; }).length + ' personas activas que marcan.</p></div><div class="herr"><button class="btn prim chico" id="emp-nuevo">+ Nueva persona</button></div></div>' +
      '<div class="card"><div class="tbl"><table><thead><tr><th>Persona</th><th>Cédula</th><th>Marca en</th><th>Lugar base</th><th>Horario</th><th>Acceso</th><th>Celular</th><th>Autorización</th></tr></thead><tbody>' +
      b.empleados.slice().sort(function (x, y) { return (y.activo - x.activo) || x.nombre.localeCompare(y.nombre); }).map(function (e) {
        return '<tr class="clic" data-emp="' + e.id + '"' + (e.activo ? '' : ' style="opacity:.5"') + '><td class="n"><b>' + esc(e.nombre) + '</b><span>' + esc(e.cargo) + (e.rol !== 'empleado' ? ' · ' + esc(e.rol) : '') + (e.piloto ? ' · piloto' : '') + '</span></td><td class="num">' + esc(e.cedula || e.telefono) + '</td><td>' + esc(tipos[e.tipo] || e.tipo) + '</td><td>' + esc(e.sede_base ? sedeNombre(e.sede_base) : '—') + '</td><td>' + esc(e.horario_id || '—') + '</td><td>' + (e.pin_temporal ? '<span class="tag t-warn">PIN temporal</span>' : '<span class="tag t-ok">Activo</span>') + '</td><td>' + (e.tiene_dispositivo ? '<span class="tag t-ok">Registrado</span>' : '<span class="tag t-mute">Aún no</span>') + '</td><td>' + (e.tipo === 'ninguno' ? '—' : e.consentimiento ? '<span class="tag t-ok">' + esc(e.consentimiento) + '</span>' : '<span class="tag t-mute">Pendiente</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    $('#emp-nuevo').onclick = function () { editarEmpleado(null); };
  };
  function editarEmpleado(id) {
    var b = S.base, e = id ? b.empleados.filter(function (x) { return x.id === id; })[0] : { activo: true, tipo: 'obra', rol: 'empleado', horario_id: 'H1', grupo: 'Neiva' };
    var horarios = Array.from(new Set(b.horarios.map(function (h) { return h.horario_id; })));
    var opt = function (lista, v) { return lista.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join(''); };
    var h = abrirHoja('<h2>' + (id ? esc(e.nombre) : 'Nueva persona') + '</h2><div class="error" id="em-err" hidden></div><div class="grid2">' +
      '<div class="campo"><label for="em-nombre">Nombre completo</label><input class="inp" id="em-nombre" value="' + esc(e.nombre || '') + '"></div>' +
      '<div class="campo"><label for="em-cargo">Cargo</label><input class="inp" id="em-cargo" value="' + esc(e.cargo || '') + '"></div>' +
      '<div class="campo"><label for="em-ced">Cédula</label><input class="inp" id="em-ced" inputmode="numeric" value="' + esc(e.cedula || '') + '"></div>' +
      '<div class="campo"><label for="em-tel">Celular (opcional)</label><input class="inp" id="em-tel" inputmode="numeric" value="' + esc(e.telefono || '') + '"></div>' +
      '<div class="campo"><label for="em-tipo">Dónde marca</label><select class="inp" id="em-tipo">' + opt([['oficina', 'Oficina (QR)'], ['obra', 'Obra (GPS + selfie)'], ['ambos', 'Oficina y obra'], ['ninguno', 'No marca (solo panel)']], e.tipo) + '</select></div>' +
      '<div class="campo"><label for="em-sede">Lugar base</label><select class="inp" id="em-sede"><option value="">—</option>' + opt(b.sedes.filter(function (s) { return s.activa; }).map(function (s) { return [s.id, s.nombre]; }), e.sede_base) + '</select></div>' +
      '<div class="campo"><label for="em-hor">Horario</label><select class="inp" id="em-hor"><option value="">—</option>' + opt(horarios.map(function (x) { var n = b.horarios.filter(function (h) { return h.horario_id === x; })[0]; return [x, x + ' · ' + n.nombre]; }), e.horario_id) + '</select></div>' +
      '<div class="campo"><label for="em-grupo">Grupo</label><input class="inp" id="em-grupo" value="' + esc(e.grupo || '') + '" placeholder="Neiva, Unimagdalena…"></div>' +
      '<div class="campo"><label for="em-rol">Acceso</label><select class="inp" id="em-rol">' + opt([['empleado', 'Empleado (solo marca)'], ['coordinador', 'Coordinador (obras y programación)'], ['jefe', 'Jefe (todo el panel)']], e.rol) + '</select></div>' +
      '<div class="campo"><label for="em-act">Estado</label><select class="inp" id="em-act">' + opt([['1', 'Activo'], ['0', 'Retirado']], e.activo ? '1' : '0') + '</select></div></div>' +
      (id ? '<div class="menu-op" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn chico" id="em-pin">Restablecer PIN</button><button class="btn chico" id="em-cel">Liberar celular</button><button class="btn chico" id="em-nov">Registrar novedad</button></div><p class="small muted">Restablecer PIN: vuelve a los últimos 4 números de su cédula. Liberar celular: úsalo si cambió de teléfono.</p>' : '<p class="small muted">PIN inicial: últimos 4 números de la cédula (o del celular si no tiene cédula).</p>') +
      '<div class="acciones"><button class="btn" data-cerrar>Cancelar</button><button class="btn prim" id="em-ok">Guardar</button></div>', { ancha: true });
    $('#em-ok', h).onclick = async function () {
      try {
        var r = await api('guardar_empleado', { empleado: { id: id || '', nombre: $('#em-nombre').value.trim(), cargo: $('#em-cargo').value.trim(), cedula: $('#em-ced').value, telefono: $('#em-tel').value, tipo: $('#em-tipo').value, sede_base: $('#em-sede').value, horario_id: $('#em-hor').value, grupo: $('#em-grupo').value.trim(), rol: $('#em-rol').value, activo: $('#em-act').value === '1', piloto: e.piloto } });
        cerrarHoja(); toast(id ? 'Cambios guardados' : 'Persona creada. ' + (r.pin_temporal || ''), 'ok'); ir('personal');
      } catch (ex) { err('#em-err', ex.message); }
    };
    if (id) {
      $('#em-pin', h).onclick = async function () { if (!confirm('¿Restablecer el PIN de ' + e.nombre + '?')) return; try { await api('reset_pin', { empleado_id: id }); toast('PIN restablecido a los últimos 4 números de la cédula', 'ok'); } catch (ex) { toast(ex.message, 'bad'); } };
      $('#em-cel', h).onclick = async function () { try { await api('reset_dispositivo', { empleado_id: id }); toast('Listo: el próximo celular con el que entre queda como el suyo', 'ok'); } catch (ex) { toast(ex.message, 'bad'); } };
      $('#em-nov', h).onclick = function () { verDia(id, hoy()); };
    }
  }

  /* ---------------- LUGARES ---------------- */
  VISTA.lugares = async function () {
    var b = await cargarBase(true);
    var lista = b.sedes.filter(function (s) { return jefe() || s.tipo === 'obra'; }).sort(function (x, y) { return (y.activa - x.activa) || (x.tipo === 'oficina' ? -1 : 1); });
    P().innerHTML = '<div class="cab"><div><h1>' + (jefe() ? 'Oficina y obras' : 'Obras') + '</h1><p>Cada lugar tiene un punto y un radio: quien marque fuera del círculo queda señalado.</p></div><div class="herr"><button class="btn prim chico" id="lg-nuevo">+ Nueva obra</button></div></div>' +
      '<div class="card">' + lista.map(function (s) {
        return '<div class="lugar"' + (s.activa ? '' : ' style="opacity:.55"') + '><div><b>' + esc(s.nombre) + (s.activa ? '' : ' · cerrada') + '</b><span>' + (s.tipo === 'oficina' ? 'Oficina · marca con QR + GPS' : 'Obra · marca con GPS + selfie') + ' · radio ' + s.radio_m + ' m' + (s.direccion ? ' · ' + esc(s.direccion) : '') + '</span></div><div class="acc">' +
          '<a class="btn chico" target="_blank" rel="noopener" href="https://www.google.com/maps?q=' + s.lat + ',' + s.lng + '">Mapa</a>' +
          (s.tipo === 'oficina' && jefe() ? '<button class="btn chico" data-qr="' + s.id + '">' + ICON.qr + ' QR</button>' : '') +
          '<button class="btn chico" data-lugar="' + s.id + '">Editar</button></div></div>';
      }).join('') + '</div>';
    $('#lg-nuevo').onclick = function () { editarLugar(null); };
  };
  function editarLugar(id) {
    var s = id ? S.base.sedes.filter(function (x) { return x.id === id; })[0] : { tipo: 'obra', radio_m: 150, activa: true };
    var h = abrirHoja('<h2>' + (id ? esc(s.nombre) : 'Nueva obra') + '</h2><div class="error" id="lg-err" hidden></div>' +
      '<div class="campo"><label for="lg-nombre">Nombre</label><input class="inp" id="lg-nombre" value="' + esc(s.nombre || '') + '" placeholder="Obra Villa Café"></div>' +
      (jefe() ? '<div class="campo"><label for="lg-tipo">Tipo</label><select class="inp" id="lg-tipo"><option value="obra"' + (s.tipo === 'obra' ? ' selected' : '') + '>Obra (GPS + selfie)</option><option value="oficina"' + (s.tipo === 'oficina' ? ' selected' : '') + '>Oficina (QR + GPS)</option></select></div>' : '') +
      '<div class="campo"><label for="lg-dir">Dirección o referencia</label><input class="inp" id="lg-dir" value="' + esc(s.direccion || '') + '"></div>' +
      '<div class="campo"><label for="lg-coord">Ubicación (latitud, longitud)</label><input class="inp" id="lg-coord" value="' + (s.lat ? s.lat + ', ' + s.lng : '') + '" placeholder="2.945408, -75.290811">' +
      '<span class="ayuda">En Google Maps deja el dedo sobre el punto y copia los números que aparecen arriba. O si estás en la obra, usa el botón.</span>' +
      '<button class="btn chico" id="lg-aqui" style="align-self:flex-start;margin-top:4px">' + ICON.pin + ' Usar mi ubicación actual</button></div>' +
      '<div class="campo"><label for="lg-radio">Radio permitido: <span id="lg-rv">' + s.radio_m + '</span> m</label><input type="range" id="lg-radio" min="30" max="800" step="10" value="' + s.radio_m + '" style="accent-color:var(--naranja)"><span class="ayuda">Que cubra toda la obra más un margen para el error del GPS (unos 30 m).</span></div>' +
      (id ? '<div class="campo"><label for="lg-act">Estado</label><select class="inp" id="lg-act"><option value="1"' + (s.activa ? ' selected' : '') + '>Activa</option><option value="0"' + (s.activa ? '' : ' selected') + '>Cerrada (ya terminó)</option></select></div>' : '') +
      '<div class="acciones"><button class="btn" data-cerrar>Cancelar</button><button class="btn prim" id="lg-ok">Guardar</button></div>');
    $('#lg-radio', h).oninput = function () { $('#lg-rv').textContent = this.value; };
    $('#lg-aqui', h).onclick = function () {
      var bt = this; bt.disabled = true; bt.innerHTML = '<span class="spin"></span> Buscando…';
      navigator.geolocation.getCurrentPosition(function (p) { $('#lg-coord').value = p.coords.latitude.toFixed(6) + ', ' + p.coords.longitude.toFixed(6); bt.disabled = false; bt.innerHTML = ICON.ok + ' Ubicación tomada (±' + Math.round(p.coords.accuracy) + ' m)'; },
        function () { bt.disabled = false; bt.textContent = 'No se pudo: revisa el permiso de ubicación'; }, { enableHighAccuracy: true, timeout: 20000 });
    };
    $('#lg-ok', h).onclick = async function () {
      var c = $('#lg-coord').value.match(/(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)/);
      if (!c) return err('#lg-err', 'Escribe la ubicación como "latitud, longitud". Ej.: 2.945408, -75.290811');
      try {
        await api('guardar_sede', { sede: { id: id || '', nombre: $('#lg-nombre').value.trim(), tipo: jefe() ? $('#lg-tipo').value : 'obra', direccion: $('#lg-dir').value.trim(), lat: +c[1], lng: +c[2], radio_m: +$('#lg-radio').value, activa: id ? $('#lg-act').value === '1' : true } });
        cerrarHoja(); toast('Lugar guardado', 'ok'); S.base = null; ir('lugares');
      } catch (ex) { err('#lg-err', ex.message); }
    };
  }
  async function verQR(id, rotar) {
    try {
      if (rotar && !confirm('Se generará un QR nuevo y el que está pegado dejará de funcionar. ¿Continuar?')) return;
      var r = await api('generar_qr', { sede_id: id, rotar: !!rotar });
      var qr = qrcode(0, 'M'); qr.addData(r.texto); qr.make();
      var img = qr.createDataURL(10, 2);
      var h = abrirHoja('<h2>QR · ' + esc(r.sede) + '</h2><div class="qr-imp"><img src="' + img + '" alt="Código QR de asistencia"><div><p style="margin:0 0 10px">Imprímelo y pégalo en la entrada. Los empleados de oficina lo escanean con la app para marcar.</p><p class="small muted">Si alguien le toma foto para marcar desde otro lugar, igual queda el aviso "Fuera del lugar" por el GPS. Si sospechas que se está usando mal, genera uno nuevo.</p></div></div>' +
        '<div class="acciones"><button class="btn" data-cerrar>Cerrar</button><button class="btn peligro" id="qr-rot">Cambiar QR</button><button class="btn prim" id="qr-imp">' + ICON.imprimir + ' Imprimir</button></div>', { ancha: true });
      $('#qr-rot', h).onclick = function () { verQR(id, true); };
      $('#qr-imp', h).onclick = function () {
        var w = window.open('', '_blank');
        w.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>QR asistencia</title><style>@page{size:letter;margin:18mm}body{font-family:Inter,Arial,sans-serif;text-align:center;color:#1F1B16}img.logo{width:300px;margin-top:10mm}h1{font-size:30px;margin:14mm 0 4mm}p{font-size:18px;color:#555}img.qr{width:120mm;height:120mm;image-rendering:pixelated;margin:8mm auto}</style></head><body><img class="logo" src="' + new URL('img/logo-ecosun.png', location.href) + '"><h1>Marca tu llegada y tu salida</h1><p>Abre la app ECOSUN Asistencia y escanea este código</p><img class="qr" src="' + img + '"><p>' + esc(r.sede) + '</p><script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>');
        w.document.close();
      };
    } catch (ex) { toast(ex.message, 'bad'); }
  }

  /* ---------------- PROGRAMACIÓN ---------------- */
  VISTA.programacion = async function () {
    var b = await cargarBase(true);
    var dias = []; for (var i = 0; i < 14; i++) dias.push(sumDias(b.hoy, i));
    var emps = b.empleados.filter(function (e) { return e.activo && e.tipo !== 'ninguno' && e.tipo !== 'oficina'; });
    var grupo = S.progGrupo || '';
    var grupos = Array.from(new Set(emps.map(function (e) { return e.grupo || ''; })));
    if (grupo) emps = emps.filter(function (e) { return (e.grupo || '') === grupo; });
    var sedes = b.sedes.filter(function (s) { return s.activa; });
    S.cambios = {};
    P().innerHTML = '<div class="cab"><div><h1>Programación</h1><p>Dónde trabaja cada persona los próximos 14 días. Si no se cambia, va a su lugar base.</p></div><div class="herr filtros">' +
      '<select class="inp" id="pg-grupo"><option value="">Todos los grupos</option>' + grupos.map(function (g) { return '<option' + (g === grupo ? ' selected' : '') + '>' + esc(g) + '</option>'; }).join('') + '</select>' +
      '<button class="btn chico" id="pg-masivo">Asignar varios días</button></div></div>' +
      '<div class="card"><div class="tbl"><table class="prog"><thead><tr><th>Persona</th>' + dias.map(function (f) { var w = dowDe(f); return '<th class="' + (w === 0 || w === 6 ? 'fin' : '') + '">' + fechaCorta(f) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      emps.map(function (e) {
        return '<tr><td class="n"><b>' + esc(e.nombre) + '</b><span>' + esc(e.cargo) + '</span></td>' + dias.map(function (f) {
          var v = b.programacion[e.id + '|' + f] || '', w = dowDe(f);
          return '<td class="' + (w === 0 || w === 6 ? 'fin' : '') + '"><select aria-label="' + esc(e.nombre + ' ' + f) + '" data-pg="' + e.id + '|' + f + '" data-orig="' + esc(v) + '">' + sedes.map(function (s) { return '<option value="' + s.id + '"' + (s.id === v ? ' selected' : '') + '>' + esc(corto(s.nombre)) + '</option>'; }).join('') + '</select></td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div><p class="small muted" style="margin:12px 0 0">Solo aparecen quienes trabajan en obra. Los cambios le llegan a cada persona la próxima vez que abra la app con señal.</p></div>' +
      '<div class="barra-acc" id="pg-barra" hidden><span id="pg-n"></span><span class="esp"></span><button class="btn chico" style="background:#fff" id="pg-desh">Deshacer</button><button class="btn chico prim" id="pg-ok">Guardar cambios</button></div>';
    $('#pg-grupo').onchange = function () { S.progGrupo = this.value; ir('programacion'); };
    $$('select[data-pg]').forEach(function (s) {
      s.onchange = function () {
        var k = s.dataset.pg; if (s.value === s.dataset.orig) delete S.cambios[k]; else S.cambios[k] = s.value;
        s.classList.toggle('cambiado', s.value !== s.dataset.orig);
        var n = Object.keys(S.cambios).length; $('#pg-barra').hidden = !n; $('#pg-n').textContent = n + ' cambio' + (n === 1 ? '' : 's') + ' sin guardar';
      };
    });
    $('#pg-desh').onclick = function () { ir('programacion'); };
    $('#pg-ok').onclick = async function () {
      var cambios = Object.keys(S.cambios).map(function (k) { var p = k.split('|'); return { empleado_id: p[0], fecha: p[1], sede_id: S.cambios[k] }; });
      try { var r = await api('guardar_programacion', { cambios: cambios }); toast(r.guardadas + ' cambios guardados', 'ok'); S.base = null; ir('programacion'); } catch (ex) { toast(ex.message, 'bad'); }
    };
    $('#pg-masivo').onclick = function () { programarVarios(emps, sedes, b.hoy); };
  };
  function programarVarios(emps, sedes, h0) {
    var h = abrirHoja('<h2>Asignar varios días</h2><div class="error" id="pm-err" hidden></div>' +
      '<div class="campo"><span class="lbl">Personas</span><div style="max-height:220px;overflow:auto;border:1px solid var(--line);border-radius:12px;padding:8px 12px">' + emps.map(function (e) { return '<label class="check" style="margin:6px 0"><input type="checkbox" class="pm-emp" value="' + e.id + '"> ' + esc(e.nombre) + '</label>'; }).join('') + '</div></div>' +
      '<div class="campo"><label for="pm-sede">Lugar</label><select class="inp" id="pm-sede">' + sedes.map(function (s) { return '<option value="' + s.id + '">' + esc(s.nombre) + '</option>'; }).join('') + '</select></div>' +
      '<div class="grid2"><div class="campo"><label for="pm-d">Desde</label><input type="date" class="inp" id="pm-d" value="' + h0 + '"></div><div class="campo"><label for="pm-h">Hasta</label><input type="date" class="inp" id="pm-h" value="' + sumDias(h0, 4) + '"></div></div>' +
      '<label class="check"><input type="checkbox" id="pm-lab" checked> Solo días de lunes a viernes</label>' +
      '<div class="acciones"><button class="btn" data-cerrar>Cancelar</button><button class="btn prim" id="pm-ok">Asignar</button></div>');
    $('#pm-ok', h).onclick = async function () {
      var ids = $$('.pm-emp').filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
      if (!ids.length) return err('#pm-err', 'Elige al menos una persona.');
      try { var r = await api('guardar_programacion', { empleado_ids: ids, desde: $('#pm-d').value, hasta: $('#pm-h').value, sede_id: $('#pm-sede').value, solo_laborales: $('#pm-lab').checked }); cerrarHoja(); toast(r.guardadas + ' días asignados', 'ok'); S.base = null; ir('programacion'); }
      catch (ex) { err('#pm-err', ex.message); }
    };
  }

  /* ---------------- NÓMINA ---------------- */
  VISTA.nomina = async function () {
    var h0 = hoy(), meses = [];
    for (var i = 0; i < 6; i++) { var d = new Date(Date.UTC(+h0.slice(0, 4), +h0.slice(5, 7) - 1 - i, 1)); meses.push(d.toISOString().slice(0, 7)); }
    P().innerHTML = '<div class="cab"><div><h1>Nómina</h1><p>Excel del mes con horas, tardanzas y horas extra aprobadas.</p></div></div>' +
      '<div class="card" style="max-width:560px"><div class="campo"><label for="nm-mes">Mes</label><select class="inp" id="nm-mes">' + meses.map(function (m) { return '<option value="' + m + '">' + MESES[+m.slice(5) - 1].replace(/^./, function (c) { return c.toUpperCase(); }) + ' ' + m.slice(0, 4) + '</option>'; }).join('') + '</select></div>' +
      '<button class="btn prim bloque" id="nm-ok">' + ICON.descarga + ' Descargar Excel</button>' +
      '<p class="small muted" style="margin:14px 0 0">Trae tres hojas: resumen por persona, detalle de horas extra y asistencia diaria. Recargos según Ajustes (extra diurna 25 %, nocturna 75 %, dominical o festivo 90 %). Antes de liquidar, revisa que no queden horas extra por aprobar.</p></div>';
    $('#nm-ok').onclick = async function () {
      var b = this; b.disabled = true; b.innerHTML = '<span class="spin"></span> Generando… (puede tardar un minuto)';
      try {
        var r = await api('exportar_nomina', { mes: $('#nm-mes').value });
        var bin = atob(r.base64), arr = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        var url = URL.createObjectURL(new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        var a = document.createElement('a'); a.href = url; a.download = r.nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        toast(r.pendientes ? 'Descargado. Ojo: quedan ' + horasDec(r.pendientes) + ' h extra sin aprobar.' : 'Excel descargado', r.pendientes ? '' : 'ok');
      } catch (ex) { toast(ex.message, 'bad'); }
      b.disabled = false; b.innerHTML = ICON.descarga + ' Descargar Excel';
    };
  };

  /* ---------------- AJUSTES ---------------- */
  VISTA.ajustes = async function () {
    var b = await cargarBase(true);
    var hids = Array.from(new Set(b.horarios.map(function (h) { return h.horario_id; })));
    var esPct = function (k) { return /^recargo_/.test(k); };
    P().innerHTML = '<div class="cab"><div><h1>Ajustes</h1><p>Horarios, tolerancia, recargos y reglas del sistema.</p></div></div>' +
      hids.map(function (hid) {
        var filas = b.horarios.filter(function (h) { return h.horario_id === hid; });
        return '<div class="card"><h3>Horario ' + esc(hid) + ' · ' + esc(filas[0].nombre) + '</h3><div class="tbl"><table data-hor="' + esc(hid) + '"><thead><tr><th>Día</th><th>Entrada</th><th>Sale a almorzar</th><th>Regresa</th><th>Salida</th><th>Extra programada (min)</th></tr></thead><tbody>' +
          ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'].map(function (dia) {
            var f = filas.filter(function (x) { return x.dia === dia; })[0] || {};
            return '<tr data-dia="' + dia + '"><td style="text-transform:capitalize;font-weight:600">' + dia + '</td><td><input type="time" class="inp" data-k="entrada" value="' + (f.entrada || '') + '"></td><td><input type="time" class="inp" data-k="salida_almuerzo" value="' + (f.salida_almuerzo || '') + '"></td><td><input type="time" class="inp" data-k="regreso_almuerzo" value="' + (f.regreso_almuerzo || '') + '"></td><td><input type="time" class="inp" data-k="salida" value="' + (f.salida || '') + '"></td><td><input type="number" min="0" class="inp" data-k="extra_programada_min" value="' + (f.extra_programada_min || 0) + '" style="max-width:110px"></td></tr>';
          }).join('') + '</tbody></table></div><p class="small muted">Deja en blanco los días que no se trabaja. Lo que se trabaje esos días queda como hora extra por aprobar.</p><button class="btn chico" data-guardar-hor="' + esc(hid) + '">Guardar horario ' + esc(hid) + '</button></div>';
      }).join('') +
      '<div class="card"><h3>Reglas</h3><div class="tbl"><table><tbody>' + b.config.filter(function (c) { return c.clave !== 'zona_horaria'; }).map(function (c) {
        var v = esPct(c.clave) && c.valor !== '' ? Math.round(+c.valor * 100) : c.valor;
        return '<tr><td class="n"><b>' + esc(c.clave.replace(/_/g, ' ')) + '</b><span>' + esc(c.descripcion || '') + '</span></td><td style="min-width:150px"><input class="inp" data-cfg="' + esc(c.clave) + '" data-pct="' + (esPct(c.clave) ? 1 : 0) + '" value="' + esc(v) + '">' + (esPct(c.clave) ? '<span class="small muted">%</span>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div><button class="btn prim chico" id="cfg-ok" style="margin-top:10px">Guardar reglas</button></div>';
    $$('[data-guardar-hor]').forEach(function (bt) {
      bt.onclick = async function () {
        var hid = bt.dataset.guardarHor, nombre = b.horarios.filter(function (h) { return h.horario_id === hid; })[0].nombre;
        var dias = $$('table[data-hor="' + hid + '"] tbody tr').map(function (tr) {
          var o = { dia: tr.dataset.dia }; $$('input', tr).forEach(function (i) { o[i.dataset.k] = i.value; }); return o;
        }).filter(function (d) { return d.entrada && d.salida; });
        try { await api('guardar_horario', { horario_id: hid, nombre: nombre, dias: dias }); toast('Horario guardado', 'ok'); S.base = null; } catch (ex) { toast(ex.message, 'bad'); }
      };
    });
    $('#cfg-ok').onclick = async function () {
      var v = {}; $$('[data-cfg]').forEach(function (i) { v[i.dataset.cfg] = i.dataset.pct === '1' && i.value !== '' ? +(+i.value.replace(',', '.') / 100).toFixed(4) : i.value; });
      try { await api('guardar_config', { valores: v }); toast('Reglas guardadas', 'ok'); S.base = null; } catch (ex) { toast(ex.message, 'bad'); }
    };
  };

  /* ---------------- Eventos ---------------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-ir],[data-cerrar],[data-marca],[data-dia],[data-sem],[data-emp],[data-lugar],[data-qr]');
    if (!t) return;
    if (t.hasAttribute('data-cerrar')) return cerrarHoja();
    if (t.dataset.ir) { cerrarHoja(); return ir(t.dataset.ir); }
    if (t.dataset.marca) return verMarca(t.dataset.marca, t.dataset.emp, t.dataset.fecha);
    if (t.dataset.dia && jefe()) { var p = t.dataset.dia.split('|'); return verDia(p[0], p[1]); }
    if (t.dataset.sem) { cargando(); return VISTA.semana(t.dataset.sem).catch(fallo); }
    if (t.dataset.emp && t.tagName === 'TR') return editarEmpleado(t.dataset.emp);
    if (t.dataset.lugar) return editarLugar(t.dataset.lugar);
    if (t.dataset.qr) return verQR(t.dataset.qr, false);
  });

  iniciar();
})();

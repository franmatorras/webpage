(async function () {
    'use strict';
    var B = window.Baske;
    var esc = B.esc;

    var yo = await B.iniciar({ activa: 'inicio' });
    var contTemporada = document.getElementById('mi-temporada');

    var M;
    try {
        M = await B.modelo(B.TABLAS_DEUDA.concat(B.TABLAS_PREMIOS, B.TABLAS_JUNTA));
        await B.prepararFotos(M.miembros);
    } catch (e) {
        B.falloCarga(contTemporada, e);
        ['cuadros-jugadores', 'cuadros-miembros', 'cuadros-junta'].forEach(function (id) {
            document.getElementById(id).innerHTML = '';
        });
        return;
    }

    pintarTemporada();
    pintarCuadros();

    function stat(etiqueta, valor, clase) {
        return '<div class="bk-stat' + (clase ? ' ' + clase : '') + '"><div class="bk-stat-etiqueta">' + etiqueta +
            '</div><div class="bk-stat-valor">' + valor + '</div></div>';
    }

    function pintarTemporada() {
        var temporada = new Set([M.temporadaActual]);
        var html = '<div class="bk-cabecera-card"><h1 class="bk-h3" style="font-size:1.5rem">Mi temporada <span class="bk-nota">' +
            esc(M.temporadaActual) + '</span></h1>';
        if (yo.miembro) html += '<span class="bk-nota">Hola, ' + esc(yo.miembro.nombre) + '</span>';
        html += '</div>';

        if (!yo.miembro) {
            contTemporada.innerHTML = html + '<p class="bk-vacio">Tu usuario no está vinculado a ningún miembro del equipo. Habla con un administrador.</p>';
            return;
        }

        var esJugador = yo.miembro.tipo_miembro === 'jugador' && !yo.miembro.fecha_baja;
        var tot = M.totales(temporada);
        var mia = yo.idJugador ? M.asistencia(yo.idJugador, temporada) : { jugadas: 0, cervezas: 0, vistas: 0 };
        var deuda = yo.idJugador ? M.deuda(yo.idJugador) : 0;
        var historica = yo.idJugador ? M.asistencia(yo.idJugador, null) : {};

        html += '<div class="bk-stats">';
        if (esJugador) {
            html += stat('Pachangas', mia.jugadas + ' <small>/ ' + tot.pachangas + '</small>');
            html += stat('Fecha de la última pachanga', historica.ultimaPachanga
                ? '<span style="font-size:1.15rem">' + esc(B.fecha(historica.ultimaPachanga)) + '</span>'
                : '<span style="font-size:1.1rem">Aún ninguna</span>');
        }
        // La deuda se enseña a los jugadores y a cualquiera que deba algo (p. ej. un cobro de equipación)
        if (esJugador || deuda > 0) {
            html += deuda > 0
                ? stat('Pagos', 'Debes ' + esc(B.euros(deuda)), 'bk-stat--deuda')
                : stat('Pagos', 'No tienes deudas pendientes', 'bk-stat--ok');
        }
        html += stat('Cervezas', mia.cervezas + ' <small>/ ' + tot.conCervezas + '</small>');
        if (!esJugador || mia.vistas) html += stat('Pachangas vistas', String(mia.vistas || 0));
        html += '</div>';

        // Votación de la última pachanga
        var ultima = M.pachangas.find(function (p) { return p.jugada; });
        if (ultima && yo.idJugador && ultima.asistentes.indexOf(yo.idJugador) >= 0) {
            var v = B.ventanaVoto(ultima.fecha);
            if (v.estado === 'abierta') {
                html += '<div class="bk-acciones"><a class="bk-btn bk-btn--azul bk-btn--grande" href="votar.html">Vota la última changa</a>' +
                    '<span class="bk-nota" style="align-self:center">Hasta el ' + esc(B.fecha(v.termina.slice(0, 10))) + ' a las 23:59</span></div>';
            } else if (v.estado === 'pronto') {
                html += '<p class="bk-nota" style="margin-top:1rem">La votación de la pachanga de hoy abre a las 19:30.</p>';
            }
        }

        // Premios
        var premios = M.premios(yo.miembro.id);
        if (premios.length) {
            html += '<h2 class="bk-h3" style="margin-top:1.25rem">Mis premios</h2><ul class="bk-premios-lista">' +
                premios.map(function (p) {
                    return '<li>' + esc(p.nombre) + '<small>' + esc(p.cuando) + '</small></li>';
                }).join('') + '</ul>';
        }

        contTemporada.innerHTML = html;
    }

    function cuadro(m, subtitulo) {
        var ex = !!m.fecha_baja;
        return '<div class="bk-cuadro">' +
            '<button type="button" aria-expanded="false">' +
            '<img class="bk-foto' + (ex ? ' bk-foto--ex' : '') + '" src="' + esc(B.foto(m)) + '" alt="" loading="lazy">' +
            '<span class="bk-cuadro-nombre">' + esc(M.nombreMiembro(m)) +
            (subtitulo ? '<small>' + esc(subtitulo) + '</small>' : '') + '</span></button>' +
            '<div class="bk-cuadro-info"><p>' + esc(m.descripcion || 'Sin descripción todavía.') + '</p>' +
            '<a href="jugador.html?id=' + m.id + '">Saber más →</a></div>' +
            '</div>';
    }

    function pintarLista(id, html, vacio) {
        var el = document.getElementById(id);
        el.innerHTML = html || '<p class="bk-vacio">' + vacio + '</p>';
        el.querySelectorAll('.bk-cuadro > button').forEach(function (b) {
            b.addEventListener('click', function () {
                var c = b.parentElement;
                var abierto = c.classList.toggle('abierto');
                b.setAttribute('aria-expanded', abierto ? 'true' : 'false');
            });
        });
    }

    function pintarCuadros() {
        var cmp = M.compararMiembros.bind(M);

        var jugadores = M.miembros.filter(function (m) { return m.tipo_miembro === 'jugador' && !m.fecha_baja; }).sort(cmp);
        pintarLista('cuadros-jugadores', jugadores.map(function (m) { return cuadro(m, M.apodo(m.id)); }).join(''), 'Todavía no hay jugadores.');

        var otros = M.miembros.filter(function (m) { return m.tipo_miembro !== 'jugador' || m.fecha_baja; }).sort(cmp);
        pintarLista('cuadros-miembros', otros.map(function (m) {
            return cuadro(m, m.fecha_baja ? 'Ex-miembro' : B.TIPOS[m.tipo_miembro]);
        }).join(''), 'Nadie por aquí todavía.');

        var junta = M.juntaActual().filter(function (j) { return j.miembro; });
        pintarLista('cuadros-junta', junta.map(function (j) { return cuadro(j.miembro, B.etiquetaCargo(j.cargo)); }).join(''), 'No hay junta directiva registrada.');
    }
})();

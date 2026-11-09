(async function () {
    'use strict';
    var B = window.Baske;
    var esc = B.esc;

    var yo = await B.iniciar({ activa: 'pachangas' });
    var resultado = document.getElementById('resultado');
    var buscar = document.getElementById('buscar');

    var M;
    try {
        M = await B.modelo(B.TABLAS_DEUDA.concat(B.TABLAS_PREMIOS, ['equipo', 'jugador_equipo', 'v_resultado_top_pachanga']));
    } catch (e) {
        B.falloCarga(resultado, e);
        return;
    }

    // ----- Estado (se refleja en la URL: ?vista=jugadores&temporadas=todas) -----
    var temporadas = M.temporadas();
    var pTemp = B.param('temporadas');
    var seleccion = pTemp === 'todas' ? 'todas'
        : pTemp ? pTemp.split(',').filter(function (t) { return temporadas.indexOf(t) >= 0; })
        : [M.temporadaActual];
    if (Array.isArray(seleccion) && !seleccion.length) seleccion = [M.temporadaActual];

    var estado = {
        vista: B.param('vista') === 'pachangas' ? 'pachangas' : 'jugadores',
        temporadas: seleccion === 'todas' ? null : new Set(seleccion),
        orden: { col: 'apellido', dir: 'asc' },
        abiertos: new Set(),
        proximas: B.param('proximas') === '1',
        desde: mesValido(B.param('desde')),
        hasta: mesValido(B.param('hasta'))
    };
    function mesValido(t) { return /^\d{4}-\d{2}$/.test(t || '') ? t : null; }

    // ----- Filtro por meses (Desde / Hasta): manda sobre temporadas y próximas -----
    var opcionMeses = document.getElementById('opcion-meses');
    var selDesde = document.getElementById('mes-desde');
    var selHasta = document.getElementById('mes-hasta');
    var quitarMeses = document.getElementById('quitar-meses');
    var meses = Array.from(new Set(M.pachangas.map(function (p) { return p.fecha.slice(0, 7); }))).sort().reverse();
    var opcionesMes = '<option value="">Cualquier mes</option>' + meses.map(function (m) {
        return '<option value="' + m + '">' + esc(B.mesAnio(m + '-01')) + '</option>';
    }).join('');
    selDesde.innerHTML = opcionesMes;
    selHasta.innerHTML = opcionesMes;
    selDesde.value = estado.desde || '';
    selHasta.value = estado.hasta || '';

    function cambiarMeses() {
        estado.desde = selDesde.value || null;
        estado.hasta = selHasta.value || null;
        // Si están al revés, se dan la vuelta
        if (estado.desde && estado.hasta && estado.desde > estado.hasta) {
            var t = estado.desde; estado.desde = estado.hasta; estado.hasta = t;
            selDesde.value = estado.desde; selHasta.value = estado.hasta;
        }
        estado.abiertos.clear();
        pintar();
    }
    selDesde.addEventListener('change', cambiarMeses);
    selHasta.addEventListener('change', cambiarMeses);
    quitarMeses.addEventListener('click', function () {
        selDesde.value = ''; selHasta.value = '';
        cambiarMeses();
    });
    function hayMeses() { return !!(estado.desde || estado.hasta); }

    var opcionProximas = document.getElementById('opcion-proximas');
    var checkProximas = document.getElementById('proximas');
    checkProximas.checked = estado.proximas;
    checkProximas.addEventListener('change', function () {
        estado.proximas = checkProximas.checked;
        pintar();
    });

    var selector = B.selectorTemporadas(document.getElementById('filtro-temporadas'), temporadas, seleccion, function (valor) {
        estado.temporadas = valor;
        pintar();
    });

    document.querySelectorAll('.bk-tabs button').forEach(function (b) {
        b.addEventListener('click', function () {
            estado.vista = b.dataset.vista;
            estado.abiertos.clear();
            pintar();
        });
    });
    buscar.addEventListener('input', function () { pintar(); });

    function actualizarUrl() {
        var q = new URLSearchParams();
        q.set('vista', estado.vista);
        q.set('temporadas', selector.todas() ? 'todas' : Array.from(estado.temporadas || []).join(','));
        if (estado.vista === 'pachangas' && estado.proximas) q.set('proximas', '1');
        if (estado.vista === 'pachangas' && estado.desde) q.set('desde', estado.desde);
        if (estado.vista === 'pachangas' && estado.hasta) q.set('hasta', estado.hasta);
        history.replaceState(null, '', location.pathname + '?' + q.toString());
    }

    function pintar() {
        document.querySelectorAll('.bk-tabs button').forEach(function (b) {
            b.setAttribute('aria-selected', b.dataset.vista === estado.vista ? 'true' : 'false');
        });
        buscar.placeholder = estado.vista === 'jugadores' ? 'Buscar por nombre o apodo…' : 'Buscar pachangas de un jugador…';
        opcionProximas.hidden = estado.vista !== 'pachangas';
        opcionMeses.hidden = estado.vista !== 'pachangas';
        quitarMeses.hidden = !hayMeses();
        actualizarUrl();
        if (estado.vista === 'jugadores') pintarJugadores(); else pintarPachangas();
    }

    function coincide(texto) {
        var q = B.normalizar(buscar.value);
        return !q || B.normalizar(texto).indexOf(q) >= 0;
    }

    function dato(etiqueta, valor) {
        return '<div><dt>' + etiqueta + '</dt><dd>' + (valor == null || valor === '' ? '—' : valor) + '</dd></div>';
    }

    // ------------------------------------------------------------------
    // Vista Jugadores
    // ------------------------------------------------------------------
    function pintarJugadores() {
        var tot = M.totales(estado.temporadas);

        var filas = M.miembros.map(function (m) {
            var idJ = M.jugadorDeMiembro.get(m.id);
            var a = idJ ? M.asistencia(idJ, estado.temporadas) : { jugadas: 0, cervezas: 0 };
            return {
                m: m,
                idJ: idJ,
                a: a,
                nombre: M.nombreMiembro(m),
                apodo: M.apodo(m.id),
                habilidad: M.habilidad(m.id),
                moroso: idJ ? M.deuda(idJ) > 0 : false,
                estado: M.estado(m),
                tray: M.trayectoria(m.id)
            };
        }).filter(function (f) {
            // Aficionados nunca; staff y ex-miembros solo si jugaron en las temporadas elegidas
            if (f.m.tipo_miembro === 'aficionado') return false;
            if ((f.m.tipo_miembro === 'staff' || f.m.fecha_baja) && f.a.jugadas === 0) return false;
            return coincide(f.nombre + ' ' + f.apodo);
        });

        var o = estado.orden;
        var signo = o.dir === 'asc' ? 1 : -1;
        filas.sort(function (x, y) {
            var r = 0;
            if (o.col === 'asistencia') r = x.a.jugadas - y.a.jugadas;
            else if (o.col === 'nombre') r = x.nombre.localeCompare(y.nombre, 'es');
            else if (o.col === 'temporadas') r = x.tray.n - y.tray.n;
            else if (o.col === 'apodo') r = (x.apodo || '~').localeCompare(y.apodo || '~', 'es');
            else if (o.col === 'moroso') r = (x.moroso ? 1 : 0) - (y.moroso ? 1 : 0);
            if (o.col === 'apellido') return M.compararMiembros(x.m, y.m) * signo;
            // Empates: siempre por apellido de la A a la Z
            return r * signo || M.compararMiembros(x.m, y.m);
        });

        function cabecera(col, texto, clase) {
            var actual = o.col === col || (col === 'nombre' && o.col === 'apellido') ? (o.dir) : '';
            return '<th' + (clase ? ' class="' + clase + '"' : '') + '><button type="button" data-col="' + col + '"' +
                (actual ? ' data-orden="' + actual + '"' : '') + '>' + texto + '</button></th>';
        }

        var html = '<p class="bk-nota" style="margin-bottom:0.5rem">' + tot.pachangas + ' pachangas jugadas en la selección. ' +
            'Toca una fila para ver más. En gris: retirados (no han jugado esta temporada), staff y difuntos; ' +
            'staff y difuntos solo salen si jugaron en las temporadas elegidas.</p>' +
            '<div class="bk-tabla-envoltorio"><table class="bk-tabla"><thead><tr><th aria-label="Desplegar"></th>' +
            cabecera('asistencia', 'Asistencia', 'num') +
            cabecera('nombre', 'Nombre') +
            cabecera('temporadas', 'Temporadas', 'num bk-ocultar-movil') +
            cabecera('apodo', 'Apodo', 'bk-ocultar-movil') +
            '<th class="bk-ocultar-movil">Habilidad especial</th>' +
            cabecera('moroso', 'Moroso') +
            '</tr></thead><tbody>';

        if (!filas.length) html += '<tr><td colspan="7" class="bk-vacio">Ningún jugador coincide con la búsqueda.</td></tr>';

        filas.forEach(function (f) {
            var abierto = estado.abiertos.has(f.m.id);
            var gris = f.estado !== 'activo';
            html += '<tr class="bk-fila-principal' + (gris ? ' bk-retirado' : '') + '" data-id="' + f.m.id + '" tabindex="0" aria-expanded="' + abierto + '">' +
                '<td><span class="bk-flecha">▶</span></td>' +
                '<td class="num"><strong>' + f.a.jugadas + '</strong> <span class="bk-nota">/ ' + tot.pachangas + '</span></td>' +
                '<td>' + esc(f.nombre) + ' ' + M.chipEstado(f.m) + (f.m.id_usuario && yo.miembro && f.m.id === yo.miembro.id ? ' <span class="bk-chip">Tú</span>' : '') + '</td>' +
                '<td class="num bk-ocultar-movil">' + f.tray.n + '</td>' +
                '<td class="bk-ocultar-movil">' + esc(f.apodo || '—') + '</td>' +
                '<td class="bk-ocultar-movil">' + esc(f.habilidad || '—') + '</td>' +
                '<td>' + (f.moroso ? '<span class="bk-chip bk-chip--rojo">Moroso</span>' : '') + '</td>' +
                '</tr>';
            if (abierto) html += '<tr class="bk-detalle"><td colspan="7">' + detalleJugador(f, tot) + '</td></tr>';
        });

        html += '</tbody></table></div>';
        resultado.innerHTML = html;

        resultado.querySelectorAll('thead button').forEach(function (b) {
            b.addEventListener('click', function () {
                var col = b.dataset.col;
                var actual = o.col === 'apellido' ? 'nombre' : o.col;
                if (actual === col) {
                    o.dir = o.dir === 'asc' ? 'desc' : 'asc';
                } else {
                    o.col = col === 'nombre' ? 'apellido' : col;
                    o.dir = col === 'asistencia' || col === 'moroso' || col === 'temporadas' ? 'desc' : 'asc';
                }
                pintarJugadores();
            });
        });
        activarDesplegables(pintarJugadores);
    }

    function detalleJugador(f, tot) {
        var m = f.m;
        var padrino = m.id_padrino ? M.nombreMiembro(m.id_padrino) : null;
        var ahijados = M.miembros.filter(function (x) { return x.id_padrino === m.id; }).map(function (x) { return M.nombreMiembro(x); });
        var premios = M.premios(m.id);
        var pct = tot.pachangas ? Math.round(f.a.jugadas * 100 / tot.pachangas) + '%' : '—';

        return '<dl class="bk-datos">' +
            dato('Apodo', esc(f.apodo)) +
            dato('Habilidad especial', esc(f.habilidad)) +
            dato('Dorsal negro', esc(m.dorsal_negro)) +
            dato('Dorsal azul', esc(m.dorsal_azul)) +
            dato('% asistencia', pct) +
            dato('Temporadas jugadas', esc(M.textoTemporadas(f.tray))) +
            dato('Última pachanga', f.tray.ultimaPachanga ? esc(B.fecha(f.tray.ultimaPachanga) + ' (' + f.tray.hace + ')') : null) +
            (M.textoDejo(m, f.tray) ? dato('Estado', esc(M.textoDejo(m, f.tray))) : '') +
            dato('Cervezas', f.a.cervezas) +
            dato('Última cerveza', f.a.ultimaCerveza ? esc(B.fecha(f.a.ultimaCerveza)) : null) +
            (f.a.vistas ? dato('Pachangas vistas (sin jugar)', f.a.vistas + ' <span class="bk-nota">· última ' + esc(B.fecha(f.a.ultimaVista)) + '</span>') : '') +
            dato('Carrera ' + esc(M.temporadaActual), M.chipsTop5(m.id)) +
            dato('Miembro desde', esc(B.fecha(m.fecha_ingreso))) +
            (m.fecha_baja ? dato('Baja', esc(B.fecha(m.fecha_baja))) : '') +
            dato('Tipo', esc(B.TIPOS[m.tipo_miembro])) +
            dato('Nº de socio', m.n_socio) +
            dato('Origen', esc(B.ORIGENES[m.origen])) +
            dato('Padrino', esc(padrino)) +
            dato('Ahijados', esc(ahijados.join(', '))) +
            dato('Premios', premios.length ? esc(premios.map(function (p) { return p.nombre + ' (' + p.cuando + ')'; }).join(', ')) : null) +
            '</dl><div class="bk-acciones"><a class="bk-btn bk-btn--peq" href="jugador.html?id=' + m.id + '">Ver ficha</a></div>';
    }

    // ------------------------------------------------------------------
    // Vista Pachangas
    // ------------------------------------------------------------------
    function pintarPachangas() {
        var q = B.normalizar(buscar.value);
        var lista = M.pachangas.filter(function (p) {
            // Una fecha concreta manda sobre el filtro de temporadas y el de próximas
            if (hayMeses()) {
                var mes = p.fecha.slice(0, 7);
                if ((estado.desde && mes < estado.desde) || (estado.hasta && mes > estado.hasta)) return false;
            } else {
                if (estado.temporadas && !estado.temporadas.has(p.temporada)) return false;
                if (!p.jugada && !estado.proximas) return false;
            }
            if (!q) return true;
            return p.asistentes.concat(p.cerveceros).some(function (id) {
                var mi = M.miembroDeJugador(id);
                return B.normalizar(M.nombreJugador(id) + ' ' + (mi ? M.apodo(mi.id) : '')).indexOf(q) >= 0;
            });
        });

        if (!lista.length) {
            resultado.innerHTML = '<p class="bk-vacio">' + (hayMeses() ? 'No hay pachangas entre esos meses.' : 'No hay pachangas en la selección.') + '</p>';
            return;
        }

        var html = '<p class="bk-nota" style="margin-bottom:0.5rem">' + lista.filter(function (p) { return p.jugada; }).length +
            ' pachangas jugadas. Toca una para ver quién fue.</p>';
        var mesActual = null;
        lista.forEach(function (p) {
            var mes = p.fecha.slice(0, 7);
            if (mes !== mesActual) {
                if (mesActual) html += '</tbody></table></div>';
                mesActual = mes;
                html += '<h2 class="bk-mes">' + esc(B.mesAnio(p.fecha)) + '</h2>' +
                    '<div class="bk-tabla-envoltorio"><table class="bk-tabla bk-tabla--pachangas"><thead><tr><th aria-label="Desplegar"></th><th>Fecha</th>' +
                    '<th class="num">Asistentes</th><th>Cervezas</th><th class="bk-ocultar-movil">Tipo</th></tr></thead><tbody>';
            }
            var abierto = estado.abiertos.has(p.id);
            var fui = yo.idJugador && p.asistentes.indexOf(yo.idJugador) >= 0;
            html += '<tr class="bk-fila-principal" data-id="' + p.id + '" tabindex="0" aria-expanded="' + abierto + '">' +
                '<td><span class="bk-flecha">▶</span></td>' +
                '<td>' + esc(B.fecha(p.fecha)) + (p.jugada ? '' : ' <span class="bk-chip">Próxima</span>') +
                (fui ? ' <span class="bk-chip bk-chip--negro">Fuiste</span>' : '') + '</td>' +
                '<td class="num">' + (p.jugada ? p.asistentes.length : '—') + '</td>' +
                '<td>' + (p.cervezas ? 'Sí' + (p.jugada ? ' · ' + p.cerveceros.length : '') : '<span class="bk-nota">No</span>') + '</td>' +
                '<td class="bk-ocultar-movil">' + (p.id_reserva ? 'Reserva' : 'Suelta · ' + esc(B.euros(p.precio))) +
                '<br><span class="bk-nota">' + esc(B.PISTAS[p.pista] || B.PISTAS.media) + '</span></td>' +
                '</tr>';
            if (abierto) html += '<tr class="bk-detalle"><td colspan="5">' + detallePachanga(p) + '</td></tr>';
        });
        html += '</tbody></table></div>';
        resultado.innerHTML = html;
        activarDesplegables(pintarPachangas);
    }

    function nombreConInvitado(id) {
        var n = esc(M.nombreJugador(id));
        if (M.esInvitado(id)) {
            var padrino = M.padrinoDeInvitado(id);
            n += ' <span class="bk-chip bk-chip--gris">invitado' + (padrino ? ' de ' + esc(padrino) : '') + '</span>';
        }
        return n;
    }

    function listaNombres(ids) {
        if (!ids.length) return '<p class="bk-vacio">Nadie.</p>';
        return '<ul class="bk-lista-simple">' + ids
            .map(function (id) { return { id: id, n: M.nombreJugador(id) }; })
            .sort(function (a, b) { return a.n.localeCompare(b.n, 'es'); })
            .map(function (x) { return '<li>' + nombreConInvitado(x.id) + '</li>'; }).join('') + '</ul>';
    }

    function detallePachanga(p) {
        if (!p.jugada) return '<p class="bk-vacio">Esta pachanga todavía no se ha jugado.</p>';

        var html = '<div class="bk-columnas">' +
            '<div><h3 class="bk-h3">Jugaron (' + p.asistentes.length + ')</h3>' + listaNombres(p.asistentes) + '</div>' +
            (p.cervezas ? '<div><h3 class="bk-h3">Cervezas (' + p.cerveceros.length + ')</h3>' + listaNombres(p.cerveceros) + '</div>' : '') +
            (p.espectadores.length ? '<div><h3 class="bk-h3">Vinieron a ver (' + p.espectadores.length + ')</h3>' + listaNombres(p.espectadores) + '</div>' : '');

        var equipos = (M.d.equipo || []).filter(function (e) { return e.id_pachanga === p.id; });
        equipos.forEach(function (e) {
            var ids = (M.d.jugador_equipo || []).filter(function (je) { return je.id_equipo === e.id; }).map(function (je) { return je.id_jugador; });
            html += '<div><h3 class="bk-h3">Equipo ' + esc(e.nombre || e.id) +
                (e.partidos_ganados != null ? ' <span class="bk-nota">· ' + e.partidos_ganados + ' ganados</span>' : '') + '</h3>' +
                listaNombres(ids) + '</div>';
        });

        return html + '</div>';
    }

    function activarDesplegables(repintar) {
        resultado.querySelectorAll('tr.bk-fila-principal').forEach(function (tr) {
            function alternar() {
                var id = Number(tr.dataset.id);
                if (estado.abiertos.has(id)) estado.abiertos.delete(id); else estado.abiertos.add(id);
                repintar();
                var fila = resultado.querySelector('tr.bk-fila-principal[data-id="' + id + '"]');
                if (fila) fila.focus({ preventScroll: true });
            }
            tr.addEventListener('click', function (ev) {
                if (ev.target.closest('a, button')) return;
                alternar();
            });
            tr.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); alternar(); }
            });
        });
    }

    pintar();
})();

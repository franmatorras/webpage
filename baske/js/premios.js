(async function () {
    'use strict';
    var B = window.Baske;
    var esc = B.esc;

    await B.iniciar({ activa: 'premios' });
    var carrera = document.getElementById('carrera');
    var historico = document.getElementById('historico');

    var M;
    try {
        M = await B.modelo(B.TABLAS_PREMIOS.concat(['v_resultado_top_pachanga']));
    } catch (e) {
        B.falloCarga(carrera, e);
        return;
    }

    var temporada = M.temporadaActual;
    var periodo = B.periodoActual();
    var enTemporada = function (p) { return p.temporada === temporada; };
    var enPeriodo = function (p) { return p.temporada === temporada && p.periodo === periodo; };

    function li(x, pos, clase, conPuntos, unidad) {
        return '<li' + (clase ? ' class="' + clase + '"' : '') + '><span class="pos">' + pos + '</span>' +
            '<a class="nombre" href="jugador.html?id=' + x.idMiembro + '">' + esc(x.nombre) + '</a>' +
            (conPuntos ? '<span class="pts">' + x.puntos + ' ' + unidad + '</span>' : '') + '</li>';
    }

    // Temporada: 1º y 2º de verdad; 3º-5º por orden alfabético
    function bloqueTemporada(titulo, tipo) {
        var lista = M.ranking(enTemporada, tipo);
        var unidad = tipo === 'mvp' ? 'pts' : 'votos';
        var html = '<section class="bk-card"><h3>' + titulo + '<small>Temporada ' + esc(temporada) + '</small></h3>';
        if (!lista.length) return html + '<p class="bk-vacio">Todavía no hay votos.</p></section>';

        html += '<ol class="bk-ranking">';
        // Los votos no se enseñan: solo la posición
        if (lista[0]) html += li(lista[0], '1º', 'oro', false, unidad);
        if (lista[1]) html += li(lista[1], '2º', 'plata', false, unidad);
        var resto = lista.slice(2, 5).sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
        if (resto.length) {
            html += '<li class="bk-ranking-contenedor"><div class="bk-ranking-grupo">' +
                '<span class="bk-nota">Top 5 (del 3º al 5º, por orden alfabético)</span>' +
                resto.map(function (x) {
                    return '<div class="bk-ranking-fila"><a class="nombre" href="jugador.html?id=' + x.idMiembro + '">' + esc(x.nombre) + '</a></div>';
                }).join('') +
                '</div></li>';
        }
        return html + '</ol></section>';
    }

    // Periodo bimestral: los tres primeros
    function bloquePeriodo(titulo, tipo) {
        var lista = M.ranking(enPeriodo, tipo).slice(0, 3);
        var unidad = tipo === 'mvp' ? 'pts' : 'votos';
        var html = '<section class="bk-card"><h3>' + titulo + '<small>' + esc(B.etiquetaPeriodo(periodo) + ' ' + temporada) + '</small></h3>';
        if (!lista.length) return html + '<p class="bk-vacio">Todavía no hay votos en este periodo.</p></section>';
        return html + '<ol class="bk-ranking">' + lista.map(function (x, i) {
            return li(x, (i + 1) + 'º', i === 0 ? 'oro' : i === 1 ? 'plata' : '', false, unidad);
        }).join('') + '</ol></section>';
    }

    carrera.innerHTML =
        bloqueTemporada('MVP de temporada', 'mvp') +
        bloqueTemporada('Fraude de temporada', 'fraude') +
        bloquePeriodo('MVP mes', 'mvp') +
        bloquePeriodo('Fraude mes', 'fraude');

    // ----- Histórico -----
    var todos = M.premios(null).map(function (p) {
        return Object.assign(p, { ganador: M.nombreMiembro(p.fila.id_miembro) });
    });
    var temporadas = Array.from(new Set(todos.map(function (p) { return p.temporada; }).concat(M.temporadas()))).sort().reverse();
    var filtroTemp = null;

    var selPremio = document.getElementById('filtro-premio');
    Array.from(new Set(todos.map(function (p) { return p.nombre; }))).sort().forEach(function (n) {
        var o = document.createElement('option');
        o.value = o.textContent = n;
        selPremio.appendChild(o);
    });
    var inputNombre = document.getElementById('filtro-nombre');

    B.selectorTemporadas(document.getElementById('filtro-temporadas'), temporadas, 'todas', function (v) {
        filtroTemp = v;
        pintarHistorico();
    });
    selPremio.addEventListener('change', pintarHistorico);
    inputNombre.addEventListener('input', pintarHistorico);

    function pintarHistorico() {
        var q = B.normalizar(inputNombre.value);
        var lista = todos.filter(function (p) {
            return (!filtroTemp || filtroTemp.has(p.temporada)) &&
                (!selPremio.value || p.nombre === selPremio.value) &&
                (!q || B.normalizar(p.ganador).indexOf(q) >= 0);
        });
        if (!lista.length) {
            historico.innerHTML = '<p class="bk-vacio">No hay premios con esos filtros.</p>';
            return;
        }
        historico.innerHTML = '<div class="bk-tabla-envoltorio"><table class="bk-tabla"><thead><tr>' +
            '<th>Premio</th><th>Ganador</th><th>Temporada</th><th>Periodo</th></tr></thead><tbody>' +
            lista.map(function (p) {
                return '<tr><td><strong>' + esc(p.nombre) + '</strong>' + (p.mencion ? ' <span class="bk-chip">Mención</span>' : '') + '</td>' +
                    '<td><a href="jugador.html?id=' + p.fila.id_miembro + '">' + esc(p.ganador) + '</a></td>' +
                    '<td>' + esc(p.temporada) + '</td><td>' + esc(p.periodo ? B.etiquetaPeriodo(p.periodo) : 'Temporada completa') + '</td></tr>';
            }).join('') + '</tbody></table></div>';
    }
    pintarHistorico();
})();

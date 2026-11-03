(async function () {
    'use strict';
    var B = window.Baske;
    var esc = B.esc;

    await B.iniciar({ activa: 'transparencia' });
    var cont = document.getElementById('cuentas');

    var M;
    try {
        M = await B.modelo(B.TABLAS_DEUDA.concat(['gasto']));
    } catch (e) {
        B.falloCarga(cont, e);
        return;
    }
    var d = M.d;

    // Cada ingreso (cobrado o pendiente) con su temporada.
    // Nunca se enseña de quién es: solo totales.
    var nPorReserva = new Map();
    M.pachangas.forEach(function (p) { if (p.id_reserva) nPorReserva.set(p.id_reserva, (nPorReserva.get(p.id_reserva) || 0) + 1); });
    var reservas = new Map((d.reserva_periodica || []).map(function (r) { return [r.id, r]; }));
    var entrenos = new Map((d.entrenamiento || []).map(function (e) { return [e.id, e]; }));

    var ingresos = [];
    (d.reserva_jugador || []).forEach(function (rj) {
        var r = reservas.get(rj.id_reserva);
        if (r) ingresos.push({ concepto: 'Cuotas de reserva', temporada: B.temporadaDe(r.fecha_inicio), importe: r.precio_unitario * (nPorReserva.get(r.id) || 0), pagado: rj.pagado });
    });
    (d.pachanga_jugador || []).forEach(function (pj) {
        var p = M.pachanga.get(pj.id_pachanga);
        if (p && p.precio != null && pj.jugado && pj.pagado != null) ingresos.push({ concepto: 'Pachangas sueltas', temporada: p.temporada, importe: Number(p.precio), pagado: pj.pagado });
    });
    (d.entrenamiento_jugador || []).forEach(function (ej) {
        var e = entrenos.get(ej.id_entrenamiento);
        if (e && ej.asistido) ingresos.push({ concepto: 'Entrenamientos', temporada: B.temporadaDe(e.fecha), importe: Number(e.precio), pagado: ej.pagado });
    });

    var TIPOS_GASTO = { reserva: 'Reservas de pista', pachanga: 'Pistas sueltas', general: 'General' };
    var gastos = (d.gasto || []).map(function (g) {
        return Object.assign({ temporada: B.temporadaDe(g.fecha) }, g);
    }).sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });

    var temporadas = Array.from(new Set(M.temporadas()
        .concat(ingresos.map(function (i) { return i.temporada; }), gastos.map(function (g) { return g.temporada; }))))
        .sort().reverse();

    var filtro = new Set([M.temporadaActual]);
    B.selectorTemporadas(document.getElementById('filtro-temporadas'), temporadas, [M.temporadaActual], function (v) {
        filtro = v;
        pintar();
    });

    function stat(etiqueta, valor, clase) {
        return '<div class="bk-stat' + (clase ? ' ' + clase : '') + '"><div class="bk-stat-etiqueta">' + etiqueta + '</div><div class="bk-stat-valor">' + valor + '</div></div>';
    }

    function pintar() {
        var dentro = function (x) { return !filtro || filtro.has(x.temporada); };
        var ing = ingresos.filter(dentro);
        var gas = gastos.filter(dentro);

        var cobrado = 0, pendiente = 0;
        var porConcepto = new Map();
        ing.forEach(function (i) {
            var c = porConcepto.get(i.concepto) || { cobrado: 0, pendiente: 0 };
            if (i.pagado) { cobrado += i.importe; c.cobrado += i.importe; } else { pendiente += i.importe; c.pendiente += i.importe; }
            porConcepto.set(i.concepto, c);
        });
        var gastado = 0;
        var porTipo = new Map();
        gas.forEach(function (g) {
            gastado += Number(g.precio);
            porTipo.set(g.tipo, (porTipo.get(g.tipo) || 0) + Number(g.precio));
        });
        var balance = cobrado - gastado;

        var html = '<div class="bk-stats">' +
            stat('Ingresos cobrados', esc(B.euros(cobrado))) +
            stat('Pendiente de cobro', esc(B.euros(pendiente)), pendiente > 0 ? 'bk-stat--deuda' : '') +
            stat('Gastos', esc(B.euros(gastado))) +
            stat('Balance', esc(B.euros(balance)), balance >= 0 ? 'bk-stat--ok' : 'bk-stat--deuda') +
            '</div>' +
            '<p class="bk-nota" style="margin-top:0.5rem">Lo pendiente de cobro es el total de todos los jugadores; no se muestra cuánto debe cada uno.</p>';

        html += '<div class="bk-grid bk-grid--2 bk-seccion">';
        html += '<section><h2 class="bk-h2">Ingresos</h2><div class="bk-tabla-envoltorio"><table class="bk-tabla"><thead><tr>' +
            '<th>Concepto</th><th class="num">Cobrado</th><th class="num">Pendiente</th></tr></thead><tbody>' +
            (porConcepto.size ? Array.from(porConcepto).map(function (e) {
                return '<tr><td>' + esc(e[0]) + '</td><td class="num">' + esc(B.euros(e[1].cobrado)) + '</td><td class="num">' + esc(B.euros(e[1].pendiente)) + '</td></tr>';
            }).join('') : '<tr><td colspan="3" class="bk-vacio">Sin ingresos.</td></tr>') +
            '</tbody><tfoot><tr><td>Total</td><td class="num">' + esc(B.euros(cobrado)) + '</td><td class="num">' + esc(B.euros(pendiente)) + '</td></tr></tfoot></table></div></section>';

        html += '<section><h2 class="bk-h2">Gastos por tipo</h2><div class="bk-tabla-envoltorio"><table class="bk-tabla"><thead><tr>' +
            '<th>Tipo</th><th class="num">Importe</th><th class="num">%</th></tr></thead><tbody>' +
            (porTipo.size ? Array.from(porTipo).sort(function (a, b) { return b[1] - a[1]; }).map(function (e) {
                return '<tr><td>' + esc(TIPOS_GASTO[e[0]] || e[0]) + '</td><td class="num">' + esc(B.euros(e[1])) + '</td>' +
                    '<td class="num">' + (gastado ? Math.round(e[1] * 100 / gastado) : 0) + '%</td></tr>';
            }).join('') : '<tr><td colspan="3" class="bk-vacio">Sin gastos.</td></tr>') +
            '</tbody><tfoot><tr><td>Total</td><td class="num">' + esc(B.euros(gastado)) + '</td><td></td></tr></tfoot></table></div></section>';
        html += '</div>';

        html += '<section class="bk-seccion"><h2 class="bk-h2">Detalle de gastos</h2><div class="bk-tabla-envoltorio"><table class="bk-tabla"><thead><tr>' +
            '<th>Fecha</th><th>Compra</th><th class="num bk-ocultar-movil">Cantidad</th><th class="bk-ocultar-movil">Tipo</th><th class="num">Importe</th></tr></thead><tbody>' +
            (gas.length ? gas.map(function (g) {
                return '<tr><td>' + esc(B.fecha(g.fecha)) + '</td><td>' + esc(g.compra) + '</td><td class="num bk-ocultar-movil">' + g.cantidad + '</td>' +
                    '<td class="bk-ocultar-movil">' + esc(TIPOS_GASTO[g.tipo] || g.tipo) + '</td><td class="num">' + esc(B.euros(g.precio)) + '</td></tr>';
            }).join('') : '<tr><td colspan="5" class="bk-vacio">Sin gastos en la selección.</td></tr>') +
            '</tbody></table></div></section>';

        cont.innerHTML = html;
    }
    pintar();
})();

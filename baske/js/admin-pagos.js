(async function () {
    'use strict';
    var B = window.Baske;
    var A = window.Admin;
    var esc = B.esc;
    var db = B.cliente;

    await B.iniciar({ admin: true, activa: 'admin' });
    var contPagos = document.getElementById('pagos');
    var contGastos = document.getElementById('gastos');
    var buscar = document.getElementById('buscar');
    var verPagados = document.getElementById('ver-pagados');
    var inputFecha = document.getElementById('fecha-pago');
    inputFecha.value = B.hoy();
    inputFecha.max = B.hoy();

    var M;
    var filtroTemp = new Set([B.temporadaActual()]);
    var selectorListo = false;

    async function recargar() {
        B.olvidar();
        try {
            M = await B.modelo(B.TABLAS_DEUDA.concat(['gasto']));
            if (!selectorListo) {
                selectorListo = true;
                B.selectorTemporadas(document.getElementById('filtro-temporadas'), M.temporadas(), [M.temporadaActual], function (v) {
                    filtroTemp = v;
                    pintarGastos();
                });
            }
            pintarPagos();
            pintarGastos();
        } catch (e) {
            B.falloCarga(contPagos, e);
        }
    }

    document.querySelectorAll('.bk-tabs button').forEach(function (b) {
        b.addEventListener('click', function () {
            document.querySelectorAll('.bk-tabs button').forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
            document.getElementById('sec-pagos').hidden = b.dataset.tab !== 'pagos';
            document.getElementById('sec-gastos').hidden = b.dataset.tab !== 'gastos';
        });
    });
    buscar.addEventListener('input', function () { pintarPagos(); });
    verPagados.addEventListener('change', function () { pintarPagos(); });

    // ==================================================================
    // PAGOS: cada cosa cobrable (reserva, pachanga suelta, entrenamiento)
    // ==================================================================
    function conceptos() {
        var d = M.d;
        var lista = [];
        var nPorReserva = new Map();
        M.pachangas.forEach(function (p) { if (p.id_reserva) nPorReserva.set(p.id_reserva, (nPorReserva.get(p.id_reserva) || 0) + 1); });
        var reservas = new Map((d.reserva_periodica || []).map(function (r) { return [r.id, r]; }));
        var entrenos = new Map((d.entrenamiento || []).map(function (e) { return [e.id, e]; }));

        (d.reserva_jugador || []).forEach(function (x) {
            var r = reservas.get(x.id_reserva);
            if (!r) return;
            lista.push({
                tabla: 'reserva_jugador', claves: { id_reserva: x.id_reserva, id_jugador: x.id_jugador }, idJugador: x.id_jugador,
                texto: 'Reserva ' + B.temporadaDe(r.fecha_inicio) + ' (' + (nPorReserva.get(r.id) || 0) + ' × ' + B.euros(r.precio_unitario) + ')',
                fecha: r.fecha_inicio, importe: r.precio_unitario * (nPorReserva.get(r.id) || 0), pagado: x.pagado, fechaPago: x.fecha_pago
            });
        });
        // pagado = null: la cubre la reserva. Si no, se cobra: suelta a su precio, de reserva sin estar apuntado +50 %
        (d.pachanga_jugador || []).forEach(function (x) {
            var p = M.pachanga.get(x.id_pachanga);
            if (!p || !x.jugado || x.pagado == null) return;
            lista.push({
                tabla: 'pachanga_jugador', claves: { id_pachanga: x.id_pachanga, id_jugador: x.id_jugador }, idJugador: x.id_jugador,
                texto: (p.id_reserva ? 'Pachanga de reserva sin estar apuntado (+50 %) ' : 'Pachanga suelta ') + B.fecha(p.fecha),
                fecha: p.fecha, importe: M.precioPachanga(p), pagado: x.pagado, fechaPago: x.fecha_pago
            });
        });
        (d.entrenamiento_jugador || []).forEach(function (x) {
            var e = entrenos.get(x.id_entrenamiento);
            if (!e || !x.asistido) return;
            lista.push({
                tabla: 'entrenamiento_jugador', claves: { id_entrenamiento: x.id_entrenamiento, id_jugador: x.id_jugador }, idJugador: x.id_jugador,
                texto: 'Entrenamiento ' + B.fecha(e.fecha), fecha: e.fecha, importe: Number(e.precio), pagado: x.pagado, fechaPago: x.fecha_pago
            });
        });
        return lista;
    }

    var ultimaLista = [];

    function pintarPagos() {
        var q = B.normalizar(buscar.value);
        var todos = conceptos().filter(function (c) { return (verPagados.checked || !c.pagado) && c.importe > 0; });
        var porJugador = new Map();
        todos.forEach(function (c) {
            if (q && B.normalizar(M.nombreJugador(c.idJugador)).indexOf(q) < 0) return;
            if (!porJugador.has(c.idJugador)) porJugador.set(c.idJugador, []);
            porJugador.get(c.idJugador).push(c);
        });

        var grupos = Array.from(porJugador).map(function (e) {
            var padrino = M.esInvitado(e[0]) ? M.padrinoDeInvitado(e[0]) : null;
            return {
                idJ: e[0], nombre: M.nombreJugador(e[0]), invitado: M.esInvitado(e[0]), padrino: padrino,
                items: e[1].sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; })
            };
        }).sort(function (a, b) {
            var da = a.items.filter(function (i) { return !i.pagado; }).length ? 0 : 1;
            var dbb = b.items.filter(function (i) { return !i.pagado; }).length ? 0 : 1;
            return da - dbb || a.nombre.localeCompare(b.nombre, 'es');
        });

        var totalPendiente = todos.filter(function (c) { return !c.pagado; }).reduce(function (s, c) { return s + c.importe; }, 0);

        if (!grupos.length) {
            contPagos.innerHTML = '<p class="bk-vacio">' + (verPagados.checked ? 'No hay nada que coincida.' : 'Nadie debe nada. 🎉') + '</p>';
            return;
        }

        ultimaLista = [];
        contPagos.innerHTML = '<p class="bk-nota" style="margin-bottom:0.75rem">Pendiente total: <strong>' + esc(B.euros(totalPendiente)) + '</strong></p>' +
            grupos.map(function (g) {
                var pendiente = g.items.filter(function (i) { return !i.pagado; });
                var deuda = pendiente.reduce(function (s, i) { return s + i.importe; }, 0);
                return '<section class="bk-card"><div class="bk-cabecera-card"><h2 class="bk-h3">' + esc(g.nombre) +
                    (g.invitado ? ' <span class="bk-chip bk-chip--gris">invitado' + (g.padrino ? ' de ' + esc(g.padrino) : '') + '</span>' : '') +
                    (deuda ? ' <span class="bk-chip bk-chip--rojo">' + esc(B.euros(deuda)) + '</span>' : '') + '</h2>' +
                    (pendiente.length > 1 ? '<button type="button" class="bk-btn bk-btn--peq" data-todo="' + g.idJ + '">Marcar todo pagado</button>' : '') + '</div>' +
                    '<div class="bk-admin-lista">' + g.items.map(function (i) {
                        var n = ultimaLista.push(i) - 1;
                        return '<div class="bk-admin-item"><div>' + esc(i.texto) + ' · <strong>' + esc(B.euros(i.importe)) + '</strong>' +
                            (i.pagado ? ' <span class="bk-chip bk-chip--verde">Pagado ' + esc(i.fechaPago ? B.fecha(i.fechaPago) : '') + '</span>' : '') + '</div>' +
                            (i.pagado
                                ? '<button type="button" class="bk-btn bk-btn--peq bk-btn--sec" data-item="' + n + '" data-valor="0">Desmarcar</button>'
                                : '<button type="button" class="bk-btn bk-btn--peq bk-btn--azul" data-item="' + n + '" data-valor="1">Marcar pagado</button>') +
                            '</div>';
                    }).join('') + '</div></section>';
            }).join('');

        contPagos.querySelectorAll('[data-item]').forEach(function (b) {
            b.addEventListener('click', function () { marcar([ultimaLista[Number(b.dataset.item)]], b.dataset.valor === '1'); });
        });
        contPagos.querySelectorAll('[data-todo]').forEach(function (b) {
            b.addEventListener('click', function () {
                var idJ = Number(b.dataset.todo);
                marcar(ultimaLista.filter(function (i) { return i.idJugador === idJ && !i.pagado; }), true);
            });
        });
    }

    async function marcar(items, pagado) {
        try {
            for (var k = 0; k < items.length; k++) {
                var i = items[k];
                var cambio = { pagado: pagado, fecha_pago: pagado ? A.fechaPago(inputFecha.value) : null };
                var consulta = db.from(i.tabla).update(cambio);
                Object.keys(i.claves).forEach(function (c) { consulta = consulta.eq(c, i.claves[c]); });
                A.ok(await consulta);
            }
            await recargar();
        } catch (e) {
            alert(B.traducirError(e));
        }
    }

    // ==================================================================
    // GASTOS
    // ==================================================================
    var TIPOS_GASTO = { reserva: 'Reserva', pachanga: 'Pachanga suelta', entrenamiento: 'Entrenamiento', general: 'General' };

    function pintarGastos() {
        var lista = (M.d.gasto || []).filter(function (g) { return !filtroTemp || filtroTemp.has(B.temporadaDe(g.fecha)); })
            .sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });
        var total = lista.reduce(function (s, g) { return s + Number(g.precio); }, 0);
        contGastos.innerHTML = !lista.length ? '<p class="bk-vacio">No hay gastos en la selección.</p>' :
            '<p class="bk-nota" style="margin-bottom:0.75rem">Total: <strong>' + esc(B.euros(total)) + '</strong></p><div class="bk-admin-lista">' +
            lista.map(function (g) {
                return '<div class="bk-admin-item" data-id="' + g.id + '"><div><strong>' + esc(g.compra) + '</strong> · ' + esc(B.euros(g.precio)) +
                    '<div class="bk-nota">' + esc(B.fecha(g.fecha)) + ' · ' + g.cantidad + ' ud. · ' + esc(TIPOS_GASTO[g.tipo] || g.tipo) + '</div></div>' +
                    '<div class="bk-chips"><button type="button" class="bk-btn bk-btn--peq bk-btn--sec" data-editar>Editar</button>' +
                    '<button type="button" class="bk-btn bk-btn--peq bk-btn--sec" data-borrar>Borrar</button></div></div>';
            }).join('') + '</div>';

        contGastos.querySelectorAll('[data-editar]').forEach(function (b) {
            b.addEventListener('click', function () {
                var id = Number(b.closest('[data-id]').dataset.id);
                editarGasto((M.d.gasto || []).find(function (g) { return g.id === id; }));
            });
        });
        contGastos.querySelectorAll('[data-borrar]').forEach(function (b) {
            b.addEventListener('click', async function () {
                if (!confirm('¿Borrar este gasto?')) return;
                try { A.ok(await db.from('gasto').delete().eq('id', Number(b.closest('[data-id]').dataset.id))); await recargar(); }
                catch (e) { alert(B.traducirError(e)); }
            });
        });
    }

    function editarGasto(g) {
        var reservas = (M.d.reserva_periodica || []).slice().sort(function (a, b) { return a.fecha_inicio < b.fecha_inicio ? 1 : -1; })
            .map(function (r) { return ['r' + r.id, 'Reserva ' + B.fecha(r.fecha_inicio) + ' – ' + B.fecha(r.fecha_fin)]; });
        var sueltas = M.pachangas.filter(function (p) { return !p.id_reserva; })
            .map(function (p) { return ['p' + p.id, 'Pachanga suelta ' + B.fecha(p.fecha)]; });
        var entrenos = (M.d.entrenamiento || []).slice().sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; })
            .map(function (e) { return ['e' + e.id, 'Entrenamiento ' + B.fecha(e.fecha)]; });
        var vinculo = g ? (g.id_reserva ? 'r' + g.id_reserva : g.id_pachanga ? 'p' + g.id_pachanga : g.id_entrenamiento ? 'e' + g.id_entrenamiento : '') : '';

        A.dialogo(g ? 'Editar gasto' : 'Nuevo gasto',
            '<div class="bk-form-grid">' +
            A.campo('Compra', 'compra', g ? g.compra : '', { requerido: true }) +
            A.campo('Precio total', 'precio', g ? g.precio : null, { tipo: 'number', min: 0, paso: '0.01', requerido: true }) +
            A.campo('Cantidad', 'cantidad', g ? g.cantidad : 1, { tipo: 'number', min: 1, requerido: true }) +
            A.campo('Fecha', 'fecha', g ? g.fecha : B.hoy(), { tipo: 'date', requerido: true }) +
            '</div>' +
            A.campo('Vinculado a', 'vinculo', null, { tipo: 'select', opciones: A.opciones(reservas.concat(sueltas, entrenos), vinculo, 'Nada (gasto general)') }),
            async function (form, v) {
                if (!v.compra || v.precio == null || !v.fecha) throw new Error('Rellena compra, precio y fecha.');
                var fila = {
                    compra: v.compra, precio: v.precio, cantidad: v.cantidad || 1, fecha: v.fecha,
                    id_reserva: v.vinculo && v.vinculo[0] === 'r' ? Number(v.vinculo.slice(1)) : null,
                    id_pachanga: v.vinculo && v.vinculo[0] === 'p' ? Number(v.vinculo.slice(1)) : null,
                    id_entrenamiento: v.vinculo && v.vinculo[0] === 'e' ? Number(v.vinculo.slice(1)) : null
                };
                if (g) A.ok(await db.from('gasto').update(fila).eq('id', g.id));
                else A.ok(await db.from('gasto').insert(fila));
                await recargar();
            });
    }

    document.getElementById('nuevo-gasto').addEventListener('click', function () { editarGasto(null); });

    await recargar();
})();

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
        // Cobros a personas concretas (p. ej. "Compra equipación")
        (d.cobro || []).forEach(function (c) {
            lista.push({
                tabla: 'cobro', claves: { id: c.id }, idJugador: c.id_jugador, cobro: c,
                texto: c.concepto, fecha: c.fecha, importe: Number(c.importe), pagado: c.pagado, fechaPago: c.fecha_pago
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
                            '<div class="bk-chips">' +
                            (i.pagado
                                ? '<button type="button" class="bk-btn bk-btn--peq bk-btn--sec" data-item="' + n + '" data-valor="0">Desmarcar</button>'
                                : '<button type="button" class="bk-btn bk-btn--peq bk-btn--azul" data-item="' + n + '" data-valor="1">Marcar pagado</button>') +
                            (i.cobro
                                ? '<button type="button" class="bk-btn bk-btn--peq bk-btn--sec" data-editar-cobro="' + n + '">Editar</button>' +
                                  '<button type="button" class="bk-btn bk-btn--peq bk-btn--sec" data-borrar-cobro="' + n + '">Borrar</button>'
                                : '') +
                            '</div></div>';
                    }).join('') + '</div></section>';
            }).join('');

        contPagos.querySelectorAll('[data-item]').forEach(function (b) {
            b.addEventListener('click', function () { marcar([ultimaLista[Number(b.dataset.item)]], b.dataset.valor === '1'); });
        });
        contPagos.querySelectorAll('[data-editar-cobro]').forEach(function (b) {
            b.addEventListener('click', function () { editarCobro(ultimaLista[Number(b.dataset.editarCobro)].cobro); });
        });
        contPagos.querySelectorAll('[data-borrar-cobro]').forEach(function (b) {
            b.addEventListener('click', async function () {
                var c = ultimaLista[Number(b.dataset.borrarCobro)].cobro;
                if (!confirm('¿Borrar el cobro "' + c.concepto + '" a ' + M.nombreJugador(c.id_jugador) + '?')) return;
                try { A.ok(await db.from('cobro').delete().eq('id', c.id)); await recargar(); }
                catch (e) { alert(B.traducirError(e)); }
            });
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
    // COBROS a personas concretas
    // ==================================================================
    // Miembros sin baja + invitados, en orden (miembros por apellido, luego invitados)
    function personas() {
        var lista = [];
        (M.d.jugador || []).forEach(function (j) {
            var m = j.id_miembro ? M.miembro.get(j.id_miembro) : null;
            if (m && m.fecha_baja) return;
            lista.push({ id: j.id, nombre: M.nombreJugador(j.id), miembro: m, invitado: !m });
        });
        return lista.sort(function (a, b) {
            if (a.invitado !== b.invitado) return a.invitado ? 1 : -1;
            if (a.miembro && b.miembro) return M.compararMiembros(a.miembro, b.miembro);
            return a.nombre.localeCompare(b.nombre, 'es');
        });
    }

    // Lista de casillas con buscador para elegir a quién se cobra
    function selectorPersonas() {
        return '<div class="bk-campo"><label>A quién se cobra</label>' +
            '<div class="bk-barra" style="margin-bottom:0.4rem"><input type="search" class="buscar-personas" placeholder="Filtrar…" aria-label="Filtrar personas">' +
            '<button type="button" class="bk-btn bk-btn--peq bk-btn--sec" data-todos>Todos los visibles</button>' +
            '<button type="button" class="bk-btn bk-btn--peq bk-btn--sec" data-ninguno>Ninguno</button></div>' +
            '<div class="bk-personas-lista">' + personas().map(function (x) {
                return '<label data-nombre="' + esc(B.normalizar(x.nombre)) + '"><input type="checkbox" class="c-persona" value="' + x.id + '"> ' + esc(x.nombre) +
                    (x.invitado ? ' <span class="bk-chip bk-chip--gris">invitado</span>' : '') + '</label>';
            }).join('') + '</div><p class="bk-nota cuantos">Nadie elegido.</p></div>';
    }

    function activarSelector(d) {
        var buscarP = d.querySelector('.buscar-personas');
        var cuantos = d.querySelector('.cuantos');
        function contar() {
            var n = d.querySelectorAll('.c-persona:checked').length;
            cuantos.textContent = n ? n + (n === 1 ? ' persona elegida.' : ' personas elegidas.') : 'Nadie elegido.';
        }
        buscarP.addEventListener('input', function () {
            var q = B.normalizar(buscarP.value);
            d.querySelectorAll('.bk-personas-lista label').forEach(function (l) { l.hidden = q && l.dataset.nombre.indexOf(q) < 0; });
        });
        d.querySelector('[data-todos]').addEventListener('click', function () {
            d.querySelectorAll('.bk-personas-lista label:not([hidden]) .c-persona').forEach(function (c) { c.checked = true; });
            contar();
        });
        d.querySelector('[data-ninguno]').addEventListener('click', function () {
            d.querySelectorAll('.c-persona').forEach(function (c) { c.checked = false; });
            contar();
        });
        d.querySelectorAll('.c-persona').forEach(function (c) { c.addEventListener('change', contar); });
    }

    function elegidas(form) {
        return Array.from(form.querySelectorAll('.c-persona:checked')).map(function (c) { return Number(c.value); });
    }

    function opcionesGastos(seleccionado) {
        var lista = (M.d.gasto || []).slice().sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; })
            .map(function (g) { return [g.id, g.compra + ' (' + B.fecha(g.fecha) + ')']; });
        return A.opciones(lista, seleccionado, 'Ninguno');
    }

    function nuevoCobro() {
        A.dialogo('Cobro a miembros',
            '<div class="bk-form-grid">' +
            A.campo('Concepto', 'concepto', '', { requerido: true }) +
            A.campo('Importe por persona', 'importe', null, { tipo: 'number', min: 0, paso: '0.01', requerido: true }) +
            A.campo('Fecha', 'fecha', B.hoy(), { tipo: 'date', requerido: true }) +
            A.campo('Sale del gasto', 'id_gasto', null, { tipo: 'select', numero: true, opciones: opcionesGastos(null) }) +
            '</div>' + selectorPersonas() +
            '<p class="bk-nota">Ej.: "Compra equipación", 25 € a cada uno de los que la pidieron. Cada persona aparece en Pagos con lo que debe.</p>',
            async function (form, v) {
                var ids = elegidas(form);
                if (!v.concepto || v.importe == null) throw new Error('Pon el concepto y el importe.');
                if (!ids.length) throw new Error('Elige al menos una persona.');
                A.ok(await db.from('cobro').insert(ids.map(function (id) {
                    return { id_jugador: id, concepto: v.concepto, importe: v.importe, fecha: v.fecha || B.hoy(), id_gasto: v.id_gasto };
                })));
                await recargar();
            }, { ancho: '720px', alAbrir: activarSelector });
    }

    function editarCobro(c) {
        A.dialogo('Editar cobro a ' + M.nombreJugador(c.id_jugador),
            '<div class="bk-form-grid">' +
            A.campo('Concepto', 'concepto', c.concepto, { requerido: true }) +
            A.campo('Importe', 'importe', c.importe, { tipo: 'number', min: 0, paso: '0.01', requerido: true }) +
            A.campo('Fecha', 'fecha', c.fecha, { tipo: 'date', requerido: true }) +
            A.campo('Sale del gasto', 'id_gasto', null, { tipo: 'select', numero: true, opciones: opcionesGastos(c.id_gasto) }) +
            '</div>',
            async function (form, v) {
                if (!v.concepto || v.importe == null) throw new Error('Pon el concepto y el importe.');
                A.ok(await db.from('cobro').update({ concepto: v.concepto, importe: v.importe, fecha: v.fecha || c.fecha, id_gasto: v.id_gasto }).eq('id', c.id));
                await recargar();
            });
    }

    document.getElementById('nuevo-cobro').addEventListener('click', nuevoCobro);

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
                var cobros = (M.d.cobro || []).filter(function (c) { return c.id_gasto === g.id; });
                var pendientes = cobros.filter(function (c) { return !c.pagado; }).length;
                return '<div class="bk-admin-item" data-id="' + g.id + '"><div><strong>' + esc(g.compra) + '</strong> · ' + esc(B.euros(g.precio)) +
                    '<div class="bk-nota">' + esc(B.fecha(g.fecha)) + ' · ' + g.cantidad + ' ud. · ' + esc(TIPOS_GASTO[g.tipo] || g.tipo) +
                    (cobros.length ? ' · cobrado a ' + cobros.length + (pendientes ? ' (' + pendientes + ' sin pagar)' : ' (todos pagados)') : '') + '</div></div>' +
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
            A.campo('Vinculado a', 'vinculo', null, { tipo: 'select', opciones: A.opciones(reservas.concat(sueltas, entrenos), vinculo, 'Nada (gasto general)') }) +
            '<details class="bk-cobrar"><summary>Cobrar a miembros (opcional)</summary>' +
            '<p class="bk-nota">Crea un cobro por persona con este concepto. Aparecerán en Pagos con lo que deben.</p>' +
            A.campo('Importe por persona', 'importe_persona', null, { tipo: 'number', min: 0, paso: '0.01' }) +
            selectorPersonas() + '</details>',
            async function (form, v) {
                var ids = elegidas(form);
                if (ids.length && v.importe_persona == null) throw new Error('Pon el importe por persona para los cobros.');
                if (!v.compra || v.precio == null || !v.fecha) throw new Error('Rellena compra, precio y fecha.');
                var fila = {
                    compra: v.compra, precio: v.precio, cantidad: v.cantidad || 1, fecha: v.fecha,
                    id_reserva: v.vinculo && v.vinculo[0] === 'r' ? Number(v.vinculo.slice(1)) : null,
                    id_pachanga: v.vinculo && v.vinculo[0] === 'p' ? Number(v.vinculo.slice(1)) : null,
                    id_entrenamiento: v.vinculo && v.vinculo[0] === 'e' ? Number(v.vinculo.slice(1)) : null
                };
                var idGasto;
                if (g) { A.ok(await db.from('gasto').update(fila).eq('id', g.id)); idGasto = g.id; }
                else idGasto = A.ok(await db.from('gasto').insert(fila).select('id').single()).id;
                if (ids.length) {
                    A.ok(await db.from('cobro').insert(ids.map(function (id) {
                        return { id_jugador: id, concepto: v.compra, importe: v.importe_persona, fecha: v.fecha, id_gasto: idGasto };
                    })));
                }
                await recargar();
            }, { ancho: '720px', alAbrir: activarSelector });
    }

    document.getElementById('nuevo-gasto').addEventListener('click', function () { editarGasto(null); });

    await recargar();
})();

(async function () {
    'use strict';
    var B = window.Baske;
    var A = window.Admin;
    var esc = B.esc;
    var db = B.cliente;

    await B.iniciar({ admin: true, activa: 'admin' });
    var barra = document.getElementById('barra');
    var contenido = document.getElementById('contenido');

    var TABLAS = B.TABLAS_DEUDA.concat(['equipo', 'jugador_equipo']);
    var M;
    var pestana = 'pachangas';
    var filtroTemp = new Set([B.temporadaActual()]);
    var ocultarProximas = false;
    var DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    async function recargar() {
        B.olvidar();
        try {
            M = await B.modelo(TABLAS);
            pintar();
        } catch (e) {
            B.falloCarga(contenido, e);
        }
    }

    document.querySelectorAll('.bk-tabs button').forEach(function (b) {
        b.addEventListener('click', function () {
            pestana = b.dataset.tab;
            document.querySelectorAll('.bk-tabs button').forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
            pintar();
        });
    });

    function pintar() {
        barra.innerHTML = '';
        var nuevo = document.createElement('button');
        nuevo.type = 'button';
        nuevo.className = 'bk-btn bk-btn--azul';
        barra.appendChild(nuevo);

        if (pestana !== 'reservas') {
            var cont = document.createElement('div');
            barra.appendChild(cont);
            var temporadas = M.temporadas();
            B.selectorTemporadas(cont, temporadas, filtroTemp ? Array.from(filtroTemp) : 'todas', function (v) {
                filtroTemp = v;
                pintar();
            });
        }

        if (pestana === 'pachangas') {
            nuevo.textContent = '+ Nueva pachanga';
            nuevo.onclick = function () { editarPachanga(null); };
            var check = document.createElement('label');
            check.className = 'bk-check';
            check.innerHTML = '<input type="checkbox"' + (ocultarProximas ? ' checked' : '') + '> Ocultar próximas';
            check.querySelector('input').addEventListener('change', function () {
                ocultarProximas = this.checked;
                pintarPachangas();
            });
            barra.appendChild(check);
            pintarPachangas();
        } else if (pestana === 'reservas') {
            nuevo.textContent = '+ Nueva reserva';
            nuevo.onclick = function () { editarReserva(null); };
            pintarReservas();
        } else {
            nuevo.textContent = '+ Nuevo entrenamiento';
            nuevo.onclick = function () { editarEntreno(null); };
            pintarEntrenos();
        }
    }

    function boton(texto, accion, clase) {
        return '<button type="button" class="bk-btn bk-btn--peq ' + (clase || 'bk-btn--sec') + '" data-accion="' + accion + '">' + texto + '</button>';
    }

    function enlazar(acciones) {
        contenido.querySelectorAll('[data-accion]').forEach(function (b) {
            b.addEventListener('click', function () {
                var id = Number(b.closest('[data-id]').dataset.id);
                acciones[b.dataset.accion](id);
            });
        });
    }

    function textoReserva(r) {
        return B.fecha(r.fecha_inicio) + ' – ' + B.fecha(r.fecha_fin) + ' (' + B.euros(r.precio_unitario) + ')';
    }

    function opcionesPista(valor) {
        return A.opciones(Object.keys(B.PISTAS).map(function (k) { return [k, B.PISTAS[k]]; }), valor || 'media');
    }
    function chipPista(x) { return '<span class="bk-chip bk-chip--gris">' + esc(B.PISTAS[x.pista] || B.PISTAS.media) + '</span>'; }
    var AVISO_GASTO = '<p class="bk-nota">Al crearla se apunta sola como gasto con el coste total; después se edita en Pagos y gastos.</p>';

    // Miembros (sin baja) + invitados, para las listas de asistencia
    function jugadoresParaLista(incluirIds) {
        var incluir = new Set(incluirIds || []);
        var lista = [];
        (M.d.jugador || []).forEach(function (j) {
            var m = j.id_miembro ? M.miembro.get(j.id_miembro) : null;
            if (m && m.fecha_baja && !incluir.has(j.id)) return;
            lista.push({ id: j.id, nombre: M.nombreJugador(j.id), invitado: !m, miembro: m, padrino: m ? null : M.padrinoDeInvitado(j.id) });
        });
        return lista.sort(function (a, b) {
            if (a.invitado !== b.invitado) return a.invitado ? 1 : -1;
            if (a.miembro && b.miembro) return M.compararMiembros(a.miembro, b.miembro);
            return a.nombre.localeCompare(b.nombre, 'es');
        });
    }

    // ==================================================================
    // PACHANGAS
    // ==================================================================
    function pintarPachangas() {
        var lista = M.pachangas.filter(function (p) {
            return (!filtroTemp || filtroTemp.has(p.temporada)) && (!ocultarProximas || p.jugada);
        });
        if (!lista.length) { contenido.innerHTML = '<p class="bk-vacio">No hay pachangas en la selección.</p>'; return; }
        contenido.innerHTML = '<div class="bk-admin-lista">' + lista.map(function (p) {
            return '<div class="bk-admin-item" data-id="' + p.id + '"><div><strong>' + esc(B.fecha(p.fecha)) + '</strong> ' +
                (p.id_reserva ? '<span class="bk-chip">Reserva</span>' : '<span class="bk-chip bk-chip--negro">Suelta · ' + esc(B.euros(p.precio)) + '</span>') + ' ' + chipPista(p) +
                (p.cervezas ? ' <span class="bk-chip bk-chip--verde">Cervezas</span>' : '') +
                (p.jugada ? '' : ' <span class="bk-chip bk-chip--gris">Próxima</span>') +
                '<div class="bk-nota">' + p.asistentes.length + ' jugaron' + (p.cervezas ? ' · ' + p.cerveceros.length + ' en cervezas' : '') + '</div></div>' +
                '<div class="bk-chips">' + boton('Asistencia', 'asistencia', 'bk-btn--azul') + boton('Editar', 'editar') + boton('Borrar', 'borrar') + '</div></div>';
        }).join('') + '</div>';
        enlazar({
            asistencia: asistenciaPachanga,
            editar: function (id) { editarPachanga(M.pachanga.get(id)); },
            borrar: borrarPachanga
        });
    }

    function reservaDeFecha(fecha) {
        return (M.d.reserva_periodica || []).find(function (r) { return fecha >= r.fecha_inicio && fecha <= r.fecha_fin; });
    }

    function editarPachanga(p) {
        var fechaIni = p ? p.fecha : B.hoy();
        var reservaIni = p ? p.id_reserva : (reservaDeFecha(fechaIni) || {}).id;
        var reservas = (M.d.reserva_periodica || []).slice().sort(function (a, b) { return a.fecha_inicio < b.fecha_inicio ? 1 : -1; })
            .map(function (r) { return [r.id, textoReserva(r)]; });

        A.dialogo(p ? 'Editar pachanga' : 'Nueva pachanga',
            '<div class="bk-form-grid">' +
            A.campo('Fecha', 'fecha', fechaIni, { tipo: 'date', requerido: true }) +
            A.campo('Reserva', 'id_reserva', null, { tipo: 'select', numero: true, opciones: A.opciones(reservas, reservaIni, 'Ninguna (pachanga suelta)') }) +
            A.campo('Pista', 'pista', null, { tipo: 'select', opciones: opcionesPista(p ? p.pista : (reservaDeFecha(fechaIni) || {}).pista) }) +
            '<div data-solo-suelta>' + A.campo('Precio por jugador', 'precio', p ? p.precio : null, { tipo: 'number', min: 0, paso: '0.01' }) + '</div>' +
            '<div data-solo-suelta>' + A.campo('Coste total de la pista', 'coste', p ? p.coste : null, { tipo: 'number', min: 0, paso: '0.01' }) + '</div>' +
            '</div>' + A.campo('Hay cervezas', 'cervezas', p ? p.cervezas : false, { tipo: 'checkbox' }) +
            (p ? '' : '<div data-solo-suelta>' + AVISO_GASTO + '</div>'),
            async function (form, v) {
                if (!v.fecha) throw new Error('Pon la fecha.');
                if (!v.id_reserva && v.precio == null) throw new Error('Una pachanga suelta necesita precio por jugador.');
                if (!p && !v.id_reserva && v.coste == null) throw new Error('Pon el coste total de la pista (para el gasto).');
                var fila = {
                    fecha: v.fecha, id_reserva: v.id_reserva, precio: v.id_reserva ? null : v.precio,
                    coste: v.id_reserva ? null : v.coste, cervezas: v.cervezas, pista: v.pista || 'media'
                };
                if (p) A.ok(await db.from('pachanga').update(fila).eq('id', p.id));
                else A.ok(await db.from('pachanga').insert(fila));
                await recargar();
            },
            {
                alAbrir: function (d) {
                    // Al cambiar la fecha de una nueva pachanga, propone la reserva que la cubre
                    var inputFecha = d.querySelector('[name="fecha"]');
                    var selReserva = d.querySelector('[name="id_reserva"]');
                    var selPista = d.querySelector('[name="pista"]');
                    function verSuelta() {
                        d.querySelectorAll('[data-solo-suelta]').forEach(function (el) { el.hidden = !!selReserva.value; });
                    }
                    selReserva.addEventListener('change', function () {
                        var r = (M.d.reserva_periodica || []).find(function (x) { return String(x.id) === selReserva.value; });
                        if (r && !p) selPista.value = r.pista || 'media';
                        verSuelta();
                    });
                    if (!p) inputFecha.addEventListener('change', function () {
                        var r = reservaDeFecha(inputFecha.value);
                        selReserva.value = r ? r.id : '';
                        if (r) selPista.value = r.pista || 'media';
                        verSuelta();
                    });
                    verSuelta();
                }
            });
    }

    async function borrarPachanga(id) {
        var p = M.pachanga.get(id);
        if (!confirm('¿Borrar la pachanga del ' + B.fecha(p.fecha) + '? Se borran también su asistencia, equipos y votos.')) return;
        try {
            A.ok(await db.from('top_pachanga').delete().eq('id_pachanga', id));
            A.ok(await db.from('pachanga').delete().eq('id', id));
            await recargar();
        } catch (e) {
            alert(B.traducirError(e));
        }
    }

    // previo (opcional): Map idJugador -> { jugado, cerveza, vio, pagado, equipo } con lo marcado
    // en pantalla antes de reabrir el diálogo (al crear un equipo), para no perderlo.
    function asistenciaPachanga(id, previo) {
        var p = M.pachanga.get(id);
        var actuales = new Map((M.d.pachanga_jugador || []).filter(function (x) { return x.id_pachanga === id; }).map(function (x) { return [x.id_jugador, x]; }));
        var equipos = (M.d.equipo || []).filter(function (e) { return e.id_pachanga === id; });
        var equipoDe = new Map((M.d.jugador_equipo || []).filter(function (x) { return x.id_pachanga === id; }).map(function (x) { return [x.id_jugador, x.id_equipo]; }));
        var suelta = !p.id_reserva;
        // En pachangas de reserva, los apuntados no pagan aparte; el resto paga precio + 50 %
        var apuntados = new Set((M.d.reserva_jugador || []).filter(function (x) { return x.id_reserva === p.id_reserva; }).map(function (x) { return x.id_jugador; }));
        function cobrable(idJ) { return suelta || !apuntados.has(idJ); }
        var precio = M.precioPachanga(p);

        function filaJugador(j) {
            var pr = previo && previo.get(j.id);
            var a = pr || actuales.get(j.id);
            var equipoActual = pr ? pr.equipo : equipoDe.get(j.id);
            var veces = j.invitado ? (M.pjDeJugador.get(j.id) || []).filter(function (x) { return x.jugado; }).length : 0;
            return '<tr data-jugador="' + j.id + '" data-nombre="' + esc(B.normalizar(j.nombre)) + '"><td>' + esc(j.nombre) +
                (j.invitado ? ' <span class="bk-chip bk-chip--gris">invitado' + (j.padrino ? ' de ' + esc(j.padrino) : '') + (veces ? ' · ' + veces + (veces === 1 ? ' vez' : ' veces') : '') + '</span>' : '') + '</td>' +
                '<td><input type="checkbox" class="c-jugado" aria-label="Jugó"' + (a && a.jugado ? ' checked' : '') + '></td>' +
                '<td><input type="checkbox" class="c-cerveza" aria-label="Cerveza"' + (a && a.cerveza ? ' checked' : '') + (p.cervezas ? '' : ' disabled') + '></td>' +
                '<td><input type="checkbox" class="c-vio" aria-label="Vino a ver"' + (a && a.vio && !a.jugado ? ' checked' : '') + '></td>' +
                (cobrable(j.id)
                    ? '<td><input type="checkbox" class="c-pagado" aria-label="Pagado"' + (a && a.pagado ? ' checked' : '') + '></td>'
                    : '<td><span class="bk-nota">Reserva</span></td>') +
                '<td><select class="c-equipo" aria-label="Equipo"' + (equipos.length ? '' : ' disabled') + '>' +
                A.opciones(equipos.map(function (e) { return [e.id, e.nombre || 'Equipo ' + e.id]; }), equipoActual, '—') + '</select></td></tr>';
        }

        var cuerpo =
            '<p class="bk-nota" style="margin-bottom:0.75rem">' + esc(B.fechaLarga(p.fecha)) + (p.cervezas ? ' · con cervezas' : ' · sin cervezas (actívalas en Editar)') +
            ' · ' + (suelta ? 'cada jugador paga ' + esc(B.euros(precio)) : 'los no apuntados a la reserva pagan ' + esc(B.euros(precio)) + ' (+50 %)') + '</p>' +
            '<div class="bk-barra"><input type="search" class="buscar" placeholder="Filtrar por nombre…" aria-label="Filtrar">' +
            '<button type="button" class="bk-btn bk-btn--peq bk-btn--sec" data-nuevo-invitado>+ Invitado</button>' +
            '<button type="button" class="bk-btn bk-btn--peq bk-btn--sec" data-nuevo-equipo>+ Equipo</button></div>' +
            '<div class="nuevo-invitado bk-card" hidden style="margin-bottom:1rem"><div class="bk-form-grid">' +
            '<div class="bk-campo"><label>Nombre del invitado</label><input type="text" class="inv-nombre" maxlength="60"></div>' +
            '<div class="bk-campo"><label>Padrino</label><select class="inv-padrino">' + A.opcionesMiembros(M, null, 'Sin padrino', function (m) { return !m.fecha_baja; }) + '</select></div>' +
            '<div class="bk-campo" style="justify-content:flex-end"><button type="button" class="bk-btn bk-btn--peq" data-crear-invitado>Añadir</button></div></div></div>' +
            '<div class="equipos">' + equipos.map(function (e) {
                return '<div class="bk-form-grid" data-equipo="' + e.id + '">' +
                    '<div class="bk-campo"><label>Nombre del equipo</label><input type="text" class="eq-nombre" value="' + esc(e.nombre || '') + '"></div>' +
                    '<div class="bk-campo"><label>Partidos ganados</label><input type="number" class="eq-ganados" min="0" value="' + (e.partidos_ganados == null ? '' : e.partidos_ganados) + '"></div></div>';
            }).join('') + '</div>' +
            '<div class="bk-tabla-envoltorio" style="max-height:50vh;overflow:auto"><table class="bk-tabla bk-tabla--compacta bk-asistencia-tabla"><thead><tr>' +
            '<th>Jugador</th><th>Jugó</th><th>Cerveza</th><th title="Vino a ver sin jugar">Vio</th><th>Pagado</th><th>Equipo</th></tr></thead><tbody>' +
            jugadoresParaLista(Array.from(actuales.keys()).concat(previo ? Array.from(previo.keys()) : [])).map(filaJugador).join('') +
            '</tbody></table></div>';

        A.dialogo('Asistencia', cuerpo, async function (form) {
            var filas = [];
            var borrar = [];
            var equiposElegidos = [];
            form.querySelectorAll('tr[data-jugador]').forEach(function (tr) {
                var idJ = Number(tr.dataset.jugador);
                var jugado = tr.querySelector('.c-jugado').checked;
                var cerveza = p.cervezas && tr.querySelector('.c-cerveza').checked;
                var vio = !jugado && tr.querySelector('.c-vio').checked;
                var casilla = tr.querySelector('.c-pagado');
                var pagado = casilla ? casilla.checked : null;
                var a = actuales.get(idJ);
                if (jugado || cerveza || vio) {
                    if (!a || a.jugado !== jugado || a.cerveza !== cerveza || !!a.vio !== vio || (casilla && !!a.pagado !== pagado)) {
                        var fila = { id_pachanga: id, id_jugador: idJ, jugado: jugado, cerveza: cerveza, vio: vio };
                        if (casilla) fila.pagado = pagado;
                        filas.push(fila);
                    }
                    var eq = tr.querySelector('.c-equipo').value;
                    if (eq && jugado) equiposElegidos.push({ id_equipo: Number(eq), id_pachanga: id, id_jugador: idJ });
                } else if (a) {
                    borrar.push(idJ);
                }
            });

            if (filas.length) A.ok(await db.from('pachanga_jugador').upsert(filas, { onConflict: 'id_pachanga,id_jugador' }));
            if (borrar.length) A.ok(await db.from('pachanga_jugador').delete().eq('id_pachanga', id).in('id_jugador', borrar));

            var bloquesEquipo = form.querySelectorAll('[data-equipo]');
            for (var i = 0; i < bloquesEquipo.length; i++) {
                var bl = bloquesEquipo[i];
                var g = bl.querySelector('.eq-ganados').value;
                A.ok(await db.from('equipo').update({
                    nombre: bl.querySelector('.eq-nombre').value.trim() || null,
                    partidos_ganados: g === '' ? null : Number(g)
                }).eq('id', Number(bl.dataset.equipo)));
            }
            if (bloquesEquipo.length) {
                A.ok(await db.from('jugador_equipo').delete().eq('id_pachanga', id));
                if (equiposElegidos.length) A.ok(await db.from('jugador_equipo').insert(equiposElegidos));
            }
            await recargar();
        }, {
            ancho: '820px',
            alAbrir: function (d) {
                var buscar = d.querySelector('.buscar');
                buscar.addEventListener('input', function () {
                    var q = B.normalizar(buscar.value);
                    d.querySelectorAll('tr[data-jugador]').forEach(function (tr) { tr.hidden = q && tr.dataset.nombre.indexOf(q) < 0; });
                });
                // Marcar cerveza o equipo implica estar en la lista
                d.querySelectorAll('tr[data-jugador]').forEach(function (tr) {
                    tr.querySelector('.c-equipo').addEventListener('change', function () {
                        if (this.value) { tr.querySelector('.c-jugado').checked = true; tr.querySelector('.c-vio').checked = false; }
                    });
                    // Jugar ya es estar allí: "Vio" es solo para quien vino sin jugar
                    tr.querySelector('.c-jugado').addEventListener('change', function () { if (this.checked) tr.querySelector('.c-vio').checked = false; });
                    tr.querySelector('.c-vio').addEventListener('change', function () { if (this.checked) tr.querySelector('.c-jugado').checked = false; });
                });

                var panelInv = d.querySelector('.nuevo-invitado');
                d.querySelector('[data-nuevo-invitado]').addEventListener('click', function () { panelInv.hidden = !panelInv.hidden; });
                d.querySelector('[data-crear-invitado]').addEventListener('click', async function () {
                    var nombre = d.querySelector('.inv-nombre').value.trim();
                    var padrino = d.querySelector('.inv-padrino').value;
                    if (!nombre) { alert('Pon el nombre del invitado.'); return; }
                    // Un invitado que repite es la misma persona: se marca su fila (y acumula sus deudas)
                    var mismo = Array.from(d.querySelectorAll('tr[data-jugador]')).find(function (tr) {
                        var jj = M.jugador.get(Number(tr.dataset.jugador));
                        return jj && !jj.id_miembro && B.normalizar(M.nombreJugador(jj.id)) === B.normalizar(nombre);
                    });
                    if (mismo && confirm('Ya hay un invitado llamado "' + nombre + '". ¿Es la misma persona?\n\nAceptar: se marca el que ya existe (acumula sus pachangas y deudas).\nCancelar: se crea otro invitado distinto.')) {
                        mismo.hidden = false;
                        mismo.querySelector('.c-jugado').checked = true;
                        mismo.scrollIntoView({ block: 'center' });
                        return;
                    }
                    try {
                        var inv = A.ok(await db.from('invitado').insert({ nombre: nombre, id_padrino: padrino ? Number(padrino) : null }).select().single());
                        var jug = A.ok(await db.from('jugador').insert({ id_invitado: inv.id }).select().single());
                        M.d.invitado.push(inv);
                        M.d.jugador.push(jug);
                        M.invitado.set(inv.id, inv);
                        M.jugador.set(jug.id, jug);
                        var tbody = d.querySelector('tbody');
                        tbody.insertAdjacentHTML('beforeend', filaJugador({ id: jug.id, nombre: nombre, invitado: true }));
                        tbody.lastElementChild.querySelector('.c-jugado').checked = true;
                        d.querySelector('.inv-nombre').value = '';
                        panelInv.hidden = true;
                    } catch (e) {
                        alert(B.traducirError(e));
                    }
                });

                d.querySelector('[data-nuevo-equipo]').addEventListener('click', async function () {
                    var nombre = prompt('Nombre del equipo (p. ej. Azul):');
                    if (nombre === null) return;
                    try {
                        A.ok(await db.from('equipo').insert({ id_pachanga: id, nombre: nombre.trim() || null }));
                        // Guardar lo marcado (aún sin guardar) para recuperarlo al reabrir
                        var marcado = new Map();
                        d.querySelectorAll('tr[data-jugador]').forEach(function (tr) {
                            var casilla = tr.querySelector('.c-pagado');
                            var eq = tr.querySelector('.c-equipo').value;
                            marcado.set(Number(tr.dataset.jugador), {
                                jugado: tr.querySelector('.c-jugado').checked,
                                cerveza: tr.querySelector('.c-cerveza').checked,
                                vio: tr.querySelector('.c-vio').checked,
                                pagado: casilla ? casilla.checked : null,
                                equipo: eq ? Number(eq) : null
                            });
                        });
                        d.close();
                        await recargar();
                        asistenciaPachanga(id, marcado);
                    } catch (e) {
                        alert(B.traducirError(e));
                    }
                });
            }
        });
    }

    // ==================================================================
    // RESERVAS
    // ==================================================================
    function pintarReservas() {
        var reservas = (M.d.reserva_periodica || []).slice().sort(function (a, b) { return a.fecha_inicio < b.fecha_inicio ? 1 : -1; });
        if (!reservas.length) { contenido.innerHTML = '<p class="bk-vacio">No hay reservas.</p>'; return; }
        contenido.innerHTML = '<div class="bk-admin-lista">' + reservas.map(function (r) {
            var n = M.pachangas.filter(function (p) { return p.id_reserva === r.id; }).length;
            var apuntados = (M.d.reserva_jugador || []).filter(function (x) { return x.id_reserva === r.id; });
            var sinPagar = apuntados.filter(function (x) { return !x.pagado; }).length;
            return '<div class="bk-admin-item" data-id="' + r.id + '"><div><strong>' + esc(B.fecha(r.fecha_inicio) + ' – ' + B.fecha(r.fecha_fin)) + '</strong> ' +
                '<span class="bk-chip">' + esc(B.temporadaDe(r.fecha_inicio)) + '</span> ' + chipPista(r) +
                '<div class="bk-nota">' + esc(B.euros(r.precio_unitario)) + ' por pachanga · coste ' + esc(B.euros(r.coste_reserva)) + ' · ' + n + ' pachangas · ' +
                apuntados.length + ' apuntados' + (sinPagar ? ' (' + sinPagar + ' sin pagar)' : '') + '</div></div>' +
                '<div class="bk-chips">' + boton('Apuntados', 'apuntados', 'bk-btn--azul') + boton('Editar', 'editar') + boton('Borrar', 'borrar') + '</div></div>';
        }).join('') + '</div>';
        enlazar({
            apuntados: apuntadosReserva,
            editar: function (id) { editarReserva((M.d.reserva_periodica || []).find(function (r) { return r.id === id; })); },
            borrar: async function (id) {
                if (M.pachangas.some(function (p) { return p.id_reserva === id; })) { alert('La reserva tiene pachangas: bórralas antes.'); return; }
                if (!confirm('¿Borrar esta reserva y su gasto de pista?')) return;
                try {
                    A.ok(await db.from('gasto').delete().eq('id_reserva', id));
                    A.ok(await db.from('reserva_periodica').delete().eq('id', id));
                    await recargar();
                }
                catch (e) { alert(B.traducirError(e)); }
            }
        });
    }

    function editarReserva(r) {
        A.dialogo(r ? 'Editar reserva' : 'Nueva reserva',
            '<div class="bk-form-grid">' +
            A.campo('Desde', 'fecha_inicio', r ? r.fecha_inicio : null, { tipo: 'date', requerido: true }) +
            A.campo('Hasta', 'fecha_fin', r ? r.fecha_fin : null, { tipo: 'date', requerido: true }) +
            A.campo('Precio por pachanga (jugador)', 'precio_unitario', r ? r.precio_unitario : null, { tipo: 'number', min: 0, paso: '0.01', requerido: true }) +
            A.campo('Coste total de la reserva', 'coste_reserva', r ? r.coste_reserva : null, { tipo: 'number', min: 0, paso: '0.01', requerido: true }) +
            A.campo('Pista', 'pista', null, { tipo: 'select', opciones: opcionesPista(r ? r.pista : null) }) +
            '</div>' + (r ? '' : AVISO_GASTO) +
            '<p class="bk-nota">Quien juegue una pachanga de la reserva sin estar apuntado (miembro o invitado) paga el precio por pachanga + 50 %.</p>' +
            (r ? '' : '<div class="bk-card bk-card--azul" style="margin-top:0.5rem">' +
                A.campo('Crear una pachanga cada semana', 'generar', true, { tipo: 'checkbox' }) +
                A.campo('Día de la semana', 'dia', null, { tipo: 'select', opciones: A.opciones(DIAS.map(function (dd, i) { return [i, dd]; }), 2) }) +
                '<p class="bk-nota">Las pachangas se crean sin cervezas; se pueden activar luego una a una.</p></div>'),
            async function (form, v) {
                if (!v.fecha_inicio || !v.fecha_fin || v.precio_unitario == null || v.coste_reserva == null) throw new Error('Rellena todos los campos.');
                if (v.fecha_fin < v.fecha_inicio) throw new Error('La fecha final es anterior a la inicial.');
                var fila = { fecha_inicio: v.fecha_inicio, fecha_fin: v.fecha_fin, precio_unitario: v.precio_unitario, coste_reserva: v.coste_reserva, pista: v.pista || 'media' };
                if (r) {
                    A.ok(await db.from('reserva_periodica').update(fila).eq('id', r.id));
                } else {
                    var nueva = A.ok(await db.from('reserva_periodica').insert(fila).select().single());
                    if (v.generar) {
                        var dia = Number(v.dia);
                        var fechas = [];
                        for (var f = v.fecha_inicio; f <= v.fecha_fin; f = B.sumarDias(f, 1)) {
                            if (new Date(f + 'T00:00:00Z').getUTCDay() === dia) fechas.push({ id_reserva: nueva.id, fecha: f, cervezas: false, pista: fila.pista });
                        }
                        if (fechas.length) A.ok(await db.from('pachanga').insert(fechas));
                    }
                }
                await recargar();
            });
    }

    function apuntadosReserva(id) {
        var actuales = new Map((M.d.reserva_jugador || []).filter(function (x) { return x.id_reserva === id; }).map(function (x) { return [x.id_jugador, x]; }));
        var lista = jugadoresParaLista(Array.from(actuales.keys())).filter(function (j) { return !j.invitado || actuales.has(j.id); });

        A.dialogo('Apuntados a la reserva',
            '<div class="bk-tabla-envoltorio" style="max-height:55vh;overflow:auto"><table class="bk-tabla bk-tabla--compacta bk-asistencia-tabla"><thead><tr>' +
            '<th>Jugador</th><th>Apuntado</th><th>Pagado</th></tr></thead><tbody>' +
            lista.map(function (j) {
                var a = actuales.get(j.id);
                return '<tr data-jugador="' + j.id + '"><td>' + esc(j.nombre) + '</td>' +
                    '<td><input type="checkbox" class="c-apuntado" aria-label="Apuntado"' + (a ? ' checked' : '') + '></td>' +
                    '<td><input type="checkbox" class="c-pagado" aria-label="Pagado"' + (a && a.pagado ? ' checked' : '') + '></td></tr>';
            }).join('') + '</tbody></table></div>',
            async function (form) {
                var filas = [], borrar = [];
                form.querySelectorAll('tr[data-jugador]').forEach(function (tr) {
                    var idJ = Number(tr.dataset.jugador);
                    var apuntado = tr.querySelector('.c-apuntado').checked;
                    var pagado = tr.querySelector('.c-pagado').checked;
                    var a = actuales.get(idJ);
                    if (apuntado && (!a || a.pagado !== pagado)) filas.push({ id_reserva: id, id_jugador: idJ, pagado: pagado });
                    if (!apuntado && a) borrar.push(idJ);
                });
                if (filas.length) A.ok(await db.from('reserva_jugador').upsert(filas, { onConflict: 'id_reserva,id_jugador' }));
                if (borrar.length) A.ok(await db.from('reserva_jugador').delete().eq('id_reserva', id).in('id_jugador', borrar));
                await recargar();
            }, {
                alAbrir: function (d) {
                    d.querySelectorAll('.c-pagado').forEach(function (c) {
                        c.addEventListener('change', function () { if (c.checked) c.closest('tr').querySelector('.c-apuntado').checked = true; });
                    });
                }
            });
    }

    // ==================================================================
    // ENTRENAMIENTOS
    // ==================================================================
    function pintarEntrenos() {
        var lista = (M.d.entrenamiento || []).filter(function (e) { return !filtroTemp || filtroTemp.has(B.temporadaDe(e.fecha)); })
            .sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });
        if (!lista.length) { contenido.innerHTML = '<p class="bk-vacio">No hay entrenamientos en la selección.</p>'; return; }
        contenido.innerHTML = '<div class="bk-admin-lista">' + lista.map(function (e) {
            var asis = (M.d.entrenamiento_jugador || []).filter(function (x) { return x.id_entrenamiento === e.id && x.asistido; }).length;
            return '<div class="bk-admin-item" data-id="' + e.id + '"><div><strong>' + esc(B.fecha(e.fecha)) + '</strong> <span class="bk-chip">' + esc(B.euros(e.precio)) + ' por jugador</span> ' + chipPista(e) +
                '<div class="bk-nota">' + asis + ' asistentes · coste de pista ' + esc(B.euros(e.coste != null ? e.coste : 5)) + '</div></div>' +
                '<div class="bk-chips">' + boton('Asistencia', 'asistencia', 'bk-btn--azul') + boton('Editar', 'editar') + boton('Borrar', 'borrar') + '</div></div>';
        }).join('') + '</div>';
        enlazar({
            asistencia: asistenciaEntreno,
            editar: function (id) { editarEntreno((M.d.entrenamiento || []).find(function (e) { return e.id === id; })); },
            borrar: async function (id) {
                if (!confirm('¿Borrar este entrenamiento y su asistencia?')) return;
                try { A.ok(await db.from('entrenamiento').delete().eq('id', id)); await recargar(); }
                catch (e) { alert(B.traducirError(e)); }
            }
        });
    }

    function editarEntreno(e) {
        A.dialogo(e ? 'Editar entrenamiento' : 'Nuevo entrenamiento',
            '<div class="bk-form-grid">' +
            A.campo('Fecha', 'fecha', e ? e.fecha : B.hoy(), { tipo: 'date', requerido: true }) +
            A.campo('Precio por jugador', 'precio', e ? e.precio : 0, { tipo: 'number', min: 0, paso: '0.01', requerido: true }) +
            A.campo('Coste total de la pista', 'coste', e ? e.coste : 5, { tipo: 'number', min: 0, paso: '0.01', requerido: true }) +
            A.campo('Pista', 'pista', null, { tipo: 'select', opciones: opcionesPista(e ? e.pista : null) }) +
            '</div>' + (e ? '' : AVISO_GASTO),
            async function (form, v) {
                if (!v.fecha) throw new Error('Pon la fecha.');
                var fila = { fecha: v.fecha, precio: v.precio || 0, coste: v.coste == null ? 5 : v.coste, pista: v.pista || 'media' };
                if (e) A.ok(await db.from('entrenamiento').update(fila).eq('id', e.id));
                else A.ok(await db.from('entrenamiento').insert(fila));
                await recargar();
            });
    }

    function asistenciaEntreno(id) {
        var actuales = new Map((M.d.entrenamiento_jugador || []).filter(function (x) { return x.id_entrenamiento === id; }).map(function (x) { return [x.id_jugador, x]; }));
        A.dialogo('Asistencia al entrenamiento',
            '<div class="bk-tabla-envoltorio" style="max-height:55vh;overflow:auto"><table class="bk-tabla bk-tabla--compacta bk-asistencia-tabla"><thead><tr>' +
            '<th>Jugador</th><th>Asistió</th><th>Pagado</th></tr></thead><tbody>' +
            jugadoresParaLista(Array.from(actuales.keys())).map(function (j) {
                var a = actuales.get(j.id);
                return '<tr data-jugador="' + j.id + '"><td>' + esc(j.nombre) + (j.invitado ? ' <span class="bk-chip bk-chip--gris">invitado</span>' : '') + '</td>' +
                    '<td><input type="checkbox" class="c-asistido" aria-label="Asistió"' + (a && a.asistido ? ' checked' : '') + '></td>' +
                    '<td><input type="checkbox" class="c-pagado" aria-label="Pagado"' + (a && a.pagado ? ' checked' : '') + '></td></tr>';
            }).join('') + '</tbody></table></div>',
            async function (form) {
                var filas = [], borrar = [];
                form.querySelectorAll('tr[data-jugador]').forEach(function (tr) {
                    var idJ = Number(tr.dataset.jugador);
                    var asistido = tr.querySelector('.c-asistido').checked;
                    var pagado = tr.querySelector('.c-pagado').checked;
                    var a = actuales.get(idJ);
                    if (asistido && (!a || !a.asistido || a.pagado !== pagado)) filas.push({ id_entrenamiento: id, id_jugador: idJ, asistido: true, pagado: pagado });
                    if (!asistido && a) borrar.push(idJ);
                });
                if (filas.length) A.ok(await db.from('entrenamiento_jugador').upsert(filas, { onConflict: 'id_entrenamiento,id_jugador' }));
                if (borrar.length) A.ok(await db.from('entrenamiento_jugador').delete().eq('id_entrenamiento', id).in('id_jugador', borrar));
                await recargar();
            });
    }

    await recargar();
})();

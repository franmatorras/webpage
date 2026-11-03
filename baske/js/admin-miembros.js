(async function () {
    'use strict';
    var B = window.Baske;
    var A = window.Admin;
    var esc = B.esc;
    var db = B.cliente;

    var yo = await B.iniciar({ admin: true, activa: 'admin' });
    var contMiembros = document.getElementById('miembros');
    var contJunta = document.getElementById('junta');
    var buscar = document.getElementById('buscar');

    var M;
    var usuarios = new Map();

    async function recargar() {
        B.olvidar();
        try {
            M = await B.modelo(B.TABLAS_JUNTA.concat(['usuario']));
            usuarios = new Map((M.d.usuario || []).map(function (u) { return [u.id, u]; }));
            await B.prepararFotos(M.miembros);
            pintarMiembros();
            pintarJunta();
        } catch (e) {
            B.falloCarga(contMiembros, e);
        }
    }

    document.querySelectorAll('.bk-tabs button').forEach(function (b) {
        b.addEventListener('click', function () {
            document.querySelectorAll('.bk-tabs button').forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
            document.getElementById('sec-miembros').hidden = b.dataset.tab !== 'miembros';
            document.getElementById('sec-junta').hidden = b.dataset.tab !== 'junta';
        });
    });
    buscar.addEventListener('input', function () { pintarMiembros(); });
    document.getElementById('nuevo-miembro').addEventListener('click', function () { editarMiembro(null); });
    document.getElementById('nuevo-cargo').addEventListener('click', function () { editarCargo(null); });

    // ==================================================================
    // MIEMBROS
    // ==================================================================
    function pintarMiembros() {
        var q = B.normalizar(buscar.value);
        var lista = M.miembros.filter(function (m) { return !q || B.normalizar(M.nombreMiembro(m)).indexOf(q) >= 0; })
            .sort(M.compararMiembros.bind(M));
        if (!lista.length) { contMiembros.innerHTML = '<p class="bk-vacio">No hay miembros.</p>'; return; }

        contMiembros.innerHTML = '<div class="bk-admin-lista">' + lista.map(function (m) {
            var u = m.id_usuario ? usuarios.get(m.id_usuario) : null;
            return '<div class="bk-admin-item" data-id="' + m.id + '"><div style="display:flex;gap:0.75rem;align-items:center">' +
                '<img class="bk-foto bk-foto--redonda" src="' + esc(B.foto(m)) + '" alt="" style="width:44px;flex:none">' +
                '<div><strong>' + esc(M.nombreMiembro(m)) + '</strong> <span class="bk-chip bk-chip--negro">' + esc(B.TIPOS[m.tipo_miembro]) + '</span>' +
                (m.fecha_baja ? ' <span class="bk-chip bk-chip--gris">Baja ' + esc(B.fecha(m.fecha_baja)) + '</span>' : !m.activo ? ' <span class="bk-chip bk-chip--gris">Inactivo</span>' : '') +
                '<div class="bk-nota">' + (u ? 'Usuario: ' + esc(u.usuario) + (u.admin ? ' (admin)' : '') + (u.debe_cambiar_password ? ' · sin contraseña aún' : '') : 'Sin login') +
                ' · azul ' + (m.dorsal_azul != null ? m.dorsal_azul : '—') + ' · negro ' + (m.dorsal_negro != null ? m.dorsal_negro : '—') + '</div></div></div>' +
                '<div class="bk-chips"><button type="button" class="bk-btn bk-btn--peq bk-btn--sec" data-editar>Editar</button>' +
                '<button type="button" class="bk-btn bk-btn--peq bk-btn--sec" data-login>Login</button></div></div>';
        }).join('') + '</div>';

        contMiembros.querySelectorAll('[data-editar]').forEach(function (b) {
            b.addEventListener('click', function () { editarMiembro(M.miembro.get(Number(b.closest('[data-id]').dataset.id))); });
        });
        contMiembros.querySelectorAll('[data-login]').forEach(function (b) {
            b.addEventListener('click', function () { gestionarLogin(M.miembro.get(Number(b.closest('[data-id]').dataset.id))); });
        });
    }

    function editarMiembro(m) {
        var tipos = Object.keys(B.TIPOS).map(function (k) { return [k, B.TIPOS[k]]; });
        var origenes = Object.keys(B.ORIGENES).map(function (k) { return [k, B.ORIGENES[k]]; });
        // Invitados que aún no son miembros (para convertirlos)
        var invitados = (M.d.jugador || []).filter(function (j) { return j.id_invitado && !j.id_miembro; })
            .map(function (j) { return [j.id, M.nombreJugador(j.id)]; });

        var cuerpo = '<div class="bk-form-grid">' +
            A.campo('Nombre', 'nombre', m ? m.nombre : '', { requerido: true }) +
            A.campo('Apellido', 'apellido', m ? m.apellido : '') +
            A.campo('Tipo', 'tipo_miembro', null, { tipo: 'select', opciones: A.opciones(tipos, m ? m.tipo_miembro : 'jugador') }) +
            A.campo('Origen', 'origen', null, { tipo: 'select', opciones: A.opciones(origenes, m ? m.origen : '', '—') }) +
            A.campo('Fecha de ingreso', 'fecha_ingreso', m ? m.fecha_ingreso : B.hoy(), { tipo: 'date', requerido: true }) +
            A.campo('Fecha de baja', 'fecha_baja', m ? m.fecha_baja : null, { tipo: 'date' }) +
            A.campo('Nº de socio', 'n_socio', m ? m.n_socio : null, { tipo: 'number', min: 0 }) +
            A.campo('Dorsal azul (1 y 01 son distintos)', 'dorsal_azul', m ? m.dorsal_azul : null, { patron: '[0-9]{1,2}', maxlength: 2, inputmode: 'numeric' }) +
            A.campo('Dorsal negro (1 y 01 son distintos)', 'dorsal_negro', m ? m.dorsal_negro : null, { patron: '[0-9]{1,2}', maxlength: 2, inputmode: 'numeric' }) +
            A.campo('Padrino', 'id_padrino', null, { tipo: 'select', numero: true, opciones: A.opcionesMiembros(M, m ? m.id_padrino : null, 'Sin padrino', function (x) { return !m || x.id !== m.id; }) }) +
            (m ? '' : A.campo('Antes era invitado', 'id_jugador_invitado', null, { tipo: 'select', numero: true, opciones: A.opciones(invitados, null, 'No') })) +
            '</div>' +
            A.campo('Activo', 'activo', m ? m.activo : true, { tipo: 'checkbox' }) +
            A.campo('Descripción', 'descripcion', m ? m.descripcion : '', { tipo: 'textarea' }) +
            '<div class="bk-campo"><label for="foto-archivo">Foto</label>' +
            (m && m.foto_url ? '<img class="bk-foto" src="' + esc(B.foto(m)) + '" alt="" style="width:96px;margin-bottom:0.4rem">' : '') +
            '<input type="file" id="foto-archivo" accept="image/*"></div>' +
            '<p class="bk-nota">Con fecha de baja el miembro pasa a inactivo y pierde el nº de socio.</p>';

        A.dialogo(m ? 'Editar ' + M.nombreMiembro(m) : 'Nuevo miembro', cuerpo, async function (form, v) {
            if (!v.nombre) throw new Error('El nombre es obligatorio.');
            [['dorsal_azul', 'azul'], ['dorsal_negro', 'negro']].forEach(function (d) {
                if (v[d[0]] != null && !/^[0-9]{1,2}$/.test(v[d[0]])) throw new Error('El dorsal ' + d[1] + ' tiene que ser un número de 1 o 2 cifras (0-9 o 00-99).');
            });
            var fila = {
                nombre: v.nombre, apellido: v.apellido, tipo_miembro: v.tipo_miembro, origen: v.origen,
                fecha_ingreso: v.fecha_ingreso || B.hoy(), fecha_baja: v.fecha_baja,
                n_socio: v.fecha_baja ? null : v.n_socio, activo: v.fecha_baja ? false : v.activo,
                dorsal_azul: v.dorsal_azul, dorsal_negro: v.dorsal_negro,
                id_padrino: v.id_padrino, descripcion: v.descripcion
            };

            var id;
            if (m) {
                A.ok(await db.from('miembro').update(fila).eq('id', m.id));
                id = m.id;
            } else {
                id = A.ok(await db.from('miembro').insert(fila).select('id').single()).id;
            }

            // Todo miembro tiene su fila en "jugador" (hace falta para asistir y para las cervezas)
            if (!M.jugadorDeMiembro.has(id)) {
                if (v.id_jugador_invitado) A.ok(await db.from('jugador').update({ id_miembro: id }).eq('id', v.id_jugador_invitado));
                else A.ok(await db.from('jugador').insert({ id_miembro: id }));
            }

            // Foto: ruta nueva en cada subida (evita cachés) y se borra la anterior
            var archivo = form.querySelector('#foto-archivo').files[0];
            if (archivo) {
                var blob = await A.reducirImagen(archivo, 800, 0.85);
                var ruta = 'fotos/' + id + '-' + Date.now() + '.jpg';
                A.ok(await db.storage.from('equipo').upload(ruta, blob, { contentType: 'image/jpeg', upsert: true }));
                A.ok(await db.from('miembro').update({ foto_url: ruta }).eq('id', id));
                if (m && m.foto_url && m.foto_url !== ruta) await db.storage.from('equipo').remove([m.foto_url]);
            }
            await recargar();
        }, {
            ancho: '760px',
            alAbrir: function (d) {
                var baja = d.querySelector('[name="fecha_baja"]');
                baja.addEventListener('change', function () {
                    if (baja.value) {
                        d.querySelector('[name="activo"]').checked = false;
                        d.querySelector('[name="n_socio"]').value = '';
                    }
                });
            }
        });
    }

    // ----- Logins (Edge Function "admin-usuarios") -----
    async function funcion(cuerpo) {
        var r = await db.functions.invoke('admin-usuarios', { body: cuerpo });
        if (r.error) {
            var texto = null;
            try { texto = (await r.error.context.json()).error; } catch (e) { /* sin cuerpo */ }
            throw new Error(texto || r.error.message || 'La función admin-usuarios falló (¿está desplegada?)');
        }
        return r.data;
    }

    function sugerirUsuario(m) {
        return B.normalizar(m.nombre + (m.apellido ? '.' + m.apellido.split(' ')[0] : '')).replace(/[^a-z0-9._-]/g, '');
    }

    function gestionarLogin(m) {
        var u = m.id_usuario ? usuarios.get(m.id_usuario) : null;

        if (!u) {
            var libres = (M.d.usuario || []).filter(function (x) {
                return !M.miembros.some(function (mm) { return mm.id_usuario === x.id; });
            }).map(function (x) { return [x.id, x.usuario]; });

            A.dialogo('Login de ' + M.nombreMiembro(m),
                '<p style="margin-bottom:0.75rem">Crea un usuario: con él entrará en la web y elegirá su contraseña la primera vez.</p>' +
                A.campo('Nombre de usuario', 'usuario', sugerirUsuario(m)) +
                (libres.length ? '<p class="bk-nota" style="margin:0.5rem 0">…o vincula un usuario que ya existe y no tiene miembro:</p>' +
                    A.campo('Usuario existente', 'existente', null, { tipo: 'select', opciones: A.opciones(libres, null, '—') }) : ''),
                async function (form, v) {
                    if (v.existente) {
                        A.ok(await db.from('miembro').update({ id_usuario: v.existente }).eq('id', m.id));
                    } else {
                        if (!v.usuario) throw new Error('Escribe un nombre de usuario.');
                        await funcion({ accion: 'crear', usuario: v.usuario, id_miembro: m.id });
                        alert('Usuario "' + v.usuario + '" creado. Dile que entre con ese usuario y elija su contraseña.');
                    }
                    await recargar();
                }, { textoGuardar: 'Crear / vincular' });
            return;
        }

        var esYo = u.id === yo.uid;
        var d = A.dialogo('Login de ' + M.nombreMiembro(m),
            '<dl class="bk-datos" style="margin-bottom:1rem">' +
            '<div><dt>Usuario</dt><dd>' + esc(u.usuario) + '</dd></div>' +
            '<div><dt>Contraseña</dt><dd>' + (u.debe_cambiar_password ? 'Aún no la ha elegido' : 'Elegida') + '</dd></div>' +
            '<div><dt>Registrado</dt><dd>' + esc(B.fecha(u.fecha_registro)) + '</dd></div></dl>' +
            '<div class="bk-form-grid">' + A.campo('Nuevo nombre de usuario', 'nuevo', '') +
            '<div class="bk-campo" style="justify-content:flex-end"><button type="button" class="bk-btn bk-btn--peq" data-renombrar>Renombrar</button></div></div>' +
            '<div class="bk-acciones" style="margin-top:0">' +
            '<button type="button" class="bk-btn bk-btn--peq bk-btn--peligro" data-resetear>Resetear contraseña</button>' +
            (esYo ? '' : '<button type="button" class="bk-btn bk-btn--peq bk-btn--sec" data-admin>' + (u.admin ? 'Quitar admin' : 'Hacer admin') + '</button>') +
            (esYo ? '' : '<button type="button" class="bk-btn bk-btn--peq bk-btn--sec" data-desvincular>Desvincular del miembro</button>') +
            '</div>',
            async function () {}, {
                sinGuardar: true,
                alAbrir: function (dlg) {
                    var msg = dlg.querySelector('.bk-mensaje');
                    async function accion(fn, okTexto) {
                        try { await fn(); B.mensaje(msg, okTexto, 'ok'); await recargar(); }
                        catch (e) { B.mensaje(msg, B.traducirError(e)); }
                    }
                    dlg.querySelector('[data-renombrar]').addEventListener('click', function () {
                        var nuevo = dlg.querySelector('[name="nuevo"]').value.trim();
                        if (!nuevo) { B.mensaje(msg, 'Escribe el nuevo nombre.'); return; }
                        accion(function () { return funcion({ accion: 'renombrar', id_usuario: u.id, usuario: nuevo }); }, 'Usuario renombrado a "' + nuevo + '".');
                    });
                    dlg.querySelector('[data-resetear]').addEventListener('click', function () {
                        if (!confirm('Su contraseña dejará de valer y tendrá que elegir otra al entrar. ¿Seguir?')) return;
                        accion(function () { return funcion({ accion: 'resetear', id_usuario: u.id }); }, 'Contraseña reseteada: al entrar elegirá una nueva.');
                    });
                    var bAdmin = dlg.querySelector('[data-admin]');
                    if (bAdmin) bAdmin.addEventListener('click', function () {
                        accion(async function () { A.ok(await db.from('usuario').update({ admin: !u.admin }).eq('id', u.id)); }, u.admin ? 'Ya no es admin.' : 'Ahora es admin.');
                        dlg.close();
                    });
                    var bDes = dlg.querySelector('[data-desvincular]');
                    if (bDes) bDes.addEventListener('click', function () {
                        if (!confirm('El usuario seguirá existiendo, pero sin miembro. ¿Seguir?')) return;
                        accion(async function () { A.ok(await db.from('miembro').update({ id_usuario: null }).eq('id', m.id)); }, 'Desvinculado.');
                        dlg.close();
                    });
                }
            });
        return d;
    }

    // ==================================================================
    // JUNTA DIRECTIVA
    // ==================================================================
    function pintarJunta() {
        var filas = (M.d.junta_directiva || []).slice().sort(function (a, b) {
            var va = !a.fecha_fin || a.fecha_fin >= M.hoy ? 0 : 1;
            var vb = !b.fecha_fin || b.fecha_fin >= M.hoy ? 0 : 1;
            return va - vb || (a.fecha_inicio < b.fecha_inicio ? 1 : -1);
        });
        if (!filas.length) { contJunta.innerHTML = '<p class="bk-vacio">No hay cargos registrados.</p>'; return; }
        contJunta.innerHTML = '<div class="bk-admin-lista">' + filas.map(function (f) {
            var c = M.cargo.get(f.id_cargo);
            var vigente = !f.fecha_fin || f.fecha_fin >= M.hoy;
            return '<div class="bk-admin-item" data-id="' + f.id + '"><div><strong>' + esc(B.etiquetaCargo(c ? c.nombre : '')) + '</strong> · ' + esc(M.nombreMiembro(f.id_miembro)) +
                (vigente ? ' <span class="bk-chip">Actual</span>' : '') +
                '<div class="bk-nota">' + esc(B.fecha(f.fecha_inicio)) + ' – ' + esc(f.fecha_fin ? B.fecha(f.fecha_fin) : 'actualidad') + '</div></div>' +
                '<div class="bk-chips">' + (!f.fecha_fin ? '<button type="button" class="bk-btn bk-btn--peq" data-terminar>Terminar hoy</button>' : '') +
                '<button type="button" class="bk-btn bk-btn--peq bk-btn--sec" data-editar>Editar</button>' +
                '<button type="button" class="bk-btn bk-btn--peq bk-btn--sec" data-borrar>Borrar</button></div></div>';
        }).join('') + '</div>';

        function filaDe(b) { var id = Number(b.closest('[data-id]').dataset.id); return M.d.junta_directiva.find(function (f) { return f.id === id; }); }
        contJunta.querySelectorAll('[data-editar]').forEach(function (b) { b.addEventListener('click', function () { editarCargo(filaDe(b)); }); });
        contJunta.querySelectorAll('[data-terminar]').forEach(function (b) {
            b.addEventListener('click', async function () {
                var f = filaDe(b);
                var fin = B.hoy() < f.fecha_inicio ? f.fecha_inicio : B.hoy();
                try { A.ok(await db.from('junta_directiva').update({ fecha_fin: fin }).eq('id', f.id)); await recargar(); }
                catch (e) { alert(B.traducirError(e)); }
            });
        });
        contJunta.querySelectorAll('[data-borrar]').forEach(function (b) {
            b.addEventListener('click', async function () {
                if (!confirm('¿Borrar este registro del histórico? (Para un cese normal usa "Terminar hoy".)')) return;
                try { A.ok(await db.from('junta_directiva').delete().eq('id', filaDe(b).id)); await recargar(); }
                catch (e) { alert(B.traducirError(e)); }
            });
        });
    }

    function editarCargo(f) {
        var cargos = (M.d.cargo || []).map(function (c) { return [c.id, B.etiquetaCargo(c.nombre)]; });
        A.dialogo(f ? 'Editar cargo' : 'Nuevo cargo',
            '<div class="bk-form-grid">' +
            A.campo('Miembro', 'id_miembro', null, { tipo: 'select', numero: true, opciones: A.opcionesMiembros(M, f ? f.id_miembro : null, 'Elige…', function (m) { return !m.fecha_baja || (f && m.id === f.id_miembro); }) }) +
            A.campo('Cargo', 'id_cargo', null, { tipo: 'select', numero: true, opciones: A.opciones(cargos, f ? f.id_cargo : null, 'Elige…') }) +
            A.campo('Desde', 'fecha_inicio', f ? f.fecha_inicio : B.hoy(), { tipo: 'date', requerido: true }) +
            A.campo('Hasta (vacío = actual)', 'fecha_fin', f ? f.fecha_fin : null, { tipo: 'date' }) +
            '</div>',
            async function (form, v) {
                if (!v.id_miembro || !v.id_cargo || !v.fecha_inicio) throw new Error('Elige miembro, cargo y fecha de inicio.');
                var fila = { id_miembro: v.id_miembro, id_cargo: v.id_cargo, fecha_inicio: v.fecha_inicio, fecha_fin: v.fecha_fin };
                if (f) A.ok(await db.from('junta_directiva').update(fila).eq('id', f.id));
                else A.ok(await db.from('junta_directiva').insert(fila));
                await recargar();
            });
    }

    await recargar();
})();

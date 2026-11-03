(async function () {
    'use strict';
    var B = window.Baske;
    var esc = B.esc;

    var yo = await B.iniciar({ activa: null });

    // ----- Cuenta -----
    document.getElementById('cuenta').innerHTML =
        '<div><dt>Usuario</dt><dd>' + esc(yo.usuario.usuario) + (yo.admin ? ' <span class="bk-chip bk-chip--negro">Admin</span>' : '') + '</dd></div>' +
        '<div><dt>Miembro</dt><dd>' + (yo.miembro ? '<a href="jugador.html?id=' + yo.miembro.id + '">' + esc(yo.miembro.nombre + ' ' + (yo.miembro.apellido || '')) + '</a>' : 'Sin vincular') + '</dd></div>' +
        '<div><dt>Registrado</dt><dd>' + esc(B.fecha(yo.usuario.fecha_registro)) + '</dd></div>';
    document.getElementById('usuario-oculto').value = yo.usuario.usuario;

    document.getElementById('salir').addEventListener('click', async function () {
        await B.cliente.auth.signOut();
        location.replace(B.url('index.html'));
    });

    // ----- Datos (solo nombre y apellido: lo demás lo bloquea la base de datos) -----
    if (yo.miembro) {
        document.getElementById('sec-datos').hidden = false;
        var inputNombre = document.getElementById('nombre');
        var inputApellido = document.getElementById('apellido');
        inputNombre.value = yo.miembro.nombre;
        inputApellido.value = yo.miembro.apellido || '';

        document.getElementById('form-datos').addEventListener('submit', async function (ev) {
            ev.preventDefault();
            var msg = document.getElementById('msg-datos');
            var nombre = inputNombre.value.trim();
            if (!nombre) { B.mensaje(msg, 'El nombre no puede estar vacío.'); return; }
            var r = await B.cliente.from('miembro')
                .update({ nombre: nombre, apellido: inputApellido.value.trim() || null })
                .eq('id', yo.miembro.id);
            B.mensaje(msg, r.error ? B.traducirError(r.error) : 'Datos guardados.', r.error ? 'error' : 'ok');
        });
    }

    // ----- Contraseña -----
    document.getElementById('form-password').addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var msg = document.getElementById('msg-password');
        var nueva = document.getElementById('nueva').value;
        if (nueva.length < 8) { B.mensaje(msg, 'Mínimo 8 caracteres.'); return; }
        if (nueva !== document.getElementById('repetir').value) { B.mensaje(msg, 'Las contraseñas no coinciden.'); return; }
        var r = await B.cliente.auth.updateUser({ password: nueva });
        if (r.error) { B.mensaje(msg, B.traducirError(r.error)); return; }
        ev.target.reset();
        B.mensaje(msg, 'Contraseña cambiada.', 'ok');
    });

    // ----- Propuestas -----
    var contProp = document.getElementById('propuestas');
    async function pintarPropuestas() {
        try {
            var res = await Promise.all([
                B.cliente.from('apodo').select('*').eq('creado_por', yo.uid).order('id', { ascending: false }),
                B.cliente.from('habilidad_especial').select('*').eq('creado_por', yo.uid).order('id', { ascending: false }),
                B.cliente.from('miembro').select('id,nombre,apellido')
            ]);
            res.forEach(function (r) { if (r.error) throw r.error; });
            var nombres = new Map(res[2].data.map(function (m) { return [m.id, m.nombre + (m.apellido ? ' ' + m.apellido : '')]; }));
            var lista = res[0].data.map(function (a) { return { tabla: 'apodo', id: a.id, tipo: 'Apodo', texto: a.apodo, miembro: a.id_miembro, validado: a.validado }; })
                .concat(res[1].data.map(function (h) { return { tabla: 'habilidad_especial', id: h.id, tipo: 'Habilidad', texto: h.habilidad, miembro: h.id_miembro, validado: h.validado }; }));

            if (!lista.length) { contProp.innerHTML = '<p class="bk-vacio">No has propuesto nada todavía.</p>'; return; }

            contProp.innerHTML = '<div class="bk-admin-lista">' + lista.map(function (p) {
                return '<div class="bk-admin-item"><div><strong>' + esc(p.texto) + '</strong> <span class="bk-nota">' + esc(p.tipo) + ' para ' + esc(nombres.get(p.miembro) || '—') + '</span></div>' +
                    (p.validado ? '<span class="bk-chip bk-chip--verde">Validada</span>'
                        : '<span class="bk-chip bk-chip--gris">Pendiente</span> <button type="button" class="bk-btn bk-btn--peq bk-btn--sec" data-tabla="' + p.tabla + '" data-id="' + p.id + '">Retirar</button>') +
                    '</div>';
            }).join('') + '</div>';

            contProp.querySelectorAll('button[data-id]').forEach(function (b) {
                b.addEventListener('click', async function () {
                    var r = await B.cliente.from(b.dataset.tabla).delete().eq('id', Number(b.dataset.id));
                    if (r.error) { alert(B.traducirError(r.error)); return; }
                    pintarPropuestas();
                });
            });
        } catch (e) {
            B.falloCarga(contProp, e);
        }
    }
    pintarPropuestas();
})();

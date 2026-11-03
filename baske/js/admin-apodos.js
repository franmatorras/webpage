(async function () {
    'use strict';
    var B = window.Baske;
    var A = window.Admin;
    var esc = B.esc;
    var db = B.cliente;

    await B.iniciar({ admin: true, activa: 'admin' });
    var contPendientes = document.getElementById('pendientes');
    var contValidados = document.getElementById('validados');
    var buscar = document.getElementById('buscar');

    // Apodo y habilidad comparten estructura; solo cambian tabla y columna
    var TIPOS_PROPUESTA = {
        apodo: { tabla: 'apodo', campo: 'apodo', nombre: 'Apodo' },
        habilidad: { tabla: 'habilidad_especial', campo: 'habilidad', nombre: 'Habilidad' }
    };

    var M;
    var usuarios = new Map();

    async function recargar() {
        B.olvidar();
        try {
            M = await B.modelo(['usuario']);
            usuarios = new Map((M.d.usuario || []).map(function (u) { return [u.id, u]; }));
            pintarPropuestas();
        } catch (e) {
            B.falloCarga(contPendientes, e);
        }
    }

    document.getElementById('nueva-propuesta').addEventListener('click', anadirPropuesta);
    buscar.addEventListener('input', function () { pintarPropuestas(); });

    // Ejecuta una escritura, recarga y enseña el error si falla
    async function escribir(fn) {
        try { A.ok(await fn()); await recargar(); }
        catch (e) { alert(B.traducirError(e)); }
    }

    function boton(texto, dato, principal) {
        return '<button type="button" class="bk-btn bk-btn--peq' + (principal ? '' : ' bk-btn--sec') + '" data-' + dato + '>' + texto + '</button>';
    }

    // ==================================================================
    // Apodos y habilidades
    // ==================================================================
    function todasPropuestas() {
        var lista = [];
        Object.keys(TIPOS_PROPUESTA).forEach(function (k) {
            var t = TIPOS_PROPUESTA[k];
            (M.d[t.tabla] || []).forEach(function (f) { lista.push({ tipo: k, fila: f, texto: f[t.campo] }); });
        });
        return lista;
    }

    function proponente(f) {
        var u = f.creado_por ? usuarios.get(f.creado_por) : null;
        return u ? u.usuario : 'desconocido';
    }

    function itemPropuesta(x, botones) {
        return '<div class="bk-admin-item" data-tipo="' + x.tipo + '" data-id="' + x.fila.id + '"><div>' +
            '<span class="bk-chip bk-chip--negro">' + TIPOS_PROPUESTA[x.tipo].nombre + '</span> <strong>' + esc(x.texto) + '</strong>' +
            '<div class="bk-nota">Para ' + esc(M.nombreMiembro(x.fila.id_miembro)) + ' · propuesto por ' + esc(proponente(x.fila)) + '</div></div>' +
            '<div class="bk-chips">' + botones + '</div></div>';
    }

    function pintarPropuestas() {
        var lista = todasPropuestas();
        var pendientes = lista.filter(function (x) { return !x.fila.validado; }).sort(function (a, b) { return a.fila.id - b.fila.id; });
        contPendientes.innerHTML = pendientes.length
            ? '<div class="bk-admin-lista">' + pendientes.map(function (x) {
                return itemPropuesta(x, boton('Validar', 'validar', true) + boton('Rechazar', 'borrar'));
            }).join('') + '</div>'
            : '<p class="bk-vacio">No hay propuestas pendientes.</p>';

        var q = B.normalizar(buscar.value);
        var validados = lista.filter(function (x) {
            return x.fila.validado && (!q || B.normalizar(M.nombreMiembro(x.fila.id_miembro) + ' ' + x.texto).indexOf(q) >= 0);
        }).sort(function (a, b) {
            return M.compararMiembros(M.miembro.get(a.fila.id_miembro) || {}, M.miembro.get(b.fila.id_miembro) || {}) ||
                a.tipo.localeCompare(b.tipo) || a.texto.localeCompare(b.texto, 'es');
        });
        contValidados.innerHTML = validados.length
            ? '<div class="bk-admin-lista">' + validados.map(function (x) {
                return itemPropuesta(x, boton('Editar', 'editar') + boton('Quitar validación', 'desvalidar') + boton('Borrar', 'borrar'));
            }).join('') + '</div>'
            : '<p class="bk-vacio">' + (q ? 'Nada coincide con la búsqueda.' : 'No hay apodos ni habilidades validados.') + '</p>';

        [contPendientes, contValidados].forEach(function (cont) {
            function datosDe(b) {
                var el = b.closest('[data-id]');
                var t = TIPOS_PROPUESTA[el.dataset.tipo];
                var id = Number(el.dataset.id);
                return { t: t, fila: M.d[t.tabla].find(function (f) { return f.id === id; }) };
            }
            cont.querySelectorAll('[data-validar]').forEach(function (b) {
                b.addEventListener('click', function () {
                    var x = datosDe(b);
                    escribir(function () { return db.from(x.t.tabla).update({ validado: true }).eq('id', x.fila.id); });
                });
            });
            cont.querySelectorAll('[data-desvalidar]').forEach(function (b) {
                b.addEventListener('click', function () {
                    var x = datosDe(b);
                    escribir(function () { return db.from(x.t.tabla).update({ validado: false }).eq('id', x.fila.id); });
                });
            });
            cont.querySelectorAll('[data-borrar]').forEach(function (b) {
                b.addEventListener('click', function () {
                    var x = datosDe(b);
                    if (!confirm('¿Borrar "' + x.fila[x.t.campo] + '"?')) return;
                    escribir(function () { return db.from(x.t.tabla).delete().eq('id', x.fila.id); });
                });
            });
            cont.querySelectorAll('[data-editar]').forEach(function (b) {
                b.addEventListener('click', function () {
                    var x = datosDe(b);
                    A.dialogo('Editar ' + x.t.nombre.toLowerCase(), A.campo(x.t.nombre, 'texto', x.fila[x.t.campo], { requerido: true }), async function (form, v) {
                        if (!v.texto) throw new Error('El texto no puede estar vacío.');
                        var cambio = {};
                        cambio[x.t.campo] = v.texto;
                        A.ok(await db.from(x.t.tabla).update(cambio).eq('id', x.fila.id));
                        await recargar();
                    });
                });
            });
        });
    }

    function anadirPropuesta() {
        var tipos = Object.keys(TIPOS_PROPUESTA).map(function (k) { return [k, TIPOS_PROPUESTA[k].nombre]; });
        var cuerpo = A.campo('Qué', 'tipo', null, { tipo: 'select', opciones: A.opciones(tipos, 'apodo') }) +
            A.campo('Miembro', 'id_miembro', null, { tipo: 'select', numero: true, requerido: true, opciones: A.opcionesMiembros(M, null, 'Elige…') }) +
            A.campo('Texto', 'texto', '', { requerido: true }) +
            '<p class="bk-nota">Se guarda ya validado.</p>';
        A.dialogo('Añadir apodo o habilidad', cuerpo, async function (form, v) {
            if (!v.id_miembro || !v.texto) throw new Error('Elige el miembro y escribe el texto.');
            var t = TIPOS_PROPUESTA[v.tipo];
            var fila = { id_miembro: v.id_miembro, validado: true };
            fila[t.campo] = v.texto;
            A.ok(await db.from(t.tabla).insert(fila));
            await recargar();
        });
    }

    recargar();
})();

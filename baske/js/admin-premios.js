(async function () {
    'use strict';
    var B = window.Baske;
    var A = window.Admin;
    var esc = B.esc;
    var db = B.cliente;

    await B.iniciar({ admin: true, activa: 'admin' });
    var contGanados = document.getElementById('ganados');
    var contCatalogo = document.getElementById('catalogo');

    var M;

    async function recargar() {
        B.olvidar();
        try {
            M = await B.modelo(B.TABLAS_PREMIOS.concat(['v_resultado_top_pachanga']));
            pintarGanados();
            pintarCatalogo();
        } catch (e) {
            B.falloCarga(contGanados, e);
        }
    }

    document.querySelectorAll('.bk-tabs button').forEach(function (b) {
        b.addEventListener('click', function () {
            document.querySelectorAll('.bk-tabs button').forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
            ['ganados', 'catalogo'].forEach(function (t) {
                document.getElementById('sec-' + t).hidden = b.dataset.tab !== t;
            });
        });
    });
    document.getElementById('nuevo-ganador').addEventListener('click', function () { editarGanador(null); });
    document.getElementById('nuevo-premio').addEventListener('click', function () { editarPremio(null); });

    // Ejecuta una escritura, recarga y enseña el error si falla
    async function escribir(fn) {
        try { A.ok(await fn()); await recargar(); }
        catch (e) { alert(B.traducirError(e)); }
    }

    function boton(texto, dato, principal) {
        return '<button type="button" class="bk-btn bk-btn--peq' + (principal ? '' : ' bk-btn--sec') + '" data-' + dato + '>' + texto + '</button>';
    }

    // ==================================================================
    // Premios ganados (premio_miembro)
    // ==================================================================
    function pintarGanados() {
        var lista = M.premios(null);
        if (!lista.length) { contGanados.innerHTML = '<p class="bk-vacio">Todavía no hay premios asignados.</p>'; return; }
        contGanados.innerHTML = '<div class="bk-admin-lista">' + lista.map(function (p) {
            return '<div class="bk-admin-item" data-id="' + p.fila.id + '"><div><strong>' + esc(p.nombre) + '</strong>' +
                (p.mencion ? ' <span class="bk-chip">Mención</span>' : '') + ' · ' + esc(M.nombreMiembro(p.fila.id_miembro)) +
                '<div class="bk-nota">' + esc(p.temporada) + ' · ' + esc(p.periodo ? B.etiquetaPeriodo(p.periodo) : 'Temporada completa') + '</div></div>' +
                '<div class="bk-chips">' + boton('Editar', 'editar') + boton('Borrar', 'borrar') + '</div></div>';
        }).join('') + '</div>';

        function filaDe(b) { var id = Number(b.closest('[data-id]').dataset.id); return M.d.premio_miembro.find(function (f) { return f.id === id; }); }
        contGanados.querySelectorAll('[data-editar]').forEach(function (b) { b.addEventListener('click', function () { editarGanador(filaDe(b)); }); });
        contGanados.querySelectorAll('[data-borrar]').forEach(function (b) {
            b.addEventListener('click', function () {
                if (!confirm('¿Quitar este premio?')) return;
                escribir(function () { return db.from('premio_miembro').delete().eq('id', filaDe(b).id); });
            });
        });
    }

    // Texto de ayuda: quién va primero en la temporada / periodo elegido
    function lideres(temporada, periodo) {
        var filtro = function (p) { return p.temporada === temporada && (!periodo || p.periodo === periodo); };
        var mvp = M.ranking(filtro, 'mvp')[0];
        var fraude = M.ranking(filtro, 'fraude')[0];
        return 'Líder MVP: ' + (mvp ? esc(mvp.nombre) + ' (' + mvp.puntos + ' pts)' : '—') +
            ' · Líder fraude: ' + (fraude ? esc(fraude.nombre) + ' (' + fraude.puntos + ' votos)' : '—');
    }

    function editarGanador(f) {
        var premios = (M.d.premio || []).slice().sort(function (a, b) { return a.nombre_premio.localeCompare(b.nombre_premio, 'es'); })
            .map(function (p) { return [p.id, p.nombre_premio + (p.mencion ? ' (mención)' : '')]; });
        if (!premios.length) { alert('Primero crea un premio en "Catálogo de premios".'); return; }

        var temporadas = M.temporadas();
        if (f && temporadas.indexOf(f.temporada) < 0) temporadas.push(f.temporada);
        var periodos = [1, 2, 3, 4, 5, 6].map(function (n) { return [n, B.etiquetaPeriodo(n)]; });

        var cuerpo =
            A.campo('Premio', 'id_premio', null, { tipo: 'select', numero: true, requerido: true, opciones: A.opciones(premios, f ? f.id_premio : null, 'Elige…') }) +
            A.campo('Ganador', 'id_miembro', null, { tipo: 'select', numero: true, requerido: true, opciones: A.opcionesMiembros(M, f ? f.id_miembro : null, 'Elige…') }) +
            A.campo('Temporada', 'temporada', null, { tipo: 'select', opciones: A.opciones(temporadas.map(function (t) { return [t, t]; }), f ? f.temporada : M.temporadaActual) }) +
            A.campo('Periodo', 'periodo', null, { tipo: 'select', numero: true, opciones: A.opciones(periodos, f ? f.periodo : null, 'Temporada completa') }) +
            '<p class="bk-nota" data-lideres></p>';

        A.dialogo(f ? 'Editar premio' : 'Asignar premio', cuerpo, async function (form, v) {
            if (!v.id_premio || !v.id_miembro) throw new Error('Elige el premio y el ganador.');
            var fila = { id_premio: v.id_premio, id_miembro: v.id_miembro, temporada: v.temporada, periodo: v.periodo };
            if (f) A.ok(await db.from('premio_miembro').update(fila).eq('id', f.id));
            else A.ok(await db.from('premio_miembro').insert(fila));
            await recargar();
        }, {
            alAbrir: function (d) {
                var t = d.querySelector('[name=temporada]');
                var p = d.querySelector('[name=periodo]');
                var ayuda = d.querySelector('[data-lideres]');
                function actualizar() { ayuda.innerHTML = lideres(t.value, p.value ? Number(p.value) : null); }
                t.addEventListener('change', actualizar);
                p.addEventListener('change', actualizar);
                actualizar();
            }
        });
    }

    // ==================================================================
    // Catálogo (premio)
    // ==================================================================
    function pintarCatalogo() {
        var lista = (M.d.premio || []).slice().sort(function (a, b) { return a.nombre_premio.localeCompare(b.nombre_premio, 'es'); });
        if (!lista.length) { contCatalogo.innerHTML = '<p class="bk-vacio">No hay premios en el catálogo.</p>'; return; }
        var veces = new Map();
        (M.d.premio_miembro || []).forEach(function (f) { veces.set(f.id_premio, (veces.get(f.id_premio) || 0) + 1); });

        contCatalogo.innerHTML = '<div class="bk-admin-lista">' + lista.map(function (p) {
            var n = veces.get(p.id) || 0;
            return '<div class="bk-admin-item" data-id="' + p.id + '"><div><strong>' + esc(p.nombre_premio) + '</strong>' +
                (p.mencion ? ' <span class="bk-chip">Mención</span>' : '') +
                '<div class="bk-nota">' + (n ? 'Entregado ' + n + (n === 1 ? ' vez' : ' veces') : 'Sin entregar') + '</div></div>' +
                '<div class="bk-chips">' + boton('Editar', 'editar') + boton('Borrar', 'borrar') + '</div></div>';
        }).join('') + '</div>';

        function filaDe(b) { return M.premio.get(Number(b.closest('[data-id]').dataset.id)); }
        contCatalogo.querySelectorAll('[data-editar]').forEach(function (b) { b.addEventListener('click', function () { editarPremio(filaDe(b)); }); });
        contCatalogo.querySelectorAll('[data-borrar]').forEach(function (b) {
            b.addEventListener('click', function () {
                var p = filaDe(b);
                var n = veces.get(p.id) || 0;
                var aviso = '¿Borrar el premio "' + p.nombre_premio + '"?' + (n ? ' También se borrarán sus ' + n + ' ganador(es) del histórico.' : '');
                if (!confirm(aviso)) return;
                escribir(function () { return db.from('premio').delete().eq('id', p.id); });
            });
        });
    }

    function editarPremio(p) {
        var cuerpo = A.campo('Nombre', 'nombre_premio', p ? p.nombre_premio : '', { requerido: true }) +
            A.campo('Es una mención', 'mencion', p ? p.mencion : false, { tipo: 'checkbox' });
        A.dialogo(p ? 'Editar premio' : 'Nuevo premio', cuerpo, async function (form, v) {
            if (!v.nombre_premio) throw new Error('Escribe el nombre del premio.');
            var fila = { nombre_premio: v.nombre_premio, mencion: v.mencion };
            if (p) A.ok(await db.from('premio').update(fila).eq('id', p.id));
            else A.ok(await db.from('premio').insert(fila));
            await recargar();
        });
    }

    recargar();
})();

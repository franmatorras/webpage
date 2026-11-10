(async function () {
    'use strict';
    var B = window.Baske;
    var esc = B.esc;

    await B.iniciar({ activa: 'transparencia' });
    var actual = document.getElementById('actual');
    var historico = document.getElementById('historico');
    var filtro = document.getElementById('filtro-cargo');

    // Qué hace cada cargo (texto provisional)
    var FUNCIONES = {
        lider_supremo: 'Encargado de la comunicación y las decisiones generales, su voto vale por cuatro y, en caso de empate, tiene voto de calidad.',
        mano_lider: 'Encargado de organizar los ritos funerarios en caso de muerte del líder Supremo. Capacidad para añadir miembros al grupo de Whatsapp, pero no para eliminarlos (salvo en caso de enfermedad u otra situación inhabilitante por parte del Líder Supremo).',
        maestro_balon: 'Encargado de asegurar que se respeta el deporte de balón y cesto, proponiendo y ayudando a definir las normas concretas del club.',
        maestro_gritos: 'Encargado de ayudar a desarrollar las distintas narrativas del club, promoviendo o no una agenda concreta a favor o en contra de alguna persona o miembro, encargándose de la realización de ediciones y montajes que puedan ser utilizados en la cuenta oficial de instagram.',
        maestro_maestros: 'Encargado de asegurarse del correcto funcionamiento del club en general, demostrando el señorío y la entereza de la que tienen que ser adalid sus miembros. También encargado de proponer (aunque no desarrollar por sí solo) eventos ajenos a las changas oficiales, tales como «pre-Potis de velocidad», «cervezas» u otros.',
        tesorero: 'Es una función, no un puesto. Requisito: ha de estar adscrito a UNICAN y ser miembro de la Junta directiva. Encargado de gestionar la tesorería y los pagos.'
    };

    var M;
    try {
        M = await B.modelo(B.TABLAS_JUNTA);
        await B.prepararFotos(M.miembros);
    } catch (e) {
        B.falloCarga(actual, e);
        return;
    }

    var vigentes = M.juntaActual().filter(function (j) { return j.miembro; });

    function tarjetaOcupada(j) {
        return '<section class="bk-card" style="display:flex;gap:1rem;align-items:flex-start">' +
            '<img class="bk-foto bk-foto--redonda" src="' + esc(B.foto(j.miembro)) + '" alt="" style="width:72px;flex:none">' +
            '<div class="bk-junta-texto"><span class="bk-chip bk-chip--negro bk-chip--ajustable">' + esc(B.etiquetaCargo(j.cargo)) + '</span>' +
            '<h2 class="bk-h3" style="margin:0.35rem 0 0.2rem"><a href="jugador.html?id=' + j.miembro.id + '">' + esc(M.nombreMiembro(j.miembro)) + '</a></h2>' +
            '<p class="bk-nota">Desde el ' + esc(B.fecha(j.fila.fecha_inicio)) + '</p>' +
            '<p style="margin-top:0.4rem;font-size:0.92rem">' + esc(FUNCIONES[j.cargo] || '') + '</p></div></section>';
    }

    // Cargo sin nadie ahora mismo: tarjeta vacía, sin foto
    function tarjetaVacia(c) {
        return '<section class="bk-card bk-card--vacia">' +
            '<span class="bk-chip bk-chip--gris bk-chip--ajustable">' + esc(B.etiquetaCargo(c.nombre)) + '</span>' +
            '<h2 class="bk-h3" style="margin:0.35rem 0 0.2rem;color:var(--bk-gris)">Pendiente de asignar</h2>' +
            '<p style="margin-top:0.4rem;font-size:0.92rem;color:var(--bk-gris)">' + esc(FUNCIONES[c.nombre] || '') + '</p></section>';
    }

    // Todos los cargos en su orden (id); cada uno con sus titulares actuales o vacío
    var cargos = (M.d.cargo || []).slice().sort(function (a, b) { return a.id - b.id; });
    var tarjetas = [];
    cargos.forEach(function (c) {
        var titulares = vigentes.filter(function (j) { return j.fila.id_cargo === c.id; });
        if (titulares.length) titulares.forEach(function (j) { tarjetas.push(tarjetaOcupada(j)); });
        else tarjetas.push(tarjetaVacia(c));
    });
    actual.innerHTML = tarjetas.length ? tarjetas.join('') : '<p class="bk-vacio">No hay cargos registrados.</p>';

    (M.d.cargo || []).forEach(function (c) {
        var o = document.createElement('option');
        o.value = c.id;
        o.textContent = B.etiquetaCargo(c.nombre);
        filtro.appendChild(o);
    });

    function pintarHistorico() {
        var filas = (M.d.junta_directiva || []).filter(function (f) {
            return !filtro.value || f.id_cargo === Number(filtro.value);
        }).sort(function (a, b) { return a.fecha_inicio < b.fecha_inicio ? 1 : a.fecha_inicio > b.fecha_inicio ? -1 : a.id_cargo - b.id_cargo; });

        if (!filas.length) {
            historico.innerHTML = '<p class="bk-vacio">Sin registros.</p>';
            return;
        }
        historico.innerHTML = '<div class="bk-tabla-envoltorio"><table class="bk-tabla"><thead><tr>' +
            '<th>Cargo</th><th>Miembro</th><th>Desde</th><th>Hasta</th></tr></thead><tbody>' +
            filas.map(function (f) {
                var c = M.cargo.get(f.id_cargo);
                var vigente = !f.fecha_fin || f.fecha_fin >= M.hoy;
                return '<tr' + (vigente ? '' : ' class="bk-retirado"') + '><td>' + esc(B.etiquetaCargo(c ? c.nombre : '')) + '</td>' +
                    '<td><a href="jugador.html?id=' + f.id_miembro + '">' + esc(M.nombreMiembro(f.id_miembro)) + '</a></td>' +
                    '<td>' + esc(B.fecha(f.fecha_inicio)) + '</td>' +
                    '<td>' + (f.fecha_fin ? esc(B.fecha(f.fecha_fin)) : '<span class="bk-chip">Actual</span>') + '</td></tr>';
            }).join('') + '</tbody></table></div>';
    }
    filtro.addEventListener('change', pintarHistorico);
    pintarHistorico();
})();

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
        lider_supremo: 'Lorem ipsum dolor sit amet: decide, representa al equipo y tiene la última palabra.',
        maestro_balon: 'Lorem ipsum: se encarga del material, los balones y la pista.',
        maestro_gritos: 'Lorem ipsum: anima, convoca y mantiene la moral (a gritos).',
        mano_lider: 'Lorem ipsum: mano derecha del líder supremo; le sustituye cuando falta.',
        maestro_maestros: 'Lorem ipsum: coordina al resto de maestros y vela por las normas.',
        tesorero: 'Lorem ipsum: lleva las cuentas, cobra las cuotas y paga las reservas.'
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
    actual.innerHTML = vigentes.length ? vigentes.map(function (j) {
        return '<section class="bk-card" style="display:flex;gap:1rem;align-items:flex-start">' +
            '<img class="bk-foto bk-foto--redonda" src="' + esc(B.foto(j.miembro)) + '" alt="" style="width:72px;flex:none">' +
            '<div><span class="bk-chip bk-chip--negro">' + esc(B.etiquetaCargo(j.cargo)) + '</span>' +
            '<h2 class="bk-h3" style="margin:0.35rem 0 0.2rem"><a href="jugador.html?id=' + j.miembro.id + '">' + esc(M.nombreMiembro(j.miembro)) + '</a></h2>' +
            '<p class="bk-nota">Desde el ' + esc(B.fecha(j.fila.fecha_inicio)) + '</p>' +
            '<p style="margin-top:0.4rem;font-size:0.92rem">' + esc(FUNCIONES[j.cargo] || '') + '</p></div></section>';
    }).join('') : '<p class="bk-vacio">No hay junta directiva registrada.</p>';

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

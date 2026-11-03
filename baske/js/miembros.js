(async function () {
    'use strict';
    var B = window.Baske;
    var esc = B.esc;

    await B.iniciar({ activa: 'miembros' });
    var top5 = document.getElementById('top5');
    var carrusel = document.getElementById('carrusel');
    var noJugadores = document.getElementById('no-jugadores');
    var buscar = document.getElementById('buscar');

    var M;
    try {
        M = await B.modelo();
        await B.prepararFotos(M.miembros);
    } catch (e) {
        B.falloCarga(top5, e);
        carrusel.innerHTML = noJugadores.innerHTML = '';
        return;
    }

    var cmp = M.compararMiembros.bind(M);

    function persona(m, extra) {
        return '<a class="bk-persona" href="jugador.html?id=' + m.id + '">' +
            '<img class="bk-foto' + (m.fecha_baja ? ' bk-foto--ex' : '') + '" src="' + esc(B.foto(m)) + '" alt="" loading="lazy">' +
            '<strong>' + esc(M.nombreMiembro(m)) + '</strong>' + (extra || '') + '</a>';
    }

    // ----- Top 5 histórico -----
    var ranking = M.miembros.map(function (m) {
        var idJ = M.jugadorDeMiembro.get(m.id);
        return { m: m, jugadas: idJ ? M.asistencia(idJ, null).jugadas : 0 };
    }).filter(function (x) { return x.jugadas > 0; })
        .sort(function (a, b) { return b.jugadas - a.jugadas || cmp(a.m, b.m); })
        .slice(0, 5);

    top5.innerHTML = ranking.length ? ranking.map(function (x, i) {
        return persona(x.m, '<span class="bk-pos">' + (i + 1) + '</span><span class="bk-nota">' + x.jugadas + ' changas</span>');
    }).join('') : '<p class="bk-vacio">Todavía no hay asistencias.</p>';

    // ----- Carrusel de jugadores -----
    var jugadores = M.miembros.filter(function (m) { return m.tipo_miembro === 'jugador' && !m.fecha_baja; }).sort(cmp);

    function pintarCarrusel() {
        var q = B.normalizar(buscar.value);
        var lista = jugadores.filter(function (m) {
            return !q || B.normalizar(M.nombreMiembro(m) + ' ' + M.apodo(m.id)).indexOf(q) >= 0;
        });
        carrusel.innerHTML = lista.length ? lista.map(function (m) {
            var apodo = M.apodo(m.id);
            return persona(m, '<span class="bk-nota">' + (apodo ? esc(apodo) : '&nbsp;') + '</span>');
        }).join('') : '<p class="bk-vacio">Ningún jugador coincide.</p>';
        carrusel.scrollLeft = 0;
    }
    buscar.addEventListener('input', pintarCarrusel);
    pintarCarrusel();

    document.querySelector('.bk-carrusel-flecha--izq').addEventListener('click', function () {
        carrusel.scrollBy({ left: -carrusel.clientWidth * 0.8, behavior: 'smooth' });
    });
    document.querySelector('.bk-carrusel-flecha--der').addEventListener('click', function () {
        carrusel.scrollBy({ left: carrusel.clientWidth * 0.8, behavior: 'smooth' });
    });

    // ----- No jugadores (y ex-miembros) -----
    var otros = M.miembros.filter(function (m) { return m.tipo_miembro !== 'jugador' || m.fecha_baja; }).sort(cmp);
    noJugadores.innerHTML = otros.length ? otros.map(function (m) {
        var t = M.trayectoria(m.id);
        var extra = '<span class="bk-nota">' + (m.fecha_baja ? 'Ex-miembro' : esc(B.TIPOS[m.tipo_miembro])) + '</span>';
        // Aficionados: solo el tipo. Staff y ex-miembros que jugaron: temporadas y cuándo lo dejaron
        if (t.n && (m.tipo_miembro !== 'aficionado' || m.fecha_baja)) {
            extra += '<span class="bk-nota">' + esc(t.n + (t.n === 1 ? ' temporada' : ' temporadas')) + '</span>';
            extra += '<span class="bk-nota">' + esc(t.sigue && !m.fecha_baja ? 'Juega esta temporada' : 'Dejó de jugar ' + t.hace) + '</span>';
        }
        return persona(m, extra);
    }).join('') : '<p class="bk-vacio">Todos los miembros son jugadores.</p>';
})();

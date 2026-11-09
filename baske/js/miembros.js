(async function () {
    'use strict';
    var B = window.Baske;
    var esc = B.esc;

    await B.iniciar({ activa: 'miembros' });
    var top5 = document.getElementById('top5');
    var carrusel = document.getElementById('carrusel');
    var noJugadores = document.getElementById('no-jugadores');
    var difuntos = document.getElementById('difuntos');
    var buscar = document.getElementById('buscar');

    var M;
    try {
        M = await B.modelo();
        await B.prepararFotos(M.miembros);
    } catch (e) {
        B.falloCarga(top5, e);
        carrusel.innerHTML = noJugadores.innerHTML = difuntos.innerHTML = '';
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

    // Pinta una lista de miembros en `cont`. Con más de `minCarrusel` personas: carrusel con
    // flechas y buscador (por nombre o apodo); si no, rejilla normal y buscador oculto.
    function seccion(cont, buscador, lista, tarjeta, vacio, minCarrusel) {
        var pista = cont;
        var carrusel = lista.length > minCarrusel;
        if (carrusel) {
            cont.className = 'bk-carrusel';
            cont.innerHTML =
                '<button type="button" class="bk-carrusel-flecha bk-carrusel-flecha--izq" aria-label="Anteriores">‹</button>' +
                '<div class="bk-carrusel-pista"></div>' +
                '<button type="button" class="bk-carrusel-flecha bk-carrusel-flecha--der" aria-label="Siguientes">›</button>';
            pista = cont.querySelector('.bk-carrusel-pista');
            cont.querySelector('.bk-carrusel-flecha--izq').addEventListener('click', function () {
                pista.scrollBy({ left: -pista.clientWidth * 0.8, behavior: 'smooth' });
            });
            cont.querySelector('.bk-carrusel-flecha--der').addEventListener('click', function () {
                pista.scrollBy({ left: pista.clientWidth * 0.8, behavior: 'smooth' });
            });
            buscador.hidden = false;
            buscador.addEventListener('input', pintar);
        } else {
            cont.className = 'bk-personas';
            buscador.hidden = true;
        }

        function pintar() {
            var q = carrusel ? B.normalizar(buscador.value) : '';
            var filtrada = lista.filter(function (m) {
                return !q || B.normalizar(M.nombreMiembro(m) + ' ' + M.apodo(m.id)).indexOf(q) >= 0;
            });
            pista.innerHTML = filtrada.length ? filtrada.map(tarjeta).join('')
                : '<p class="bk-vacio">' + (lista.length ? 'Nadie coincide con la búsqueda.' : vacio) + '</p>';
            pista.scrollLeft = 0;
        }
        pintar();
    }

    // ----- Jugadores (siempre en carrusel) -----
    var jugadores = M.miembros.filter(function (m) { return m.tipo_miembro === 'jugador' && !m.fecha_baja; }).sort(cmp);
    seccion(carrusel, buscar, jugadores, function (m) {
        var apodo = M.apodo(m.id);
        return persona(m, '<span class="bk-nota">' + (apodo ? esc(apodo) : '&nbsp;') + '</span>');
    }, 'Todavía no hay jugadores.', -1);

    function temporadasJugadas(t, sigue) {
        return '<span class="bk-nota">' + esc(t.n + (t.n === 1 ? ' temporada' : ' temporadas')) + '</span>' +
            '<span class="bk-nota">' + esc(sigue ? 'Juega esta temporada' : 'Dejó de jugar ' + t.hace) + '</span>';
    }

    // ----- No jugadores (siguen en el equipo) -----
    var otros = M.miembros.filter(function (m) { return m.tipo_miembro !== 'jugador' && !m.fecha_baja; }).sort(cmp);
    seccion(noJugadores, document.getElementById('buscar-no-jugadores'), otros, function (m) {
        var t = M.trayectoria(m.id);
        var extra = '<span class="bk-nota">' + esc(B.TIPOS[m.tipo_miembro]) + '</span>';
        // Aficionados: solo el tipo. Staff que jugó: temporadas y cuándo lo dejó
        if (t.n && m.tipo_miembro !== 'aficionado') extra += temporadasJugadas(t, t.sigue);
        return persona(m, extra);
    }, 'Todos los miembros son jugadores.', 4);

    // ----- Difuntos (ex-miembros) -----
    var ex = M.miembros.filter(function (m) { return m.fecha_baja; }).sort(cmp);
    seccion(difuntos, document.getElementById('buscar-difuntos'), ex, function (m) {
        var t = M.trayectoria(m.id);
        var extra = '<span class="bk-nota">Baja ' + esc(B.fecha(m.fecha_baja)) + '</span>';
        if (t.n) extra += temporadasJugadas(t, false);
        return persona(m, extra);
    }, 'Ningún difunto… de momento.', 4);
})();

(async function () {
    'use strict';
    var B = window.Baske;
    var esc = B.esc;

    var yo = await B.iniciar({ activa: 'inicio' });
    var cont = document.getElementById('votacion');

    function aviso(texto) {
        cont.innerHTML = '<p>' + texto + '</p><div class="bk-acciones"><a class="bk-btn" href="inicio.html">Volver a Inicio</a></div>';
    }

    var M, ultima, miVoto;
    try {
        M = await B.modelo();
        ultima = M.pachangas.find(function (p) { return p.jugada; });
        if (ultima && yo.idJugador) {
            var r = await B.cliente.from('top_pachanga').select('*')
                .eq('id_pachanga', ultima.id).eq('id_jugador', yo.idJugador).maybeSingle();
            if (r.error) throw r.error;
            miVoto = r.data;
        }
    } catch (e) {
        B.falloCarga(cont, e);
        return;
    }

    if (!yo.miembro || !yo.idJugador) return aviso('Solo los miembros del equipo pueden votar.');
    if (!ultima) return aviso('Todavía no se ha jugado ninguna pachanga.');
    if (ultima.asistentes.indexOf(yo.idJugador) < 0) {
        return aviso('No jugaste la última pachanga (' + esc(B.fecha(ultima.fecha)) + '), así que esta vez no te toca votar.');
    }

    var ventana = B.ventanaVoto(ultima.fecha);
    if (ventana.estado === 'pronto') return aviso('La votación de la pachanga de hoy abre a las 19:30.');
    if (ventana.estado === 'cerrada') return aviso('La votación de la pachanga del ' + esc(B.fecha(ultima.fecha)) + ' ya está cerrada.');

    // Solo miembros: ni se vota a invitados, ni nadie se vota a sí mismo al top
    var candidatos = ultima.asistentes
        .filter(function (id) { return !M.esInvitado(id); })
        .map(function (id) { return { id: id, nombre: M.nombreJugador(id) }; })
        .sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
    var paraTop = candidatos.filter(function (c) { return c.id !== yo.idJugador; });

    if (paraTop.length < 3) {
        return aviso('Hacen falta al menos tres compañeros (miembros) en la pachanga para poder votar el top 3.');
    }

    function opciones(lista, vacio) {
        return '<option value="">' + vacio + '</option>' + lista.map(function (c) {
            return '<option value="' + c.id + '">' + esc(c.nombre) + (c.id === yo.idJugador ? ' (tú)' : '') + '</option>';
        }).join('');
    }

    cont.innerHTML =
        '<p class="bk-nota" style="margin-bottom:1rem">Pachanga del <strong>' + esc(B.fechaLarga(ultima.fecha)) + '</strong>. ' +
        'Votación abierta hasta el ' + esc(B.fecha(ventana.termina.slice(0, 10))) + ' a las 23:59. Puedes cambiar tu voto mientras siga abierta.</p>' +
        '<form id="form-voto" novalidate>' +
        '<h2 class="bk-h3">Los tres mejores</h2>' +
        [1, 2, 3].map(function (n) {
            return '<div class="bk-campo"><label for="top' + n + '"><b>' + n + 'º</b> ' + (n === 1 ? '3 puntos' : n === 2 ? '2 puntos' : '1 punto') + '</label>' +
                '<select id="top' + n + '" class="top" required>' + opciones(paraTop, 'Elige jugador…') + '</select></div>';
        }).join('') +
        '<h2 class="bk-h3" style="margin-top:1.25rem">El fraude</h2>' +
        '<div class="bk-campo"><label for="fraude">Fraude de la changa (puedes votarte a ti mismo)</label>' +
        '<select id="fraude">' + opciones(candidatos, 'Sin voto al fraude') + '</select></div>' +
        '<div class="bk-acciones"><button type="submit" class="bk-btn bk-btn--azul" id="guardar">' + (miVoto ? 'Cambiar mi voto' : 'Votar') + '</button>' +
        (miVoto ? '<button type="button" class="bk-btn bk-btn--sec" id="retirar">Retirar mi voto</button>' : '') + '</div>' +
        '<div id="msg-voto" class="bk-mensaje" role="status"></div>' +
        '</form>';

    var form = document.getElementById('form-voto');
    var tops = Array.from(form.querySelectorAll('select.top'));
    var fraude = document.getElementById('fraude');
    var msg = document.getElementById('msg-voto');

    if (miVoto) {
        tops[0].value = miVoto.top_1;
        tops[1].value = miVoto.top_2;
        tops[2].value = miVoto.top_3;
        fraude.value = miVoto.fraude || '';
        if (miVoto) B.mensaje(msg, 'Ya votaste esta pachanga. Puedes cambiar el voto.', 'ok');
    }

    // No dejar elegir el mismo jugador en dos puestos del top
    function bloquearRepetidos() {
        var elegidos = tops.map(function (s) { return s.value; });
        tops.forEach(function (s, i) {
            Array.from(s.options).forEach(function (o) {
                o.disabled = o.value !== '' && elegidos.some(function (v, j) { return j !== i && v === o.value; });
            });
        });
    }
    tops.forEach(function (s) { s.addEventListener('change', bloquearRepetidos); });
    bloquearRepetidos();

    form.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var valores = tops.map(function (s) { return Number(s.value); });
        if (valores.some(function (v) { return !v; })) { B.mensaje(msg, 'Elige a los tres mejores.'); return; }

        var boton = document.getElementById('guardar');
        boton.disabled = true;
        try {
            var r = await B.cliente.from('top_pachanga').upsert({
                id_pachanga: ultima.id,
                id_jugador: yo.idJugador,
                top_1: valores[0],
                top_2: valores[1],
                top_3: valores[2],
                fraude: fraude.value ? Number(fraude.value) : null
            }, { onConflict: 'id_pachanga,id_jugador' });
            if (r.error) throw r.error;
            B.mensaje(msg, '¡Voto guardado! Puedes cambiarlo hasta que se cierre la votación.', 'ok');
            boton.textContent = 'Cambiar mi voto';
        } catch (e) {
            B.mensaje(msg, B.traducirError(e));
        } finally {
            boton.disabled = false;
        }
    });

    var retirar = document.getElementById('retirar');
    if (retirar) {
        retirar.addEventListener('click', async function () {
            if (!confirm('¿Retirar tu voto de esta pachanga?')) return;
            var r = await B.cliente.from('top_pachanga').delete()
                .eq('id_pachanga', ultima.id).eq('id_jugador', yo.idJugador);
            if (r.error) { B.mensaje(msg, B.traducirError(r.error)); return; }
            location.reload();
        });
    }
})();

(async function () {
    'use strict';
    var B = window.Baske;
    var esc = B.esc;

    var yo = await B.iniciar({ activa: 'miembros' });
    var ficha = document.getElementById('ficha');

    var M;
    try {
        M = await B.modelo(B.TABLAS_PREMIOS.concat(B.TABLAS_JUNTA, ['v_resultado_top_pachanga']));
    } catch (e) {
        B.falloCarga(ficha, e);
        return;
    }

    var m = M.miembro.get(Number(B.param('id')));
    if (!m) {
        ficha.innerHTML = '<p class="bk-vacio">No existe ese miembro.</p>';
        return;
    }
    await B.prepararFotos([m]);
    document.title = M.nombreMiembro(m) + ' · FRAN-BASKET';

    var idJ = M.jugadorDeMiembro.get(m.id);

    function dato(etiqueta, valor) {
        return '<div><dt>' + etiqueta + '</dt><dd>' + (valor == null || valor === '' ? '—' : valor) + '</dd></div>';
    }

    var padrino = m.id_padrino ? M.miembro.get(m.id_padrino) : null;
    var ahijados = M.miembros.filter(function (x) { return x.id_padrino === m.id; }).sort(M.compararMiembros.bind(M));
    var apodos = M.apodos.get(m.id) || [];
    var habilidades = M.habilidades.get(m.id) || [];
    var cargosActuales = M.juntaActual().filter(function (j) { return j.fila.id_miembro === m.id; });

    var tray = M.trayectoria(m.id);
    // El tipo ya sale en su chip: para staff se enseña cuándo dejó de jugar
    var chipEstado = m.tipo_miembro === 'staff'
        ? (tray.n && !tray.sigue ? '<span class="bk-chip bk-chip--gris">Dejó de jugar ' + esc(tray.hace) + '</span>' : '')
        : M.chipEstado(m);
    var chips = '<span class="bk-chip bk-chip--negro">' + esc(B.TIPOS[m.tipo_miembro]) + '</span> ' + chipEstado + ' ' +
        cargosActuales.map(function (j) { return '<span class="bk-chip">' + esc(B.etiquetaCargo(j.cargo)) + '</span>'; }).join(' ');

    var html = '<div class="bk-perfil"><img class="bk-foto' + (m.fecha_baja ? ' bk-foto--ex' : '') + '" src="' + esc(B.foto(m)) + '" alt="Foto de ' + esc(M.nombreMiembro(m)) + '">' +
        '<div><h1 class="bk-titulo" style="margin-bottom:0.4rem">' + esc(M.nombreMiembro(m)) + '</h1>' +
        '<div class="bk-chips" style="margin-bottom:0.9rem">' + chips + '</div>' +
        (m.descripcion ? '<p style="margin-bottom:1rem">' + esc(m.descripcion) + '</p>' : '') +
        '<dl class="bk-datos">' +
        dato('Apodos', esc(apodos.join(', '))) +
        dato('Habilidad especial', esc(habilidades.join(', '))) +
        dato('Dorsal azul', esc(m.dorsal_azul)) +
        dato('Dorsal negro', esc(m.dorsal_negro)) +
        dato('Temporadas jugadas', esc(M.textoTemporadas(tray))) +
        (M.textoDejo(m, tray) ? dato('Estado', esc(M.textoDejo(m, tray))) : '') +
        dato('Miembro desde', esc(B.fecha(m.fecha_ingreso))) +
        (m.fecha_baja ? dato('Baja', esc(B.fecha(m.fecha_baja))) : '') +
        dato('Nº de socio', m.n_socio) +
        dato('Origen', esc(B.ORIGENES[m.origen])) +
        dato('Padrino', padrino ? '<a href="jugador.html?id=' + padrino.id + '">' + esc(M.nombreMiembro(padrino)) + '</a>' : null) +
        dato('Carrera ' + esc(M.temporadaActual), M.chipsTop5(m.id) + ' <a class="bk-nota" href="premios.html">Ver premios</a>') +
        dato('Ahijados', ahijados.map(function (a) { return '<a href="jugador.html?id=' + a.id + '">' + esc(M.nombreMiembro(a)) + '</a>'; }).join(', ')) +
        '</dl></div></div>';

    // ----- Estadísticas por temporada -----
    if (idJ) {
        var filas = M.temporadas().map(function (t) {
            var set = new Set([t]);
            var a = M.asistencia(idJ, set);
            var tot = M.totales(set);
            return { t: t, a: a, tot: tot };
        }).filter(function (f) { return f.a.jugadas || f.a.cervezas || f.t === M.temporadaActual; });

        var total = M.asistencia(idJ, null);
        html += '<h2 class="bk-h2">Estadísticas</h2><div class="bk-tabla-envoltorio"><table class="bk-tabla"><thead><tr>' +
            '<th>Temporada</th><th class="num">Pachangas</th><th class="num">Cervezas</th>' +
            '</tr></thead><tbody>' +
            filas.map(function (f) {
                return '<tr><td>' + esc(f.t) + '</td><td class="num">' + f.a.jugadas + ' <span class="bk-nota">/ ' + f.tot.pachangas + '</span></td>' +
                    '<td class="num">' + f.a.cervezas + ' <span class="bk-nota">/ ' + f.tot.conCervezas + '</span></td></tr>';
            }).join('') +
            '</tbody><tfoot><tr><td>Total</td><td class="num">' + total.jugadas + '</td><td class="num">' + total.cervezas + '</td></tr></tfoot></table></div>' +
            '<p class="bk-nota" style="margin-top:0.4rem">Última pachanga: ' + esc(total.ultimaPachanga ? B.fecha(total.ultimaPachanga) : '—') +
            ' · Última cerveza: ' + esc(total.ultimaCerveza ? B.fecha(total.ultimaCerveza) : '—') + '</p>';
    }

    // ----- Premios y cargos -----
    var premios = M.premios(m.id);
    var cargos = M.cargosDe(m.id);
    html += '<div class="bk-grid bk-seccion">' +
        '<section class="bk-card"><h2 class="bk-h3">Premios</h2>' + (premios.length
            ? '<ul class="bk-premios-lista">' + premios.map(function (p) { return '<li>' + esc(p.nombre) + '<small>' + esc(p.cuando) + '</small></li>'; }).join('') + '</ul>'
            : '<p class="bk-vacio">Sin premios (de momento).</p>') + '</section>' +
        '<section class="bk-card"><h2 class="bk-h3">Junta directiva</h2>' + (cargos.length
            ? '<ul class="bk-lista-simple">' + cargos.map(function (c) {
                return '<li><strong>' + esc(B.etiquetaCargo(c.cargo)) + '</strong> <span class="bk-nota">' + esc(B.fecha(c.fecha_inicio)) + ' – ' + esc(c.fecha_fin ? B.fecha(c.fecha_fin) : 'actualidad') + '</span></li>';
            }).join('') + '</ul>'
            : '<p class="bk-vacio">Nunca ha tenido cargo.</p>') + '</section>' +
        '</div>';

    // ----- Proponer apodo / habilidad -----
    html += '<section class="bk-card bk-seccion"><h2 class="bk-h3">Proponer</h2>' +
        '<p class="bk-nota" style="margin-bottom:0.75rem">Propón un apodo o una habilidad especial para ' + esc(m.nombre) + '. Aparecerá cuando un administrador la valide.</p>' +
        '<form id="form-propuesta" class="bk-form-grid">' +
        '<div class="bk-campo"><label for="tipo-propuesta">Qué</label><select id="tipo-propuesta"><option value="apodo">Apodo</option><option value="habilidad">Habilidad especial</option></select></div>' +
        '<div class="bk-campo"><label for="texto-propuesta">Propuesta</label><input type="text" id="texto-propuesta" maxlength="60" required></div>' +
        '<div class="bk-campo" style="justify-content:flex-end"><button class="bk-btn" type="submit">Enviar</button></div>' +
        '</form><div id="msg-propuesta" class="bk-mensaje" role="status"></div></section>';

    ficha.innerHTML = html;

    // Desde Ajustes → "Proponer más" (jugador.html?id=…#proponer): ir directo al formulario
    if (location.hash === '#proponer') {
        var formProp = document.getElementById('form-propuesta');
        formProp.closest('section').scrollIntoView({ block: 'start' });
        var primero = formProp.querySelector('input, select');
        if (primero) primero.focus({ preventScroll: true });
    }

    document.getElementById('form-propuesta').addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var msg = document.getElementById('msg-propuesta');
        var tipo = document.getElementById('tipo-propuesta').value;
        var input = document.getElementById('texto-propuesta');
        var texto = input.value.trim();
        if (!texto) { B.mensaje(msg, 'Escribe la propuesta.'); return; }

        var fila = { id_miembro: m.id, validado: false, creado_por: yo.uid };
        var r;
        if (tipo === 'apodo') {
            fila.apodo = texto;
            r = await B.cliente.from('apodo').insert(fila);
        } else {
            fila.habilidad = texto;
            r = await B.cliente.from('habilidad_especial').insert(fila);
        }
        if (r.error) { B.mensaje(msg, B.traducirError(r.error)); return; }
        input.value = '';
        B.mensaje(msg, 'Propuesta enviada. Puedes retirarla desde Ajustes mientras no se valide.', 'ok');
    });
})();

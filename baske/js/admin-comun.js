(function () {
    'use strict';
    // Utilidades de las pantallas de administración (window.Admin).
    var B = window.Baske;
    var esc = B.esc;

    // Abre un <dialog> con un formulario.
    //   alGuardar(form, valores) puede ser async; si lanza, se enseña el error y el diálogo sigue abierto.
    //   opciones: { textoGuardar, ancho, sinGuardar, alAbrir(dialog) }
    function dialogo(titulo, cuerpo, alGuardar, opciones) {
        opciones = opciones || {};
        var d = document.createElement('dialog');
        d.className = 'bk-dialogo';
        if (opciones.ancho) d.style.width = 'min(' + opciones.ancho + ', calc(100vw - 32px))';
        d.innerHTML = '<form method="dialog" novalidate>' +
            '<div class="bk-cabecera-card"><h2 class="bk-h3">' + esc(titulo) + '</h2>' +
            '<button type="button" class="bk-btn bk-btn--peq bk-btn--sec" data-cerrar aria-label="Cerrar">✕</button></div>' +
            '<div class="bk-dialogo-cuerpo">' + cuerpo + '</div>' +
            '<div class="bk-mensaje" role="alert"></div>' +
            '<div class="bk-acciones">' +
            (opciones.sinGuardar ? '' : '<button type="submit" class="bk-btn bk-btn--azul">' + esc(opciones.textoGuardar || 'Guardar') + '</button>') +
            '<button type="button" class="bk-btn bk-btn--sec" data-cerrar>' + (opciones.sinGuardar ? 'Cerrar' : 'Cancelar') + '</button></div>' +
            '</form>';
        document.body.appendChild(d);

        var form = d.querySelector('form');
        var msg = d.querySelector('.bk-mensaje');
        d.querySelectorAll('[data-cerrar]').forEach(function (b) { b.addEventListener('click', function () { d.close(); }); });
        d.addEventListener('close', function () { d.remove(); });

        form.addEventListener('submit', async function (ev) {
            ev.preventDefault();
            var boton = form.querySelector('button[type="submit"]');
            if (boton) boton.disabled = true;
            B.mensaje(msg, '');
            try {
                await alGuardar(form, valores(form));
                d.close();
            } catch (e) {
                console.error(e);
                B.mensaje(msg, B.traducirError(e));
            } finally {
                if (boton) boton.disabled = false;
            }
        });

        d.showModal();
        if (opciones.alAbrir) opciones.alAbrir(d);
        return d;
    }

    // Lee los campos con name: vacío -> null, data-tipo="numero" -> Number, checkbox -> boolean
    function valores(form) {
        var v = {};
        form.querySelectorAll('[name]').forEach(function (el) {
            if (el.type === 'checkbox') { v[el.name] = el.checked; return; }
            if (el.type === 'file') return;
            var x = el.value.trim();
            if (x === '') v[el.name] = null;
            else if (el.dataset.tipo === 'numero') v[el.name] = Number(x.replace(',', '.'));
            else v[el.name] = x;
        });
        return v;
    }

    function campo(etiqueta, nombre, valor, extra) {
        extra = extra || {};
        var id = 'c-' + nombre + '-' + Math.random().toString(36).slice(2, 7);
        var tipo = extra.tipo || 'text';
        var attrs = (extra.requerido ? ' required' : '') + (extra.min != null ? ' min="' + extra.min + '"' : '') +
            (extra.max != null ? ' max="' + extra.max + '"' : '') + (extra.paso ? ' step="' + extra.paso + '"' : '') +
            (extra.patron ? ' pattern="' + esc(extra.patron) + '"' : '') + (extra.maxlength ? ' maxlength="' + extra.maxlength + '"' : '') +
            (extra.inputmode ? ' inputmode="' + extra.inputmode + '"' : '') +
            (tipo === 'number' ? ' data-tipo="numero" inputmode="decimal"' : '');
        if (tipo === 'checkbox') {
            return '<div class="bk-campo bk-campo--check"><input type="checkbox" id="' + id + '" name="' + nombre + '"' + (valor ? ' checked' : '') + '>' +
                '<label for="' + id + '">' + esc(etiqueta) + '</label></div>';
        }
        if (tipo === 'textarea') {
            return '<div class="bk-campo"><label for="' + id + '">' + esc(etiqueta) + '</label><textarea id="' + id + '" name="' + nombre + '">' + esc(valor) + '</textarea></div>';
        }
        if (tipo === 'select') {
            return '<div class="bk-campo"><label for="' + id + '">' + esc(etiqueta) + '</label><select id="' + id + '" name="' + nombre + '"' +
                (extra.numero ? ' data-tipo="numero"' : '') + attrs + '>' + extra.opciones + '</select></div>';
        }
        return '<div class="bk-campo"><label for="' + id + '">' + esc(etiqueta) + '</label><input type="' + tipo + '" id="' + id + '" name="' + nombre + '" value="' + esc(valor == null ? '' : valor) + '"' + attrs + '></div>';
    }

    // <option>s a partir de [[valor, texto]]
    function opciones(lista, seleccionado, vacio) {
        return (vacio != null ? '<option value="">' + esc(vacio) + '</option>' : '') + lista.map(function (o) {
            return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(seleccionado) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
        }).join('');
    }

    function opcionesMiembros(M, seleccionado, vacio, filtro) {
        var lista = M.miembros.filter(filtro || function () { return true; }).sort(M.compararMiembros.bind(M))
            .map(function (m) { return [m.id, M.nombreMiembro(m) + (m.fecha_baja ? ' (ex)' : '')]; });
        return opciones(lista, seleccionado, vacio);
    }

    // Lanza el error de una respuesta de supabase-js
    function ok(r) {
        if (r && r.error) throw r.error;
        return r ? r.data : null;
    }

    // Fecha de pago a guardar: hoy -> null (la base de datos pone "ahora"); otro día -> mediodía de ese día
    function fechaPago(texto) {
        if (!texto || texto >= B.hoy()) return null;
        return texto + 'T12:00:00Z';
    }

    window.Admin = {
        dialogo: dialogo,
        valores: valores,
        campo: campo,
        opciones: opciones,
        opcionesMiembros: opcionesMiembros,
        ok: ok,
        fechaPago: fechaPago,
        reducirImagen: B.reducirImagen
    };
})();

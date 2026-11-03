(async function () {
    'use strict';
    var B = window.Baske;
    var esc = B.esc;

    await B.iniciar({ activa: 'equipacion' });
    var grid = document.getElementById('dorsales');
    var info = document.getElementById('info');
    var inputNombre = document.getElementById('buscar-nombre');
    var inputNumero = document.getElementById('buscar-numero');
    var selectOrden = document.getElementById('orden');

    var M;
    try {
        M = await B.modelo();
    } catch (e) {
        B.falloCarga(grid, e);
        return;
    }

    // Los dorsales son texto: '1' y '01' son números distintos.
    // 110 números: '0'-'9' y '00'-'99'. numero -> { n, azul: miembro, negro: miembro } (solo activos)
    var numeros = [];
    var porNumero = new Map();
    for (var i = 0; i < 10; i++) numeros.push({ n: String(i), azul: null, negro: null });
    for (var k = 0; k < 100; k++) numeros.push({ n: String(k).padStart(2, '0'), azul: null, negro: null });
    numeros.forEach(function (x) { porNumero.set(x.n, x); });
    M.miembros.forEach(function (m) {
        if (!m.activo) return;
        var az = m.dorsal_azul != null ? porNumero.get(String(m.dorsal_azul)) : null;
        var ng = m.dorsal_negro != null ? porNumero.get(String(m.dorsal_negro)) : null;
        if (az) az.azul = m;
        if (ng) ng.negro = m;
    });

    function ocupacion(x) { return (x.azul ? 1 : 0) + (x.negro ? 1 : 0); }
    // Orden: 0, 00, 1, 01, 2, 02 … 9, 09, 10, 11 … 99
    function comparar(a, b) { return Number(a.n) - Number(b.n) || a.n.length - b.n.length; }
    function dos(n) { return n == null ? '—' : String(n); }

    var seleccionado = null;

    function describir(x) {
        if (!ocupacion(x)) return '<strong>Nº ' + dos(x.n) + '</strong> — libre en los dos colores.';
        return '<strong>Nº ' + dos(x.n) + '</strong><br>' +
            'Azul: ' + (x.azul ? '<a href="jugador.html?id=' + x.azul.id + '">' + esc(M.nombreMiembro(x.azul)) + '</a>' : '<span class="bk-nota">libre</span>') + '<br>' +
            'Negro: ' + (x.negro ? '<a href="jugador.html?id=' + x.negro.id + '">' + esc(M.nombreMiembro(x.negro)) + '</a>' : '<span class="bk-nota">libre</span>');
    }

    function pintar() {
        var orden = selectOrden.value;
        var lista = numeros.slice().sort(function (a, b) {
            if (orden === 'desc') return comparar(b, a);
            if (orden === 'ocupados') return ocupacion(b) - ocupacion(a) || comparar(a, b);
            if (orden === 'libres') return ocupacion(a) - ocupacion(b) || comparar(a, b);
            return comparar(a, b);
        });

        // Filtros: por nombre resalta los números de esa gente; por número, ese número
        var q = B.normalizar(inputNombre.value);
        var numBuscado = inputNumero.value.trim() === '' ? null : inputNumero.value.trim();
        var resaltados = null;
        var textoInfo = null;

        if (q) {
            var gente = M.miembros.filter(function (m) {
                return m.activo && B.normalizar(M.nombreMiembro(m) + ' ' + M.apodo(m.id)).indexOf(q) >= 0;
            });
            resaltados = new Set();
            gente.forEach(function (m) {
                if (m.dorsal_azul != null) resaltados.add(String(m.dorsal_azul));
                if (m.dorsal_negro != null) resaltados.add(String(m.dorsal_negro));
            });
            textoInfo = gente.length
                ? gente.map(function (m) {
                    return '<strong>' + esc(M.nombreMiembro(m)) + '</strong>: azul ' + esc(dos(m.dorsal_azul)) +
                        ' · negro ' + esc(dos(m.dorsal_negro));
                }).join('<br>')
                : 'Nadie activo se llama así.';
        } else if (numBuscado != null) {
            if (porNumero.has(numBuscado)) {
                resaltados = new Set([numBuscado]);
                textoInfo = describir(porNumero.get(numBuscado));
            } else {
                textoInfo = 'Escribe un número de 1 o 2 cifras (el 1 y el 01 son distintos).';
            }
        } else if (seleccionado != null) {
            textoInfo = describir(porNumero.get(seleccionado));
        }

        info.innerHTML = textoInfo || '<span class="bk-nota">Toca un número para ver quién lo tiene.</span>';

        grid.innerHTML = lista.map(function (x) {
            var clase = x.azul && x.negro ? 'bk-dorsal--ambos' : x.azul ? 'bk-dorsal--azul' : x.negro ? 'bk-dorsal--negro' : '';
            if (resaltados) clase += resaltados.has(x.n) ? ' resaltado' : ' atenuado';
            var etiqueta = 'Número ' + dos(x.n) + ': ' + (x.azul ? 'azul ocupado' : 'azul libre') + ', ' + (x.negro ? 'negro ocupado' : 'negro libre');
            return '<button type="button" class="bk-dorsal ' + clase + '" data-n="' + x.n + '" aria-label="' + etiqueta + '"' +
                (seleccionado === x.n ? ' aria-pressed="true"' : '') + '><span>' + dos(x.n) + '</span></button>';
        }).join('');
    }

    grid.addEventListener('click', function (ev) {
        var b = ev.target.closest('.bk-dorsal');
        if (!b) return;
        seleccionado = b.dataset.n;
        inputNombre.value = '';
        inputNumero.value = '';
        pintar();
    });

    inputNombre.addEventListener('input', function () { inputNumero.value = ''; seleccionado = null; pintar(); });
    inputNumero.addEventListener('input', function () {
        inputNombre.value = '';
        seleccionado = null;
        pintar();
        var b = grid.querySelector('.resaltado');
        if (b) b.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    selectOrden.addEventListener('change', pintar);

    pintar();
})();

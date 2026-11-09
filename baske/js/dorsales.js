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
    // Los aficionados pueden llevar cualquier número: se enseñan, pero no lo ocupan
    function nuevo(n) { return { n: n, azul: null, negro: null, aficionados: [] }; }
    for (var i = 0; i < 10; i++) numeros.push(nuevo(String(i)));
    for (var k = 0; k < 100; k++) numeros.push(nuevo(String(k).padStart(2, '0')));
    numeros.forEach(function (x) { porNumero.set(x.n, x); });
    M.miembros.forEach(function (m) {
        if (!m.activo) return;
        var az = m.dorsal_azul != null ? porNumero.get(String(m.dorsal_azul)) : null;
        var ng = m.dorsal_negro != null ? porNumero.get(String(m.dorsal_negro)) : null;
        if (m.tipo_miembro === 'aficionado') {
            if (az) az.aficionados.push({ m: m, color: 'azul' });
            if (ng) ng.aficionados.push({ m: m, color: 'negro' });
            return;
        }
        if (az) az.azul = m;
        if (ng) ng.negro = m;
    });

    function ocupacion(x) { return (x.azul ? 1 : 0) + (x.negro ? 1 : 0); }
    // Orden: 00, 01 … 09, luego 0, 1 … 9, luego 10, 11 … 99
    function grupo(n) { return n.length === 2 && n[0] === '0' ? 0 : n.length === 1 ? 1 : 2; }
    function comparar(a, b) { return grupo(a.n) - grupo(b.n) || Number(a.n) - Number(b.n); }
    function dos(n) { return n == null ? '—' : String(n); }

    var seleccionado = null;

    function enlace(m) { return '<a href="jugador.html?id=' + m.id + '">' + esc(M.nombreMiembro(m)) + '</a>'; }

    function describir(x) {
        var afic = x.aficionados.length
            ? '<br><span class="bk-nota">Aficionados con el número: ' +
              x.aficionados.map(function (a) { return enlace(a.m) + ' (' + a.color + ')'; }).join(', ') + '</span>'
            : '';
        if (!ocupacion(x)) return '<strong>Nº ' + dos(x.n) + '</strong> — libre en los dos colores.' + afic;
        return '<strong>Nº ' + dos(x.n) + '</strong><br>' +
            'Azul: ' + (x.azul ? enlace(x.azul) : '<span class="bk-nota">libre</span>') + '<br>' +
            'Negro: ' + (x.negro ? enlace(x.negro) : '<span class="bk-nota">libre</span>') + afic;
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
                    return '<strong>' + esc(M.nombreMiembro(m)) + '</strong>' + (m.tipo_miembro === 'aficionado' ? ' <span class="bk-nota">(aficionado: no ocupa número)</span>' : '') +
                        ': azul ' + esc(dos(m.dorsal_azul)) + ' · negro ' + esc(dos(m.dorsal_negro));
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
            if (x.aficionados.length) clase += ' bk-dorsal--aficionado';
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

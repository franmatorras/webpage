(function () {
    /* ---------------------------------------------------------------
       CAMBIO DE VERSIÓN DESACTIVADO
       Por ahora la página solo muestra la versión alternativa: el <body>
       ya viene con la clase mode-mrx desde infancia.html y el botón
       #mode-toggle está comentado ahí. Todo el bloque de abajo se conserva
       tal cual; para reactivarlo, descomentarlo y descomentar también el
       botón en infancia.html (y devolver al <body> la clase mode-2000s).
       --------------------------------------------------------------- */

    // var STORAGE_KEY = 'infancia-mode';
    // var MODE_2000S = 'mode-2000s';
    // var MODE_MRX = 'mode-mrx';
    //
    // var body = document.body;
    // var toggle = document.getElementById('mode-toggle');
    //
    // // localStorage puede estar bloqueado (modo privado, cookies de terceros):
    // // la página tiene que seguir funcionando igual.
    // function readMode() {
    //     try {
    //         return localStorage.getItem(STORAGE_KEY);
    //     } catch (e) {
    //         return null;
    //     }
    // }
    //
    // function saveMode(mode) {
    //     try {
    //         localStorage.setItem(STORAGE_KEY, mode);
    //     } catch (e) {
    //         /* sin persistencia, pero el cambio de modo sigue valiendo */
    //     }
    // }
    //
    // function applyMode(mode) {
    //     body.classList.remove(MODE_2000S, MODE_MRX);
    //     body.classList.add(mode);
    //     toggle.textContent = mode === MODE_MRX
    //         ? 'Volver a la versión original'
    //         : 'Ver versión alternativa';
    // }
    //
    // // ?modo=alt fuerza la versión alternativa (enlace directo); si no, manda lo guardado.
    // var forced = /[?&]modo=alt\b/.test(window.location.search) ? MODE_MRX : null;
    //
    // applyMode(forced || (readMode() === MODE_MRX ? MODE_MRX : MODE_2000S));
    //
    // toggle.addEventListener('click', function () {
    //     var next = body.classList.contains(MODE_MRX) ? MODE_2000S : MODE_MRX;
    //     applyMode(next);
    //     saveMode(next);
    //     window.scrollTo(0, 0);
    // });

    // Contador de visitas: puro adorno, sube hasta un número fijo al cargar.
    var counter = document.getElementById('hit-counter');

    if (counter) {
        var digits = counter.querySelectorAll('.digit');
        var target = 13742;
        var current = 0;
        var step = Math.ceil(target / 60);

        var countId = setInterval(function () {
            current += step;

            if (current >= target) {
                current = target;
                clearInterval(countId);
            }

            var text = String(current).padStart(digits.length, '0');

            for (var i = 0; i < digits.length; i++) {
                digits[i].textContent = text.charAt(i);
            }
        }, 30);
    }

    // Reloj del "servidor", que es el reloj del visitante.
    var clock = document.getElementById('retro-clock');

    if (clock) {
        tick();
        setInterval(tick, 1000);
    }

    function tick() {
        var now = new Date();
        clock.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
    }

    function pad(n) {
        return String(n).padStart(2, '0');
    }
})();

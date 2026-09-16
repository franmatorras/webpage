(function () {
    // Carrusel de la fiesta en cumpleamiento.html. Se activa cuando la cuenta
    // atrás llega a cero (js/cumpleamiento.js lanza "fiesta:start") y hasta
    // entonces no hace ni una petición. La subida vive en fotos.html.
    //
    // Necesita /fiesta-config.js, js/carrusel.js y js/fiesta-api.js antes.

    // Con un punto por foto, un carrusel de 80 fotos desborda la fila de puntos:
    // aquí se enseñan las últimas y el resto se ve en la cuadrícula de fotos.html.
    var MAX_CARRUSEL = 15;

    var arrancado = false;

    var galeria = document.getElementById('fiesta-galeria');
    var verTodas = document.getElementById('fiesta-ver-todas');

    if (!galeria || !window.FiestaApi) {
        return;
    }

    // cumpleamiento.js se carga antes que este archivo y lanza "fiesta:start" de
    // forma síncrona, así que si la fiesta ya había empezado el evento se pierde:
    // por eso además se comprueba la clase al arrancar.
    document.addEventListener('fiesta:start', arrancar);

    if (document.body.classList.contains('fiesta-activa')) {
        arrancar();
    }

    async function arrancar() {
        if (arrancado) {
            return;
        }

        arrancado = true;

        if (!FiestaApi.hayConfig()) {
            mostrarAviso('El muro de fotos todavía no está configurado.');
            return;
        }

        try {
            var fotos = await FiestaApi.cargarFotos({ limite: MAX_CARRUSEL });
            renderCarrusel(fotos);
        } catch (error) {
            console.error('Error cargando las fotos de la fiesta:', error);
            mostrarAviso('No se han podido cargar las fotos.');
        }
    }

    function renderCarrusel(fotos) {
        galeria.textContent = '';

        if (!fotos.length) {
            mostrarAviso('Todavía no hay fotos. ¡Sé el primero!');
            return;
        }

        var carrusel = document.createElement('div');
        carrusel.className = 'carrusel';
        carrusel.setAttribute('data-carrusel', '');

        var track = document.createElement('div');
        track.className = 'carrusel-track';

        for (var i = 0; i < fotos.length; i++) {
            track.appendChild(FiestaApi.imagenDe(fotos[i], false));
        }

        carrusel.appendChild(track);
        galeria.appendChild(carrusel);

        // El carrusel se crea después del DOMContentLoaded, así que hay que
        // montarlo a mano.
        if (window.Carrusel) {
            window.Carrusel.setup(carrusel);
        }

        if (verTodas) {
            verTodas.hidden = false;
        }
    }

    function mostrarAviso(texto) {
        galeria.textContent = '';

        var p = document.createElement('p');
        p.className = 'fiesta-vacio';
        p.textContent = texto;
        galeria.appendChild(p);
    }
})();

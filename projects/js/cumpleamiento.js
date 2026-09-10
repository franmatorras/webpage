(function () {
    // Vídeo de YouTube: pegar aquí solo el ID del vídeo (la parte después de "?v=").
    // El vídeo debe ser "No listado" (unlisted) — YouTube no permite incrustar vídeos "Privados".
    // Dejar como cadena vacía para mostrar el marcador de posición.
    var VIDEO_ID = 'jvLpFkoqJPw';

    renderVideo();

    function renderVideo() {
        var frame = document.getElementById('cumple-video-frame');

        if (!frame || !VIDEO_ID) {
            return;
        }

        var iframe = document.createElement('iframe');
        iframe.src = 'https://www.youtube-nocookie.com/embed/' + VIDEO_ID + '?rel=0';
        iframe.title = 'Vídeo de cumpleaños';
        iframe.loading = 'lazy';
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen';
        iframe.allowFullscreen = true;

        frame.innerHTML = '';
        frame.appendChild(iframe);
    }

    var targetDate = new Date('2026-09-19T20:00:00+02:00');
    var daysEl = document.getElementById('cd-days');
    var hoursEl = document.getElementById('cd-hours');
    var minutesEl = document.getElementById('cd-minutes');
    var secondsEl = document.getElementById('cd-seconds');

    function pad(n) {
        return String(n).padStart(2, '0');
    }

    // Para poder ver el modo fiesta antes del día 19: ?fiesta=1 lo fuerza,
    // ?fiesta=0 lo desactiva. Sin parámetro manda la cuenta atrás.
    var forzado = new URLSearchParams(window.location.search).get('fiesta');

    if (forzado === '1') {
        activarFiesta();
        return;
    }

    var intervalId = setInterval(updateCountdown, 1000);
    updateCountdown();

    // Al llegar a cero la página se convierte en la fiesta: se esconde la cuenta
    // atrás (por CSS, no borrando nada, para que el botón "Ver años anteriores"
    // siga ahí) y se destapa el muro de fotos, que ya está en el HTML.
    function activarFiesta() {
        document.body.classList.add('fiesta-activa');

        var seccion = document.getElementById('fiesta-section');

        if (seccion) {
            seccion.hidden = false;
        }

        document.dispatchEvent(new CustomEvent('fiesta:start'));
    }

    function updateCountdown() {
        var diff = targetDate.getTime() - Date.now();

        if (diff <= 0) {
            clearInterval(intervalId);

            // ?fiesta=0 deja la cuenta atrás congelada en ceros, para poder ver
            // la página "de antes" aunque la fecha ya haya pasado.
            if (forzado !== '0') {
                activarFiesta();
            }

            return;
        }

        var totalSeconds = Math.floor(diff / 1000);
        var days = Math.floor(totalSeconds / 86400);
        var hours = Math.floor((totalSeconds % 86400) / 3600);
        var minutes = Math.floor((totalSeconds % 3600) / 60);
        var seconds = totalSeconds % 60;

        daysEl.textContent = pad(days);
        hoursEl.textContent = pad(hours);
        minutesEl.textContent = pad(minutes);
        secondsEl.textContent = pad(seconds);
    }
})();

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
    var wrapper = document.getElementById('cumple-countdown-wrapper');
    var daysEl = document.getElementById('cd-days');
    var hoursEl = document.getElementById('cd-hours');
    var minutesEl = document.getElementById('cd-minutes');
    var secondsEl = document.getElementById('cd-seconds');

    function pad(n) {
        return String(n).padStart(2, '0');
    }

    var intervalId = setInterval(updateCountdown, 1000);
    updateCountdown();

    function updateCountdown() {
        var diff = targetDate.getTime() - Date.now();

        if (diff <= 0) {
            clearInterval(intervalId);
            wrapper.innerHTML = '<p class="cumple-celebration">¡Es la fiesta! 🎉</p>';
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

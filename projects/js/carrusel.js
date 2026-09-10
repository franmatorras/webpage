(function () {
    // Carrusel de fotos reutilizable.
    // Uso: <div class="carrusel" data-carrusel><div class="carrusel-track">
    //          <img src="..." alt="..." loading="lazy">
    //      </div></div>
    // Sin JS el carrusel sigue siendo una tira de fotos deslizable a los lados.

    document.addEventListener('DOMContentLoaded', init);

    var lightbox = null;
    var lightboxImg = null;
    var lightboxImages = [];
    var lightboxIndex = 0;
    var lastFocused = null;

    function init() {
        var carruseles = document.querySelectorAll('[data-carrusel]');

        for (var i = 0; i < carruseles.length; i++) {
            setupCarrusel(carruseles[i]);
        }
    }

    function setupCarrusel(carrusel) {
        // Un carrusel solo se monta una vez: init() recorre todos los
        // [data-carrusel] al cargar la página y js/fiesta.js monta a mano el suyo
        // en cuanto llegan las fotos, así que los dos pueden caer sobre el mismo
        // elemento y duplicar flechas y puntos.
        if (carrusel.dataset.carruselListo === '1') {
            return;
        }

        carrusel.dataset.carruselListo = '1';

        var track = carrusel.querySelector('.carrusel-track');
        var images = track ? track.querySelectorAll('img') : [];

        // Un carrusel sin fotos se oculta entero para no dejar un hueco vacío.
        if (!track || images.length === 0) {
            carrusel.hidden = true;
            return;
        }

        for (var i = 0; i < images.length; i++) {
            bindLightbox(images[i], images, i);
        }

        // Con una sola foto no hacen falta flechas ni puntos.
        if (images.length < 2) {
            return;
        }

        var prev = makeButton('carrusel-prev', 'Foto anterior', '‹');
        var next = makeButton('carrusel-next', 'Foto siguiente', '›');
        var dots = document.createElement('div');
        dots.className = 'carrusel-dots';

        for (var j = 0; j < images.length; j++) {
            dots.appendChild(makeDot(track, j));
        }

        carrusel.appendChild(prev);
        carrusel.appendChild(next);
        carrusel.appendChild(dots);

        prev.addEventListener('click', function () {
            goTo(track, currentIndex(track) - 1);
        });

        next.addEventListener('click', function () {
            goTo(track, currentIndex(track) + 1);
        });

        var ticking = false;
        track.addEventListener('scroll', function () {
            if (ticking) {
                return;
            }
            ticking = true;
            requestAnimationFrame(function () {
                ticking = false;
                sync();
            });
        });

        window.addEventListener('resize', sync);
        sync();

        function sync() {
            var index = currentIndex(track);
            var buttons = dots.children;

            for (var k = 0; k < buttons.length; k++) {
                buttons[k].setAttribute('aria-current', k === index ? 'true' : 'false');
            }

            prev.disabled = index <= 0;
            next.disabled = index >= images.length - 1;
        }
    }

    function makeButton(className, label, glyph) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'carrusel-btn ' + className;
        button.setAttribute('aria-label', label);
        button.textContent = glyph;
        return button;
    }

    function makeDot(track, index) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'carrusel-dot';
        dot.setAttribute('aria-label', 'Ir a la foto ' + (index + 1));
        dot.addEventListener('click', function () {
            goTo(track, index);
        });
        return dot;
    }

    function currentIndex(track) {
        return Math.round(track.scrollLeft / track.clientWidth);
    }

    function goTo(track, index) {
        track.scrollTo({ left: index * track.clientWidth, behavior: 'smooth' });
    }

    // ----- Lightbox (compartido por todos los carruseles de la página) -----

    function bindLightbox(img, images, index) {
        img.tabIndex = 0;
        img.setAttribute('role', 'button');

        img.addEventListener('click', function () {
            openLightbox(images, index, img);
        });

        img.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openLightbox(images, index, img);
            }
        });
    }

    function buildLightbox() {
        lightbox = document.createElement('div');
        lightbox.className = 'lightbox';
        lightbox.hidden = true;
        lightbox.innerHTML =
            '<button type="button" class="lightbox-close" aria-label="Cerrar">✕</button>' +
            '<button type="button" class="lightbox-prev" aria-label="Foto anterior">‹</button>' +
            '<img alt="">' +
            '<button type="button" class="lightbox-next" aria-label="Foto siguiente">›</button>' +
            '<div class="lightbox-caption" hidden>' +
                '<strong class="lightbox-caption-titulo"></strong>' +
                '<span class="lightbox-caption-nota"></span>' +
                '<span class="lightbox-caption-autor"></span>' +
            '</div>';

        lightboxImg = lightbox.querySelector('img');

        lightbox.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
        lightbox.querySelector('.lightbox-prev').addEventListener('click', function (event) {
            event.stopPropagation();
            step(-1);
        });
        lightbox.querySelector('.lightbox-next').addEventListener('click', function (event) {
            event.stopPropagation();
            step(1);
        });

        // Un clic en el fondo (no en la foto ni en los botones) cierra.
        lightbox.addEventListener('click', function (event) {
            if (event.target === lightbox) {
                closeLightbox();
            }
        });

        document.addEventListener('keydown', function (event) {
            if (lightbox.hidden) {
                return;
            }
            if (event.key === 'Escape') {
                closeLightbox();
            } else if (event.key === 'ArrowLeft') {
                step(-1);
            } else if (event.key === 'ArrowRight') {
                step(1);
            }
        });

        document.body.appendChild(lightbox);
    }

    function openLightbox(images, index, trigger) {
        if (!lightbox) {
            buildLightbox();
        }

        lastFocused = trigger;
        lightboxImages = images;
        show(index);
        lightbox.hidden = false;
        document.body.style.overflow = 'hidden';
        lightbox.querySelector('.lightbox-close').focus();
    }

    function closeLightbox() {
        lightbox.hidden = true;
        document.body.style.overflow = '';

        if (lastFocused) {
            lastFocused.focus();
            lastFocused = null;
        }
    }

    function step(delta) {
        show(lightboxIndex + delta);
    }

    function show(index) {
        var total = lightboxImages.length;
        lightboxIndex = (index % total + total) % total;

        var source = lightboxImages[lightboxIndex];
        lightboxImg.src = source.src;
        lightboxImg.alt = source.alt || '';

        showCaption(source);

        var multiple = total > 1;
        lightbox.querySelector('.lightbox-prev').hidden = !multiple;
        lightbox.querySelector('.lightbox-next').hidden = !multiple;
    }

    // Los carruseles antiguos no llevan data-* y no muestran pie ninguno; las
    // fotos de la fiesta traen título, autor y nota en el dataset.
    function showCaption(source) {
        var caption = lightbox.querySelector('.lightbox-caption');
        var titulo = source.dataset.titulo || '';
        var nota = source.dataset.nota || '';
        var autor = source.dataset.autor || '';

        fillPart(caption.querySelector('.lightbox-caption-titulo'), titulo);
        fillPart(caption.querySelector('.lightbox-caption-nota'), nota);
        fillPart(caption.querySelector('.lightbox-caption-autor'), autor ? '— ' + autor : '');

        caption.hidden = !titulo && !nota && !autor;
    }

    // textContent, nunca innerHTML: estos textos los escribe cualquiera.
    function fillPart(element, text) {
        element.textContent = text;
        element.hidden = !text;
    }

    // Se expone para que quien cargue fotos por JS (js/fiesta.js) pueda montar
    // un carrusel creado después del DOMContentLoaded.
    window.Carrusel = {
        setup: setupCarrusel,
        refresh: init
    };
})();

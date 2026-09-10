(function () {
    // Muro de fotos de la fiesta. Se activa cuando la cuenta atrás llega a cero
    // (js/cumpleamiento.js lanza el evento "fiesta:start") y hasta entonces no
    // hace ni una petición.
    //
    // Los textos (título, autor, nota) los escribe cualquiera desde internet, así
    // que se pintan siempre con textContent y nunca interpolados en innerHTML.

    var MAX_FOTOS = 5;          // por envío; es una ayuda de interfaz, no seguridad
    var MAX_LADO = 1600;        // px del lado largo tras reducir
    var CALIDAD = 0.82;         // calidad JPEG al recomprimir
    var TAM_MAX = 6 * 1024 * 1024;  // el mismo tope que tiene el bucket
    var CLAVE_NOMBRE = 'fiesta-autor';

    var seleccion = [];         // { file, objectUrl, titulo, nota, fila }
    var fotos = [];
    var cargaError = null;
    var subiendo = false;
    var arrancado = false;

    var seccion = document.getElementById('fiesta-section');

    if (!seccion) {
        return;
    }

    var btnSubir = document.getElementById('fiesta-subir');
    var form = document.getElementById('fiesta-form');
    var inputFile = document.getElementById('fiesta-file');
    var inputAutor = document.getElementById('fiesta-autor');
    var contenedorSeleccion = document.getElementById('fiesta-seleccion');
    var btnEnviar = document.getElementById('fiesta-enviar');
    var estado = document.getElementById('fiesta-estado');
    var galeria = document.getElementById('fiesta-galeria');

    inputAutor.value = recordarNombre();

    btnSubir.addEventListener('click', toggleForm);
    inputFile.addEventListener('change', onElegirFotos);
    form.addEventListener('submit', onEnviar);

    // cumpleamiento.js se carga antes que este archivo y lanza "fiesta:start" de
    // forma síncrona, así que si la fiesta ya había empezado el evento se pierde:
    // por eso además se comprueba la clase al arrancar.
    document.addEventListener('fiesta:start', arrancar);

    if (document.body.classList.contains('fiesta-activa')) {
        arrancar();
    }

    function arrancar() {
        if (arrancado) {
            return;
        }

        arrancado = true;

        if (!hayConfig()) {
            btnSubir.disabled = true;
            renderGaleria();
            return;
        }

        cargarFotos();
    }

    function hayConfig() {
        return typeof FIESTA_SUPABASE_URL !== 'undefined'
            && typeof FIESTA_SUPABASE_ANON_KEY !== 'undefined'
            && FIESTA_SUPABASE_URL
            && FIESTA_SUPABASE_ANON_KEY;
    }

    function cabeceras(extra) {
        var base = {
            apikey: FIESTA_SUPABASE_ANON_KEY,
            Authorization: 'Bearer ' + FIESTA_SUPABASE_ANON_KEY
        };

        for (var clave in extra) {
            base[clave] = extra[clave];
        }

        return base;
    }

    function urlPublica(ruta) {
        return FIESTA_SUPABASE_URL + '/storage/v1/object/public/fiesta/' + ruta;
    }

    // ----- Carga de fotos -----

    async function cargarFotos() {
        var url = FIESTA_SUPABASE_URL + '/rest/v1/fiesta_fotos'
            + '?select=id,ruta,titulo,autor,nota,creada_en'
            + '&order=creada_en.desc';

        try {
            var respuesta = await fetch(url, { headers: cabeceras() });

            if (!respuesta.ok) {
                throw new Error('Supabase respondió ' + respuesta.status + ': ' + await respuesta.text());
            }

            fotos = await respuesta.json();
            cargaError = null;
        } catch (error) {
            cargaError = error;
            console.error('Error cargando las fotos de la fiesta:', error);
        }

        renderGaleria();
    }

    function renderGaleria() {
        galeria.textContent = '';

        if (!hayConfig()) {
            galeria.appendChild(aviso('El muro de fotos todavía no está configurado.'));
            return;
        }

        if (cargaError) {
            galeria.appendChild(aviso('No se han podido cargar las fotos.'));
            return;
        }

        if (!fotos.length) {
            galeria.appendChild(aviso('Todavía no hay fotos. ¡Sé el primero!'));
            return;
        }

        var carrusel = document.createElement('div');
        carrusel.className = 'carrusel';
        carrusel.setAttribute('data-carrusel', '');

        var track = document.createElement('div');
        track.className = 'carrusel-track';

        for (var i = 0; i < fotos.length; i++) {
            track.appendChild(imagenDe(fotos[i]));
        }

        carrusel.appendChild(track);
        galeria.appendChild(carrusel);

        // El carrusel se crea después del DOMContentLoaded, así que hay que
        // montarlo a mano (js/carrusel.js expone window.Carrusel).
        if (window.Carrusel) {
            window.Carrusel.setup(carrusel);
        }
    }

    function imagenDe(foto) {
        var img = document.createElement('img');
        img.src = urlPublica(foto.ruta);
        img.alt = foto.titulo || 'Foto de la fiesta';
        img.loading = 'lazy';

        // El pie del lightbox se lee de aquí; se asignan como datos, no como HTML.
        if (foto.titulo) {
            img.dataset.titulo = foto.titulo;
        }

        if (foto.autor) {
            img.dataset.autor = foto.autor;
        }

        if (foto.nota) {
            img.dataset.nota = foto.nota;
        }

        return img;
    }

    function aviso(texto) {
        var p = document.createElement('p');
        p.className = 'fiesta-vacio';
        p.textContent = texto;
        return p;
    }

    // ----- Elegir fotos -----

    function toggleForm() {
        form.hidden = !form.hidden;
        btnSubir.setAttribute('aria-expanded', String(!form.hidden));

        if (!form.hidden) {
            inputAutor.focus();
        }
    }

    function onElegirFotos() {
        limpiarSeleccion();

        var elegidas = Array.prototype.slice.call(inputFile.files);

        if (elegidas.length > MAX_FOTOS) {
            elegidas = elegidas.slice(0, MAX_FOTOS);
            decir('Solo se pueden subir ' + MAX_FOTOS + ' fotos a la vez; se han cogido las ' + MAX_FOTOS + ' primeras.');
        } else {
            decir('');
        }

        for (var i = 0; i < elegidas.length; i++) {
            anhadirFila(elegidas[i]);
        }
    }

    function anhadirFila(file) {
        var entrada = {
            file: file,
            objectUrl: URL.createObjectURL(file),
            titulo: '',
            nota: '',
            fila: null
        };

        var fila = document.createElement('div');
        fila.className = 'fiesta-fila';

        var miniatura = document.createElement('img');
        miniatura.className = 'fiesta-miniatura';
        miniatura.src = entrada.objectUrl;
        miniatura.alt = '';

        var campos = document.createElement('div');
        campos.className = 'fiesta-fila-campos';
        campos.appendChild(campo('Título', 60, 'titulo', entrada));
        campos.appendChild(campo('Pie de foto', 140, 'nota', entrada));

        var quitar = document.createElement('button');
        quitar.type = 'button';
        quitar.className = 'fiesta-quitar';
        quitar.setAttribute('aria-label', 'Quitar esta foto');
        quitar.textContent = '✕';
        quitar.addEventListener('click', function () {
            quitarFila(entrada);
        });

        fila.appendChild(miniatura);
        fila.appendChild(campos);
        fila.appendChild(quitar);

        entrada.fila = fila;
        seleccion.push(entrada);
        contenedorSeleccion.appendChild(fila);
    }

    function campo(etiqueta, maximo, propiedad, entrada) {
        var label = document.createElement('label');
        label.className = 'fiesta-campo';
        label.appendChild(document.createTextNode(etiqueta));

        var input = document.createElement('input');
        input.type = 'text';
        input.maxLength = maximo;
        input.placeholder = 'Opcional';
        input.addEventListener('input', function () {
            entrada[propiedad] = input.value;
        });

        label.appendChild(input);
        return label;
    }

    function quitarFila(entrada) {
        var indice = seleccion.indexOf(entrada);

        if (indice === -1) {
            return;
        }

        seleccion.splice(indice, 1);
        URL.revokeObjectURL(entrada.objectUrl);
        entrada.fila.remove();
    }

    // Sin revokeObjectURL los blobs se acumulan en memoria, y en un móvil que
    // sube varias tandas durante la noche eso se nota.
    function limpiarSeleccion() {
        for (var i = 0; i < seleccion.length; i++) {
            URL.revokeObjectURL(seleccion[i].objectUrl);
            seleccion[i].fila.remove();
        }

        seleccion = [];
    }

    // ----- Envío -----

    async function onEnviar(evento) {
        evento.preventDefault();

        if (subiendo) {
            return;
        }

        var autor = inputAutor.value.trim();

        // El atributo required ya avisa, pero dejaría pasar una ristra de
        // espacios; esta es la comprobación que cuenta en el navegador (la de
        // verdad está en el WITH CHECK de la tabla).
        if (!autor) {
            decir('Pon tu nombre para subir las fotos.');
            inputAutor.focus();
            return;
        }

        if (!seleccion.length) {
            decir('Elige al menos una foto.');
            inputFile.focus();
            return;
        }

        subiendo = true;
        btnEnviar.disabled = true;
        guardarNombre(autor);

        var filas = [];
        var fallos = 0;
        var total = seleccion.length;

        for (var i = 0; i < total; i++) {
            var entrada = seleccion[i];
            decir('Subiendo ' + (i + 1) + ' de ' + total + '…');

            try {
                var ruta = await subirArchivo(entrada.file);

                filas.push({
                    ruta: ruta,
                    titulo: entrada.titulo.trim() || null,
                    autor: autor,
                    nota: entrada.nota.trim() || null
                });
            } catch (error) {
                fallos++;
                console.error('Error subiendo una foto:', error);
            }
        }

        try {
            if (filas.length) {
                await guardarFilas(filas);
            }

            limpiarSeleccion();
            inputFile.value = '';

            if (fallos) {
                decir('Subidas ' + filas.length + ' de ' + total + '. ' + fallos + ' no se han podido subir.');
            } else {
                decir('¡Listo! Gracias por las fotos.');
            }

            await cargarFotos();
        } catch (error) {
            console.error('Error guardando los datos de las fotos:', error);
            decir('Las fotos se han subido pero no se han podido guardar. Inténtalo otra vez.');
        }

        subiendo = false;
        btnEnviar.disabled = false;
    }

    async function subirArchivo(file) {
        var blob = await reducir(file);
        var ruta = uuid() + '.' + extensionDe(blob.type);

        var respuesta = await fetch(FIESTA_SUPABASE_URL + '/storage/v1/object/fiesta/' + ruta, {
            method: 'POST',
            headers: cabeceras({ 'Content-Type': blob.type }),
            body: blob
        });

        if (!respuesta.ok) {
            throw new Error('Storage respondió ' + respuesta.status + ': ' + await respuesta.text());
        }

        return ruta;
    }

    async function guardarFilas(filas) {
        // PostgREST acepta un array: una sola petición para toda la tanda.
        var respuesta = await fetch(FIESTA_SUPABASE_URL + '/rest/v1/fiesta_fotos', {
            method: 'POST',
            headers: cabeceras({
                'Content-Type': 'application/json',
                Prefer: 'return=minimal'
            }),
            body: JSON.stringify(filas)
        });

        if (!respuesta.ok) {
            throw new Error('Supabase respondió ' + respuesta.status + ': ' + await respuesta.text());
        }
    }

    // ----- Reducir la foto antes de subirla -----

    // Una foto de móvil pesa 3-8 MB y por el wifi de un bar eso va lentísimo,
    // más aún en tandas de cinco. Recomprimir dentro del navegador la deja en
    // 250-400 KB y, de paso, borra los EXIF (incluidas las coordenadas GPS).
    async function reducir(file) {
        try {
            // imageOrientation "from-image" es imprescindible: sin ella el canvas
            // pierde la marca de rotación EXIF y media galería sale tumbada.
            var bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
            var escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));
            var ancho = Math.round(bitmap.width * escala);
            var alto = Math.round(bitmap.height * escala);

            var canvas = document.createElement('canvas');
            canvas.width = ancho;
            canvas.height = alto;
            canvas.getContext('2d').drawImage(bitmap, 0, 0, ancho, alto);
            bitmap.close();

            var blob = await new Promise(function (resolve) {
                canvas.toBlob(resolve, 'image/jpeg', CALIDAD);
            });

            if (!blob) {
                throw new Error('canvas.toBlob no ha devuelto nada');
            }

            return blob;
        } catch (error) {
            console.warn('No se ha podido reducir la foto, se sube el original:', error);

            if (file.size > TAM_MAX) {
                throw new Error('La foto es demasiado grande y no se ha podido reducir');
            }

            return file;
        }
    }

    function extensionDe(tipo) {
        if (tipo === 'image/png') {
            return 'png';
        }

        if (tipo === 'image/webp') {
            return 'webp';
        }

        return 'jpg';
    }

    // crypto.randomUUID solo existe en contexto seguro (https o localhost), así
    // que probando desde el móvil por http://IP-de-la-red hace falta el respaldo.
    function uuid() {
        if (window.crypto && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }

        var bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;

        var hex = [];

        for (var i = 0; i < 16; i++) {
            hex.push(bytes[i].toString(16).padStart(2, '0'));
        }

        return hex.slice(0, 4).join('') + '-' + hex.slice(4, 6).join('') + '-'
            + hex.slice(6, 8).join('') + '-' + hex.slice(8, 10).join('') + '-'
            + hex.slice(10, 16).join('');
    }

    // ----- Varios -----

    function decir(texto) {
        estado.textContent = texto;
    }

    // El nombre es obligatorio, así que se recuerda para quien suba varias tandas.
    function recordarNombre() {
        try {
            return localStorage.getItem(CLAVE_NOMBRE) || '';
        } catch (error) {
            return '';
        }
    }

    function guardarNombre(nombre) {
        try {
            localStorage.setItem(CLAVE_NOMBRE, nombre);
        } catch (error) {
            // Modo privado en Safari: no pasa nada, solo no se recuerda.
        }
    }
})();

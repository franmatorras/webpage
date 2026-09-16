(function () {
    // Lógica compartida del muro de fotos: la usan js/fiesta.js (carrusel de
    // cumpleamiento.html) y js/fotos.js (contraseña, subida y cuadrícula de
    // fotos.html). Se expone como window.FiestaApi, igual que window.Carrusel.
    //
    // Necesita /fiesta-config.js cargado antes.

    var MAX_LADO = 1600;        // px del lado largo de la foto grande
    var CALIDAD = 0.82;
    var MAX_LADO_MINI = 400;    // px del lado largo de la miniatura de la cuadrícula
    var CALIDAD_MINI = 0.75;
    var TAM_MAX = 6 * 1024 * 1024;  // el mismo tope que tiene el bucket
    var SAL_CLAVE = 'fiesta-cumple:';

    function hayConfig() {
        return typeof FIESTA_SUPABASE_URL !== 'undefined'
            && typeof FIESTA_SUPABASE_ANON_KEY !== 'undefined'
            && FIESTA_SUPABASE_URL !== ''
            && FIESTA_SUPABASE_ANON_KEY !== '';
    }

    function claveConfigurada() {
        return typeof FIESTA_CLAVE_HASH !== 'undefined' && FIESTA_CLAVE_HASH !== '';
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

    // ----- Lectura -----

    // Devuelve las filas, de la más nueva a la más antigua. Lanza si falla.
    async function cargarFotos(opciones) {
        var limite = opciones && opciones.limite;
        var url = FIESTA_SUPABASE_URL + '/rest/v1/fiesta_fotos'
            + '?select=id,ruta,ruta_mini,titulo,autor,nota,creada_en'
            + '&order=creada_en.desc'
            + (limite ? '&limit=' + limite : '');

        var respuesta = await fetch(url, { headers: cabeceras() });

        if (!respuesta.ok) {
            throw new Error('Supabase respondió ' + respuesta.status + ': ' + await respuesta.text());
        }

        return respuesta.json();
    }

    // Imagen con los datos que lee el pie del lightbox (js/carrusel.js).
    // Todo por dataset/textContent: estos textos los escribe cualquiera.
    function imagenDe(foto, usarMini) {
        var img = document.createElement('img');
        img.src = urlPublica(usarMini && foto.ruta_mini ? foto.ruta_mini : foto.ruta);
        img.alt = foto.titulo || 'Foto de la fiesta';
        img.loading = 'lazy';

        // Si se muestra la miniatura, el lightbox abre la grande.
        img.dataset.grande = urlPublica(foto.ruta);

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

    // ----- Subida -----

    // Sube una foto (grande + miniatura) y devuelve { ruta, ruta_mini }.
    // Si solo falla la miniatura, ruta_mini queda en null y la cuadrícula usará
    // la grande: mejor eso que perder la foto.
    async function subirFoto(file) {
        var versiones = await reducir(file);
        var id = uuid();
        var ruta = id + '.' + extensionDe(versiones.grande.type);

        await subirObjeto(ruta, versiones.grande);

        var rutaMini = null;

        if (versiones.mini) {
            try {
                await subirObjeto('mini/' + id + '.jpg', versiones.mini);
                rutaMini = 'mini/' + id + '.jpg';
            } catch (error) {
                console.warn('No se ha podido subir la miniatura:', error);
            }
        }

        return { ruta: ruta, ruta_mini: rutaMini };
    }

    async function subirObjeto(ruta, blob) {
        var respuesta = await fetch(FIESTA_SUPABASE_URL + '/storage/v1/object/fiesta/' + ruta, {
            method: 'POST',
            headers: cabeceras({ 'Content-Type': blob.type }),
            body: blob
        });

        if (!respuesta.ok) {
            throw new Error('Storage respondió ' + respuesta.status + ': ' + await respuesta.text());
        }
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

    // Una foto de móvil pesa 3-8 MB y por el wifi de un bar eso va lentísimo.
    // Recomprimir en el navegador la deja en 250-400 KB (y la miniatura en unos
    // 30 KB) y, de paso, borra los EXIF, incluidas las coordenadas GPS.
    // Se decodifica una sola vez y se dibuja en dos tamaños.
    async function reducir(file) {
        var bitmap;

        try {
            // imageOrientation "from-image" es imprescindible: sin ella el canvas
            // pierde la marca de rotación EXIF y media galería sale tumbada.
            bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        } catch (error) {
            console.warn('No se ha podido reducir la foto, se sube el original:', error);

            if (file.size > TAM_MAX) {
                throw new Error('La foto es demasiado grande y no se ha podido reducir');
            }

            return { grande: file, mini: null };
        }

        try {
            var grande = await dibujar(bitmap, MAX_LADO, CALIDAD);

            if (!grande) {
                throw new Error('canvas.toBlob no ha devuelto nada');
            }

            var mini = await dibujar(bitmap, MAX_LADO_MINI, CALIDAD_MINI);
            return { grande: grande, mini: mini };
        } finally {
            bitmap.close();
        }
    }

    function dibujar(bitmap, maxLado, calidad) {
        var escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * escala);
        canvas.height = Math.round(bitmap.height * escala);
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);

        return new Promise(function (resolve) {
            canvas.toBlob(resolve, 'image/jpeg', calidad);
        });
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

    // ----- Contraseña -----

    // Misma normalización que el comando de PowerShell de fiesta-config.js: si se
    // cambia aquí, hay que cambiarlo allí. Los teclados de móvil ponen la primera
    // letra en mayúscula y a veces un espacio al final, de ahí trim y minúsculas.
    function hashClave(clave) {
        return sha256Hex(SAL_CLAVE + clave.trim().toLowerCase().normalize('NFC'));
    }

    function claveCorrecta(clave) {
        return claveConfigurada() && hashClave(clave) === FIESTA_CLAVE_HASH.toLowerCase();
    }

    // SHA-256 en JavaScript puro. crypto.subtle haría lo mismo, pero solo existe en
    // contexto seguro y fallaría al probar desde el móvil por http en la red local.
    var K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    function rotr(x, n) {
        return (x >>> n) | (x << (32 - n));
    }

    function sha256Hex(texto) {
        var bytes = new TextEncoder().encode(texto);
        var longitud = bytes.length;
        var total = Math.ceil((longitud + 9) / 64) * 64;
        var mensaje = new Uint8Array(total);
        var vista = new DataView(mensaje.buffer);

        mensaje.set(bytes);
        mensaje[longitud] = 0x80;
        vista.setUint32(total - 8, Math.floor(longitud / 0x20000000));
        vista.setUint32(total - 4, (longitud << 3) >>> 0);

        var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
        var w = new Uint32Array(64);

        for (var bloque = 0; bloque < total; bloque += 64) {
            var i;

            for (i = 0; i < 16; i++) {
                w[i] = vista.getUint32(bloque + i * 4);
            }

            for (i = 16; i < 64; i++) {
                var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
                var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
                w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
            }

            var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];

            for (i = 0; i < 64; i++) {
                var t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
                var t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
                hh = g;
                g = f;
                f = e;
                e = (d + t1) >>> 0;
                d = c;
                c = b;
                b = a;
                a = (t1 + t2) >>> 0;
            }

            h[0] = (h[0] + a) >>> 0;
            h[1] = (h[1] + b) >>> 0;
            h[2] = (h[2] + c) >>> 0;
            h[3] = (h[3] + d) >>> 0;
            h[4] = (h[4] + e) >>> 0;
            h[5] = (h[5] + f) >>> 0;
            h[6] = (h[6] + g) >>> 0;
            h[7] = (h[7] + hh) >>> 0;
        }

        return h.map(function (x) {
            return x.toString(16).padStart(8, '0');
        }).join('');
    }

    // Fallo fácil de cometer: pegar en fiesta-config.js la contraseña en claro en
    // vez del hash. Entonces no acierta nadie y la página no dice por qué.
    if (claveConfigurada() && !/^[0-9a-f]{64}$/i.test(FIESTA_CLAVE_HASH)) {
        console.warn('FIESTA_CLAVE_HASH no parece un hash SHA-256 (64 caracteres, 0-9 y a-f). '
            + '¿Se ha pegado la contraseña en claro? Así no va a funcionar ninguna.');
    }

    window.FiestaApi = {
        hayConfig: hayConfig,
        claveConfigurada: claveConfigurada,
        urlPublica: urlPublica,
        cargarFotos: cargarFotos,
        imagenDe: imagenDe,
        subirFoto: subirFoto,
        guardarFilas: guardarFilas,
        hashClave: hashClave,
        claveCorrecta: claveCorrecta,
        sha256Hex: sha256Hex
    };
})();

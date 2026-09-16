(function () {
    // fotos.html: contraseña, subida de fotos y cuadrícula con todas las fotos.
    //
    // La contraseña se comprueba solo en el navegador: esconde el formulario a
    // quien llegue por casualidad, pero no es seguridad (ver fiesta-config.js).
    // La cuadrícula es pública, igual que el carrusel de cumpleamiento.html.
    //
    // Los textos (título, autor, nota) los escribe cualquiera desde internet, así
    // que se pintan siempre con textContent/dataset y nunca con innerHTML.
    //
    // Necesita /fiesta-config.js, js/carrusel.js y js/fiesta-api.js antes.

    var MAX_FOTOS = 5;          // por envío; es una ayuda de interfaz, no seguridad
    var CLAVE_NOMBRE = 'fiesta-autor';
    var CLAVE_ACCESO = 'fiesta-clave-ok';

    var seleccion = [];         // { file, objectUrl, titulo, nota, fila }
    var subiendo = false;

    var puerta = document.getElementById('fotos-puerta');
    var inputClave = document.getElementById('fotos-clave');
    var mostrarClave = document.getElementById('fotos-mostrar');
    var estadoPuerta = document.getElementById('fotos-puerta-estado');
    var cerrado = document.getElementById('fotos-cerrado');

    var form = document.getElementById('fiesta-form');
    var inputFile = document.getElementById('fiesta-file');
    var inputAutor = document.getElementById('fiesta-autor');
    var contenedorSeleccion = document.getElementById('fiesta-seleccion');
    var btnEnviar = document.getElementById('fiesta-enviar');
    var estado = document.getElementById('fiesta-estado');

    var grid = document.getElementById('fotos-grid');
    var contador = document.getElementById('fotos-contador');

    if (!form || !grid || !window.FiestaApi) {
        return;
    }

    inputAutor.value = leer(CLAVE_NOMBRE);

    puerta.addEventListener('submit', onEntrar);
    mostrarClave.addEventListener('change', function () {
        inputClave.type = mostrarClave.checked ? 'text' : 'password';
    });
    inputFile.addEventListener('change', onElegirFotos);
    form.addEventListener('submit', onEnviar);

    iniciarPuerta();
    cargarGrid();

    // ----- Contraseña -----

    function iniciarPuerta() {
        if (!FiestaApi.hayConfig() || !FiestaApi.claveConfigurada()) {
            cerrado.hidden = false;
            return;
        }

        // Se guarda el hash, no un "sí": si Fran cambia la contraseña, el hash
        // guardado deja de coincidir y se vuelve a pedir en todos los móviles.
        if (leer(CLAVE_ACCESO) === FIESTA_CLAVE_HASH.toLowerCase()) {
            abrirFormulario(false);
            return;
        }

        puerta.hidden = false;
    }

    // Intentos ilimitados: sin contador, sin espera y sin bloqueo.
    function onEntrar(evento) {
        evento.preventDefault();

        if (!FiestaApi.claveCorrecta(inputClave.value)) {
            estadoPuerta.textContent = 'Contraseña incorrecta. Prueba otra vez.';
            inputClave.focus();
            inputClave.select();
            return;
        }

        guardar(CLAVE_ACCESO, FIESTA_CLAVE_HASH.toLowerCase());
        inputClave.value = '';
        abrirFormulario(true);
    }

    function abrirFormulario(enfocar) {
        puerta.hidden = true;
        form.hidden = false;

        if (enfocar) {
            inputAutor.focus();
        }
    }

    // ----- Cuadrícula -----

    async function cargarGrid() {
        if (!FiestaApi.hayConfig()) {
            avisoGrid('El muro de fotos todavía no está configurado.');
            return;
        }

        try {
            renderGrid(await FiestaApi.cargarFotos());
        } catch (error) {
            console.error('Error cargando las fotos de la fiesta:', error);
            avisoGrid('No se han podido cargar las fotos.');
        }
    }

    function renderGrid(fotos) {
        grid.textContent = '';
        contador.textContent = fotos.length ? '(' + fotos.length + ')' : '';

        if (!fotos.length) {
            avisoGrid('Todavía no hay fotos.');
            return;
        }

        var teselas = [];

        for (var i = 0; i < fotos.length; i++) {
            var img = FiestaApi.imagenDe(fotos[i], true);
            teselas.push(img);
            grid.appendChild(img);
        }

        // El lightbox recorre toda la cuadrícula y abre la foto grande, no la
        // miniatura (lee data-grande).
        if (window.Carrusel) {
            for (var j = 0; j < teselas.length; j++) {
                window.Carrusel.bindLightbox(teselas[j], teselas, j);
            }
        }
    }

    function avisoGrid(texto) {
        grid.textContent = '';

        var p = document.createElement('p');
        p.className = 'fiesta-vacio fotos-grid-aviso';
        p.textContent = texto;
        grid.appendChild(p);
    }

    // ----- Elegir fotos -----

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
        guardar(CLAVE_NOMBRE, autor);

        var filas = [];
        var fallos = 0;
        var total = seleccion.length;

        // Una a una, no en paralelo: cinco subidas a la vez por el wifi de un bar
        // se pisan el ancho de banda y el progreso deja de significar nada.
        for (var i = 0; i < total; i++) {
            var entrada = seleccion[i];
            decir('Subiendo ' + (i + 1) + ' de ' + total + '…');

            try {
                var rutas = await FiestaApi.subirFoto(entrada.file);

                filas.push({
                    ruta: rutas.ruta,
                    ruta_mini: rutas.ruta_mini,
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
                await FiestaApi.guardarFilas(filas);
            }

            limpiarSeleccion();
            inputFile.value = '';

            if (fallos) {
                decir('Subidas ' + filas.length + ' de ' + total + '. ' + fallos + ' no se han podido subir.');
            } else {
                decir('¡Listo! Gracias por las fotos.');
            }

            await cargarGrid();
        } catch (error) {
            console.error('Error guardando los datos de las fotos:', error);
            decir('Las fotos se han subido pero no se han podido guardar. Inténtalo otra vez.');
        }

        subiendo = false;
        btnEnviar.disabled = false;
    }

    // ----- Varios -----

    function decir(texto) {
        estado.textContent = texto;
    }

    // localStorage puede lanzar (Safari en modo privado): entonces simplemente no
    // se recuerda nada.
    function leer(clave) {
        try {
            return localStorage.getItem(clave) || '';
        } catch (error) {
            return '';
        }
    }

    function guardar(clave, valor) {
        try {
            localStorage.setItem(clave, valor);
        } catch (error) {
            // nada
        }
    }
})();

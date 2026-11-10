(async function () {
    'use strict';
    var B = window.Baske;

    // Solo se vuelve a rutas de esta misma web
    var volver = B.param('volver');
    var destino = volver && volver.charAt(0) === '/' && volver.charAt(1) !== '/' ? volver : B.url('inicio.html');

    var sesion = await B.cliente.auth.getSession();
    if (sesion.data && sesion.data.session) {
        location.replace(destino);
        return;
    }

    var form = document.getElementById('form-login');
    var inputUsuario = document.getElementById('usuario');
    var pasoPassword = document.getElementById('paso-password');
    var pasoNueva = document.getElementById('paso-nueva');
    var inputPassword = document.getElementById('password');
    var inputNueva = document.getElementById('nueva');
    var inputRepetir = document.getElementById('repetir');
    var boton = document.getElementById('boton');
    var cambiar = document.getElementById('cambiar');
    var msg = document.getElementById('mensaje');

    var estado = null; // null | 'ok' | 'primer_acceso'
    var email = null;

    function reiniciar() {
        estado = null;
        email = null;
        inputUsuario.readOnly = false;
        pasoPassword.hidden = true;
        pasoNueva.hidden = true;
        cambiar.hidden = true;
        inputPassword.value = inputNueva.value = inputRepetir.value = '';
        boton.textContent = 'Continuar';
        B.mensaje(msg, '');
        inputUsuario.focus();
    }

    cambiar.addEventListener('click', function (ev) { ev.preventDefault(); reiniciar(); });

    async function comprobarUsuario() {
        var usuario = inputUsuario.value.trim();
        if (!usuario) { B.mensaje(msg, 'Escribe tu usuario.'); return; }

        var r = await B.cliente.rpc('estado_login', { p_usuario: usuario });
        if (r.error) throw r.error;
        var fila = r.data && r.data[0];

        if (!fila || fila.estado === 'no_existe') {
            B.mensaje(msg, 'Ese usuario no existe. Pídele tu usuario a un administrador.');
            return;
        }

        estado = fila.estado;
        email = fila.email;
        inputUsuario.readOnly = true;
        cambiar.hidden = false;
        B.mensaje(msg, '');

        if (estado === 'primer_acceso') {
            pasoNueva.hidden = false;
            boton.textContent = 'Crear contraseña y entrar';
            inputNueva.focus();
        } else {
            pasoPassword.hidden = false;
            boton.textContent = 'Entrar';
            inputPassword.focus();
        }
    }

    async function entrar(password) {
        var r = await B.cliente.auth.signInWithPassword({ email: email, password: password });
        if (r.error) throw r.error;
        location.replace(destino);
    }

    async function crearPassword() {
        var nueva = inputNueva.value;
        if (nueva.length < 8) { B.mensaje(msg, 'La contraseña debe tener al menos 8 caracteres.'); return; }
        if (nueva !== inputRepetir.value) { B.mensaje(msg, 'Las contraseñas no coinciden.'); return; }

        var r = await B.cliente.rpc('primera_password', { p_usuario: inputUsuario.value.trim(), p_password: nueva });
        if (r.error) throw r.error;
        await entrar(nueva);
    }

    form.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        boton.disabled = true;
        try {
            if (!estado) {
                await comprobarUsuario();
            } else if (estado === 'ok') {
                if (!inputPassword.value) { B.mensaje(msg, 'Escribe tu contraseña.'); return; }
                await entrar(inputPassword.value);
            } else {
                await crearPassword();
            }
        } catch (e) {
            console.error(e);
            B.mensaje(msg, B.traducirError(e));
        } finally {
            boton.disabled = false;
        }
    });

    inputUsuario.focus();
})();

(async function () {
    'use strict';
    var B = window.Baske;

    await B.iniciar({ activa: 'transparencia' });

    // PDFs en el bucket privado "equipo" (los sube un admin: docs/estatutos.pdf, docs/junta.pdf)
    async function cargarPdf(ruta, idCont, idBoton, titulo) {
        var cont = document.getElementById(idCont);
        try {
            var enlace = await B.urlFirmada(ruta);
            cont.innerHTML = '<iframe class="bk-pdf" title="' + B.esc(titulo) + '"></iframe>';
            cont.querySelector('iframe').src = enlace;
            var boton = document.getElementById(idBoton);
            boton.href = enlace;
            boton.hidden = false;
        } catch (e) {
            console.warn(ruta, e);
            cont.innerHTML = '<p class="bk-vacio">Documento pendiente de subir.</p>';
        }
    }

    cargarPdf('docs/estatutos.pdf', 'doc-estatutos', 'abrir-estatutos', 'Estatutos');
    cargarPdf('docs/junta.pdf', 'doc-junta', 'abrir-junta', 'Junta directiva');
})();

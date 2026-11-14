// En FRAN-BASKET el icono es el escudo del club; en el resto de la web, los bigotes
const icono = location.pathname.indexOf('/baske/') === 0
    ? { href: '/baske/img/badge/logo_garza_sin_fondo.png', type: 'image/png' }
    : { href: '/src/bigotes.JPG', type: 'image/jpeg' };

const favicon = document.createElement('link');
favicon.rel = 'icon';
favicon.type = icono.type;
favicon.href = icono.href;
document.head.appendChild(favicon);

// Icono para "Añadir a pantalla de inicio" en iOS (sin él, iOS usa una captura de la página)
const touchIcon = document.createElement('link');
touchIcon.rel = 'apple-touch-icon';
touchIcon.href = icono.href;
document.head.appendChild(touchIcon);

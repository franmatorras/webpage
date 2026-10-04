const favicon = document.createElement('link');
favicon.rel = 'icon';
favicon.type = 'image/jpeg';
favicon.href = '/src/bigotes.JPG'; // Path to your icon
document.head.appendChild(favicon);

// Icono para "Añadir a pantalla de inicio" en iOS (sin él, iOS usa una captura de la página)
const touchIcon = document.createElement('link');
touchIcon.rel = 'apple-touch-icon';
touchIcon.href = '/src/bigotes.JPG';
document.head.appendChild(touchIcon);

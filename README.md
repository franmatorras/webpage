# Personal Reference Site para GitHub Pages

Sitio moderno con navegación responsive, cards dinámicas y soporte para contenido multimedia.

## 📁 Estructura del Proyecto

```
webpage_scratch/
├── index.html              ← Página principal
├── style.css               ← Estilos (tema verde, responsive)
├── script.js               ← JavaScript para interactividad
├── README.md              ← Este archivo
└── projects/
    ├── boletines.html     ← Listado de boletines
    ├── novelas.html       ← Listado de historias
    ├── images/            ← Carpeta de imágenes
    │   ├── boletin_plantilla.png
    │   ├── boletin-01.png
    │   ├── boletin-02.png
    │   └── boletin-especial.png
    ├── boletines/         ← Páginas individuales de boletines
    │   ├── plantilla-boletin.html
    │   ├── boletin-01.html
    │   ├── boletin-02.html
    │   └── boletin-especial.html
    └── cronica_huracan/   ← Páginas individuales de historias
        ├── cronica.html
        ├── memorias-viaje.html
        ├── ultimo-faro.html
        └── confesiones-medianoche.html
```

## 🖼️ Añadir Imágenes

### Rutas Correctas

Las imágenes deben colocarse en la carpeta `projects/images/`:

```html
<!-- En boletines.html (ubicado en projects/) -->
<img src="images/mi-imagen.png" alt="Descripción">

<!-- En boletines/plantilla-boletin.html (un nivel más profundo) -->
<img src="../images/mi-imagen.png" alt="Descripción">
```

### Formatos Recomendados

- **Previsualizaciones**: PNG o JPG (máx 200KB)
- **Para pantallas**: Usar `object-fit: cover` para ajustar proporción
- **Responsive**: Siempre incluir `width: 100%;` para adaptarse al dispositivo

### Ejemplo de Imagen Responsive

```html
<img src="images/boletin.png" 
     alt="Boletín" 
     style="width: 100%; height: 180px; object-fit: cover;">
```

---

## 📝 Tipos de Previsualizaciones

### 1. Previsualización con Imagen (para Boletines)

```html
<div class="card">
    <div class="card-header">
        <h3>Título del Boletín</h3>
        <span class="card-date">8 Mar 2026</span>
    </div>
    <div class="card-preview">
        <img src="images/boletin.png" alt="Boletín">
    </div>
    <p>Descripción breve...</p>
    <a href="enlace.html">Ver Diseño</a>
</div>
```

### 2. Previsualización con Texto (para Historias)

```html
<div class="card">
    <div class="card-header">
        <h3>Título de la Historia</h3>
        <span class="card-date">22 Mar 2026</span>
    </div>
    <div class="card-preview-text">
        Lorem ipsum dolor sit amet, consectetur adipiscing elit...
    </div>
    <p>Descripción breve...</p>
    <a href="enlace.html">Leer Completo</a>
</div>
```

El texto es **automáticamente scrolleable** si excede 120px de altura.

---

## 🎨 Configurar Imagen de Fondo

### En HTML

Agrega la clase `has-bg-image` al `<body>`:

```html
<body class="has-bg-image">
```

### En CSS

En `style.css`, la sección `body.has-bg-image` ya está lista. Solo coloca tu imagen en la raíz:

```css
body.has-bg-image {
    background: linear-gradient(rgba(245, 249, 247, 0.85), rgba(232, 243, 240, 0.85)), 
                url('background.png');
    background-attachment: fixed;
    background-size: cover;
    background-position: center;
}
```

**Reemplaza** `background.png` con tu imagen. El degradado (0.85 = 85% opacidad) oscurece la imagen para mejorar legibilidad.

---

## ☰ Navegación Collapsible

La navegación se oculta automáticamente en pantallas menores de 768px y muestra un botón con símbolo **☰**.

### Cómo Funciona

1. **`script.js`** detecta clics en el botón **☰**
2. Abre/cierra la navegación con animación suave
3. Se cierra automáticamente al hacer clic en un enlace

**No requiere configuración adicional** — funciona automáticamente en todas las páginas que incluyan `<script src="../script.js"></script>`.

---

## 💾 Desplegar en GitHub Pages

### 1. Crear o Configurar Repositorio

**Opción A: Sitio de usuario**
```bash
# Nombra el repo: yourusername.github.io
# El sitio estará disponible en: https://yourusername.github.io/
```

**Opción B: Repositorio normal**
```bash
# En Settings → Pages → Source: main branch /root
# El sitio estará disponible en: https://yourusername.github.io/repo-name/
```

### 2. Subir Archivos

```bash
git add .
git commit -m "Inicial: sitio de referencia personal"
git push origin main
```

### 3. Esperar

GitHub Pages actualiza en 1-2 minutos. Visita tu URL y ¡listo!

---

## 🔄 Contenido Dinámico (Sin Editar HTML Después del Despliegue)

### ¿Qué Requeriría?

Para agregar contenido sin tocar HTML después del despliegue necesitarías una de estas opciones:

#### Opción 1: CMS Estático con Jekyll (Recomendado para GitHub Pages)

**Jekyll** está integrado nativamente en GitHub Pages:
- Escribe posts en Markdown
- Se convierte automáticamente a HTML
- Solo editas archivos `.md`

```
_posts/
├── 2026-03-09-primer-boletin.md
└── 2026-03-08-segunda-historia.md
```

**Ventajas**: Fácil, sin servidor, GitHub Pages lo procesa automáticamente  
**Requiere**: Aprender sintaxis YAML y Markdown (bastante sencillo)

---

#### Opción 2: Backend Dinámico

Necesitarías un servidor con:
- **Backend**: Node.js, Python, o similar  
- **Base de datos**: MongoDB, PostgreSQL
- **Hosting**: Heroku, Vercel, Railway (no GitHub Pages)

**Ejemplo conceptual**:
```javascript
// script.js cargaría contenido desde API
fetch('/api/articulos')
  .then(res => res.json())
  .then(data => {
    // Renderiza HTML dinámicamente
  });
```

**Ventajas**: Completo, sin límites  
**Requiere**: Conocimientos de backend y DevOps

---

#### Opción 3: Archivo JSON + JavaScript (Más Simple)

Crear `data.json` con contenido:
```json
{
  "articulos": [
    {
      "titulo": "Mi Artículo",
      "fecha": "2026-03-09",
      "contenido": "Lorem ipsum..."
    }
  ]
}
```

JavaScript carga y renderiza:
```javascript
fetch('data.json')
  .then(res => res.json())
  .then(data => {
    // Genera HTML desde datos
  });
```

**Ventajas**: Simple, funciona en GitHub Pages  
**Requiere**: Básico JavaScript; editas solo `.json` para nuevo contenido

---

## 🚀 Próximos Pasos

1. **Crear carpeta** `projects/images/`
2. **Agregar tus imágenes** con nombres claros (sin espacios)
3. **Actualizar rutas** en HTML si es necesario
4. **Desplegar** a GitHub (arriba)

---

## 📞 Troubleshooting

### Imágenes no se ven

- ✓ Verifica que la ruta sea correcta (relativas desde `.html`)
- ✓ Usa `/` para rutas, no `\`
- ✓ Nombres sin espacios: `mi-imagen.png` no `mi imagen.png`
- ✓ Verifica la consola (F12) para errores

### Navegación no se oculta en móvil

- ✓ Verifica que `script.js` esté incluido: `<script src="../script.js"></script>`
- ✓ Abre consola (F12) y busca errores de JavaScript

### Fondo de imagen no se ve

- ✓ Ruta correcta en CSS
- ✓ La imagen existe en la carpeta raíz
- ✓ Verifica permisos en GitHub

---

**¡Tu sitio está listo para crecer!** 🌱
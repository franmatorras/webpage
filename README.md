# Personal Reference Site for GitHub Pages

Este repositorio contiene un sitio web estático en HTML/CSS/JS para proyectos personales, boletines e historias. Está optimizado para GitHub Pages y no requiere backend.

## 📌 Descripción

- Página principal: `index.html`
- Estilos globales: `style.css`
- JavaScript: `script.js`, `global.js`
- Secciones de contenido: `projects/` con subcarpetas (`boletines/`, `cronica_huracan/`, `fran-cis-coh/`, etc.)

## 🧭 Table of Contents

1. [Estructura del repositorio](#estructura-del-repositorio)
2. [Instalación y prueba local](#instalación-y-prueba-local)
3. [Uso](#uso)
4. [GitHub Pages](#github-pages)
5. [Wiki del proyecto](#wiki-del-proyecto)
6. [Contribuir](#contribuir)
7. [Licencia](#licencia)
8. [Contacto](#contacto)

## 📁 Estructura del repositorio

- `/index.html`
- `/style.css`
- `/script.js`
- `/global.js`
- `/projects/`
  - `boletines.html`, `novelas.html`, `franciscoh.html`
  - `boletines/` (boletin-001.html ... boletin-especial.html)
  - `cronica_huracan/` (cronica.html, novela_1.html, novela_2.html, sinopsis.html)
  - `fran-cis-coh/` (disenhos.html, reglamento.html, etc.)
  - `/src/` (boletines, disenhos)

> Nota: Mantén rutas relativas correctas desde subcarpetas usando `../`.

## 🧪 Instalación y prueba local

1. Abre `index.html` en tu navegador.
2. O usa un servidor local:
   - Python 3: `python -m http.server 8000`
   - Node.js: `npm install -g serve` y `serve .`
3. Verifica que la navegación funcione y no haya errores de 404 en la consola.

## 🚀 Uso

- Edita HTML dentro de `projects/` para agregar contenido.
- Mantén `style.css` y `script.js` para estilos e interactividad global.
- Comprueba rutas y dependencias en cada página nueva.

## 🌐 GitHub Pages

### Configuración rápida
1. Ve a `Settings > Pages`.
2. Selecciona rama `main` y carpeta `/ (root)`.
3. Pulsa `Save`.
4. Después de 1-2 minutos, tu sitio estará en `http://fran.matorras.com`.

### Verificación
- Asegúrate de que `index.html` se muestre correctamente.
- Prueba rutas a subdirectorios y archivos estáticos (CSS/JS) desde páginas internas.

## 📚 Wiki del proyecto

GitHub wiki es una herramienta para documentación enriquecida y colaborativa. Sigue el flujo de la documentación oficial:

Wiki still in development... 
1. En GitHub, abre `Wiki` en la barra superior del repositorio.
2. Crea una página principal `Home` con:
   - Propósito del proyecto
   - Estructura de alto nivel
   - Guía rápida de rutas y páginas relevantes
3. Crear páginas adicionales:
   - `Instalación`
   - `Estructura`
   - `Contribuir`
   - `Boletines` (Detalle de cada subsitio)
   - `Historias` (Cronica huracan, novela, etc.)
4. Usa Markdown escalonado (`#`, `##`, `###`) y enlaces relativos de wiki para navegación.
5. El wiki se guarda como repositorio git separado (https://github.com/franmatorras/webpage.wiki.git), así puedes clonar/editar localmente:
   - `git clone https://github.com/franmatorras/webpage.wiki.git`
   - `git checkout -b docs/improvement`
   - `git add .` y `git commit -m "Actualizar documentación wiki"`
   - `git push origin docs/improvement`

> Consejo: Actualiza el README con un enlace directo al wiki: `https://github.com/franmatorras/webpage/wiki`.

## ✅ Buenas prácticas y checklist antes de deploy

- [ ] Asegúrate de que las rutas en subcarpetas usen `../` cuando sea necesario.
- [ ] Todos los recursos referenciados (CSS, JS, imágenes) existen.
- [ ] Evita comentarios de debug y scripts temporales expuestos.
- [ ] Valida con HTML/CSS lint si es posible.

## 🤝 Contribuir

- Crea un issue antes de cambios mayores.
- Usa branches con nombre claro: `feature/boletin-012`.
- Envía PR con descripción y pasos de prueba.

## 📝 Licencia

Este proyecto no tiene licencia especificada. Añade `LICENSE` si quieres permitir duplicación/uso.

## 📬 Contacto

- Autor: Fran M.
- Repositorio: https://github.com/franmatorras/webpage

---


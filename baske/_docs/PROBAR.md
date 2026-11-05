# Probar FRAN-BASKET en local (beta testers)

Gracias por probar. La web es estática (HTML/CSS/JS, sin compilar): solo hace falta
servir los archivos. Los datos están en Supabase, así que tu copia local usa la misma
base de datos que el resto de testers.

## 1. Requisitos

- git
- Python 3 **o** VS Code con la extensión Live Server

## 2. Descargar el código

```bash
git clone https://github.com/franmatorras/webpage.git
cd webpage
git checkout franbasket
```

Para traer cambios nuevos más adelante: `git pull`.

## 3. Arrancar

Sirve la **raíz del repositorio** (no la carpeta `baske/`):

```bash
python -m http.server 8000
```

y abre <http://localhost:8000/baske/>.

Con VS Code: abre la carpeta del repo y pulsa "Go Live" (Live Server ya está configurado
en el puerto 5501) → <http://localhost:5501/baske/>.

- No abras los HTML con doble clic (`file://`): las páginas cargan `/global.js` y
  `/fiesta-config.js` con rutas absolutas y no funcionan así.
- Usa el puerto **8000 o 5501**. En otros puertos casi todo funciona, pero crear logins
  desde Admin falla (la función del servidor solo acepta esos dos).

## 4. Entrar

Usa el nombre de usuario que te ha dado Fran. La primera vez te pedirá crear una
contraseña (mínimo 8 caracteres). Si la olvidas, un admin puede resetearla.

## 5. Qué probar

- **Login**: usuario inexistente, primera contraseña, contraseña incorrecta.
- **Inicio**: tus estadísticas, deuda, votación (abre a las 19:30 del día de la pachanga
  y cierra dos días después a las 23:59).
- **Pachangas**: Vista Jugadores (orden, filtros por temporada) y Vista Pachangas
  (meses desde/hasta, próximas, detalle de cada pachanga).
- **Equipación / Dorsales**: búsqueda por nombre y número, orden, colores.
- **Transparencia**: junta, cuentas, patrocinadores.
- **Miembros y fichas**: proponer apodos y habilidades.
- **Premios**.
- **Ajustes**: subir y quitar tu foto, cambiar nombre y contraseña, tus propuestas.
- **Admin** (si te han hecho admin): pachangas y asistencia, pagos, cobros y gastos,
  miembros y logins, premios, apodos.
- **Móvil**: herramientas de desarrollo del navegador → modo dispositivo, ~375 px de ancho.
- Cualquier error en la consola del navegador (F12) también interesa.

## 6. Importante

La base de datos es **real y compartida** con el resto de testers. No metas datos
personales de verdad (fotos, nombres…). Todo lo de prueba se borra antes del lanzamiento.

## 7. Cómo avisar de un fallo

Abre un issue en GitHub o escríbele a Fran con:

- la página (URL),
- qué hiciste, paso a paso,
- qué esperabas y qué pasó,
- una captura (y el error de la consola, si lo hay).

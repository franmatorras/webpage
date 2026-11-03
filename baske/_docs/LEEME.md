# FRAN-BASKET — puesta en marcha

Sección privada del equipo en `/baske/`. Usa el proyecto Supabase de la fiesta
(`/fiesta-config.js`) y el esquema `equipo` de `dbb_schema.sql`.

Esta carpeta (`_docs`) no se publica: Jekyll ignora las carpetas que empiezan por `_`.

## 1. Base de datos (una vez)

En el SQL Editor del proyecto de la fiesta:

1. `dbb_schema.sql` (ya ejecutado).
2. `migracion_01.sql`: login por usuario, reglas de votación (autovoto al fraude,
   solo miembros, ventana martes 19:30 → jueves 23:59), columna `periodo` en
   premios y el bucket privado `equipo`.

Comprueba en **Project Settings → API → Exposed schemas** que está `equipo`.

## 2. Auth

- **Authentication → Sign In / Providers → Email**: activo.
- **Allow new users to sign up**: desactivado (las cuentas solo las crea un admin).

Los usuarios entran con su nombre de usuario; por debajo su email es ficticio,
`<usuario>@fran-basket.invalid`. La primera vez eligen contraseña.

## 3. Edge Function `admin-usuarios`

Necesaria para crear logins, resetear contraseñas y renombrar usuarios desde
`baske/admin/miembros.html`.

**Edge Functions → Deploy a new function → Via editor**, nombre `admin-usuarios`,
pegar `edge/admin-usuarios/index.ts` y desplegar. "Verify JWT" puede quedarse
activado. Si se sirve la web desde otro origen que no sea `fran.matorras.com` o
localhost (puertos 8000/5501), añadirlo a `ORIGENES` en ese archivo.

## 4. Archivos privados (bucket `equipo`)

**Storage → equipo**:

- `docs/estatutos.pdf`
- `docs/junta.pdf`

Las fotos de los miembros se suben desde la pantalla de admin (`fotos/…`).

## 5. Fotos de las equipaciones

`baske/img/equipacion/` tiene camisetas provisionales en SVG. Sustitúyelas por las
fotos reales (si cambia la extensión, cambia también `equipacion.html`). Estas
imágenes sí son públicas.

## 6. Datos de prueba

- `datos_prueba.sql`: crea miembros, pachangas de 2025-26 y 2026-27, votos, etc.
  Los miembros que ya existían juegan las pachangas de 2026-27, incluida la de hoy,
  para poder probar la votación.
- `borrar_datos_prueba.sql`: borra exactamente lo que creó el anterior.

## Lo que se gestiona desde el panel de Supabase

- Subir los PDF al bucket `equipo` (`docs/estatutos.pdf`, `docs/junta.pdf`).

Los premios (catálogo y ganadores) y la validación de apodos y habilidades
se hacen en la web: Admin → Premios y Admin → Apodos y habilidades.

## Migración 02 (dorsales "1" y "01" distintos)

Ejecutar `migracion_02.sql` en el editor SQL. Cambia `dorsal_azul` y `dorsal_negro`
de número a texto (1 o 2 cifras). Los dorsales que ya existían se quedan tal cual
(1 → "1"); si alguien tenía en realidad el "01", corrígelo en Admin → Miembros.

## Reglas que calcula la web

- Temporada: 1 de septiembre – 31 de agosto.
- MVP: 3 puntos por voto como 1º, 2 como 2º, 1 como 3º. Fraude: 1 por voto.
- Deuda: reserva sin pagar = precio por pachanga × pachangas de la reserva;
  pachanga suelta jugada sin pagar = su precio; entrenamiento asistido sin pagar = su precio.
- "Retirado": no ha jugado esta temporada o no es de tipo jugador. "Ex-miembro": tiene fecha de baja.

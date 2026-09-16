-- Configuración del muro de fotos de la fiesta.
--
-- Ejecutar en el SQL Editor del proyecto Supabase *de la fiesta* (el nuevo,
-- separado del de Lecturas). Se puede volver a ejecutar sin miedo: todo va con
-- "if not exists" / "drop policy if exists" y no borra datos. Este archivo no lo
-- carga la web: queda aquí como registro de la configuración, igual que
-- data_model.md documenta el esquema de la biblioteca.
--
-- Modelo de seguridad: la clave anon viaja en el navegador (fiesta-config.js),
-- así que cualquiera puede hacer POST directamente. Los límites de verdad son
-- estas políticas, no lo que compruebe el JavaScript.

-- Bucket: lectura pública, tope de 6 MB, solo imágenes.
-- Storage lo aplica por su cuenta, mande lo que mande el navegador.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fiesta', 'fiesta', true, 6291456,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create table if not exists fiesta_fotos (
    id        uuid primary key default gen_random_uuid(),
    ruta      text not null,
    titulo    text,
    autor     text not null,
    nota      text,
    creada_en timestamptz not null default now(),
    visible   boolean not null default true
);

-- Miniatura de ~400 px para la cuadrícula de fotos.html (mini/<uuid>.jpg).
-- Puede ser null: la cuadrícula usa entonces la foto grande.
alter table fiesta_fotos add column if not exists ruta_mini text;

-- El carrusel pide las fotos ordenadas por fecha descendente.
create index if not exists fiesta_fotos_creada_en_idx
    on fiesta_fotos (creada_en desc);

alter table fiesta_fotos enable row level security;

drop policy if exists "fiesta_fotos anon select" on fiesta_fotos;
create policy "fiesta_fotos anon select"
    on fiesta_fotos for select to anon
    using (visible);

drop policy if exists "fiesta_fotos anon insert" on fiesta_fotos;
create policy "fiesta_fotos anon insert"
    on fiesta_fotos for insert to anon
    with check (
        visible
        and char_length(ruta) < 100
        and char_length(coalesce(ruta_mini, '')) < 100
        and char_length(coalesce(titulo, '')) <= 60
        and char_length(coalesce(nota, '')) <= 140
        -- autor obligatorio: trim() rechaza también un nombre de solo espacios,
        -- que "not null" por sí solo dejaría pasar.
        and char_length(trim(autor)) between 1 and 40
    );

-- Anon puede añadir objetos al bucket, pero nunca modificarlos ni borrarlos:
-- nadie puede pisar ni eliminar la foto de otro.
drop policy if exists "fiesta storage anon insert" on storage.objects;
create policy "fiesta storage anon insert"
    on storage.objects for insert to anon
    with check (bucket_id = 'fiesta');

-- A propósito NO hay políticas de UPDATE ni DELETE para anon.
--
-- Para ocultar una foto inapropiada: poner visible = false desde el dashboard
-- (el dashboard usa la service_role y se salta el RLS).
--
-- Interruptor de emergencia, si alguien abusa durante la fiesta:
--   drop policy "fiesta storage anon insert" on storage.objects;
--   drop policy "fiesta_fotos anon insert" on fiesta_fotos;
-- Las subidas se cortan al instante y las fotos ya subidas se siguen viendo.
-- (Para reabrir, volver a ejecutar este archivo.)
--
-- La contraseña de fotos.html NO sustituye a nada de lo anterior: se comprueba
-- solo en el navegador, y con la clave anon se puede subir sin pasar por ella.
--
-- Borrar TODO (solo para limpiar pruebas, nunca durante la fiesta), en dos pasos:
--   1. Aquí, en el SQL Editor:   delete from fiesta_fotos;
--   2. Los ficheros, desde el dashboard: Storage > fiesta > seleccionar todo
--      (también la carpeta mini/) > Delete.
-- Supabase no deja borrar storage.objects con SQL ("Direct deletion from storage
-- tables is not allowed"), y si se pone en el mismo lote que el paso 1 el error
-- deshace también el borrado de la tabla.

-- Configuración del muro de fotos de la fiesta.
--
-- Ejecutar UNA SOLA VEZ en el SQL Editor del proyecto Supabase *de la fiesta*
-- (el nuevo, separado del de Lecturas). Este archivo no lo carga la web: queda
-- aquí como registro de la configuración, igual que data_model.md documenta el
-- esquema de la biblioteca.
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

-- =====================================================================
-- FRAN-BASKET - migracion 01 (sobre dbb_schema.sql v7)
--
-- Ejecutar en el SQL Editor del proyecto Supabase de la fiesta, despues de
-- dbb_schema.sql. Se puede volver a ejecutar: todo es "create or replace",
-- "if not exists" o "drop ... if exists".
--
-- Contenido
--   1. Login por nombre de usuario (funciones que puede llamar anon)
--   2. Votaciones: autovoto al fraude, solo miembros votados, ventana de 3 dias
--   3. Premios: columna periodo (premios bimestrales "mes")
--   4. Storage: bucket privado "equipo" (fotos de miembros y PDFs)
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
set search_path = equipo, extensions;


-- ---------------------------------------------------------------------
-- 1. LOGIN
-- La web pide primero el usuario. estado_login dice si existe y si aun
-- no tiene contrasena; devuelve el email de auth.users (ficticio,
-- <usuario>@fran-basket.invalid) para hacer signInWithPassword.
-- primera_password pone la contrasena SOLO si debe_cambiar_password es
-- true; el trigger on_auth_user_password_changed lo pasa a false.
-- ---------------------------------------------------------------------
create or replace function equipo.estado_login(p_usuario text)
returns table (estado text, email text)
language sql stable security definer
set search_path = equipo, extensions as $$
  select case when u.debe_cambiar_password then 'primer_acceso' else 'ok' end,
         a.email::text
  from equipo.usuario u
  join auth.users a on a.id = u.id
  where lower(u.usuario) = lower(trim(p_usuario))
  union all
  select 'no_existe', null::text
  where not exists (select 1 from equipo.usuario
                    where lower(usuario) = lower(trim(p_usuario)))
  limit 1;
$$;

create or replace function equipo.primera_password(p_usuario text, p_password text)
returns void
language plpgsql security definer
set search_path = equipo, extensions as $$
declare
  v_id uuid;
begin
  if p_password is null or char_length(p_password) < 8 then
    raise exception 'La contraseña debe tener al menos 8 caracteres';
  end if;

  select id into v_id
  from equipo.usuario
  where lower(usuario) = lower(trim(p_usuario))
    and debe_cambiar_password
  for update;

  if v_id is null then
    raise exception 'Este usuario no existe o ya tiene contraseña';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = v_id;
end $$;

revoke execute on function equipo.estado_login(text) from public;
revoke execute on function equipo.primera_password(text, text) from public;
grant execute on function equipo.estado_login(text) to anon, authenticated;
grant execute on function equipo.primera_password(text, text) to anon, authenticated;

-- anon necesita "usage" en el esquema para llamar a esas dos funciones.
-- No tiene permisos sobre ninguna tabla ni vista, asi que no ve datos.
grant usage on schema equipo to anon;


-- ---------------------------------------------------------------------
-- 2. VOTACIONES
--   * Uno puede votarse a si mismo como fraude (nunca al top).
--   * Solo se vota a miembros (ni top ni fraude a invitados).
--   * Ventana: dia de la pachanga 19:30 hasta dos dias despues 23:59
--     (hora de Madrid). Martes 19:30 -> jueves 23:59.
-- ---------------------------------------------------------------------
do $$
declare
  c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'equipo.top_pachanga'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%fraude%'
  loop
    execute format('alter table equipo.top_pachanga drop constraint %I', c);
  end loop;
end $$;

create or replace function check_top_pachanga() returns trigger
language plpgsql set search_path = equipo as $$
declare
  v_fecha date;
  v_ahora timestamp := now() at time zone 'Europe/Madrid';
begin
  if not exists (select 1 from jugador
                 where id = new.id_jugador and id_miembro is not null) then
    raise exception 'Solo los miembros pueden votar';
  end if;

  if exists (select 1 from jugador j
             where j.id in (new.top_1, new.top_2, new.top_3, new.fraude)
               and j.id_miembro is null) then
    raise exception 'Solo se puede votar a miembros, no a invitados';
  end if;

  select fecha into v_fecha from pachanga where id = new.id_pachanga;

  if v_ahora < v_fecha + time '19:30' then
    raise exception 'La votación de esta pachanga aún no ha empezado';
  end if;

  if v_ahora >= (v_fecha + 3)::timestamp then
    raise exception 'La votación de esta pachanga ya está cerrada';
  end if;

  if exists (select 1 from pachanga_jugador pj
             where pj.id_pachanga = new.id_pachanga
               and pj.id_jugador in (new.id_jugador, new.top_1, new.top_2, new.top_3, new.fraude)
               and not pj.jugado) then
    raise exception 'Votante y votados deben haber jugado la pachanga';
  end if;

  return new;
end $$;


-- ---------------------------------------------------------------------
-- 3. PREMIOS
-- periodo: 1 Sep-Oct, 2 Nov-Dic, 3 Ene-Feb, 4 Mar-Abr, 5 May-Jun, 6 Jul-Ago.
-- null = premio de temporada completa.
-- ---------------------------------------------------------------------
alter table premio_miembro
  add column if not exists periodo smallint check (periodo between 1 and 6);

alter table premio_miembro
  drop constraint if exists premio_miembro_id_premio_temporada_key;

alter table premio_miembro
  drop constraint if exists uq_premio_miembro_periodo;

alter table premio_miembro
  add constraint uq_premio_miembro_periodo
  unique nulls not distinct (id_premio, temporada, periodo);


-- ---------------------------------------------------------------------
-- 4. STORAGE - bucket privado "equipo"
--   fotos/<id_miembro>.jpg   foto de cada miembro (miembro.foto_url)
--   docs/estatutos.pdf       estatutos
--   docs/junta.pdf           documento de la junta directiva
-- Lectura: cualquier usuario con sesion (la web pide enlaces firmados).
-- Escritura: solo administradores.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('equipo', 'equipo', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "equipo storage lectura" on storage.objects;
create policy "equipo storage lectura"
  on storage.objects for select to authenticated
  using (bucket_id = 'equipo');

drop policy if exists "equipo storage admin insert" on storage.objects;
create policy "equipo storage admin insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'equipo' and equipo.is_admin());

drop policy if exists "equipo storage admin update" on storage.objects;
create policy "equipo storage admin update"
  on storage.objects for update to authenticated
  using (bucket_id = 'equipo' and equipo.is_admin())
  with check (bucket_id = 'equipo' and equipo.is_admin());

drop policy if exists "equipo storage admin delete" on storage.objects;
create policy "equipo storage admin delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'equipo' and equipo.is_admin());

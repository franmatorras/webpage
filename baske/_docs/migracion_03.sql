-- =====================================================================
-- FRAN-BASKET · migración 03
-- Ejecutar una vez en el editor SQL de Supabase, después de las migraciones
-- 01 y 02. Se puede volver a ejecutar sin problema.
--
--  1. Cada miembro puede subir o borrar su propia foto.
--  2. Pista ("media" o "completa") en reservas, pachangas y entrenamientos.
--  3. Coste total de la pista en pachangas sueltas y entrenamientos
--     (entrenamiento: 5 € por defecto).
--  4. Gasto automático al crear una reserva, una pachanga suelta o un
--     entrenamiento (luego se puede editar como cualquier gasto).
--  5. Pachangas de reserva: quien juega sin estar apuntado a la reserva
--     (miembro o invitado) paga esa pachanga suelta, con un 50 % más.
--  6. Los aficionados pueden llevar cualquier dorsal: no lo ocupan.
-- =====================================================================

set search_path = equipo;

-- ---------------------------------------------------------------------
-- 1. Fotos de perfil propias
-- ---------------------------------------------------------------------

-- id del miembro del usuario actual (null si no está vinculado)
create or replace function mi_miembro() returns bigint
language sql stable security definer set search_path = equipo as $$
  select id from miembro where id_usuario = auth.uid();
$$;
revoke all on function mi_miembro() from public;
grant execute on function mi_miembro() to authenticated;

-- Los no admin pueden cambiar nombre, apellido y foto de su propia ficha
create or replace function proteger_miembro() returns trigger
language plpgsql set search_path = equipo as $$
begin
  if auth.uid() is not null and not is_admin()
     and (to_jsonb(new) - 'nombre' - 'apellido' - 'foto_url')
         is distinct from (to_jsonb(old) - 'nombre' - 'apellido' - 'foto_url') then
    raise exception 'Solo puedes modificar tu nombre, apellido y foto';
  end if;
  return new;
end $$;

-- Storage: cada uno gestiona los archivos fotos/<su id de miembro>-*.jpg
drop policy if exists "equipo storage foto propia insert" on storage.objects;
create policy "equipo storage foto propia insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'equipo' and name like 'fotos/' || equipo.mi_miembro()::text || '-%');

drop policy if exists "equipo storage foto propia update" on storage.objects;
create policy "equipo storage foto propia update"
  on storage.objects for update to authenticated
  using (bucket_id = 'equipo' and name like 'fotos/' || equipo.mi_miembro()::text || '-%')
  with check (bucket_id = 'equipo' and name like 'fotos/' || equipo.mi_miembro()::text || '-%');

drop policy if exists "equipo storage foto propia delete" on storage.objects;
create policy "equipo storage foto propia delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'equipo' and name like 'fotos/' || equipo.mi_miembro()::text || '-%');


-- ---------------------------------------------------------------------
-- 2. Tipo de pista
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'tipo_pista' and n.nspname = 'equipo') then
    create type equipo.tipo_pista as enum ('media', 'completa');
  end if;
end $$;

alter table reserva_periodica add column if not exists pista tipo_pista not null default 'media';
alter table pachanga          add column if not exists pista tipo_pista not null default 'media';
alter table entrenamiento     add column if not exists pista tipo_pista not null default 'media';


-- ---------------------------------------------------------------------
-- 3. Coste total de la pista
--    pachanga.coste: solo sueltas (en las de reserva el coste es el de la reserva)
-- ---------------------------------------------------------------------
alter table pachanga      add column if not exists coste numeric(10,2) check (coste >= 0);
alter table entrenamiento add column if not exists coste numeric(10,2) not null default 5 check (coste >= 0);


-- ---------------------------------------------------------------------
-- 4. Gastos enlazados también a entrenamientos + gasto automático
-- ---------------------------------------------------------------------
alter table gasto add column if not exists id_entrenamiento bigint references entrenamiento(id) on delete restrict;
create index if not exists ix_gasto_entrenamiento on gasto (id_entrenamiento);

-- Quitar el check antiguo (reserva o pachanga, no las dos): nombre automático
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'equipo.gasto'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ~ 'id_reserva IS NULL\) OR \(id_pachanga IS NULL'
  loop
    execute format('alter table equipo.gasto drop constraint %I', c.conname);
  end loop;
end $$;

alter table gasto drop constraint if exists ck_gasto_un_enlace;
alter table gasto add constraint ck_gasto_un_enlace
  check (num_nonnulls(id_reserva, id_pachanga, id_entrenamiento) <= 1);

-- tipo es una columna generada: se rehace para incluir 'entrenamiento'
alter table gasto drop column if exists tipo;
alter table gasto add column tipo text generated always as (
  case when id_reserva       is not null then 'reserva'
       when id_pachanga      is not null then 'pachanga'
       when id_entrenamiento is not null then 'entrenamiento'
       else 'general' end
) stored;

create or replace function etiqueta_pista(p tipo_pista) returns text
language sql immutable as $$
  select case p when 'completa' then 'Pista completa' else 'Media pista' end;
$$;

create or replace function gasto_automatico() returns trigger
language plpgsql set search_path = equipo as $$
begin
  if tg_table_name = 'reserva_periodica' then
    insert into gasto (compra, precio, cantidad, fecha, id_reserva)
    values (format('Alquiler pista · reserva %s – %s (%s)',
                   to_char(new.fecha_inicio, 'DD/MM/YYYY'), to_char(new.fecha_fin, 'DD/MM/YYYY'), etiqueta_pista(new.pista)),
            new.coste_reserva, 1, new.fecha_inicio, new.id);
  elsif tg_table_name = 'pachanga' then
    if new.id_reserva is null and new.coste is not null then
      insert into gasto (compra, precio, cantidad, fecha, id_pachanga)
      values (format('Alquiler pista · pachanga %s (%s)', to_char(new.fecha, 'DD/MM/YYYY'), etiqueta_pista(new.pista)),
              new.coste, 1, new.fecha, new.id);
    end if;
  elsif tg_table_name = 'entrenamiento' then
    insert into gasto (compra, precio, cantidad, fecha, id_entrenamiento)
    values (format('Alquiler pista · entrenamiento %s (%s)', to_char(new.fecha, 'DD/MM/YYYY'), etiqueta_pista(new.pista)),
            new.coste, 1, new.fecha, new.id);
  end if;
  return new;
end $$;

drop trigger if exists trg_reserva_gasto on reserva_periodica;
create trigger trg_reserva_gasto after insert on reserva_periodica
  for each row execute function gasto_automatico();

drop trigger if exists trg_pachanga_gasto on pachanga;
create trigger trg_pachanga_gasto after insert on pachanga
  for each row execute function gasto_automatico();

drop trigger if exists trg_entrenamiento_gasto on entrenamiento;
create trigger trg_entrenamiento_gasto after insert on entrenamiento
  for each row execute function gasto_automatico();

-- Borrar una pachanga suelta o un entrenamiento borra antes su gasto de pista
-- (los gastos de reserva se siguen protegiendo: una reserva con gastos no se borra)
create or replace function borrar_gasto_enlazado() returns trigger
language plpgsql set search_path = equipo as $$
begin
  if tg_table_name = 'pachanga' then
    delete from gasto where id_pachanga = old.id;
  else
    delete from gasto where id_entrenamiento = old.id;
  end if;
  return old;
end $$;

drop trigger if exists trg_pachanga_borrar_gasto on pachanga;
create trigger trg_pachanga_borrar_gasto before delete on pachanga
  for each row execute function borrar_gasto_enlazado();

drop trigger if exists trg_entrenamiento_borrar_gasto on entrenamiento;
create trigger trg_entrenamiento_borrar_gasto before delete on entrenamiento
  for each row execute function borrar_gasto_enlazado();


-- ---------------------------------------------------------------------
-- 5. Pachanga de reserva sin estar apuntado: se paga aparte
--    pagado = null  -> lo cubre la reserva (está apuntado)
--    pagado = false/true -> se cobra esa pachanga (precio de reserva × 1,5)
-- ---------------------------------------------------------------------
create or replace function normalizar_pachanga_jugador() returns trigger
language plpgsql set search_path = equipo as $$
declare
  v_reserva   bigint;
  v_cervezas  boolean;
begin
  select id_reserva, cervezas into v_reserva, v_cervezas
  from pachanga where id = new.id_pachanga;

  if v_reserva is not null and exists (
       select 1 from reserva_jugador rj
       where rj.id_reserva = v_reserva and rj.id_jugador = new.id_jugador) then
    new.pagado := null;
  else
    new.pagado := coalesce(new.pagado, false);
  end if;

  if new.cerveza and not v_cervezas then
    raise exception 'Esta pachanga no tiene evento de cervezas';
  end if;

  if tg_op = 'UPDATE' and old.jugado and not new.jugado and exists (
       select 1 from top_pachanga t
       where t.id_pachanga = new.id_pachanga
         and new.id_jugador in (t.id_jugador, t.top_1, t.top_2, t.top_3, t.fraude)) then
    raise exception 'El jugador tiene votos en esta pachanga; eliminalos antes de quitar la asistencia';
  end if;

  return new;
end $$;

-- Al apuntar o desapuntar a alguien de una reserva, recalcular sus pachangas
create or replace function sync_pagado_on_reserva_jugador() returns trigger
language plpgsql set search_path = equipo as $$
declare
  r record;
begin
  for r in select * from (select new.id_reserva as id_reserva, new.id_jugador as id_jugador where tg_op <> 'DELETE'
                          union
                          select old.id_reserva, old.id_jugador where tg_op <> 'INSERT') x loop
    update pachanga_jugador pj set pagado = pj.pagado
    from pachanga p
    where p.id = pj.id_pachanga and p.id_reserva = r.id_reserva and pj.id_jugador = r.id_jugador;
  end loop;
  return null;
end $$;

drop trigger if exists trg_reserva_jugador_sync on reserva_jugador;
create trigger trg_reserva_jugador_sync
  after insert or delete or update of id_reserva, id_jugador on reserva_jugador
  for each row execute function sync_pagado_on_reserva_jugador();

-- Aplicar la regla nueva a lo que ya existe
update pachanga_jugador set pagado = pagado;


-- ---------------------------------------------------------------------
-- 6. Dorsales: los aficionados no ocupan número
-- ---------------------------------------------------------------------
drop index if exists ux_miembro_dorsal_azul;
drop index if exists ux_miembro_dorsal_negro;
create unique index ux_miembro_dorsal_azul
  on miembro (dorsal_azul)  where activo and dorsal_azul  is not null and tipo_miembro <> 'aficionado';
create unique index ux_miembro_dorsal_negro
  on miembro (dorsal_negro) where activo and dorsal_negro is not null and tipo_miembro <> 'aficionado';

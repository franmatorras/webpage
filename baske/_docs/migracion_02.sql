-- =====================================================================
-- FRAN-BASKET · migración 02
-- Dorsales como texto para que "1" y "01" sean números distintos.
-- Ejecutar una vez en el editor SQL de Supabase (proyecto de la fiesta),
-- después de migracion_01.sql. Se puede volver a ejecutar sin problema.
-- Los valores existentes se conservan tal cual: 1 -> '1', 23 -> '23'.
-- =====================================================================

set search_path = equipo;

-- 1. Índices únicos por color (se recrean al final)
drop index if exists equipo.ux_miembro_dorsal_azul;
drop index if exists equipo.ux_miembro_dorsal_negro;

-- 2. Checks antiguos (dorsal_* >= 0): tienen nombre automático, se buscan por definición
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'equipo.miembro'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ~ 'dorsal_(azul|negro)'
  loop
    execute format('alter table equipo.miembro drop constraint %I', c.conname);
  end loop;
end $$;

-- 3. Cambio de tipo (sin efecto si ya son texto)
alter table miembro alter column dorsal_azul  type text using dorsal_azul::text;
alter table miembro alter column dorsal_negro type text using dorsal_negro::text;

-- 4. Solo 1 o 2 cifras: '0'-'9' y '00'-'99'
alter table miembro add constraint ck_miembro_dorsal_azul  check (dorsal_azul  ~ '^[0-9]{1,2}$');
alter table miembro add constraint ck_miembro_dorsal_negro check (dorsal_negro ~ '^[0-9]{1,2}$');

-- 5. Un dorsal por color entre los miembros activos
create unique index ux_miembro_dorsal_azul
  on miembro (dorsal_azul)  where activo and dorsal_azul  is not null;
create unique index ux_miembro_dorsal_negro
  on miembro (dorsal_negro) where activo and dorsal_negro is not null;

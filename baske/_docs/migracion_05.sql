-- =====================================================================
-- FRAN-BASKET · migración 05
-- Ejecutar una vez en el editor SQL de Supabase, después de la 04.
-- Se puede volver a ejecutar sin problema.
--
--  1. Espectadores: quien fue a ver una pachanga sin jugar (pachanga_jugador.vio).
--  2. Cobros a personas concretas (p. ej. "Compra equipación"): tabla cobro.
-- =====================================================================

set search_path = equipo;

-- ---------------------------------------------------------------------
-- 1. Espectadores
--    Una fila de pachanga_jugador = estuvo allí: jugó, fue a las cervezas o vino a ver.
--    Votos, deudas y temporadas jugadas solo miran "jugado".
-- ---------------------------------------------------------------------
alter table pachanga_jugador add column if not exists vio boolean not null default false;


-- ---------------------------------------------------------------------
-- 2. Cobros a personas (miembros o invitados)
-- ---------------------------------------------------------------------
create table if not exists cobro (
  id          bigint generated always as identity primary key,
  id_jugador  bigint not null references jugador(id) on delete restrict,
  concepto    text not null,
  importe     numeric(10,2) not null check (importe >= 0),
  fecha       date not null default current_date,
  pagado      boolean not null default false,
  fecha_pago  timestamptz,
  id_gasto    bigint references gasto(id) on delete set null,   -- compra del equipo de la que sale (opcional)
  check (pagado = (fecha_pago is not null))
);

create index if not exists ix_cobro_jugador on cobro (id_jugador);
create index if not exists ix_cobro_gasto   on cobro (id_gasto);

drop trigger if exists trg_cobro_fecha_pago on cobro;
create trigger trg_cobro_fecha_pago
  before insert or update on cobro
  for each row execute function normalizar_fecha_pago();

alter table cobro enable row level security;
drop policy if exists lectura on cobro;
create policy lectura on cobro for select to authenticated using (true);
drop policy if exists admin_escritura on cobro;
create policy admin_escritura on cobro for all to authenticated
  using (equipo.is_admin()) with check (equipo.is_admin());

grant all on cobro to authenticated, service_role;

-- =====================================================================
-- Team website - Supabase (PostgreSQL) schema - v7
--
-- Everything lives in its own schema "equipo", separate from public and
-- from Storage. After running this script, add "equipo" to
-- Project Settings > API > Exposed schemas.
--
-- Access model
--   * Every authenticated user can READ everything except other people's
--     votes (they see their own vote and the aggregated results view).
--   * Non-admins can only: edit nombre/apellido of their own miembro row,
--     cast/change/delete their own vote, and propose (unvalidated) apodos
--     and habilidades. Username changes are admin-only. Passwords are
--     changed through Supabase Auth and are never visible to admins.
--   * Admins can write everything, except casting votes on behalf of
--     other members.
--   * Anonymous visitors have no access.
--   * The SQL editor / service role bypasses all of this (use it to create
--     the first admin: update usuario set admin = true where ...).
-- =====================================================================

create extension if not exists btree_gist with schema extensions;

create schema equipo;
set search_path = equipo, extensions;


-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
create type tipo_miembro   as enum ('jugador', 'staff', 'aficionado');
create type origen_miembro as enum ('fundador', 'traido', 'aparecido');


-- ---------------------------------------------------------------------
-- PAYMENT DATE (shared by reserva_jugador, pachanga_jugador,
-- entrenamiento_jugador)
-- pagado true  -> fecha_pago defaults to now() if not given; can be set
--                 to any past moment, never a future one.
-- pagado false/null -> fecha_pago is cleared.
-- ---------------------------------------------------------------------
create or replace function normalizar_fecha_pago() returns trigger
language plpgsql set search_path = equipo as $$
begin
  if coalesce(new.pagado, false) then
    if new.fecha_pago is null then
      new.fecha_pago := now();
    elsif new.fecha_pago > now() then
      raise exception 'fecha_pago no puede ser una fecha futura';
    end if;
  else
    new.fecha_pago := null;
  end if;
  return new;
end $$;


-- ---------------------------------------------------------------------
-- USUARIO
-- Passwords are handled by Supabase Auth (auth.users), not stored here.
-- Accounts are created by an admin (Edge Function with the service key)
-- with a placeholder password; a usuario row is created automatically.
-- Username = user_metadata "usuario" if given, otherwise the email.
--
-- debe_cambiar_password:
--   * true on creation.
--   * set to false automatically when the password in auth.users changes
--     (the user cannot clear it any other way).
--   * on an admin password reset, the Edge Function must set it back to
--     true AFTER changing the password (the change itself clears it).
-- ---------------------------------------------------------------------
create table usuario (
  id                     uuid primary key references auth.users(id) on delete cascade,
  usuario                text not null unique,
  fecha_registro         timestamptz not null default now(),
  admin                  boolean not null default false,
  debe_cambiar_password  boolean not null default true
);

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = equipo as $$
begin
  insert into equipo.usuario (id, usuario)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'usuario', new.email));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create or replace function handle_password_change() returns trigger
language plpgsql security definer set search_path = equipo as $$
begin
  update equipo.usuario set debe_cambiar_password = false where id = new.id;
  return new;
end $$;

create trigger on_auth_user_password_changed
  after update of encrypted_password on auth.users
  for each row when (old.encrypted_password is distinct from new.encrypted_password)
  execute function handle_password_change();


-- ---------------------------------------------------------------------
-- MIEMBRO
-- n_socio unique constraint is DEFERRABLE so the website can renumber
-- (n_socio = n_socio - 1 where n_socio > X) in a single UPDATE.
-- A member with fecha_baja cannot be active nor keep a n_socio.
-- ---------------------------------------------------------------------
create table miembro (
  id              bigint generated always as identity primary key,
  id_usuario      uuid unique references usuario(id) on delete set null,
  nombre          text not null,
  apellido        text,
  -- migracion_02.sql: dorsales pasan a text con check '^[0-9]{1,2}$' ('1' <> '01')
  dorsal_azul     smallint check (dorsal_azul >= 0),
  dorsal_negro    smallint check (dorsal_negro >= 0),
  fecha_ingreso   date not null default current_date,
  fecha_baja      date,
  n_socio         integer check (n_socio >= 0),
  tipo_miembro    tipo_miembro not null default 'jugador',
  activo          boolean not null default true,
  foto_url        text,                                   -- path in Supabase Storage
  descripcion     text,
  id_padrino      bigint references miembro(id) on delete set null,
  origen          origen_miembro,
  constraint uq_miembro_n_socio unique (n_socio) deferrable initially immediate,
  check (fecha_baja is null or fecha_baja >= fecha_ingreso),
  check (fecha_baja is null or not activo),
  check (fecha_baja is null or n_socio is null),
  check (id_padrino is null or id_padrino <> id)
);

-- One dorsal per colour among active members
create unique index ux_miembro_dorsal_azul
  on miembro (dorsal_azul)  where activo and dorsal_azul  is not null;
create unique index ux_miembro_dorsal_negro
  on miembro (dorsal_negro) where activo and dorsal_negro is not null;


-- ---------------------------------------------------------------------
-- JUNTA DIRECTIVA (one row per member-role-period)
-- fecha_fin is the last day in office (inclusive); null = current.
-- Rules:
--   * Periods of the same role cannot overlap (one holder at a time).
--   * A member cannot hold two non-acumulable roles at the same time.
--   * An acumulable role (tesorero) is held IN ADDITION to another role:
--     its whole period must be covered by the member's other role(s).
-- Order of operations for the admin: give the other role first, then
-- tesorero; when leaving, end tesorero first (or both in one transaction).
-- ---------------------------------------------------------------------
create table cargo (
  id          smallint generated always as identity primary key,
  nombre      text not null unique,
  acumulable  boolean not null default false
);

insert into cargo (nombre, acumulable) values
  ('lider_supremo',    false),
  ('maestro_balon',    false),
  ('maestro_gritos',   false),
  ('mano_lider',       false),
  ('maestro_maestros', false),
  ('tesorero',         true);

create table junta_directiva (
  id            bigint generated always as identity primary key,
  id_miembro    bigint not null references miembro(id) on delete restrict,
  id_cargo      smallint not null references cargo(id) on delete restrict,
  fecha_inicio  date not null,
  fecha_fin     date,
  check (fecha_fin is null or fecha_fin >= fecha_inicio),
  constraint ex_junta_cargo_sin_solapes exclude using gist (
    id_cargo with =,
    daterange(fecha_inicio, fecha_fin, '[]') with &&
  )
);

create or replace function validar_junta_miembro() returns trigger
language plpgsql set search_path = equipo as $$
declare
  v_miembro bigint;
begin
  for v_miembro in
    select distinct x from unnest(array[
      case when tg_op <> 'DELETE' then new.id_miembro end,
      case when tg_op <> 'INSERT' then old.id_miembro end]) x
    where x is not null
  loop
    -- No two non-acumulable roles at the same time
    if exists (
      select 1
      from junta_directiva a
      join cargo ca on ca.id = a.id_cargo and not ca.acumulable
      join junta_directiva b on b.id_miembro = a.id_miembro and b.id > a.id
      join cargo cb on cb.id = b.id_cargo and not cb.acumulable
      where a.id_miembro = v_miembro
        and daterange(a.fecha_inicio, a.fecha_fin, '[]')
         && daterange(b.fecha_inicio, b.fecha_fin, '[]')) then
      raise exception 'Un miembro no puede tener dos cargos a la vez, salvo tesorero';
    end if;

    -- Acumulable roles (tesorero) must be covered by another role
    if exists (
      select 1
      from junta_directiva t
      join cargo ct on ct.id = t.id_cargo and ct.acumulable
      where t.id_miembro = v_miembro
        and not coalesce((
              select range_agg(daterange(o.fecha_inicio, o.fecha_fin, '[]'))
              from junta_directiva o
              join cargo co on co.id = o.id_cargo and not co.acumulable
              where o.id_miembro = v_miembro
            ) @> daterange(t.fecha_inicio, t.fecha_fin, '[]'), false)) then
      raise exception 'El tesorero debe tener otro cargo de la junta durante todo su periodo';
    end if;
  end loop;
  return null;
end $$;

-- Deferred: checked at the end of the transaction, so several changes
-- made together (e.g. in one RPC) are validated as a whole.
create constraint trigger trg_junta_miembro
  after insert or update or delete on junta_directiva
  deferrable initially deferred
  for each row execute function validar_junta_miembro();


-- ---------------------------------------------------------------------
-- INVITADO / JUGADOR
-- jugador = anyone who can attend (member or guest). A guest converted
-- to member keeps the same jugador row: set id_miembro on it.
-- ---------------------------------------------------------------------
create table invitado (
  id          bigint generated always as identity primary key,
  nombre      text not null,
  id_padrino  bigint references miembro(id) on delete set null
);

create table jugador (
  id           bigint generated always as identity primary key,
  id_miembro   bigint unique references miembro(id) on delete restrict,
  id_invitado  bigint unique references invitado(id) on delete restrict,
  check (id_miembro is not null or id_invitado is not null)
);


-- ---------------------------------------------------------------------
-- RESERVA PERIODICA
-- coste_reserva   = renting cost of the booking
-- precio_unitario = player's fee per pachanga
-- n_pachangas is not stored: see view v_reserva_periodica.
-- ---------------------------------------------------------------------
create table reserva_periodica (
  id               bigint generated always as identity primary key,
  fecha_inicio     date not null,
  fecha_fin        date not null,
  precio_unitario  numeric(8,2) not null check (precio_unitario >= 0),
  coste_reserva    numeric(10,2) not null check (coste_reserva >= 0),
  check (fecha_fin >= fecha_inicio)
);

create table reserva_jugador (
  id_reserva  bigint not null references reserva_periodica(id) on delete cascade,
  id_jugador  bigint not null references jugador(id) on delete restrict,
  pagado      boolean not null default false,
  fecha_pago  timestamptz,
  primary key (id_reserva, id_jugador),
  check (pagado = (fecha_pago is not null))
);

create trigger trg_reserva_jugador_fecha_pago
  before insert or update on reserva_jugador
  for each row execute function normalizar_fecha_pago();


-- ---------------------------------------------------------------------
-- PACHANGA
-- Exactly one of: id_reserva (periodic) or precio (one-off player fee).
-- A periodic pachanga must fall inside its reserva's dates.
-- A reserva cannot be deleted while it has pachangas.
-- cervezas = whether there is a beer event that day.
-- ---------------------------------------------------------------------
create table pachanga (
  id          bigint generated always as identity primary key,
  id_reserva  bigint references reserva_periodica(id) on delete restrict,
  fecha       date not null,
  precio      numeric(8,2) check (precio >= 0),
  cervezas    boolean not null default false,
  check ((id_reserva is null) <> (precio is null))
);

create or replace function validar_pachanga() returns trigger
language plpgsql set search_path = equipo as $$
begin
  if new.id_reserva is not null and not exists (
       select 1 from reserva_periodica r
       where r.id = new.id_reserva
         and new.fecha between r.fecha_inicio and r.fecha_fin) then
    raise exception 'La fecha de la pachanga esta fuera del periodo de la reserva';
  end if;

  if tg_op = 'UPDATE' and old.cervezas and not new.cervezas and exists (
       select 1 from pachanga_jugador pj
       where pj.id_pachanga = new.id and pj.cerveza) then
    raise exception 'Hay jugadores marcados en las cervezas de esta pachanga';
  end if;

  return new;
end $$;

create or replace function validar_fechas_reserva() returns trigger
language plpgsql set search_path = equipo as $$
begin
  if exists (select 1 from pachanga p
             where p.id_reserva = new.id
               and p.fecha not between new.fecha_inicio and new.fecha_fin) then
    raise exception 'Hay pachangas de esta reserva fuera de las nuevas fechas';
  end if;
  return new;
end $$;

create trigger trg_reserva_fechas
  before update of fecha_inicio, fecha_fin on reserva_periodica
  for each row execute function validar_fechas_reserva();

-- cerveza = whether this player attended the beer event (only if there is one).
-- pagado  = only for one-off pachangas; forced to NULL when the pachanga
--           belongs to a reserva, defaults to false otherwise.
-- jugado  = cannot be set back to false while the player has votes in it.
create table pachanga_jugador (
  id_pachanga  bigint not null references pachanga(id) on delete cascade,
  id_jugador   bigint not null references jugador(id) on delete restrict,
  jugado       boolean not null default true,
  cerveza      boolean not null default false,
  pagado       boolean,
  fecha_pago   timestamptz,
  primary key (id_pachanga, id_jugador),
  check (coalesce(pagado, false) = (fecha_pago is not null))
);

create trigger trg_pachanga_validar
  before insert or update on pachanga
  for each row execute function validar_pachanga();

create or replace function normalizar_pachanga_jugador() returns trigger
language plpgsql set search_path = equipo as $$
declare
  v_reserva   bigint;
  v_cervezas  boolean;
begin
  select id_reserva, cervezas into v_reserva, v_cervezas
  from pachanga where id = new.id_pachanga;

  if v_reserva is not null then
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

create trigger trg_pachanga_jugador_pagado
  before insert or update on pachanga_jugador
  for each row execute function normalizar_pachanga_jugador();

-- Same-event triggers fire in alphabetical order: this one must run
-- after trg_pachanga_jugador_pagado, hence the longer name.
create trigger trg_pachanga_jugador_pagado_fecha
  before insert or update on pachanga_jugador
  for each row execute function normalizar_fecha_pago();

-- If a pachanga is attached to / detached from a reserva, re-normalise pagado
create or replace function sync_pagado_on_reserva_change() returns trigger
language plpgsql set search_path = equipo as $$
begin
  update pachanga_jugador set pagado = pagado where id_pachanga = new.id;
  return new;
end $$;

create trigger trg_pachanga_reserva_change
  after update of id_reserva on pachanga
  for each row when (old.id_reserva is distinct from new.id_reserva)
  execute function sync_pagado_on_reserva_change();

-- Reserva with its pachanga count (counts created pachangas, past or future)
create view v_reserva_periodica with (security_invoker = true) as
select r.*, count(p.id)::int as n_pachangas
from reserva_periodica r
left join pachanga p on p.id_reserva = r.id
group by r.id;


-- ---------------------------------------------------------------------
-- EQUIPO (teams within a pachanga)
-- ---------------------------------------------------------------------
create table equipo (
  id                bigint generated always as identity primary key,
  id_pachanga       bigint not null references pachanga(id) on delete cascade,
  nombre            text,
  partidos_ganados  smallint check (partidos_ganados >= 0),   -- optional
  unique (id, id_pachanga)
);

create table jugador_equipo (
  id_equipo    bigint not null,
  id_pachanga  bigint not null,
  id_jugador   bigint not null,
  primary key (id_equipo, id_jugador),
  unique (id_pachanga, id_jugador),
  foreign key (id_equipo, id_pachanga)
    references equipo(id, id_pachanga) on delete cascade,
  foreign key (id_pachanga, id_jugador)
    references pachanga_jugador(id_pachanga, id_jugador) on delete cascade
);


-- ---------------------------------------------------------------------
-- TOP PACHANGA (votes)
-- Voter: a member (not a guest) who played the pachanga.
-- Voted players (tops and fraude) must have played it.
-- No self-vote. Voting only from the day of the pachanga onwards.
-- ---------------------------------------------------------------------
create table top_pachanga (
  id_pachanga  bigint not null,
  id_jugador   bigint not null,                         -- voter
  top_1        bigint not null,
  top_2        bigint not null,
  top_3        bigint not null,
  fraude       bigint,                                  -- vote for the fraude award
  primary key (id_pachanga, id_jugador),
  foreign key (id_pachanga, id_jugador) references pachanga_jugador(id_pachanga, id_jugador) on delete cascade,
  foreign key (id_pachanga, top_1)      references pachanga_jugador(id_pachanga, id_jugador),
  foreign key (id_pachanga, top_2)      references pachanga_jugador(id_pachanga, id_jugador),
  foreign key (id_pachanga, top_3)      references pachanga_jugador(id_pachanga, id_jugador),
  foreign key (id_pachanga, fraude)     references pachanga_jugador(id_pachanga, id_jugador),
  check (top_1 <> top_2 and top_1 <> top_3 and top_2 <> top_3),
  check (id_jugador not in (top_1, top_2, top_3)),
  check (fraude is null or fraude <> id_jugador)
);

create or replace function check_top_pachanga() returns trigger
language plpgsql set search_path = equipo as $$
begin
  if not exists (select 1 from jugador
                 where id = new.id_jugador and id_miembro is not null) then
    raise exception 'Solo los miembros pueden votar';
  end if;

  if exists (select 1 from pachanga where id = new.id_pachanga and fecha > current_date) then
    raise exception 'No se puede votar una pachanga que aun no se ha jugado';
  end if;

  if exists (select 1 from pachanga_jugador pj
             where pj.id_pachanga = new.id_pachanga
               and pj.id_jugador in (new.id_jugador, new.top_1, new.top_2, new.top_3, new.fraude)
               and not pj.jugado) then
    raise exception 'Votante y votados deben haber jugado la pachanga';
  end if;

  return new;
end $$;

create trigger trg_top_pachanga_check
  before insert or update on top_pachanga
  for each row execute function check_top_pachanga();

-- Aggregated results, readable by everyone without exposing who voted what.
-- Runs with the owner's rights on purpose (not security_invoker).
create view v_resultado_top_pachanga as
select id_pachanga,
       id_jugador,
       count(*) filter (where posicion = 'top_1')  as votos_top_1,
       count(*) filter (where posicion = 'top_2')  as votos_top_2,
       count(*) filter (where posicion = 'top_3')  as votos_top_3,
       count(*) filter (where posicion = 'fraude') as votos_fraude
from (
  select id_pachanga, top_1  as id_jugador, 'top_1'  as posicion from top_pachanga
  union all
  select id_pachanga, top_2,  'top_2'  from top_pachanga
  union all
  select id_pachanga, top_3,  'top_3'  from top_pachanga
  union all
  select id_pachanga, fraude, 'fraude' from top_pachanga where fraude is not null
) v
group by id_pachanga, id_jugador;


-- ---------------------------------------------------------------------
-- PREMIO (one winner per award per season)
-- ---------------------------------------------------------------------
create table premio (
  id             bigint generated always as identity primary key,
  nombre_premio  text not null unique,
  mencion        boolean not null default false
);

create table premio_miembro (
  id          bigint generated always as identity primary key,
  id_premio   bigint not null references premio(id) on delete cascade,
  id_miembro  bigint not null references miembro(id) on delete cascade,
  temporada   text not null check (temporada ~ '^[0-9]{4}-[0-9]{2}$'),   -- e.g. '2025-26'
  unique (id_premio, temporada)
);


-- ---------------------------------------------------------------------
-- ENTRENAMIENTO (guests allowed: uses jugador)
-- ---------------------------------------------------------------------
create table entrenamiento (
  id      bigint generated always as identity primary key,
  fecha   date not null,
  precio  numeric(8,2) not null default 0 check (precio >= 0)
);

create table entrenamiento_jugador (
  id_entrenamiento  bigint not null references entrenamiento(id) on delete cascade,
  id_jugador        bigint not null references jugador(id) on delete restrict,
  asistido          boolean not null default true,
  pagado            boolean not null default false,
  fecha_pago        timestamptz,
  primary key (id_entrenamiento, id_jugador),
  check (pagado = (fecha_pago is not null))
);

create trigger trg_entrenamiento_jugador_fecha_pago
  before insert or update on entrenamiento_jugador
  for each row execute function normalizar_fecha_pago();


-- ---------------------------------------------------------------------
-- GASTO
-- Booking charges are linked to a reserva or to a one-off pachanga;
-- general charges have neither. tipo is derived from that.
-- Linked reserva/pachanga cannot be deleted while it has charges.
-- ---------------------------------------------------------------------
create table gasto (
  id           bigint generated always as identity primary key,
  compra       text not null,
  precio       numeric(10,2) not null check (precio >= 0),  -- total price of the purchase
  cantidad     integer not null default 1 check (cantidad > 0),
  fecha        date not null default current_date,
  id_reserva   bigint references reserva_periodica(id) on delete restrict,
  id_pachanga  bigint references pachanga(id) on delete restrict,
  tipo         text generated always as (
                 case when id_reserva  is not null then 'reserva'
                      when id_pachanga is not null then 'pachanga'
                      else 'general' end
               ) stored,
  check (id_reserva is null or id_pachanga is null)
);


-- ---------------------------------------------------------------------
-- APODO / HABILIDAD ESPECIAL (admin validation)
-- Any user can propose one for any member; it starts unvalidated.
-- creado_por is the proposer; validado_por is filled automatically with
-- the admin who validates.
-- ---------------------------------------------------------------------
create table apodo (
  id            bigint generated always as identity primary key,
  id_miembro    bigint not null references miembro(id) on delete cascade,
  apodo         text not null,
  creado_por    uuid default auth.uid() references usuario(id) on delete set null,
  validado      boolean not null default false,
  validado_por  uuid references usuario(id) on delete set null,
  check (validado or validado_por is null)
);

create table habilidad_especial (
  id            bigint generated always as identity primary key,
  id_miembro    bigint not null references miembro(id) on delete cascade,
  habilidad     text not null,
  creado_por    uuid default auth.uid() references usuario(id) on delete set null,
  validado      boolean not null default false,
  validado_por  uuid references usuario(id) on delete set null,
  check (validado or validado_por is null)
);

create or replace function registrar_validacion() returns trigger
language plpgsql set search_path = equipo as $$
begin
  if not new.validado then
    new.validado_por := null;
  elsif tg_op = 'INSERT' or not old.validado then
    new.validado_por := auth.uid();
  end if;
  return new;
end $$;

create trigger trg_apodo_validacion
  before insert or update on apodo
  for each row execute function registrar_validacion();

create trigger trg_habilidad_validacion
  before insert or update on habilidad_especial
  for each row execute function registrar_validacion();


-- ---------------------------------------------------------------------
-- INDEXES on FK columns not covered by a PK/unique leading column
-- ---------------------------------------------------------------------
create index ix_junta_miembro           on junta_directiva (id_miembro);
create index ix_reserva_jugador_jug     on reserva_jugador (id_jugador);
create index ix_pachanga_reserva        on pachanga (id_reserva);
create index ix_pachanga_jugador_jug    on pachanga_jugador (id_jugador);
create index ix_equipo_pachanga         on equipo (id_pachanga);
create index ix_premio_miembro_miembro  on premio_miembro (id_miembro);
create index ix_entreno_jugador_jug     on entrenamiento_jugador (id_jugador);
create index ix_gasto_reserva           on gasto (id_reserva);
create index ix_gasto_pachanga          on gasto (id_pachanga);
create index ix_apodo_miembro           on apodo (id_miembro);
create index ix_habilidad_miembro       on habilidad_especial (id_miembro);


-- =====================================================================
-- ACCESS CONTROL
-- =====================================================================

-- Is the current user an admin?
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = equipo as $$
  select coalesce((select admin from usuario where id = auth.uid()), false);
$$;

-- jugador id of the current user (null if not linked to a member)
create or replace function mi_jugador() returns bigint
language sql stable security definer set search_path = equipo as $$
  select j.id
  from jugador j
  join miembro m on m.id = j.id_miembro
  where m.id_usuario = auth.uid();
$$;

-- Non-admins may only change nombre/apellido on their own miembro row
create or replace function proteger_miembro() returns trigger
language plpgsql set search_path = equipo as $$
begin
  if auth.uid() is not null and not is_admin()
     and (to_jsonb(new) - 'nombre' - 'apellido')
         is distinct from (to_jsonb(old) - 'nombre' - 'apellido') then
    raise exception 'Solo puedes modificar tu nombre y apellido';
  end if;
  return new;
end $$;

create trigger trg_miembro_proteger
  before update on miembro
  for each row execute function proteger_miembro();

-- Row Level Security: everyone authenticated reads, admins write.
do $$
declare
  t text;
begin
  foreach t in array array[
    'usuario', 'miembro', 'cargo', 'junta_directiva', 'invitado', 'jugador',
    'reserva_periodica', 'reserva_jugador', 'pachanga', 'pachanga_jugador',
    'equipo', 'jugador_equipo', 'premio', 'premio_miembro', 'entrenamiento',
    'entrenamiento_jugador', 'gasto', 'apodo', 'habilidad_especial'
  ] loop
    execute format('alter table equipo.%I enable row level security', t);
    execute format('create policy lectura on equipo.%I for select to authenticated using (true)', t);
    execute format('create policy admin_escritura on equipo.%I for all to authenticated
                    using (equipo.is_admin()) with check (equipo.is_admin())', t);
  end loop;
end $$;

-- Self-service exceptions
-- (usuario has none: username and admin flag are admin-only)
create policy editar_mi_miembro on miembro
  for update to authenticated
  using (id_usuario = auth.uid()) with check (id_usuario = auth.uid());

-- Proposals of apodo / habilidad: anyone can propose (unvalidated, as
-- themselves) and withdraw their own proposal while it is unvalidated.
create policy proponer on apodo
  for insert to authenticated
  with check (not validado and creado_por = auth.uid());

create policy retirar_propuesta on apodo
  for delete to authenticated
  using (not validado and creado_por = auth.uid());

create policy proponer on habilidad_especial
  for insert to authenticated
  with check (not validado and creado_por = auth.uid());

create policy retirar_propuesta on habilidad_especial
  for delete to authenticated
  using (not validado and creado_por = auth.uid());

-- Votes: only your own, for everyone (admins included). Admins can read and
-- delete any vote but cannot cast or change one for someone else.
alter table top_pachanga enable row level security;

create policy ver_votos on top_pachanga
  for select to authenticated
  using (id_jugador = mi_jugador() or is_admin());

create policy votar on top_pachanga
  for insert to authenticated
  with check (id_jugador = mi_jugador());

create policy cambiar_mi_voto on top_pachanga
  for update to authenticated
  using (id_jugador = mi_jugador()) with check (id_jugador = mi_jugador());

create policy borrar_voto on top_pachanga
  for delete to authenticated
  using (id_jugador = mi_jugador() or is_admin());


-- ---------------------------------------------------------------------
-- SCHEMA PRIVILEGES
-- Logged-in users and the service role (Edge Functions) get access;
-- RLS above decides what each one can do. anon gets nothing, which also
-- keeps the results view (it bypasses RLS on purpose) away from visitors.
-- ---------------------------------------------------------------------
grant usage on schema equipo to authenticated, service_role;
grant all on all tables    in schema equipo to authenticated, service_role;
grant all on all sequences in schema equipo to authenticated, service_role;
grant all on all routines  in schema equipo to authenticated, service_role;
alter default privileges for role postgres in schema equipo
  grant all on tables    to authenticated, service_role;
alter default privileges for role postgres in schema equipo
  grant all on sequences to authenticated, service_role;
alter default privileges for role postgres in schema equipo
  grant all on routines  to authenticated, service_role;
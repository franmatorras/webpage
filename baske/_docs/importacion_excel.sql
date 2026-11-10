-- =====================================================================
-- FRAN-BASKET - importación de Pachangas.xlsx
-- GENERADO por importar_excel.py el 2026-11-08. No editar a mano: cambia el
-- script (PERSONAS, costes...) y vuelve a generarlo.
--
-- Ejecutar en el SQL Editor de Supabase, después de las migraciones 01 a 06.
-- Se para sin tocar nada si ya hubo una importación o si ya hay pachangas,
-- entrenamientos o reservas en las fechas del Excel.
-- Cada fila creada se apunta en importacion_baske.filas;
-- borrar_importacion_excel.sql la deshace.
-- Los mensajes (NOTICE) dicen qué miembros ya existían y cuáles se crean.
-- =====================================================================

create schema if not exists importacion_baske;
revoke all on schema importacion_baske from public, anon, authenticated;
create table if not exists importacion_baske.filas (tabla text not null, id bigint not null);
create table if not exists importacion_baske.persona (
  clave       text primary key,
  id_miembro  bigint,
  id_jugador  bigint not null
);

-- Busca el miembro (por id, por usuario de la web o por nombre/apellido); si no existe
-- lo crea (salvo si se buscaba por id o usuario: entonces se para). Le da jugador.
create or replace function importacion_baske.miembro(p_clave text, p_nombre text, p_apellido text,
    p_id bigint, p_usuario text, p_tipo equipo.tipo_miembro, p_ingreso date, p_baja date) returns void
language plpgsql set search_path = equipo as $f$
declare
  v_m bigint; v_j bigint; v_n int;
begin
  if p_id is not null then
    select id into v_m from miembro where id = p_id;
    if v_m is null then raise exception 'No existe el miembro con id % (%)', p_id, p_clave; end if;
  elsif p_usuario is not null then
    select m.id into v_m from miembro m join usuario u on u.id = m.id_usuario
    where lower(u.usuario) = lower(trim(p_usuario));
    if v_m is null then
      raise exception 'El usuario "%" (%) no existe o no tiene miembro vinculado', p_usuario, p_clave;
    end if;
  else
    select count(*), min(id) into v_n, v_m from miembro
    where lower(trim(nombre)) = lower(trim(p_nombre))
      and (p_apellido is null or lower(trim(coalesce(apellido, ''))) = lower(trim(p_apellido)));
    if v_n > 1 then
      raise exception 'Hay % miembros que encajan con "%" (%): pon apellido o id_miembro en PERSONAS', v_n, p_nombre, p_clave;
    end if;
  end if;

  if v_m is null then
    -- Con fecha de baja: ex-miembro (inactivo y sin nº de socio)
    insert into miembro (nombre, apellido, fecha_ingreso, tipo_miembro, fecha_baja, activo)
    values (p_nombre, p_apellido, p_ingreso, p_tipo, p_baja, p_baja is null) returning id into v_m;
    insert into importacion_baske.filas values ('miembro', v_m);
    raise notice 'Miembro NUEVO:     % (id %)%', p_clave, v_m,
      coalesce(', baja ' || to_char(p_baja, 'DD/MM/YYYY'), '');
  else
    raise notice 'Miembro existente: % -> id %', p_clave, v_m;
  end if;

  select id into v_j from jugador where id_miembro = v_m;
  if v_j is null then
    insert into jugador (id_miembro) values (v_m) returning id into v_j;
    insert into importacion_baske.filas values ('jugador', v_j);
  end if;
  insert into importacion_baske.persona values (p_clave, v_m, v_j);
end $f$;

create or replace function importacion_baske.invitado(p_clave text, p_nombre text, p_padrino text) returns void
language plpgsql set search_path = equipo as $f$
declare
  v_i bigint; v_j bigint;
begin
  insert into invitado (nombre, id_padrino)
  values (p_nombre, (select id_miembro from importacion_baske.persona where clave = p_padrino))
  returning id into v_i;
  insert into importacion_baske.filas values ('invitado', v_i);
  insert into jugador (id_invitado) values (v_i) returning id into v_j;
  insert into importacion_baske.filas values ('jugador', v_j);
  insert into importacion_baske.persona values (p_clave, null, v_j);
end $f$;

create or replace function importacion_baske.jugador(p_clave text) returns bigint
language plpgsql as $f$
declare
  v_j bigint;
begin
  select id_jugador into v_j from importacion_baske.persona where clave = p_clave;
  if v_j is null then raise exception 'Persona sin crear: %', p_clave; end if;
  return v_j;
end $f$;

-- Hora a la que se dan por hechos los pagos (hora de Madrid)
create or replace function importacion_baske.momento(p_fecha date, p_hora time) returns timestamptz
language sql stable as $f$
  select (p_fecha + p_hora) at time zone 'Europe/Madrid';
$f$;

create or replace function importacion_baske.reserva(p_inicio date, p_fin date, p_precio numeric, p_coste numeric) returns bigint
language plpgsql set search_path = equipo as $f$
declare
  v_r bigint;
begin
  insert into reserva_periodica (fecha_inicio, fecha_fin, precio_unitario, coste_reserva)
  values (p_inicio, p_fin, p_precio, p_coste) returning id into v_r;
  insert into importacion_baske.filas values ('reserva_periodica', v_r);
  insert into importacion_baske.filas select 'gasto', id from gasto where id_reserva = v_r;
  return v_r;
end $f$;

create or replace function importacion_baske.apunta(p_reserva bigint, p_clave text, p_pagado boolean) returns void
language plpgsql set search_path = equipo as $f$
begin
  insert into reserva_jugador (id_reserva, id_jugador, pagado, fecha_pago)
  select p_reserva, importacion_baske.jugador(p_clave), p_pagado,
         case when p_pagado then importacion_baske.momento(r.fecha_inicio, time '12:00') end
  from reserva_periodica r where r.id = p_reserva;
end $f$;

-- Pachanga suelta (p_reserva null: con precio y sin coste, así no crea gasto) o de reserva
create or replace function importacion_baske.pachanga(p_fecha date, p_precio numeric, p_reserva bigint,
    p_pista text, p_cervezas boolean) returns bigint
language plpgsql set search_path = equipo as $f$
declare
  v_p bigint;
begin
  insert into pachanga (id_reserva, fecha, precio, coste, cervezas, pista)
  values (p_reserva, p_fecha, case when p_reserva is null then p_precio end, null, p_cervezas, p_pista::tipo_pista)
  returning id into v_p;
  insert into importacion_baske.filas values ('pachanga', v_p);
  return v_p;
end $f$;

-- Asistencia. pagado lo pone a null la base de datos si está apuntado a la reserva.
create or replace function importacion_baske.asiste(p_pachanga bigint, p_clave text, p_jugado boolean,
    p_cerveza boolean, p_pagado boolean) returns void
language plpgsql set search_path = equipo as $f$
begin
  insert into pachanga_jugador (id_pachanga, id_jugador, jugado, cerveza, pagado, fecha_pago)
  select p_pachanga, importacion_baske.jugador(p_clave), p_jugado, p_cerveza, p_pagado,
         case when p_pagado then importacion_baske.momento(p.fecha, time '21:00') end
  from pachanga p where p.id = p_pachanga;
end $f$;

-- Entrenamiento histórico: se borra el gasto de pista que se crea solo
create or replace function importacion_baske.entrenamiento(p_fecha date, p_precio numeric, p_pista text) returns bigint
language plpgsql set search_path = equipo as $f$
declare
  v_e bigint;
begin
  insert into entrenamiento (fecha, precio, coste, pista)
  values (p_fecha, p_precio, 0, p_pista::tipo_pista) returning id into v_e;
  delete from gasto where id_entrenamiento = v_e;
  insert into importacion_baske.filas values ('entrenamiento', v_e);
  return v_e;
end $f$;

create or replace function importacion_baske.entrena(p_entrenamiento bigint, p_clave text) returns void
language plpgsql set search_path = equipo as $f$
begin
  insert into entrenamiento_jugador (id_entrenamiento, id_jugador, asistido, pagado, fecha_pago)
  select p_entrenamiento, importacion_baske.jugador(p_clave), true, false, null
  from entrenamiento e where e.id = p_entrenamiento;
end $f$;

do $$
declare
  v_p bigint;
  v_e bigint;
  v_r bigint[] := '{}';
  v_choques text;
begin
  if exists (select 1 from importacion_baske.filas) or exists (select 1 from importacion_baske.persona) then
    raise exception 'Ya hay una importación: ejecuta borrar_importacion_excel.sql primero';
  end if;

  -- Fechas que ya existen en la base de datos
  select string_agg(distinct to_char(f, 'DD/MM/YYYY'), ', ') into v_choques from (
    select fecha f from equipo.pachanga union all select fecha from equipo.entrenamiento
  ) x where f = any (array[
    '2024-11-26', '2024-12-03', '2024-12-10', '2024-12-17', '2025-01-07', '2025-01-14',
    '2025-01-21', '2025-01-28', '2025-01-31', '2025-02-04', '2025-02-11', '2025-02-18',
    '2025-02-25', '2025-02-28', '2025-03-04', '2025-03-11', '2025-03-14', '2025-03-21',
    '2025-03-26', '2025-04-01', '2025-04-15', '2025-04-29', '2025-05-06', '2025-05-09',
    '2025-05-13', '2025-05-20', '2025-05-27', '2025-06-03', '2025-06-10', '2025-06-17',
    '2025-06-20', '2025-09-02', '2025-09-09', '2025-09-30', '2025-10-07', '2025-10-14',
    '2025-10-21', '2025-10-28', '2025-11-04', '2025-11-11', '2025-11-18', '2025-11-25',
    '2025-12-02', '2025-12-09', '2025-12-16', '2026-01-13', '2026-01-20', '2026-02-03',
    '2026-02-24', '2026-03-03', '2026-03-10', '2026-03-19', '2026-03-24', '2026-04-07',
    '2026-04-14', '2026-04-21', '2026-04-28', '2026-05-07', '2026-05-12', '2026-05-19',
    '2026-05-26', '2026-06-02', '2026-06-09', '2026-06-16', '2026-06-23', '2026-06-30',
    '2026-09-01', '2026-09-08', '2026-09-22', '2026-09-29', '2026-10-06', '2026-10-13',
    '2026-10-27', '2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24', '2026-12-01',
    '2026-12-15', '2026-12-22'
  ]::date[]);
  if v_choques is not null then
    raise exception 'Ya hay pachangas o entrenamientos en estas fechas del Excel: %', v_choques;
  end if;
  if exists (select 1 from equipo.reserva_periodica where daterange(fecha_inicio, fecha_fin, '[]') && daterange(date '2026-09-01', date '2026-10-31', '[]')) then
    raise exception 'Ya hay una reserva periódica que se solapa con 01/09/2026 - 31/10/2026';
  end if;
  if exists (select 1 from equipo.reserva_periodica where daterange(fecha_inicio, fecha_fin, '[]') && daterange(date '2026-11-01', date '2026-12-31', '[]')) then
    raise exception 'Ya hay una reserva periódica que se solapa con 01/11/2026 - 31/12/2026';
  end if;

  -- ----- MIEMBROS -----
  perform importacion_baske.miembro('Fran', 'Fran', null, null, 'fran', 'jugador', date '2024-11-26', null);
  perform importacion_baske.miembro('Abel', 'Abel', null, null, null, 'jugador', date '2025-03-26', date '2025-08-31');
  perform importacion_baske.miembro('Alex', 'Alex', null, null, null, 'jugador', date '2025-02-04', null);
  perform importacion_baske.miembro('Álvaro', 'Álvaro', null, null, null, 'jugador', date '2025-05-27', null);
  perform importacion_baske.miembro('Antonio Gigachad', 'Antonio Gigachad', null, null, null, 'jugador', date '2024-11-26', null);
  perform importacion_baske.miembro('Antonio IH', 'Antonio IH', null, null, 'millagi.do', 'jugador', date '2025-10-07', null);
  perform importacion_baske.miembro('Bochi', 'Bochi', null, null, null, 'jugador', date '2026-10-06', null);
  perform importacion_baske.miembro('Borja', 'Borja', null, null, null, 'jugador', date '2024-11-26', null);
  perform importacion_baske.miembro('Bryan', 'Bryan', null, null, null, 'jugador', date '2025-03-04', date '2025-08-31');
  perform importacion_baske.miembro('Carlos Cipi', 'Carlos Cipi', null, null, null, 'jugador', date '2024-12-17', null);
  perform importacion_baske.miembro('Cervantes', 'Cervantes', null, null, null, 'jugador', date '2024-12-03', date '2025-08-31');
  perform importacion_baske.miembro('Dani V', 'Dani V', null, null, null, 'jugador', date '2024-12-17', date '2026-08-31');
  perform importacion_baske.miembro('Dani Fichaje', 'Dani Fichaje', null, null, null, 'jugador', date '2026-03-24', null);
  perform importacion_baske.miembro('Edu M', 'Edu M', null, null, null, 'jugador', date '2024-12-17', null);
  perform importacion_baske.miembro('Edu OTR', 'Edu OTR', null, null, null, 'jugador', date '2024-12-03', null);
  perform importacion_baske.miembro('Elena', 'Elena', null, null, null, 'jugador', date '2024-12-03', date '2025-08-31');
  perform importacion_baske.miembro('Gonzalo', 'Gonzalo', null, null, null, 'jugador', date '2026-09-01', null);
  perform importacion_baske.miembro('Guzmán', 'Guzmán', null, null, null, 'jugador', date '2025-09-30', null);
  perform importacion_baske.miembro('Joan', 'Joan', null, null, null, 'jugador', date '2026-04-14', date '2026-08-31');
  perform importacion_baske.miembro('Jorge', 'Jorge', null, null, null, 'jugador', date '2025-01-07', null);
  perform importacion_baske.miembro('Jorge Gigachad', 'Jorge Gigachad', null, null, null, 'jugador', date '2026-09-01', null);
  perform importacion_baske.miembro('Juan (Jugoma)', 'Juan', null, null, null, 'jugador', date '2024-11-26', null);
  perform importacion_baske.miembro('Juanpri', 'Juanpri', null, null, null, 'jugador', date '2025-09-09', null);
  perform importacion_baske.miembro('Luis', 'Luis', null, null, null, 'jugador', date '2025-01-14', date '2026-08-31');
  perform importacion_baske.miembro('Luis (primo Álvaro)', 'Luis (primo Álvaro)', null, null, null, 'jugador', date '2025-12-02', null);
  perform importacion_baske.miembro('Marco', 'Marco', null, null, null, 'jugador', date '2024-12-10', date '2025-08-31');
  perform importacion_baske.miembro('Marcos', 'Marcos', null, null, null, 'jugador', date '2024-12-17', null);
  perform importacion_baske.miembro('Miguel (La Garza)', 'Miguel', null, null, null, 'jugador', date '2024-11-26', null);
  perform importacion_baske.miembro('Nico', 'Nico', null, null, null, 'jugador', date '2024-12-03', null);
  perform importacion_baske.miembro('Olaf', 'Olaf', null, null, null, 'jugador', date '2025-02-25', date '2025-08-31');
  perform importacion_baske.miembro('Pablucho', 'Pablucho', null, null, null, 'jugador', date '2024-11-26', date '2026-08-31');
  perform importacion_baske.miembro('Popo', 'Popo', null, null, null, 'jugador', date '2024-11-26', date '2025-08-31');
  perform importacion_baske.miembro('Raúl', 'Raúl', null, null, 'raul.santos', 'jugador', date '2024-11-26', null);
  perform importacion_baske.miembro('Rodri', 'Rodri', null, null, null, 'jugador', date '2025-12-09', date '2026-08-31');

  -- ----- INVITADOS -----
  perform importacion_baske.invitado('Dani Espinosa', 'Dani Espinosa', null);
  perform importacion_baske.invitado('DaniLo', 'DaniLo', null);
  perform importacion_baske.invitado('Miguel Magic', 'Miguel Magic', null);
  perform importacion_baske.invitado('Jose (amigo de Raúl)', 'Jose (amigo de Raúl)', 'Raúl');
  perform importacion_baske.invitado('Fran (amigo de Juan)', 'Fran (amigo de Juan)', 'Juan (Jugoma)');
  perform importacion_baske.invitado('Mikel', 'Mikel', null);
  perform importacion_baske.invitado('Valva', 'Valva', null);
  perform importacion_baske.invitado('Jack', 'Jack', null);
  perform importacion_baske.invitado('Simón (francés IH)', 'Simón (francés IH)', null);
  perform importacion_baske.invitado('Duje', 'Duje', null);
  perform importacion_baske.invitado('Aitor (amigo Álvaro)', 'Aitor (amigo Álvaro)', 'Álvaro');
  perform importacion_baske.invitado('Alain', 'Alain', null);
  perform importacion_baske.invitado('Miguel Barquín', 'Miguel Barquín', null);
  perform importacion_baske.invitado('Jeison', 'Jeison', null);
  perform importacion_baske.invitado('Julia', 'Julia', null);
  perform importacion_baske.invitado('Marta', 'Marta', null);
  perform importacion_baske.invitado('Diego Guirao', 'Diego Guirao', null);
  perform importacion_baske.invitado('Ángel', 'Ángel', null);
  perform importacion_baske.invitado('Sari', 'Sari', null);
  perform importacion_baske.invitado('Adriana', 'Adriana', null);
  perform importacion_baske.invitado('Miguel (amigo Joan)', 'Miguel (amigo Joan)', 'Joan');
  perform importacion_baske.invitado('Joni IH', 'Joni IH', null);
  perform importacion_baske.invitado('Amigo Álvaro', 'Amigo Álvaro', 'Álvaro');
  perform importacion_baske.invitado('Óscar (amigo Edu)', 'Óscar (amigo Edu)', null);

  -- ----- RESERVAS 26/27 -----
  v_r := v_r || importacion_baske.reserva(date '2026-09-01', date '2026-10-31', 1, 50.61);
  perform importacion_baske.apunta(v_r[1], 'Fran', true);
  perform importacion_baske.apunta(v_r[1], 'Alex', false);
  perform importacion_baske.apunta(v_r[1], 'Álvaro', true);
  perform importacion_baske.apunta(v_r[1], 'Antonio Gigachad', true);
  perform importacion_baske.apunta(v_r[1], 'Antonio IH', true);
  perform importacion_baske.apunta(v_r[1], 'Dani Fichaje', true);
  perform importacion_baske.apunta(v_r[1], 'Edu M', true);
  perform importacion_baske.apunta(v_r[1], 'Edu OTR', true);
  perform importacion_baske.apunta(v_r[1], 'Guzmán', true);
  perform importacion_baske.apunta(v_r[1], 'Jorge', true);
  perform importacion_baske.apunta(v_r[1], 'Jorge Gigachad', true);
  perform importacion_baske.apunta(v_r[1], 'Nico', true);
  perform importacion_baske.apunta(v_r[1], 'Gonzalo', true);
  v_r := v_r || importacion_baske.reserva(date '2026-11-01', date '2026-12-31', 1, 50.61);
  perform importacion_baske.apunta(v_r[2], 'Fran', true);
  perform importacion_baske.apunta(v_r[2], 'Álvaro', true);
  perform importacion_baske.apunta(v_r[2], 'Antonio Gigachad', false);
  perform importacion_baske.apunta(v_r[2], 'Antonio IH', true);
  perform importacion_baske.apunta(v_r[2], 'Dani Fichaje', true);
  perform importacion_baske.apunta(v_r[2], 'Edu M', true);
  perform importacion_baske.apunta(v_r[2], 'Edu OTR', true);
  perform importacion_baske.apunta(v_r[2], 'Gonzalo', true);
  perform importacion_baske.apunta(v_r[2], 'Guzmán', true);
  perform importacion_baske.apunta(v_r[2], 'Jorge Gigachad', true);
  perform importacion_baske.apunta(v_r[2], 'Nico', true);
  perform importacion_baske.apunta(v_r[2], 'Óscar (amigo Edu)', false);

  -- ----- TEMPORADA 24/25 -----
  v_p := importacion_baske.pachanga(date '2024-11-26', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, false);
  perform importacion_baske.asiste(v_p, 'Borja', true, false, false);
  perform importacion_baske.asiste(v_p, 'Juan (Jugoma)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Pablucho', true, false, false);
  perform importacion_baske.asiste(v_p, 'Popo', true, false, false);
  perform importacion_baske.asiste(v_p, 'Raúl', true, false, false);
  v_p := importacion_baske.pachanga(date '2024-12-03', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, false);
  perform importacion_baske.asiste(v_p, 'Cervantes', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Elena', true, false, false);
  perform importacion_baske.asiste(v_p, 'Juan (Jugoma)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  perform importacion_baske.asiste(v_p, 'Pablucho', true, false, false);
  perform importacion_baske.asiste(v_p, 'Popo', true, false, false);
  v_p := importacion_baske.pachanga(date '2024-12-10', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Juan (Jugoma)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Marco', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  perform importacion_baske.asiste(v_p, 'Raúl', true, false, false);
  v_p := importacion_baske.pachanga(date '2024-12-17', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, false);
  perform importacion_baske.asiste(v_p, 'Carlos Cipi', true, false, false);
  perform importacion_baske.asiste(v_p, 'Cervantes', true, false, false);
  perform importacion_baske.asiste(v_p, 'Dani V', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Juan (Jugoma)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Marco', true, false, false);
  perform importacion_baske.asiste(v_p, 'Marcos', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  perform importacion_baske.asiste(v_p, 'Raúl', true, false, false);
  perform importacion_baske.asiste(v_p, 'Mikel', true, false, false);
  v_p := importacion_baske.pachanga(date '2025-01-07', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Jorge', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  perform importacion_baske.asiste(v_p, 'Raúl', true, false, false);
  v_p := importacion_baske.pachanga(date '2025-01-14', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Cervantes', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Jorge', true, false, false);
  perform importacion_baske.asiste(v_p, 'Luis', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  perform importacion_baske.asiste(v_p, 'Raúl', true, false, false);
  v_p := importacion_baske.pachanga(date '2025-01-21', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Juan (Jugoma)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Luis', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  perform importacion_baske.asiste(v_p, 'Pablucho', true, false, false);
  perform importacion_baske.asiste(v_p, 'Popo', true, false, false);
  v_p := importacion_baske.pachanga(date '2025-01-28', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, false);
  perform importacion_baske.asiste(v_p, 'Cervantes', true, false, false);
  perform importacion_baske.asiste(v_p, 'Juan (Jugoma)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  perform importacion_baske.asiste(v_p, 'Raúl', true, false, false);
  v_e := importacion_baske.entrenamiento(date '2025-01-31', 0, 'media');  -- Friday
  perform importacion_baske.entrena(v_e, 'Fran');
  perform importacion_baske.entrena(v_e, 'Carlos Cipi');
  perform importacion_baske.entrena(v_e, 'Edu M');
  perform importacion_baske.entrena(v_e, 'Luis');
  perform importacion_baske.entrena(v_e, 'Miguel (La Garza)');
  perform importacion_baske.entrena(v_e, 'Nico');
  perform importacion_baske.entrena(v_e, 'Pablucho');
  perform importacion_baske.entrena(v_e, 'Dani Espinosa');
  perform importacion_baske.entrena(v_e, 'DaniLo');
  perform importacion_baske.entrena(v_e, 'Miguel Magic');
  v_p := importacion_baske.pachanga(date '2025-02-04', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Alex', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Juan (Jugoma)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  v_p := importacion_baske.pachanga(date '2025-02-11', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, false);
  perform importacion_baske.asiste(v_p, 'Cervantes', true, false, false);
  perform importacion_baske.asiste(v_p, 'Dani V', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Juan (Jugoma)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Luis', true, false, false);
  perform importacion_baske.asiste(v_p, 'Marco', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  v_p := importacion_baske.pachanga(date '2025-02-18', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Dani V', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Juan (Jugoma)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Luis', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  perform importacion_baske.asiste(v_p, 'Raúl', true, false, false);
  perform importacion_baske.asiste(v_p, 'Jose (amigo de Raúl)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Fran (amigo de Juan)', true, false, false);
  v_p := importacion_baske.pachanga(date '2025-02-25', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, false);
  perform importacion_baske.asiste(v_p, 'Cervantes', true, false, false);
  perform importacion_baske.asiste(v_p, 'Dani V', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Marco', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  perform importacion_baske.asiste(v_p, 'Olaf', true, false, false);
  perform importacion_baske.asiste(v_p, 'Popo', true, false, false);
  v_e := importacion_baske.entrenamiento(date '2025-02-28', 0, 'media');  -- Friday
  perform importacion_baske.entrena(v_e, 'Fran');
  perform importacion_baske.entrena(v_e, 'Edu M');
  perform importacion_baske.entrena(v_e, 'Juan (Jugoma)');
  perform importacion_baske.entrena(v_e, 'Marcos');
  perform importacion_baske.entrena(v_e, 'Miguel (La Garza)');
  perform importacion_baske.entrena(v_e, 'Nico');
  perform importacion_baske.entrena(v_e, 'Valva');
  v_p := importacion_baske.pachanga(date '2025-03-04', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, false);
  perform importacion_baske.asiste(v_p, 'Bryan', true, false, false);
  perform importacion_baske.asiste(v_p, 'Dani V', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Luis', true, false, false);
  perform importacion_baske.asiste(v_p, 'Marco', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  v_p := importacion_baske.pachanga(date '2025-03-11', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Bryan', true, false, false);
  perform importacion_baske.asiste(v_p, 'Cervantes', true, false, false);
  perform importacion_baske.asiste(v_p, 'Dani V', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Juan (Jugoma)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Luis', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  perform importacion_baske.asiste(v_p, 'Olaf', true, false, false);
  v_e := importacion_baske.entrenamiento(date '2025-03-14', 0, 'media');  -- Friday
  perform importacion_baske.entrena(v_e, 'Fran');
  perform importacion_baske.entrena(v_e, 'Antonio Gigachad');
  perform importacion_baske.entrena(v_e, 'Carlos Cipi');
  perform importacion_baske.entrena(v_e, 'Edu M');
  perform importacion_baske.entrena(v_e, 'Elena');
  perform importacion_baske.entrena(v_e, 'Juan (Jugoma)');
  perform importacion_baske.entrena(v_e, 'Miguel (La Garza)');
  perform importacion_baske.entrena(v_e, 'Nico');
  v_e := importacion_baske.entrenamiento(date '2025-03-21', 0, 'media');  -- Friday
  perform importacion_baske.entrena(v_e, 'Fran');
  perform importacion_baske.entrena(v_e, 'Carlos Cipi');
  perform importacion_baske.entrena(v_e, 'Edu M');
  perform importacion_baske.entrena(v_e, 'Juan (Jugoma)');
  perform importacion_baske.entrena(v_e, 'Luis');
  perform importacion_baske.entrena(v_e, 'Marcos');
  perform importacion_baske.entrena(v_e, 'Nico');
  perform importacion_baske.entrena(v_e, 'Jack');
  v_e := importacion_baske.entrenamiento(date '2025-03-26', 0, 'media');  -- Wednesday
  perform importacion_baske.entrena(v_e, 'Fran');
  perform importacion_baske.entrena(v_e, 'Abel');
  perform importacion_baske.entrena(v_e, 'Antonio Gigachad');
  perform importacion_baske.entrena(v_e, 'Juan (Jugoma)');
  perform importacion_baske.entrena(v_e, 'Marcos');
  perform importacion_baske.entrena(v_e, 'Miguel (La Garza)');
  perform importacion_baske.entrena(v_e, 'Nico');
  v_p := importacion_baske.pachanga(date '2025-04-01', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, false);
  perform importacion_baske.asiste(v_p, 'Dani V', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Juan (Jugoma)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Luis', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  v_p := importacion_baske.pachanga(date '2025-04-15', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Dani V', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Luis', true, false, false);
  v_p := importacion_baske.pachanga(date '2025-04-29', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, false);
  perform importacion_baske.asiste(v_p, 'Dani V', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Luis', true, false, false);
  perform importacion_baske.asiste(v_p, 'Marcos', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  perform importacion_baske.asiste(v_p, 'Simón (francés IH)', true, false, false);
  v_p := importacion_baske.pachanga(date '2025-05-06', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Dani V', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Juan (Jugoma)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Marco', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  v_e := importacion_baske.entrenamiento(date '2025-05-09', 0, 'media');  -- Friday
  perform importacion_baske.entrena(v_e, 'Fran');
  perform importacion_baske.entrena(v_e, 'Antonio Gigachad');
  perform importacion_baske.entrena(v_e, 'Miguel (La Garza)');
  v_p := importacion_baske.pachanga(date '2025-05-13', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, false);
  perform importacion_baske.asiste(v_p, 'Carlos Cipi', true, false, false);
  perform importacion_baske.asiste(v_p, 'Dani V', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  v_p := importacion_baske.pachanga(date '2025-05-20', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Carlos Cipi', true, false, false);
  perform importacion_baske.asiste(v_p, 'Cervantes', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Popo', true, false, false);
  v_p := importacion_baske.pachanga(date '2025-05-27', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Álvaro', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  v_p := importacion_baske.pachanga(date '2025-06-03', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Cervantes', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  perform importacion_baske.asiste(v_p, 'Popo', true, false, false);
  perform importacion_baske.asiste(v_p, 'Simón (francés IH)', true, false, false);
  v_p := importacion_baske.pachanga(date '2025-06-10', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Dani V', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Marcos', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  perform importacion_baske.asiste(v_p, 'Popo', true, false, false);
  perform importacion_baske.asiste(v_p, 'Duje', true, false, false);
  v_p := importacion_baske.pachanga(date '2025-06-17', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Cervantes', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Marcos', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  perform importacion_baske.asiste(v_p, 'Popo', true, false, false);
  v_e := importacion_baske.entrenamiento(date '2025-06-20', 0, 'completa');  -- Friday
  perform importacion_baske.entrena(v_e, 'Fran');
  perform importacion_baske.entrena(v_e, 'Antonio Gigachad');
  perform importacion_baske.entrena(v_e, 'Cervantes');
  perform importacion_baske.entrena(v_e, 'Dani V');
  perform importacion_baske.entrena(v_e, 'Edu M');
  perform importacion_baske.entrena(v_e, 'Marco');
  perform importacion_baske.entrena(v_e, 'Marcos');
  perform importacion_baske.entrena(v_e, 'Miguel (La Garza)');
  perform importacion_baske.entrena(v_e, 'Popo');

  -- ----- TEMPORADA 25/26 -----
  v_p := importacion_baske.pachanga(date '2025-09-02', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Álvaro', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, false);
  perform importacion_baske.asiste(v_p, 'Dani V', true, false, false);
  perform importacion_baske.asiste(v_p, 'Jorge', true, false, false);
  perform importacion_baske.asiste(v_p, 'Marcos', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  v_p := importacion_baske.pachanga(date '2025-09-09', 0, null, 'completa', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Alex', true, false, false);
  perform importacion_baske.asiste(v_p, 'Álvaro', true, false, false);
  perform importacion_baske.asiste(v_p, 'Dani V', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, true, false);
  perform importacion_baske.asiste(v_p, 'Jorge', true, true, false);
  perform importacion_baske.asiste(v_p, 'Juan (Jugoma)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Juanpri', true, true, false);
  perform importacion_baske.asiste(v_p, 'Luis', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  perform importacion_baske.asiste(v_p, 'Aitor (amigo Álvaro)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Borja', false, true, false);
  perform importacion_baske.asiste(v_p, 'Alain', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel Barquín', false, true, false);
  v_p := importacion_baske.pachanga(date '2025-09-30', 0, null, 'completa', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, true, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Jorge', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, true, false);
  perform importacion_baske.asiste(v_p, 'Nico', false, true, false);
  v_p := importacion_baske.pachanga(date '2025-10-07', 0, null, 'completa', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Álvaro', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, true, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Jorge', true, false, false);
  perform importacion_baske.asiste(v_p, 'Luis', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, true, false);
  perform importacion_baske.asiste(v_p, 'Raúl', false, true, false);
  v_p := importacion_baske.pachanga(date '2025-10-14', 0, null, 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, true, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, true, false);
  perform importacion_baske.asiste(v_p, 'Jeison', true, true, false);
  perform importacion_baske.asiste(v_p, 'Raúl', false, true, false);
  perform importacion_baske.asiste(v_p, 'Borja', false, true, false);
  v_p := importacion_baske.pachanga(date '2025-10-21', 0, null, 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, true, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, true, false);
  perform importacion_baske.asiste(v_p, 'Jorge', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, true, false);
  perform importacion_baske.asiste(v_p, 'Raúl', false, true, false);
  v_p := importacion_baske.pachanga(date '2025-10-28', 0, null, 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Dani V', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Jorge', true, false, false);
  perform importacion_baske.asiste(v_p, 'Juan (Jugoma)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, true, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  v_p := importacion_baske.pachanga(date '2025-11-04', 0, null, 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Dani V', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, true, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Jorge', true, false, false);
  perform importacion_baske.asiste(v_p, 'Luis', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, true, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  v_p := importacion_baske.pachanga(date '2025-11-11', 0, null, 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Alex', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, true, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, true, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Juanpri', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, true, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, true, false);
  v_p := importacion_baske.pachanga(date '2025-11-18', 0, null, 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Alex', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Jorge', true, true, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, true, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  perform importacion_baske.asiste(v_p, 'Raúl', false, true, false);
  perform importacion_baske.asiste(v_p, 'Borja', false, true, false);
  v_p := importacion_baske.pachanga(date '2025-11-25', 0, null, 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, true, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Jorge', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, true, false);
  perform importacion_baske.asiste(v_p, 'Raúl', false, true, false);
  perform importacion_baske.asiste(v_p, 'Borja', false, true, false);
  v_p := importacion_baske.pachanga(date '2025-12-02', 0, null, 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Álvaro', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Jorge', true, false, false);
  perform importacion_baske.asiste(v_p, 'Luis (primo Álvaro)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, true, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, true, false);
  v_p := importacion_baske.pachanga(date '2025-12-09', 0, null, 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, true, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, true, false);
  perform importacion_baske.asiste(v_p, 'Rodri', true, false, false);
  perform importacion_baske.asiste(v_p, 'Raúl', false, true, false);
  perform importacion_baske.asiste(v_p, 'Borja', false, true, false);
  v_p := importacion_baske.pachanga(date '2025-12-16', 0, null, 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Álvaro', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, true, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, true, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Jorge', true, false, false);
  perform importacion_baske.asiste(v_p, 'Luis (primo Álvaro)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, true, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, true, false);
  perform importacion_baske.asiste(v_p, 'Pablucho', true, true, false);
  perform importacion_baske.asiste(v_p, 'Raúl', false, true, false);
  perform importacion_baske.asiste(v_p, 'Borja', false, true, false);
  perform importacion_baske.asiste(v_p, 'Marta', false, true, false);
  v_p := importacion_baske.pachanga(date '2026-01-13', 0, null, 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, true, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, true, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Jorge', true, false, false);
  perform importacion_baske.asiste(v_p, 'Luis', true, true, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, true, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, true, false);
  perform importacion_baske.asiste(v_p, 'Julia', false, true, false);
  perform importacion_baske.asiste(v_p, 'Raúl', false, true, false);
  perform importacion_baske.asiste(v_p, 'Diego Guirao', false, true, false);
  perform importacion_baske.asiste(v_p, 'Ángel', false, true, false);
  v_p := importacion_baske.pachanga(date '2026-01-20', 0, null, 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Luis', true, false, false);
  perform importacion_baske.asiste(v_p, 'Luis (primo Álvaro)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, true, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  perform importacion_baske.asiste(v_p, 'Rodri', true, false, false);
  perform importacion_baske.asiste(v_p, 'Pablucho', true, false, false);
  perform importacion_baske.asiste(v_p, 'Borja', false, true, false);
  v_p := importacion_baske.pachanga(date '2026-02-03', 0, null, 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, true, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Jorge', true, false, false);
  perform importacion_baske.asiste(v_p, 'Luis (primo Álvaro)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, true, false);
  perform importacion_baske.asiste(v_p, 'Pablucho', true, false, false);
  v_p := importacion_baske.pachanga(date '2026-02-24', 0, null, 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Álvaro', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, true, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, true, false);
  perform importacion_baske.asiste(v_p, 'Borja', false, true, false);
  v_p := importacion_baske.pachanga(date '2026-03-03', 0, null, 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, true, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, true, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, true, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, true, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, true, false);
  perform importacion_baske.asiste(v_p, 'Jorge', true, true, false);
  perform importacion_baske.asiste(v_p, 'Juanpri', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, true, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, true, false);
  v_p := importacion_baske.pachanga(date '2026-03-10', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  v_p := importacion_baske.pachanga(date '2026-03-19', 0, null, 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, true, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, true, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, true, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  perform importacion_baske.asiste(v_p, 'Borja', false, true, false);
  v_p := importacion_baske.pachanga(date '2026-03-24', 0, null, 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Dani Fichaje', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, true, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, true, false);
  perform importacion_baske.asiste(v_p, 'Pablucho', true, true, false);
  v_p := importacion_baske.pachanga(date '2026-04-07', 0, null, 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Carlos Cipi', true, true, false);
  perform importacion_baske.asiste(v_p, 'Dani Fichaje', true, true, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, true, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, true, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Miguel (La Garza)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, true, false);
  perform importacion_baske.asiste(v_p, 'Pablucho', true, false, false);
  perform importacion_baske.asiste(v_p, 'Borja', false, true, false);
  perform importacion_baske.asiste(v_p, 'Sari', false, true, false);
  perform importacion_baske.asiste(v_p, 'Julia', false, true, false);
  perform importacion_baske.asiste(v_p, 'Adriana', false, true, false);
  v_p := importacion_baske.pachanga(date '2026-04-14', 0, null, 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Dani Fichaje', true, true, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Joan', true, false, false);
  perform importacion_baske.asiste(v_p, 'Jorge', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  perform importacion_baske.asiste(v_p, 'Borja', false, true, false);
  perform importacion_baske.asiste(v_p, 'Raúl', false, true, false);
  v_p := importacion_baske.pachanga(date '2026-04-21', 0, null, 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Álvaro', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Dani Fichaje', true, true, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, true, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Joan', true, false, false);
  perform importacion_baske.asiste(v_p, 'Luis (primo Álvaro)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Borja', false, true, false);
  v_p := importacion_baske.pachanga(date '2026-04-28', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Luis (primo Álvaro)', true, false, false);
  v_p := importacion_baske.pachanga(date '2026-05-07', 0, null, 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Dani Fichaje', true, true, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Juan (Jugoma)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Luis (primo Álvaro)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, true, false);
  perform importacion_baske.asiste(v_p, 'Borja', false, true, false);
  v_p := importacion_baske.pachanga(date '2026-05-12', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, false);
  perform importacion_baske.asiste(v_p, 'Carlos Cipi', true, false, false);
  perform importacion_baske.asiste(v_p, 'Dani Fichaje', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Joan', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  v_p := importacion_baske.pachanga(date '2026-05-19', 0, null, 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Dani Fichaje', true, true, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, true, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Joan', true, false, false);
  perform importacion_baske.asiste(v_p, 'Jorge', true, false, false);
  perform importacion_baske.asiste(v_p, 'Luis (primo Álvaro)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, true, false);
  perform importacion_baske.asiste(v_p, 'Miguel (amigo Joan)', true, false, false);
  v_p := importacion_baske.pachanga(date '2026-05-26', 0, null, 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, true, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Dani Fichaje', true, true, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, true, false);
  perform importacion_baske.asiste(v_p, 'Joni IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Borja', false, true, false);
  perform importacion_baske.asiste(v_p, 'Valva', false, true, false);
  v_p := importacion_baske.pachanga(date '2026-06-02', 0, null, 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Carlos Cipi', true, false, false);
  perform importacion_baske.asiste(v_p, 'Dani Fichaje', true, true, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, true, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Marcos', true, true, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, true, false);
  v_p := importacion_baske.pachanga(date '2026-06-09', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Juan (Jugoma)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  v_p := importacion_baske.pachanga(date '2026-06-16', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Dani Fichaje', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Luis (primo Álvaro)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Marcos', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  perform importacion_baske.asiste(v_p, 'Rodri', true, false, false);
  v_p := importacion_baske.pachanga(date '2026-06-23', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, false);
  perform importacion_baske.asiste(v_p, 'Carlos Cipi', true, false, false);
  perform importacion_baske.asiste(v_p, 'Dani Fichaje', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Jorge', true, false, false);
  perform importacion_baske.asiste(v_p, 'Juan (Jugoma)', true, false, false);
  perform importacion_baske.asiste(v_p, 'Marcos', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  perform importacion_baske.asiste(v_p, 'Rodri', true, false, false);
  v_p := importacion_baske.pachanga(date '2026-06-30', 0, null, 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, false);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, false);
  perform importacion_baske.asiste(v_p, 'Carlos Cipi', true, false, false);
  perform importacion_baske.asiste(v_p, 'Dani Fichaje', true, false, false);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, false);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, false);
  perform importacion_baske.asiste(v_p, 'Marcos', true, false, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, false);
  perform importacion_baske.asiste(v_p, 'Rodri', true, false, false);

  -- ----- TEMPORADA 26/27 -----
  v_p := importacion_baske.pachanga(date '2026-09-01', null, v_r[1], 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, true);
  perform importacion_baske.asiste(v_p, 'Álvaro', true, false, true);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, true);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, true);
  perform importacion_baske.asiste(v_p, 'Borja', false, true, false);
  perform importacion_baske.asiste(v_p, 'Edu M', true, true, true);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, true);
  perform importacion_baske.asiste(v_p, 'Gonzalo', true, false, true);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, true);
  perform importacion_baske.asiste(v_p, 'Jorge Gigachad', true, true, true);
  perform importacion_baske.asiste(v_p, 'Nico', true, true, true);
  perform importacion_baske.asiste(v_p, 'Amigo Álvaro', true, false, true);
  perform importacion_baske.asiste(v_p, 'Adriana', false, true, false);
  v_p := importacion_baske.pachanga(date '2026-09-08', null, v_r[1], 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, true);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, true, true);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, true);
  perform importacion_baske.asiste(v_p, 'Dani Fichaje', true, true, true);
  perform importacion_baske.asiste(v_p, 'Edu M', true, true, true);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, true);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, true);
  perform importacion_baske.asiste(v_p, 'Jorge Gigachad', true, true, true);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, true);
  perform importacion_baske.asiste(v_p, 'Marcos', true, true, true);
  v_p := importacion_baske.pachanga(date '2026-09-22', null, v_r[1], 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, true);
  perform importacion_baske.asiste(v_p, 'Álvaro', true, false, true);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, true);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, true);
  perform importacion_baske.asiste(v_p, 'Dani Fichaje', true, false, true);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, true);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, true);
  perform importacion_baske.asiste(v_p, 'Gonzalo', true, false, true);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, true);
  perform importacion_baske.asiste(v_p, 'Jorge', true, false, true);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, true);
  perform importacion_baske.asiste(v_p, 'Marcos', true, false, true);
  v_p := importacion_baske.pachanga(date '2026-09-29', null, v_r[1], 'media', false);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, true);
  perform importacion_baske.asiste(v_p, 'Álvaro', true, false, true);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, true);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, true);
  perform importacion_baske.asiste(v_p, 'Dani Fichaje', true, false, true);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, true);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, true);
  perform importacion_baske.asiste(v_p, 'Gonzalo', true, false, true);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, true);
  perform importacion_baske.asiste(v_p, 'Jorge', true, false, true);
  perform importacion_baske.asiste(v_p, 'Jorge Gigachad', true, false, true);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, true);
  v_p := importacion_baske.pachanga(date '2026-10-06', null, v_r[1], 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, true);
  perform importacion_baske.asiste(v_p, 'Álvaro', true, false, true);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, true, true);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, true);
  perform importacion_baske.asiste(v_p, 'Bochi', false, true, false);
  perform importacion_baske.asiste(v_p, 'Dani Fichaje', true, true, true);
  perform importacion_baske.asiste(v_p, 'Edu M', true, true, true);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, true);
  perform importacion_baske.asiste(v_p, 'Gonzalo', true, false, true);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, true);
  perform importacion_baske.asiste(v_p, 'Raúl', false, true, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, false, true);
  v_p := importacion_baske.pachanga(date '2026-10-13', null, v_r[1], 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, true);
  perform importacion_baske.asiste(v_p, 'Álvaro', true, false, true);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, true, true);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, true);
  perform importacion_baske.asiste(v_p, 'Borja', false, true, false);
  perform importacion_baske.asiste(v_p, 'Dani Fichaje', true, true, true);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, true);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, true);
  perform importacion_baske.asiste(v_p, 'Gonzalo', true, false, true);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, true);
  perform importacion_baske.asiste(v_p, 'Jorge Gigachad', true, true, true);
  perform importacion_baske.asiste(v_p, 'Juanpri', false, true, false);
  perform importacion_baske.asiste(v_p, 'Nico', true, true, true);
  v_p := importacion_baske.pachanga(date '2026-10-27', null, v_r[1], 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, true, true);
  perform importacion_baske.asiste(v_p, 'Álvaro', true, false, true);
  perform importacion_baske.asiste(v_p, 'Antonio Gigachad', true, false, true);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, true);
  perform importacion_baske.asiste(v_p, 'Dani Fichaje', true, true, true);
  perform importacion_baske.asiste(v_p, 'Edu M', true, true, true);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, true);
  perform importacion_baske.asiste(v_p, 'Gonzalo', true, false, true);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, true);
  perform importacion_baske.asiste(v_p, 'Jorge Gigachad', true, false, true);
  perform importacion_baske.asiste(v_p, 'Nico', true, true, true);
  perform importacion_baske.asiste(v_p, 'Óscar (amigo Edu)', true, false, true);
  v_p := importacion_baske.pachanga(date '2026-11-03', null, v_r[2], 'media', true);
  perform importacion_baske.asiste(v_p, 'Fran', true, false, true);
  perform importacion_baske.asiste(v_p, 'Álvaro', true, false, true);
  perform importacion_baske.asiste(v_p, 'Antonio IH', true, false, true);
  perform importacion_baske.asiste(v_p, 'Bochi', false, true, false);
  perform importacion_baske.asiste(v_p, 'Dani Fichaje', true, false, true);
  perform importacion_baske.asiste(v_p, 'Edu M', true, false, true);
  perform importacion_baske.asiste(v_p, 'Edu OTR', true, false, true);
  perform importacion_baske.asiste(v_p, 'Gonzalo', true, false, true);
  perform importacion_baske.asiste(v_p, 'Guzmán', true, false, true);
  perform importacion_baske.asiste(v_p, 'Jorge Gigachad', true, false, true);
  perform importacion_baske.asiste(v_p, 'Óscar (amigo Edu)', true, false, true);
  v_p := importacion_baske.pachanga(date '2026-11-10', null, v_r[2], 'media', false);  -- futura
  v_p := importacion_baske.pachanga(date '2026-11-17', null, v_r[2], 'media', false);  -- futura
  v_p := importacion_baske.pachanga(date '2026-11-24', null, v_r[2], 'media', false);  -- futura
  v_p := importacion_baske.pachanga(date '2026-12-01', null, v_r[2], 'media', false);  -- futura
  v_p := importacion_baske.pachanga(date '2026-12-15', null, v_r[2], 'media', false);  -- futura
  v_p := importacion_baske.pachanga(date '2026-12-22', null, v_r[2], 'media', false);  -- futura
end $$;

select tabla, count(*) from importacion_baske.filas group by tabla order by tabla;

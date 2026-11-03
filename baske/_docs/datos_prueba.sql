-- =====================================================================
-- FRAN-BASKET - datos de prueba
--
-- Ejecutar en el SQL Editor DESPUES de migracion_01.sql y migracion_02.sql. Crea miembros,
-- invitados, reservas, pachangas (temporadas 2025-26 y 2026-27 hasta hoy,
-- mas una futura), asistencias, votos, equipos, entrenamientos, pagos,
-- gastos, junta, premios, apodos y habilidades.
--
-- Cada fila creada se apunta en prueba_baske.filas (esquema NO expuesto a
-- la API), y borrar_datos_prueba.sql borra exactamente esas filas.
--
-- Los miembros ya existentes (p. ej. el admin) reciben fila en "jugador"
-- si no la tenian (no se borra al limpiar: hace falta igualmente), se
-- apuntan a la reserva 2026-27 sin pagar y juegan las pachangas de esa
-- temporada, incluida la de hoy, para poder probar la votacion.
-- =====================================================================

create schema if not exists prueba_baske;
create table if not exists prueba_baske.filas (tabla text not null, id bigint not null);
revoke all on schema prueba_baske from anon, authenticated;

do $$
declare
  -- 1-14 jugadores activos (13 y 14 novatos 2026), 15 ex-miembro (baja),
  -- 16 y 18 staff (jugaron en 2025-26 y ya no), 17 aficionada (nunca juega)
  v_nombres   text[] := array['Pablo','Diego','Javier','Álvaro','Sergio','Marcos','Iván','Rubén','Hugo',
                              'Adrián','Mario','Daniel','Óscar','Lucas','Tomás','Laura','Marta','Elena'];
  v_apellidos text[] := array['Arroyo','Benítez','Castro','Domínguez','Esteban','Fernández','Gil','Herrera',
                              'Iglesias','Jiménez','López','Molina','Navarro','Ortega','Sanz','Pérez','Quintana','Ruiz'];
  -- Dorsales en texto: '7' y '07' son números distintos
  v_azul      text[] := array['4', '7', '10', '11', '13', '23', '0', '07', '8', '14', '21', '33', '44', '99', '12', null, null, null];
  v_negro     text[] := array['04', '8', '9', null, '13', '23', '1', '6', null, '15', '22', '32', null, '77', '12', null, null, null];
  v_ingreso   date[] := array['2021-09-15','2021-09-15','2021-09-15','2021-09-15','2022-01-10','2022-03-02',
                              '2022-10-05','2023-01-20','2023-09-12','2024-02-01','2024-09-17','2025-01-14',
                              '2026-09-08','2026-09-15','2022-01-10','2023-02-01','2024-05-01','2022-09-01'];
  m      bigint[] := '{}';   -- ids de miembro (posicion = numero de arriba)
  j      bigint[] := '{}';   -- ids de jugador (misma posicion)
  inv_j  bigint[] := '{}';   -- jugadores invitados
  reales bigint[] := '{}';   -- jugadores de miembros que ya existian

  usados_azul  text[];
  usados_negro text[];
  v_az text; v_ng text;
  v_tipo equipo.tipo_miembro;
  v_id bigint; v_j bigint; v_r1 bigint; v_r2 bigint; v_p bigint; v_e1 bigint; v_e2 bigint;
  v_fecha date; v_cervezas boolean; v_juega boolean; v_cerveza boolean;
  v_temporada int; i int; k int;
  v_miem bigint[]; v_todos bigint[]; v_tops bigint[]; v_votante bigint; v_fraude bigint;
  v_txt text;
  v_real_miembro bigint;
begin
  if exists (select 1 from prueba_baske.filas) then
    raise exception 'Ya hay datos de prueba: ejecuta borrar_datos_prueba.sql primero';
  end if;

  perform setseed(0.42);

  -- ----- MIEMBROS -----
  select coalesce(array_agg(dorsal_azul), '{}')  into usados_azul  from equipo.miembro where activo and dorsal_azul  is not null;
  select coalesce(array_agg(dorsal_negro), '{}') into usados_negro from equipo.miembro where activo and dorsal_negro is not null;

  for i in 1..18 loop
    v_tipo := case when i <= 15 then 'jugador' when i in (16, 18) then 'staff' else 'aficionado' end;

    v_az := v_azul[i];
    if v_az is not null then
      while v_az = any(usados_azul) loop v_az := ((v_az::int + 1) % 100)::text; end loop;
      usados_azul := usados_azul || v_az;
    end if;
    v_ng := v_negro[i];
    if v_ng is not null then
      while v_ng = any(usados_negro) loop v_ng := ((v_ng::int + 1) % 100)::text; end loop;
      usados_negro := usados_negro || v_ng;
    end if;

    insert into equipo.miembro (nombre, apellido, dorsal_azul, dorsal_negro, fecha_ingreso, fecha_baja,
                                n_socio, tipo_miembro, activo, descripcion, origen)
    values (v_nombres[i], v_apellidos[i], v_az, v_ng, v_ingreso[i],
            case when i = 15 then date '2026-06-30' end,
            case when i = 15 then null else 900 + i end,
            v_tipo, i <> 15,
            format('%s es un miembro de prueba de FRAN-BASKET. Lorem ipsum dolor sit amet, consectetur adipiscing elit.', v_nombres[i]),
            (case when i <= 4 then 'fundador' when i % 2 = 0 then 'traido' else 'aparecido' end)::equipo.origen_miembro)
    returning id into v_id;
    m := m || v_id;
    insert into prueba_baske.filas values ('miembro', v_id);

    insert into equipo.jugador (id_miembro) values (v_id) returning id into v_j;
    j := j || v_j;
    insert into prueba_baske.filas values ('jugador', v_j);
  end loop;

  for i in 5..18 loop
    if i % 2 = 0 then
      update equipo.miembro set id_padrino = m[((i - 5) % 4) + 1] where id = m[i];
    end if;
  end loop;

  -- Miembros que ya existian: jugador si no lo tienen
  for v_id in select mi.id from equipo.miembro mi where not (mi.id = any(m)) and mi.fecha_baja is null loop
    select id into v_j from equipo.jugador where id_miembro = v_id;
    if v_j is null then
      insert into equipo.jugador (id_miembro) values (v_id) returning id into v_j;
    end if;
    reales := reales || v_j;
    v_real_miembro := coalesce(v_real_miembro, v_id);
  end loop;

  -- ----- INVITADOS -----
  foreach v_txt in array array['Carlos (invitado)', 'Nacho (invitado)', 'Rafa (invitado)'] loop
    insert into equipo.invitado (nombre, id_padrino) values (v_txt, m[1 + coalesce(array_length(inv_j, 1), 0)]) returning id into v_id;
    insert into prueba_baske.filas values ('invitado', v_id);
    insert into equipo.jugador (id_invitado) values (v_id) returning id into v_j;
    inv_j := inv_j || v_j;
    insert into prueba_baske.filas values ('jugador', v_j);
  end loop;

  -- ----- RESERVAS -----
  insert into equipo.reserva_periodica (fecha_inicio, fecha_fin, precio_unitario, coste_reserva)
  values ('2025-09-02', '2026-06-30', 4, 1200) returning id into v_r1;
  insert into prueba_baske.filas values ('reserva_periodica', v_r1);
  insert into equipo.reserva_periodica (fecha_inicio, fecha_fin, precio_unitario, coste_reserva)
  values ('2026-09-01', '2027-06-29', 4, 1300) returning id into v_r2;
  insert into prueba_baske.filas values ('reserva_periodica', v_r2);

  for i in 1..18 loop
    if i <= 12 or i in (15, 18) then
      insert into equipo.reserva_jugador (id_reserva, id_jugador, pagado, fecha_pago)
      values (v_r1, j[i], i <> 5, case when i <> 5 then timestamptz '2025-10-01 12:00+02' end);
    end if;
    if i <= 14 then
      insert into equipo.reserva_jugador (id_reserva, id_jugador, pagado, fecha_pago)
      values (v_r2, j[i], i not in (3, 8, 12), case when i not in (3, 8, 12) then timestamptz '2026-09-20 12:00+02' end);
    end if;
  end loop;
  if array_length(reales, 1) > 0 then
    foreach v_j in array reales loop
      insert into equipo.reserva_jugador (id_reserva, id_jugador, pagado) values (v_r2, v_j, false)
      on conflict do nothing;
    end loop;
  end if;

  -- ----- PACHANGAS Y ASISTENCIA -----
  for v_fecha, v_temporada, v_id in
      select d::date, 1, v_r1 from generate_series(date '2025-09-02', date '2026-06-30', interval '7 day') d
      union all
      select d::date, 2, v_r2 from generate_series(date '2026-09-01', current_date + 7, interval '7 day') d
      union all
      select d, 1, null from unnest(array[date '2026-07-07', date '2026-07-21']) d
      order by 1
  loop
    v_cervezas := extract(week from v_fecha)::int % 3 = 0 or v_fecha = current_date or v_fecha = date '2026-07-21';

    insert into equipo.pachanga (id_reserva, fecha, precio, cervezas)
    values (v_id, v_fecha, case when v_id is null then 5 end, v_cervezas)
    returning id into v_p;
    insert into prueba_baske.filas values ('pachanga', v_p);

    continue when v_fecha > current_date;

    for i in 1..18 loop
      v_juega := false;
      if i <= 16 or i = 18 then
        if (v_temporada = 1 and (i <= 12 or i in (15, 16, 18))) or (v_temporada = 2 and i <= 14) then
          v_juega := random() < 0.4 + (i % 5) * 0.12;
        end if;
      end if;
      v_cerveza := v_cervezas and random() < 0.55;

      if v_juega then
        insert into equipo.pachanga_jugador (id_pachanga, id_jugador, jugado, cerveza, pagado)
        values (v_p, j[i], true, v_cerveza, case when v_id is null then not (i = 5 or random() < 0.1) end);
      elsif v_cerveza and (i = 17 or (i in (16, 18) and v_temporada = 2)) and random() < 0.6 then
        insert into equipo.pachanga_jugador (id_pachanga, id_jugador, jugado, cerveza, pagado)
        values (v_p, j[i], false, true, case when v_id is null then true end);
      end if;
    end loop;

    if v_temporada = 2 and array_length(reales, 1) > 0 then
      foreach v_j in array reales loop
        if v_fecha = current_date or random() < 0.75 then
          insert into equipo.pachanga_jugador (id_pachanga, id_jugador, jugado, cerveza)
          values (v_p, v_j, true, v_cervezas and random() < 0.5);
        end if;
      end loop;
    end if;

    foreach v_j in array inv_j loop
      if random() < 0.12 then
        insert into equipo.pachanga_jugador (id_pachanga, id_jugador, jugado, cerveza, pagado)
        values (v_p, v_j, true, false, case when v_id is null then true end);
      end if;
    end loop;
  end loop;

  -- ----- EQUIPOS (las 3 ultimas pachangas ya jugadas, sin contar hoy) -----
  for v_p in
    select p.id from equipo.pachanga p
    join prueba_baske.filas f on f.tabla = 'pachanga' and f.id = p.id
    where p.fecha < current_date order by p.fecha desc limit 3
  loop
    insert into equipo.equipo (id_pachanga, nombre, partidos_ganados) values (v_p, 'Azul', floor(random() * 5)::int) returning id into v_e1;
    insert into equipo.equipo (id_pachanga, nombre, partidos_ganados) values (v_p, 'Negro', floor(random() * 5)::int) returning id into v_e2;
    k := 0;
    for v_j in select id_jugador from equipo.pachanga_jugador where id_pachanga = v_p and jugado order by random() loop
      insert into equipo.jugador_equipo (id_equipo, id_pachanga, id_jugador)
      values (case when k % 2 = 0 then v_e1 else v_e2 end, v_p, v_j);
      k := k + 1;
    end loop;
  end loop;

  -- ----- VOTOS (todas las pachangas pasadas menos la de hoy) -----
  alter table equipo.top_pachanga disable trigger trg_top_pachanga_check;

  for v_p in
    select p.id from equipo.pachanga p
    join prueba_baske.filas f on f.tabla = 'pachanga' and f.id = p.id
    where p.fecha < current_date
  loop
    select array_agg(pj.id_jugador) into v_miem
    from equipo.pachanga_jugador pj
    join equipo.jugador jj on jj.id = pj.id_jugador
    where pj.id_pachanga = v_p and pj.jugado and jj.id_miembro is not null;

    continue when coalesce(array_length(v_miem, 1), 0) < 4;

    foreach v_votante in array v_miem loop
      continue when random() > 0.7;
      select (array_agg(x order by random() * (1 + (x % 4)) desc))[1:3] into v_tops
      from unnest(v_miem) x where x <> v_votante;
      v_fraude := v_miem[1 + floor(random() * array_length(v_miem, 1))::int];
      insert into equipo.top_pachanga (id_pachanga, id_jugador, top_1, top_2, top_3, fraude)
      values (v_p, v_votante, v_tops[1], v_tops[2], v_tops[3], v_fraude);
    end loop;
  end loop;

  alter table equipo.top_pachanga enable trigger trg_top_pachanga_check;

  -- ----- ENTRENAMIENTOS -----
  foreach v_fecha in array array[date '2026-10-08', date '2026-10-22'] loop
    insert into equipo.entrenamiento (fecha, precio) values (v_fecha, 3) returning id into v_id;
    insert into prueba_baske.filas values ('entrenamiento', v_id);
    for i in 1..10 loop
      if i = 2 or random() < 0.5 then
        insert into equipo.entrenamiento_jugador (id_entrenamiento, id_jugador, asistido, pagado)
        values (v_id, j[i], true, i <> 2);
      end if;
    end loop;
  end loop;

  -- ----- GASTOS -----
  insert into equipo.gasto (compra, precio, cantidad, fecha, id_reserva) values ('Alquiler pista temporada 2025-26', 1200, 1, '2025-09-01', v_r1) returning id into v_id;
  insert into prueba_baske.filas values ('gasto', v_id);
  insert into equipo.gasto (compra, precio, cantidad, fecha, id_reserva) values ('Alquiler pista temporada 2026-27', 1300, 1, '2026-09-01', v_r2) returning id into v_id;
  insert into prueba_baske.filas values ('gasto', v_id);
  insert into equipo.gasto (compra, precio, cantidad, fecha, id_pachanga)
  select 'Pista suelta julio', 60, 1, '2026-07-07', p.id from equipo.pachanga p
  join prueba_baske.filas f on f.tabla = 'pachanga' and f.id = p.id where p.fecha = '2026-07-07'
  returning id into v_id;
  insert into prueba_baske.filas values ('gasto', v_id);
  insert into equipo.gasto (compra, precio, cantidad, fecha) values ('Balones', 105, 3, '2025-10-14') returning id into v_id;
  insert into prueba_baske.filas values ('gasto', v_id);
  insert into equipo.gasto (compra, precio, cantidad, fecha) values ('Equipaciones', 450, 20, '2026-09-25') returning id into v_id;
  insert into prueba_baske.filas values ('gasto', v_id);
  insert into equipo.gasto (compra, precio, cantidad, fecha) values ('Botiquín', 35, 1, '2026-10-02') returning id into v_id;
  insert into prueba_baske.filas values ('gasto', v_id);

  -- ----- JUNTA (solo si no hay junta real) -----
  if not exists (select 1 from equipo.junta_directiva) then
    for v_txt, i, v_fecha, v_az in
      select * from (values
        ('lider_supremo',    1, date '2025-09-01', 0),
        ('maestro_balon',    2, date '2025-09-01', 1),
        ('maestro_balon',    6, date '2026-09-01', 0),
        ('maestro_gritos',   3, date '2025-09-01', 0),
        ('mano_lider',       4, date '2025-09-01', 0),
        ('maestro_maestros', 5, date '2025-09-01', 1),
        ('maestro_maestros', 7, date '2026-09-01', 0),
        ('tesorero',         4, date '2025-09-01', 0)
      ) t (cargo, idx, inicio, termina)
    loop
      insert into equipo.junta_directiva (id_miembro, id_cargo, fecha_inicio, fecha_fin)
      select m[i], c.id, v_fecha, case when v_az = 1 then date '2026-08-31' end
      from equipo.cargo c where c.nombre = v_txt
      returning id into v_id;
      insert into prueba_baske.filas values ('junta_directiva', v_id);
    end loop;
  end if;

  -- ----- PREMIOS -----
  foreach v_txt in array array['MVP de temporada', 'Fraude de temporada', 'MVP mes', 'Fraude mes', 'Novato del año'] loop
    v_id := null;
    insert into equipo.premio (nombre_premio) values (v_txt)
    on conflict (nombre_premio) do nothing returning id into v_id;
    if v_id is not null then
      insert into prueba_baske.filas values ('premio', v_id);
    end if;
  end loop;

  for v_txt, i, v_ng, v_az in
    select * from (values
      ('MVP de temporada',    2, 1, null), ('Fraude de temporada', 9, 1, null), ('Novato del año', 12, 1, null),
      ('MVP mes',  2, 1, 1), ('MVP mes',  6, 1, 2), ('MVP mes',  1, 1, 3), ('MVP mes', 10, 1, 4), ('MVP mes',  2, 1, 5), ('MVP mes',  3, 1, 6),
      ('Fraude mes', 9, 1, 1), ('Fraude mes', 7, 1, 2), ('Fraude mes', 12, 1, 3), ('Fraude mes', 9, 1, 4), ('Fraude mes', 4, 1, 5), ('Fraude mes', 8, 1, 6),
      ('MVP mes',  5, 2, 1), ('Fraude mes', 11, 2, 1)
    ) t (premio, idx, temp, periodo)
  loop
    v_id := null;
    insert into equipo.premio_miembro (id_premio, id_miembro, temporada, periodo)
    select p.id,
           case when v_txt = 'Fraude mes' and v_ng = 2 and v_real_miembro is not null then v_real_miembro else m[i] end,
           case when v_ng = 1 then '2025-26' else '2026-27' end, v_az
    from equipo.premio p where p.nombre_premio = v_txt
    on conflict do nothing
    returning id into v_id;
    if v_id is not null then
      insert into prueba_baske.filas values ('premio_miembro', v_id);
    end if;
  end loop;

  -- ----- APODOS Y HABILIDADES -----
  for i, v_txt in
    select * from (values (1, 'El Muro'), (2, 'Triplazo'), (3, 'Megáfono'), (6, 'Chicle'), (9, 'El Fraude'), (12, 'Pasos')) t
  loop
    insert into equipo.apodo (id_miembro, apodo, validado) values (m[i], v_txt, true) returning id into v_id;
    insert into prueba_baske.filas values ('apodo', v_id);
  end loop;
  insert into equipo.apodo (id_miembro, apodo, validado) values (m[5], 'Propuesta sin validar', false) returning id into v_id;
  insert into prueba_baske.filas values ('apodo', v_id);

  for i, v_txt in
    select * from (values (1, 'Tapón al aro'), (2, 'Triple desde el parking'), (4, 'Pase sin mirar'),
                          (7, 'Rebote ofensivo'), (10, 'Desaparecer en defensa')) t
  loop
    insert into equipo.habilidad_especial (id_miembro, habilidad, validado) values (m[i], v_txt, true) returning id into v_id;
    insert into prueba_baske.filas values ('habilidad_especial', v_id);
  end loop;
end $$;

select tabla, count(*) from prueba_baske.filas group by tabla order by tabla;

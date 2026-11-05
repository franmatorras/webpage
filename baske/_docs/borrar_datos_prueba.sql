-- =====================================================================
-- FRAN-BASKET - borrar los datos de prueba
-- Borra SOLO las filas apuntadas por datos_prueba.sql en prueba_baske.filas
-- (y lo que cuelga de ellas en cascada), y luego el esquema prueba_baske.
-- Las filas "jugador" creadas para miembros que ya existian se quedan.
-- =====================================================================

do $$
begin
  if to_regclass('prueba_baske.filas') is null then
    raise notice 'No hay datos de prueba que borrar';
    return;
  end if;

  -- Cobros de la gente de prueba (antes que sus jugadores)
  delete from equipo.cobro
  where id in (select id from prueba_baske.filas where tabla = 'cobro')
     or id_jugador in (select id from prueba_baske.filas where tabla = 'jugador');
  delete from equipo.gasto where id in (select id from prueba_baske.filas where tabla = 'gasto');
  -- Gastos de pista creados solos (por si alguno no quedó apuntado)
  delete from equipo.gasto
  where id_reserva in (select id from prueba_baske.filas where tabla = 'reserva_periodica')
     or id_pachanga in (select id from prueba_baske.filas where tabla = 'pachanga')
     or id_entrenamiento in (select id from prueba_baske.filas where tabla = 'entrenamiento');
  delete from equipo.entrenamiento where id in (select id from prueba_baske.filas where tabla = 'entrenamiento');
  delete from equipo.premio_miembro where id in (select id from prueba_baske.filas where tabla = 'premio_miembro');
  delete from equipo.premio p
  where p.id in (select id from prueba_baske.filas where tabla = 'premio')
    and not exists (select 1 from equipo.premio_miembro pm where pm.id_premio = p.id);
  delete from equipo.apodo where id in (select id from prueba_baske.filas where tabla = 'apodo');
  delete from equipo.habilidad_especial where id in (select id from prueba_baske.filas where tabla = 'habilidad_especial');
  delete from equipo.junta_directiva where id in (select id from prueba_baske.filas where tabla = 'junta_directiva');

  -- Votos antes que asistencias: top_1/2/3/fraude no borran en cascada
  delete from equipo.top_pachanga where id_pachanga in (select id from prueba_baske.filas where tabla = 'pachanga');
  delete from equipo.pachanga where id in (select id from prueba_baske.filas where tabla = 'pachanga');
  delete from equipo.reserva_periodica where id in (select id from prueba_baske.filas where tabla = 'reserva_periodica');

  delete from equipo.jugador where id in (select id from prueba_baske.filas where tabla = 'jugador');
  delete from equipo.invitado where id in (select id from prueba_baske.filas where tabla = 'invitado');
  delete from equipo.miembro where id in (select id from prueba_baske.filas where tabla = 'miembro');
end $$;

drop schema if exists prueba_baske cascade;

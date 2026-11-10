-- =====================================================================
-- FRAN-BASKET - deshacer la importación de Pachangas.xlsx
-- Borra SOLO las filas apuntadas por importacion_excel.sql en
-- importacion_baske.filas (y lo que cuelga de ellas en cascada), y luego el
-- esquema importacion_baske.
--
-- Pensado para usarlo poco después de importar. OJO: también borra lo que se
-- haya añadido desde la web a esas filas (votos o asistencias en las
-- pachangas importadas, cobros a los miembros/invitados creados...).
-- Los miembros que ya existían antes de importar se quedan (y su fila
-- "jugador", si ya la tenían).
-- =====================================================================

do $$
begin
  if to_regclass('importacion_baske.filas') is null then
    raise notice 'No hay importación que borrar';
    return;
  end if;

  -- Cobros de la gente creada (antes que sus jugadores)
  delete from equipo.cobro
  where id_jugador in (select id from importacion_baske.filas where tabla = 'jugador');

  -- Gastos apuntados y los de pista que cuelgan de lo importado
  delete from equipo.gasto
  where id in (select id from importacion_baske.filas where tabla = 'gasto')
     or id_reserva in (select id from importacion_baske.filas where tabla = 'reserva_periodica')
     or id_pachanga in (select id from importacion_baske.filas where tabla = 'pachanga')
     or id_entrenamiento in (select id from importacion_baske.filas where tabla = 'entrenamiento');

  delete from equipo.entrenamiento where id in (select id from importacion_baske.filas where tabla = 'entrenamiento');

  -- Votos antes que asistencias: top_1/2/3/fraude no borran en cascada
  delete from equipo.top_pachanga where id_pachanga in (select id from importacion_baske.filas where tabla = 'pachanga');
  delete from equipo.pachanga where id in (select id from importacion_baske.filas where tabla = 'pachanga');
  delete from equipo.reserva_periodica where id in (select id from importacion_baske.filas where tabla = 'reserva_periodica');

  delete from equipo.jugador where id in (select id from importacion_baske.filas where tabla = 'jugador');
  delete from equipo.invitado where id in (select id from importacion_baske.filas where tabla = 'invitado');
  delete from equipo.miembro where id in (select id from importacion_baske.filas where tabla = 'miembro');
end $$;

drop schema if exists importacion_baske cascade;

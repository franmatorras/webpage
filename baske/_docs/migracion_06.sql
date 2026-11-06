-- =====================================================================
-- FRAN-BASKET · migración 06 · Nº de socio al entrar
-- Ejecutar una vez en el editor SQL de Supabase, después de la 05.
-- Se puede volver a ejecutar sin problema.
--
-- Hasta ahora el número se daba solo al crear la primera contraseña. Ahora,
-- cada vez que un miembro con sesión abre la web, si está activo (sin baja)
-- y no tiene número, recibe el libre más bajo.
-- =====================================================================

set search_path = equipo;

-- Asignación sin comprobar permisos (solo la usan las funciones de abajo)
create or replace function asignar_n_socio_interno(p_miembro bigint) returns integer
language plpgsql security definer set search_path = equipo as $$
declare
  v_actual integer;
  v_baja date;
begin
  -- Un número cada vez, aunque dos personas entren a la vez
  perform pg_advisory_xact_lock(hashtext('equipo.n_socio'));

  select n_socio, fecha_baja into v_actual, v_baja from miembro where id = p_miembro for update;
  if not found or v_baja is not null then return null; end if;
  if v_actual is not null then return v_actual; end if;

  v_actual := siguiente_n_socio();
  update miembro set n_socio = v_actual where id = p_miembro;
  return v_actual;
end $$;
revoke all on function asignar_n_socio_interno(bigint) from public, anon, authenticated;

-- Admins (desde Admin → Miembros) y primera_password (sin sesión)
create or replace function asignar_n_socio(p_miembro bigint) returns integer
language plpgsql security definer set search_path = equipo as $$
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'Solo los administradores pueden asignar números de socio';
  end if;
  return asignar_n_socio_interno(p_miembro);
end $$;

-- Cada miembro, para sí mismo, al entrar en la web
create or replace function asegurar_mi_n_socio() returns integer
language plpgsql security definer set search_path = equipo as $$
declare
  v_miembro bigint;
begin
  select id into v_miembro from miembro where id_usuario = auth.uid();
  if v_miembro is null then return null; end if;
  return asignar_n_socio_interno(v_miembro);
end $$;
revoke all on function asegurar_mi_n_socio() from public, anon;
grant execute on function asegurar_mi_n_socio() to authenticated;

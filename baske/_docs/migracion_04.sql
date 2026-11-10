-- =====================================================================
-- FRAN-BASKET · migración 04 · Números de socio automáticos
-- Ejecutar una vez en el editor SQL de Supabase, después de la 03.
-- Se puede volver a ejecutar sin problema.
--
--  * Al entrar por primera vez (crear su contraseña), el miembro recibe el
--    número de socio libre más bajo, si no tenía uno.
--  * Cuando alguien pierde su número (baja o borrado), los números mayores
--    bajan uno para que no queden huecos.
--  * Los admins pueden asignar el siguiente número a mano con asignar_n_socio().
-- =====================================================================

set search_path = equipo;

-- Número libre más bajo (empezando en 1)
create or replace function siguiente_n_socio() returns integer
language sql stable security definer set search_path = equipo as $$
  select min(n) from generate_series(1, coalesce((select max(n_socio) from miembro), 0) + 1) n
  where not exists (select 1 from miembro where n_socio = n);
$$;

-- Asigna número a un miembro si no tiene y no está de baja. Devuelve su número.
-- Uso interno (primera contraseña) y para admins desde la web.
create or replace function asignar_n_socio(p_miembro bigint) returns integer
language plpgsql security definer set search_path = equipo as $$
declare
  v_actual integer;
  v_baja date;
begin
  -- Desde la web solo admins (primera_password llama sin sesión: auth.uid() es null)
  if auth.uid() is not null and not is_admin() then
    raise exception 'Solo los administradores pueden asignar números de socio';
  end if;

  -- Un número cada vez, aunque dos personas entren a la vez
  perform pg_advisory_xact_lock(hashtext('equipo.n_socio'));

  select n_socio, fecha_baja into v_actual, v_baja from miembro where id = p_miembro for update;
  if not found or v_baja is not null then return null; end if;
  if v_actual is not null then return v_actual; end if;

  v_actual := siguiente_n_socio();
  update miembro set n_socio = v_actual where id = p_miembro;
  return v_actual;
end $$;

revoke all on function siguiente_n_socio() from public;
revoke all on function asignar_n_socio(bigint) from public;
grant execute on function siguiente_n_socio() to authenticated;
grant execute on function asignar_n_socio(bigint) to authenticated;

-- Primera contraseña: igual que antes + número de socio
create or replace function equipo.primera_password(p_usuario text, p_password text)
returns void
language plpgsql security definer
set search_path = equipo, extensions as $$
declare
  v_id uuid;
  v_miembro bigint;
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

  select id into v_miembro from equipo.miembro where id_usuario = v_id;
  if v_miembro is not null then
    perform equipo.asignar_n_socio(v_miembro);
  end if;
end $$;

-- Al perder un número (baja, se lo quitan o se borra el miembro), los mayores bajan uno
create or replace function compactar_n_socio() returns trigger
language plpgsql security definer set search_path = equipo as $$
begin
  perform pg_advisory_xact_lock(hashtext('equipo.n_socio'));
  update miembro set n_socio = n_socio - 1 where n_socio > old.n_socio;
  return null;
end $$;

drop trigger if exists trg_miembro_compactar_n_socio on miembro;
create trigger trg_miembro_compactar_n_socio
  after update of n_socio on miembro
  for each row when (old.n_socio is not null and new.n_socio is null)
  execute function compactar_n_socio();

drop trigger if exists trg_miembro_compactar_n_socio_borrado on miembro;
create trigger trg_miembro_compactar_n_socio_borrado
  after delete on miembro
  for each row when (old.n_socio is not null)
  execute function compactar_n_socio();

-- La baja quita el número sola (antes lo tenía que vaciar el formulario)
create or replace function baja_quita_n_socio() returns trigger
language plpgsql set search_path = equipo as $$
begin
  if new.fecha_baja is not null then new.n_socio := null; end if;
  return new;
end $$;

drop trigger if exists trg_miembro_baja_n_socio on miembro;
create trigger trg_miembro_baja_n_socio
  before insert or update of fecha_baja, n_socio on miembro
  for each row execute function baja_quita_n_socio();

-- Puesta al día de lo que ya existe:
-- 1) cerrar huecos manteniendo el orden actual
with orden as (
  select id, row_number() over (order by n_socio, id) as nuevo
  from miembro where n_socio is not null
)
update miembro m set n_socio = o.nuevo
from orden o where o.id = m.id and m.n_socio is distinct from o.nuevo;

-- 2) quien ya entró alguna vez y no tiene número, lo recibe (por orden de registro)
do $$
declare
  r record;
begin
  for r in
    select mi.id from miembro mi
    join usuario u on u.id = mi.id_usuario
    where mi.n_socio is null and mi.fecha_baja is null and not u.debe_cambiar_password
    order by u.fecha_registro, mi.id
  loop
    perform asignar_n_socio(r.id);
  end loop;
end $$;

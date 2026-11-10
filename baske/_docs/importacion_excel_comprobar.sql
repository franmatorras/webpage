-- =====================================================================
-- FRAN-BASKET - comprobar la importación de Pachangas.xlsx (solo lectura)
-- GENERADO por importar_excel.py. Dice, para cada persona del Excel, qué
-- miembros de la base de datos encajan. "crear" = no hay ninguno y se creará;
-- más de uno = la importación se parará: pon apellido o id_miembro en PERSONAS.
-- Con usuario: si sale "crear", ese usuario no existe y la importación se parará.
-- =====================================================================
with p (clave, nombre, apellido, usuario, id_forzado) as (values
  ('Fran', 'Fran', null::text, 'fran'::text, null::bigint),
  ('Abel', 'Abel', null::text, null::text, null::bigint),
  ('Alex', 'Alex', null::text, null::text, null::bigint),
  ('Álvaro', 'Álvaro', null::text, null::text, null::bigint),
  ('Antonio Gigachad', 'Antonio Gigachad', null::text, null::text, null::bigint),
  ('Antonio IH', 'Antonio IH', null::text, 'millagi.do'::text, null::bigint),
  ('Bochi', 'Bochi', null::text, null::text, null::bigint),
  ('Borja', 'Borja', null::text, null::text, null::bigint),
  ('Bryan', 'Bryan', null::text, null::text, null::bigint),
  ('Carlos Cipi', 'Carlos Cipi', null::text, null::text, null::bigint),
  ('Cervantes', 'Cervantes', null::text, null::text, null::bigint),
  ('Dani V', 'Dani V', null::text, null::text, null::bigint),
  ('Dani Fichaje', 'Dani Fichaje', null::text, null::text, null::bigint),
  ('Edu M', 'Edu M', null::text, null::text, null::bigint),
  ('Edu OTR', 'Edu OTR', null::text, null::text, null::bigint),
  ('Elena', 'Elena', null::text, null::text, null::bigint),
  ('Gonzalo', 'Gonzalo', null::text, null::text, null::bigint),
  ('Guzmán', 'Guzmán', null::text, null::text, null::bigint),
  ('Joan', 'Joan', null::text, null::text, null::bigint),
  ('Jorge', 'Jorge', null::text, null::text, null::bigint),
  ('Jorge Gigachad', 'Jorge Gigachad', null::text, null::text, null::bigint),
  ('Juan (Jugoma)', 'Juan', null::text, null::text, null::bigint),
  ('Juanpri', 'Juanpri', null::text, null::text, null::bigint),
  ('Luis', 'Luis', null::text, null::text, null::bigint),
  ('Luis (primo Álvaro)', 'Luis (primo Álvaro)', null::text, null::text, null::bigint),
  ('Marco', 'Marco', null::text, null::text, null::bigint),
  ('Marcos', 'Marcos', null::text, null::text, null::bigint),
  ('Miguel (La Garza)', 'Miguel', null::text, null::text, null::bigint),
  ('Nico', 'Nico', null::text, null::text, null::bigint),
  ('Olaf', 'Olaf', null::text, null::text, null::bigint),
  ('Pablucho', 'Pablucho', null::text, null::text, null::bigint),
  ('Popo', 'Popo', null::text, null::text, null::bigint),
  ('Raúl', 'Raúl', null::text, 'raul.santos'::text, null::bigint),
  ('Rodri', 'Rodri', null::text, null::text, null::bigint)
)
select p.clave, coalesce('usuario ' || p.usuario, p.nombre) as busca,
       coalesce(string_agg(m.id || ': ' || m.nombre || coalesce(' ' || m.apellido, ''), ' | ' order by m.id), 'crear') as encaja
from p
left join equipo.usuario u on p.id_forzado is null and lower(u.usuario) = lower(p.usuario)
left join equipo.miembro m
  on (p.id_forzado is not null and m.id = p.id_forzado)
  or (p.id_forzado is null and p.usuario is not null and m.id_usuario = u.id)
  or (p.id_forzado is null and p.usuario is null and lower(trim(m.nombre)) = lower(trim(p.nombre))
      and (p.apellido is null or lower(trim(coalesce(m.apellido, ''))) = lower(trim(p.apellido))))
group by p.clave, p.nombre, p.usuario
order by count(m.id) desc, p.clave;

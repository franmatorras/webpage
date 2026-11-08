#!/usr/bin/env python3
# =====================================================================
# FRAN-BASKET - importar el Excel de pachangas (Pachangas.xlsx)
#
# Lee las pestañas "Cuentas 2425", "Cuentas 2526" y "Cuentas 2627" y genera:
#   importacion_excel.sql            -> se ejecuta en el SQL Editor de Supabase
#   importacion_excel_comprobar.sql  -> (opcional, solo lectura) qué miembros
#                                       de la base de datos encajan con cada persona
# Para deshacer la importación: borrar_importacion_excel.sql
#
# Uso (solo biblioteca estándar, no hace falta instalar nada):
#   python -I importar_excel.py Pachangas.xlsx
#
# Reglas:
#   * 24/25 y 25/26: solo asistencia y cervezas, sin dinero: pachangas sueltas y
#     entrenamientos a 0 €, sin pagos ni gastos (25/26 cerró a 0 y las cuentas
#     empiezan de cero en 26/27). En 24/25 solo los martes son pachanga; el resto,
#     entrenamiento.
#   * 26/27: dos reservas periódicas (sep-oct y nov-dic), 1 € por pachanga.
#   * Los nombres de la cuadrícula Sí/No son miembros; los escritos debajo,
#     invitados (salvo que PERSONAS diga que son otra persona ya conocida).
#
# Para unir o separar nombres, edita PERSONAS (alias) y vuelve a ejecutar.
# =====================================================================

import datetime
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import OrderedDict

# ---------------------------------------------------------------------
# CONFIGURACIÓN
# ---------------------------------------------------------------------

# Coste total de alquiler de cada reserva de 26/27 (se apunta solo como gasto)
COSTE_RESERVA_1 = 7.23*7      # 01/09/2026 - 31/10/2026
COSTE_RESERVA_2 = 7.23*7      # 01/11/2026 - 31/12/2026
PRECIO_UNITARIO = 1      # € por pachanga de reserva (quien no está apuntado paga +50 %)
PRECIO_HISTORICO = 0     # € de las pachangas y entrenamientos de 24/25 y 25/26: sin ingresos ni deudas

RESERVAS = [
    # (fecha_inicio, fecha_fin, coste, (fila del título de su lista de pagos en "Cuentas 2627", sin usar))
    (datetime.date(2026, 9, 1), datetime.date(2026, 10, 31), COSTE_RESERVA_1, (36, None)),
    (datetime.date(2026, 11, 1), datetime.date(2026, 12, 31), COSTE_RESERVA_2, (51, None)),
]
# Cambios sobre las listas del Excel: {nº reserva: {clave persona: pagado}}
RESERVA_AJUSTES = {
    1: {'Gonzalo': True},   # juega como "Periódica" en sep-oct aunque no sale en la lista
}

# Fechas con pista completa que no salen como nota en la cuadrícula
PISTA_COMPLETA = {datetime.date(2025, 6, 20)}   # gasto "Pista completa 20/6" de 24/25

# Fechas mal escritas en el Excel: {fecha del Excel: fecha real}
FECHAS_CORREGIDAS = {
    # Pone lunes 26/05, pero la propia hoja la marca "-Martes", la cuenta en la
    # columna "Martes" y apunta el pago de Álvaro Shmuel el 27/05
    datetime.date(2025, 5, 26): datetime.date(2025, 5, 27),
}

# Totales del Excel que se sabe que no cuadran (no se avisa de ellos)
TOTALES_DESACTUALIZADOS = {'26/27'}   # las fórmulas no cuentan ni el 27/10 ni el 03/11

# Personas. clave = nombre único en este script.
#   tipo:         'miembro' o 'invitado'
#   nombre/apellido: con qué nombre se busca el miembro en la base de datos
#                 (sin distinguir mayúsculas) y con cuál se crea si no existe.
#   usuario:      usuario (login) de la web que ya tiene ese miembro; gana a
#                 nombre/apellido y la importación se para si no existe
#   id_miembro:   fuerza el miembro de la base de datos (gana a todo lo anterior)
#   tipo_miembro: 'jugador' (por defecto), 'staff' o 'aficionado' (solo al crear)
#   padrino:      clave del miembro que lo trajo (solo invitados)
#   alias:        otras formas en que aparece en el Excel
#   revisar:      nota de algo dudoso (solo informativo)
def M(clave, nombre=None, alias=(), apellido=None, usuario=None, id_miembro=None, tipo_miembro='jugador', revisar=None):
    return dict(clave=clave, tipo='miembro', nombre=nombre or clave, apellido=apellido, usuario=usuario,
                id_miembro=id_miembro, tipo_miembro=tipo_miembro, alias=list(alias), revisar=revisar)

def I(clave, nombre=None, alias=(), padrino=None, revisar=None):
    return dict(clave=clave, tipo='invitado', nombre=nombre or clave, padrino=padrino,
                alias=list(alias), revisar=revisar)

PERSONAS = [
    # ----- Miembros (salen en la cuadrícula de alguna temporada) -----
    M('Fran', usuario='fran'),
    M('Abel'),
    M('Alex'),
    M('Álvaro', alias=['Álvaro Shmuel']),
    M('Antonio Gigachad', alias=['Antonio (Gigachad)', 'Antonio G']),
    M('Antonio IH', alias=['Antonio M'], usuario='millagi.do'),
    M('Bochi'),
    M('Borja', alias=['Borjas']),
    M('Bryan'),
    M('Carlos Cipi', alias=['Cipi']),
    M('Cervantes'),
    M('Dani V', alias=['Dani V (El otro Edu)']),
    M('Dani Fichaje', alias=['Dani fichaje', 'Dani'], revisar='"Dani" de las listas de reserva 26/27'),
    M('Edu M', alias=['Edu M (Fumón)', 'Edu F']),
    M('Edu OTR', alias=['Edu OTR (La Cabra)']),
    M('Elena'),
    M('Gonzalo'),
    M('Guzmán', alias=['Guzmán (el Bueno)']),
    M('Joan'),
    M('Jorge', alias=['Jorge (de Alfarache)', 'Jorge Gu.']),
    M('Jorge Gigachad', alias=['Jorge Gi.']),
    M('Juan (Jugoma)', nombre='Juan', alias=['Jugoma']),
    M('Juanpri'),
    M('Luis', revisar='Distinto de "Luis (primo Álvaro)": en 25/26 salen los dos'),
    M('Luis (primo Álvaro)', nombre='Luis (primo Álvaro)', alias=['Luis primo Álvaro']),
    M('Marco', revisar='Distinto de "Marcos": en 24/25 salen los dos'),
    M('Marcos', alias=['Marqitos', 'Marquitos', 'Marqutos', 'Markitos']),
    M('Miguel (La Garza)', nombre='Miguel', alias=['Miguel']),
    M('Nico', alias=['Nico (La Araña de Añorbe)', 'Nick']),
    M('Olaf'),
    M('Pablucho'),
    M('Popo'),
    M('Raúl', alias=['Ra'], usuario='raul.santos'),
    M('Rodri'),

    # ----- Invitados (escritos debajo de la cuadrícula) -----
    # 24/25
    I('Dani Espinosa'),
    I('DaniLo'),
    I('Miguel Magic'),
    I('Jose (amigo de Raúl)', alias=['Jose (Raúl)'], padrino='Raúl'),
    I('Fran (amigo de Juan)', alias=['Amigo Juan'], padrino='Juan (Jugoma)'),
    I('Mikel'),
    I('Valva'),
    I('Jack'),
    I('Simón (francés IH)', alias=['Simon', 'Simón'], revisar='"Simón (francés IH)" 29/04/2025 y "Simon" 03/06/2025 como la misma persona'),
    I('Duje'),
    # 25/26
    I('Aitor (amigo Álvaro)', padrino='Álvaro'),
    I('Alain'),
    I('Miguel Barquín'),
    I('Jeison'),
    I('Julia'),
    I('Marta'),
    I('Diego Guirao'),
    I('Ángel'),
    I('Sari'),
    I('Adriana'),
    I('Miguel (amigo Joan)', alias=['Miguel amigo Joan'], padrino='Joan'),
    I('Joni IH'),
    # 26/27
    I('Amigo Álvaro', padrino='Álvaro', revisar='¿Es "Aitor (amigo Álvaro)" de 25/26? Si lo es, pon este nombre como alias de Aitor'),
    I('Óscar (amigo Edu)', alias=['Óscar amigo Edu', 'Oscar Amigo Edu', 'Oscar', 'Óscar']),
]

# Textos debajo de la cuadrícula que no son personas
IGNORAR = {
    '-martes', '-viernes', '-miércoles', 'día de 1.5', 'pista completa',
    'pagado', 'no vino', 'no llegó a aparecer', 'quizás jose', 'ruben (amigo dani)',
    'popo llegó ya a las 19:29', 'lesión de tobillo álvaro', 'lesión dedo guzmán',
    'donaciones:', 'gastos extra:', 'ha pagado edu su parte',
}

# Cómo está organizada cada pestaña
HOJAS = {
    '24/25': dict(hoja='Cuentas 2425', invitados=(29, 31, 'K', 'BN'), totales={'D': 'todas', 'C': 'martes'}),
    '25/26': dict(hoja='Cuentas 2526', invitados=(26, 31, 'C', 'DC'), totales={'B': 'todas'}),
    '26/27': dict(hoja='Cuentas 2627', invitados=(25, 26, 'E', 'AT'), totales={'B': 'todas', 'C': 'cervezas'}),
}
# Pagos sueltos apuntados en 26/27 ("Donaciones"): filas con fecha en E, nombre en F, importe en G
PAGOS_2627 = (30, 40)

TEMPORADA_ACTUAL = '26/27'

# ---------------------------------------------------------------------
# LECTURA DEL XLSX
# ---------------------------------------------------------------------
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
NS_REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'


def col_num(letras):
    n = 0
    for ch in letras:
        n = n * 26 + ord(ch) - 64
    return n


def col_letras(n):
    s = ''
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def leer_libro(ruta):
    z = zipfile.ZipFile(ruta)
    compartidas = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall(NS + 'si'):
            compartidas.append(''.join(t.text or '' for t in si.iter(NS + 't')))
    rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    hojas = {}
    for h in ET.fromstring(z.read('xl/workbook.xml')).iter(NS + 'sheet'):
        destino = rels[h.get(NS_REL + 'id')].lstrip('/')
        if not destino.startswith('xl/'):
            destino = 'xl/' + destino
        celdas = {}
        for c in ET.fromstring(z.read(destino)).iter(NS + 'c'):
            m = re.match(r'([A-Z]+)(\d+)$', c.get('r'))
            v = c.find(NS + 'v')
            t = c.get('t')
            if t == 's' and v is not None:
                val = compartidas[int(v.text)]
            elif t == 'inlineStr':
                val = ''.join(x.text or '' for x in c.iter(NS + 't'))
            elif t in ('str', 'b', 'e') and v is not None:
                val = v.text
            elif v is not None:
                val = float(v.text)
            else:
                continue
            if isinstance(val, str) and not val.strip():
                continue
            celdas[(int(m.group(2)), col_num(m.group(1)))] = val
        hojas[h.get('name')] = celdas
    return hojas


def fecha_excel(v):
    return datetime.date(1899, 12, 30) + datetime.timedelta(days=int(v))


def norm(s):
    return re.sub(r'\s+', ' ', str(s).strip().lstrip('+').strip()).lower()


def si(v):
    return isinstance(v, str) and norm(v) in ('sí', 'si')


def ref(fila, col):
    return f'{col_letras(col)}{fila}'


# ---------------------------------------------------------------------
# PERSONAS
# ---------------------------------------------------------------------
POR_CLAVE = OrderedDict((p['clave'], p) for p in PERSONAS)
ALIAS = {}
for p in PERSONAS:
    for nombre in [p['clave'], p['nombre']] + p['alias']:
        k = norm(nombre)
        if k in ALIAS and ALIAS[k] != p['clave']:
            sys.exit(f'ERROR en PERSONAS: "{nombre}" es alias de "{ALIAS[k]}" y de "{p["clave"]}"')
        ALIAS[k] = p['clave']
for p in PERSONAS:
    if p['tipo'] == 'invitado' and p['padrino'] and POR_CLAVE.get(p['padrino'], {}).get('tipo') != 'miembro':
        sys.exit(f'ERROR en PERSONAS: el padrino "{p["padrino"]}" de "{p["clave"]}" no es un miembro')

desconocidos = []        # (temporada, celda, texto)
avisos = []
vistos = OrderedDict()   # clave -> set de textos del Excel
temporadas_vistas = {}   # clave -> temporadas en cuya pestaña sale (cuadrícula, notas o listas)


def persona(texto, temporada, celda):
    clave = ALIAS.get(norm(texto))
    if clave is None:
        desconocidos.append((temporada, celda, texto))
        return None
    vistos.setdefault(clave, set()).add(str(texto).strip())
    temporadas_vistas.setdefault(clave, set()).add(temporada)
    return clave


# ---------------------------------------------------------------------
# EVENTOS (pachangas y entrenamientos)
# ---------------------------------------------------------------------
eventos = OrderedDict()   # (temporada, fecha) -> dict


def evento(temporada, fecha):
    k = (temporada, fecha)
    if k not in eventos:
        eventos[k] = dict(temporada=temporada, fecha=fecha, precio=PRECIO_HISTORICO,
                          pista='completa' if fecha in PISTA_COMPLETA else 'media',
                          asistentes=OrderedDict())
    return eventos[k]


def apuntar(ev, clave, jugado=False, cerveza=False, pagado=None):
    a = ev['asistentes'].setdefault(clave, dict(jugado=False, cerveza=False, pagado=None))
    a['jugado'] |= jugado
    a['cerveza'] |= cerveza
    if pagado is not None:
        a['pagado'] = pagado if a['pagado'] is None else (a['pagado'] or pagado)


def leer_temporada(temporada, celdas, cfg):
    # Grupos de columnas: empiezan en "Asistencia" (fila 2); la fecha está en la fila 1
    cab = {c: norm(v) for (f, c), v in celdas.items() if f == 2 and isinstance(v, str)}
    inicios = sorted(c for c, v in cab.items() if v == 'asistencia')
    ultima = max(cab)
    grupos = []
    for i, c0 in enumerate(inicios):
        c1 = (inicios[i + 1] - 1) if i + 1 < len(inicios) else ultima
        cols = {cab[c]: c for c in range(c0, c1 + 1) if c in cab}
        fechas = [celdas[(1, c)] for c in range(c0, c1 + 1) if isinstance(celdas.get((1, c)), float)]
        if len(fechas) != 1:
            sys.exit(f'ERROR {temporada}: el grupo de columnas {col_letras(c0)}-{col_letras(c1)} no tiene una fecha clara')
        fecha = fecha_excel(fechas[0])
        grupos.append(dict(fecha=FECHAS_CORREGIDAS.get(fecha, fecha), c0=c0, c1=c1,
                           asis=cols['asistencia'], pag=cols.get('pagado'), cer=cols.get('cerveza')))

    # Jugadores de la cuadrícula: desde la fila 3 hasta la primera fila sin nombre
    filas = []
    f = 3
    while isinstance(celdas.get((f, 1)), str):
        filas.append(f)
        f += 1

    conteo = {}
    for f in filas:
        clave = persona(celdas[(f, 1)], temporada, ref(f, 1))
        conteo[f] = dict(todas=0, martes=0, cervezas=0)
        for g in grupos:
            jugado = si(celdas.get((f, g['asis'])))
            cerveza = g['cer'] is not None and si(celdas.get((f, g['cer'])))
            if jugado:
                conteo[f]['todas'] += 1
                conteo[f]['martes'] += g['fecha'].weekday() == 1
            conteo[f]['cervezas'] += cerveza
            if not (jugado or cerveza) or clave is None:
                continue
            pv = celdas.get((f, g['pag'])) if g['pag'] else None
            pagado = None if (isinstance(pv, str) and norm(pv) == 'periódica') else si(pv)
            apuntar(evento(temporada, g['fecha']), clave, jugado, cerveza, pagado)
            if isinstance(pv, str) and norm(pv) == 'periódica':
                eventos[(temporada, g['fecha'])]['asistentes'][clave]['periodica'] = True

    # Comprobar contra los totales del propio Excel
    for f in filas if temporada not in TOTALES_DESACTUALIZADOS else []:
        for letra, tipo in cfg['totales'].items():
            v = celdas.get((f, col_num(letra)))
            m = re.match(r'\s*(-?\d+(?:\.\d+)?)', str(v)) if v is not None else None
            if m and float(m.group(1)) != conteo[f][tipo]:
                avisos.append(f'{temporada}: {celdas[(f, 1)]} -> el Excel dice {m.group(1)} ({tipo}, '
                              f'columna {letra}) y la cuadrícula da {conteo[f][tipo]}')

    # Debajo de la cuadrícula: invitados y notas
    f0, f1, ca, cb = cfg['invitados']
    for f in range(f0, f1 + 1):
        for g in grupos:
            if g['c1'] < col_num(ca) or g['c0'] > col_num(cb):
                continue
            ev = evento(temporada, g['fecha'])
            marca_pago = celdas.get((f, g['pag'])) if g['pag'] else None
            for c in range(g['c0'], g['c1'] + 1):
                v = celdas.get((f, c))
                if not isinstance(v, str) or not (col_num(ca) <= c <= col_num(cb)):
                    continue
                n = norm(v)
                if n == 'pista completa':
                    ev['pista'] = 'completa'
                if n in IGNORAR or n.startswith('-') or c == g['pag']:
                    continue
                clave = persona(v, temporada, ref(f, c))
                if clave is None:
                    continue
                if c == g['asis']:
                    pagado = None
                    if marca_pago is not None:
                        pagado = not (isinstance(marca_pago, str) and norm(marca_pago) == 'no vino')
                    apuntar(ev, clave, jugado=True, pagado=pagado)
                elif c == g['cer']:
                    apuntar(ev, clave, cerveza=True)
    return grupos


# ---------------------------------------------------------------------
# SQL
# ---------------------------------------------------------------------
def q(v):
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return repr(round(v, 2))
    if isinstance(v, datetime.date):
        return f"date '{v.isoformat()}'"
    return "'" + str(v).replace("'", "''") + "'"


FUNCIONES_SQL = r"""
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
"""


def generar_sql(miembros, invitados, primera_fecha, reservas, listas, salida):
    l = []
    w = l.append
    hoy = datetime.date.today().isoformat()
    w('-- =====================================================================')
    w('-- FRAN-BASKET - importación de Pachangas.xlsx')
    w(f'-- GENERADO por importar_excel.py el {hoy}. No editar a mano: cambia el')
    w('-- script (PERSONAS, costes...) y vuelve a generarlo.')
    w('--')
    w('-- Ejecutar en el SQL Editor de Supabase, después de las migraciones 01 a 06.')
    w('-- Se para sin tocar nada si ya hubo una importación o si ya hay pachangas,')
    w('-- entrenamientos o reservas en las fechas del Excel.')
    w('-- Cada fila creada se apunta en importacion_baske.filas;')
    w('-- borrar_importacion_excel.sql la deshace.')
    w('-- Los mensajes (NOTICE) dicen qué miembros ya existían y cuáles se crean.')
    w('-- =====================================================================')
    w(FUNCIONES_SQL)
    w('do $$')
    w('declare')
    w('  v_p bigint;')
    w('  v_e bigint;')
    w('  v_r bigint[] := \'{}\';')
    w('  v_choques text;')
    w('begin')
    w('  if exists (select 1 from importacion_baske.filas) or exists (select 1 from importacion_baske.persona) then')
    w("    raise exception 'Ya hay una importación: ejecuta borrar_importacion_excel.sql primero';")
    w('  end if;')
    fechas = sorted({k[1] for k in eventos})
    w('')
    w('  -- Fechas que ya existen en la base de datos')
    w('  select string_agg(distinct to_char(f, \'DD/MM/YYYY\'), \', \') into v_choques from (')
    w('    select fecha f from equipo.pachanga union all select fecha from equipo.entrenamiento')
    w('  ) x where f = any (array[')
    for i in range(0, len(fechas), 6):
        trozo = ', '.join(f"'{d.isoformat()}'" for d in fechas[i:i + 6])
        w(f'    {trozo}{"," if i + 6 < len(fechas) else ""}')
    w('  ]::date[]);')
    w('  if v_choques is not null then')
    w("    raise exception 'Ya hay pachangas o entrenamientos en estas fechas del Excel: %', v_choques;")
    w('  end if;')
    for ini, fin, _, _ in reservas:
        w(f'  if exists (select 1 from equipo.reserva_periodica where daterange(fecha_inicio, fecha_fin, \'[]\') && daterange({q(ini)}, {q(fin)}, \'[]\')) then')
        w(f"    raise exception 'Ya hay una reserva periódica que se solapa con {ini:%d/%m/%Y} - {fin:%d/%m/%Y}';")
        w('  end if;')

    w('')
    w('  -- ----- MIEMBROS -----')
    for p in miembros:
        w(f"  perform importacion_baske.miembro({q(p['clave'])}, {q(p['nombre'])}, {q(p['apellido'])}, "
          f"{q(p['id_miembro'])}, {q(p['usuario'])}, {q(p['tipo_miembro'])}, {q(primera_fecha[p['clave']])}, "
          f"{q(p['fecha_baja'])});")
    w('')
    w('  -- ----- INVITADOS -----')
    for p in invitados:
        w(f"  perform importacion_baske.invitado({q(p['clave'])}, {q(p['nombre'])}, {q(p['padrino'])});")

    w('')
    w('  -- ----- RESERVAS 26/27 -----')
    for i, (ini, fin, coste, _) in enumerate(reservas, 1):
        w(f'  v_r := v_r || importacion_baske.reserva({q(ini)}, {q(fin)}, {q(PRECIO_UNITARIO)}, {q(coste)});')
        for clave, pagado in listas[i].items():
            w(f'  perform importacion_baske.apunta(v_r[{i}], {q(clave)}, {q(pagado)});')

    for temporada in HOJAS:
        w('')
        w(f'  -- ----- TEMPORADA {temporada} -----')
        for (t, fecha), ev in eventos.items():
            if t != temporada:
                continue
            asis = ev['asistentes']
            if ev['tipo'] == 'entrenamiento':
                w(f"  v_e := importacion_baske.entrenamiento({q(fecha)}, {q(ev['precio'])}, {q(ev['pista'])});"
                  f"  -- {fecha:%A}")
                for clave, a in asis.items():
                    if a['jugado']:
                        w(f'  perform importacion_baske.entrena(v_e, {q(clave)});')
                continue
            cervezas = any(a['cerveza'] for a in asis.values())
            if ev['reserva']:
                w(f"  v_p := importacion_baske.pachanga({q(fecha)}, null, v_r[{ev['reserva']}], {q(ev['pista'])}, {q(cervezas)});"
                  + ('  -- futura' if not asis else ''))
            else:
                w(f"  v_p := importacion_baske.pachanga({q(fecha)}, {q(ev['precio'])}, null, {q(ev['pista'])}, {q(cervezas)});")
            for clave, a in asis.items():
                w(f"  perform importacion_baske.asiste(v_p, {q(clave)}, {q(a['jugado'])}, {q(a['cerveza'])}, {q(a['pagado_sql'])});")
    w('end $$;')
    w('')
    w('select tabla, count(*) from importacion_baske.filas group by tabla order by tabla;')
    with open(salida, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('\n'.join(l) + '\n')


def generar_comprobar(miembros, salida):
    l = ['-- =====================================================================',
         '-- FRAN-BASKET - comprobar la importación de Pachangas.xlsx (solo lectura)',
         '-- GENERADO por importar_excel.py. Dice, para cada persona del Excel, qué',
         '-- miembros de la base de datos encajan. "crear" = no hay ninguno y se creará;',
         '-- más de uno = la importación se parará: pon apellido o id_miembro en PERSONAS.',
         '-- Con usuario: si sale "crear", ese usuario no existe y la importación se parará.',
         '-- =====================================================================',
         'with p (clave, nombre, apellido, usuario, id_forzado) as (values']
    filas = [f"  ({q(p['clave'])}, {q(p['nombre'])}, {q(p['apellido'])}::text, {q(p['usuario'])}::text, {q(p['id_miembro'])}::bigint)" for p in miembros]
    l.append(',\n'.join(filas))
    l += [')',
          "select p.clave, coalesce('usuario ' || p.usuario, p.nombre) as busca,",
          "       coalesce(string_agg(m.id || ': ' || m.nombre || coalesce(' ' || m.apellido, ''), ' | ' order by m.id), 'crear') as encaja",
          'from p',
          'left join equipo.usuario u on p.id_forzado is null and lower(u.usuario) = lower(p.usuario)',
          'left join equipo.miembro m',
          '  on (p.id_forzado is not null and m.id = p.id_forzado)',
          '  or (p.id_forzado is null and p.usuario is not null and m.id_usuario = u.id)',
          '  or (p.id_forzado is null and p.usuario is null and lower(trim(m.nombre)) = lower(trim(p.nombre))',
          "      and (p.apellido is null or lower(trim(coalesce(m.apellido, ''))) = lower(trim(p.apellido))))",
          'group by p.clave, p.nombre, p.usuario',
          'order by count(m.id) desc, p.clave;']
    with open(salida, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('\n'.join(l) + '\n')


# ---------------------------------------------------------------------
# PRINCIPAL
# ---------------------------------------------------------------------
def main():
    if len(sys.argv) != 2:
        sys.exit('Uso: python -I importar_excel.py Pachangas.xlsx')
    ruta = sys.argv[1]
    carpeta = os.path.dirname(os.path.abspath(__file__))
    hojas = leer_libro(ruta)

    for temporada, cfg in HOJAS.items():
        if cfg['hoja'] not in hojas:
            sys.exit(f'ERROR: no encuentro la pestaña "{cfg["hoja"]}"')
        leer_temporada(temporada, hojas[cfg['hoja']], cfg)

    # Pagos sueltos de 26/27
    c27 = hojas[HOJAS['26/27']['hoja']]
    for f in range(*PAGOS_2627):
        fecha, nombre, importe = c27.get((f, 5)), c27.get((f, 6)), c27.get((f, 7))
        if isinstance(fecha, float) and isinstance(nombre, str) and isinstance(importe, float):
            clave = persona(nombre, '26/27', ref(f, 6))
            ev = eventos.get(('26/27', fecha_excel(fecha)))
            if clave and ev and clave in ev['asistentes']:
                ev['asistentes'][clave]['pagado'] = True
            elif clave:
                avisos.append(f'26/27: pago de {nombre} el {fecha_excel(fecha):%d/%m/%Y} ({ref(f, 6)}) sin asistencia ese día')

    # Listas de pago de las reservas
    listas = {}
    for i, (ini, fin, _, (fa, _)) in enumerate(RESERVAS, 1):
        listas[i] = OrderedDict()
        # La lista empieza debajo del título y sigue hasta la primera fila vacía
        f = fa + 1
        while isinstance(c27.get((f, 1)), str):
            clave = persona(c27[(f, 1)], '26/27', ref(f, 1))
            if clave:
                listas[i][clave] = si(c27.get((f, 2)))
            f += 1
        for clave, pagado in RESERVA_AJUSTES.get(i, {}).items():
            listas[i][clave] = pagado

    if desconocidos:
        print('ERROR: nombres que no están en PERSONAS ni en IGNORAR:')
        for t, celda, texto in desconocidos:
            print(f'  {t}  {celda:>6}  "{texto}"')
        sys.exit('Añádelos (como persona nueva o como alias) y vuelve a ejecutar.')

    # Tipo de cada fecha y pagos
    eventos_ordenados = OrderedDict(sorted(eventos.items(), key=lambda kv: kv[0][1]))
    eventos.clear()
    eventos.update(eventos_ordenados)
    for (t, fecha), ev in eventos.items():
        ev['tipo'] = 'entrenamiento' if (t == '24/25' and fecha.weekday() != 1) else 'pachanga'
        ev['reserva'] = None
        if t == TEMPORADA_ACTUAL:
            ev['reserva'] = next(i for i, r in enumerate(RESERVAS, 1) if r[0] <= fecha <= r[1])
        for clave, a in ev['asistentes'].items():
            if t != TEMPORADA_ACTUAL or not a['jugado']:
                a['pagado_sql'] = False           # histórico (0 €) o solo cervezas: ni pago ni deuda
                continue
            apuntado = clave in listas[ev['reserva']]
            if a.get('periodica') and not apuntado:
                avisos.append(f'{t}: {clave} sale como "Periódica" el {fecha:%d/%m/%Y} pero no está en la lista de la reserva {ev["reserva"]}: se le cobrará esa pachanga')
            if apuntado and not a.get('periodica') and POR_CLAVE[clave]['tipo'] == 'miembro':
                avisos.append(f'{t}: {clave} está en la reserva {ev["reserva"]} pero el {fecha:%d/%m/%Y} no sale como "Periódica"')
            a['pagado_sql'] = True if apuntado else bool(a['pagado'])

    # Personas usadas, en orden de PERSONAS
    primera_fecha = {}
    for (t, fecha), ev in eventos.items():
        for clave in ev['asistentes']:
            primera_fecha.setdefault(clave, fecha)
    for i, (ini, _, _, _) in enumerate(RESERVAS, 1):
        for clave in listas[i]:
            primera_fecha.setdefault(clave, ini)
    usadas = [p for p in PERSONAS if p['clave'] in primera_fecha]
    miembros = [p for p in usadas if p['tipo'] == 'miembro']
    invitados = [p for p in usadas if p['tipo'] == 'invitado']
    for p in invitados:
        if p['padrino'] and p['padrino'] not in primera_fecha:
            p['padrino'] = None

    # Baja: quien no sale en la pestaña de ninguna temporada posterior se da de baja
    # el último día (31 de agosto) de la última temporada en que sale.
    # Solo se aplica a los miembros que se crean; los que ya existen no se tocan.
    orden = list(HOJAS)
    for p in miembros:
        ultima = max(temporadas_vistas[p['clave']], key=orden.index)
        p['fecha_baja'] = None if ultima == orden[-1] else datetime.date(2000 + int(ultima[-2:]), 8, 31)

    salida = os.path.join(carpeta, 'importacion_excel.sql')
    comprobar = os.path.join(carpeta, 'importacion_excel_comprobar.sql')
    generar_sql(miembros, invitados, primera_fecha, RESERVAS, listas, salida)
    generar_comprobar(miembros, comprobar)

    # ----- Informe -----
    print('=' * 70)
    print('IMPORTACIÓN DE PACHANGAS.XLSX')
    print('=' * 70)
    for t in HOJAS:
        evs = [e for (tt, _), e in eventos.items() if tt == t]
        pach = [e for e in evs if e['tipo'] == 'pachanga']
        ent = [e for e in evs if e['tipo'] == 'entrenamiento']
        jug = sum(a['jugado'] for e in evs for a in e['asistentes'].values())
        cer = sum(a['cerveza'] for e in evs for a in e['asistentes'].values())
        print(f'\n{t}: {len(pach)} pachangas, {len(ent)} entrenamientos, {jug} asistencias jugando, {cer} a cervezas')
        for e in evs:
            extra = []
            if e['tipo'] == 'entrenamiento':
                extra.append(f'ENTRENAMIENTO ({e["fecha"]:%a})')
            if e['pista'] == 'completa':
                extra.append('pista completa')
            if e['precio'] != PRECIO_HISTORICO and not e['reserva']:
                extra.append(f'precio {e["precio"]} €')
            if e['reserva']:
                extra.append(f'reserva {e["reserva"]}')
            if not e['asistentes']:
                extra.append('sin asistencia (futura)')
            inv = [c for c in e['asistentes'] if POR_CLAVE[c]['tipo'] == 'invitado']
            if inv:
                extra.append('invitados: ' + ', '.join(inv))
            n = sum(a['jugado'] for a in e['asistentes'].values())
            print(f'  {e["fecha"]:%d/%m/%Y}  {n:2d} juegan  ' + ' · '.join(extra))

    print('\nReservas 26/27 (precio por pachanga %s €):' % PRECIO_UNITARIO)
    for i, (ini, fin, coste, _) in enumerate(RESERVAS, 1):
        n = sum(1 for e in eventos.values() if e['reserva'] == i)
        print(f'  {i}. {ini:%d/%m} - {fin:%d/%m/%Y}: {n} pachangas, coste {round(coste, 2)} €')
        print('     pagado:    ' + ', '.join(c for c, p in listas[i].items() if p))
        print('     sin pagar: ' + (', '.join(c for c, p in listas[i].items() if not p) or '-'))

    print('\nDeudas que quedarán en 26/27:')
    deudas = OrderedDict()
    for i in listas:
        n = sum(1 for e in eventos.values() if e['reserva'] == i)
        for c, p in listas[i].items():
            if not p:
                deudas.setdefault(c, []).append(f'reserva {i}: {PRECIO_UNITARIO * n} €')
    for (t, fecha), e in eventos.items():
        for c, a in e['asistentes'].items():
            if e['reserva'] and a['jugado'] and a['pagado_sql'] is False:
                deudas.setdefault(c, []).append(f'pachanga {fecha:%d/%m}: {PRECIO_UNITARIO * 1.5} €')
    for c, d in deudas.items():
        print(f'  {c}: ' + '; '.join(d))

    print(f'\nPersonas: {len(miembros)} miembros, {len(invitados)} invitados')
    for p in usadas:
        textos = sorted(vistos.get(p['clave'], set()) - {p['clave']})
        linea = f'  [{p["tipo"][:3]}] {p["clave"]}'
        if p['tipo'] == 'miembro' and p['nombre'] != p['clave']:
            linea += f'  (se busca/crea como "{p["nombre"]}")'
        if p['tipo'] == 'miembro' and p.get('fecha_baja'):
            linea += f'  BAJA {p["fecha_baja"]:%d/%m/%Y}'
        if textos:
            linea += '  <- ' + ', '.join(f'"{x}"' for x in textos)
        if p['tipo'] == 'invitado' and p.get('padrino'):
            linea += f'  padrino: {p["padrino"]}'
        print(linea)
        if p.get('revisar'):
            print(f'        REVISAR: {p["revisar"]}')

    sin_uso = [p['clave'] for p in PERSONAS if p['clave'] not in primera_fecha]
    if sin_uso:
        print('\nEn PERSONAS pero no aparecen en el Excel (no se crean): ' + ', '.join(sin_uso))

    if avisos:
        print('\nAVISOS:')
        for a in avisos:
            print('  - ' + a)

    print(f'\nGenerado: {salida}')
    print(f'Generado: {comprobar}')


if __name__ == '__main__':
    main()

// Edge Function "admin-usuarios" (FRAN-BASKET)
//
// Crea y gestiona logins desde baske/admin/miembros.html. Necesita la
// service key (solo existe aqui, nunca en el navegador).
// Despliegue: Supabase > Edge Functions > Deploy a new function > Via editor,
// nombre "admin-usuarios", pegar este archivo y Deploy.
//
// Peticion (POST JSON, con la sesion del admin en Authorization):
//   { accion: 'crear',     usuario: 'pepe', id_miembro?: 12 }
//   { accion: 'resetear',  id_usuario: '<uuid>' }
//   { accion: 'renombrar', id_usuario: '<uuid>', usuario: 'pepe2' }
//
// Tras 'crear' o 'resetear' el usuario entra con su nombre en la web y elige
// contrasena nueva (debe_cambiar_password = true).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const DOMINIO = 'fran-basket.invalid';
const ORIGENES = [
  'https://fran.matorras.com',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:5501',
  'http://127.0.0.1:5501',
];
const PATRON_USUARIO = /^[a-zA-Z0-9._-]{3,30}$/;

function passwordAleatoria(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

// auth.admin no tiene "buscar por email": se recorren las paginas
// deno-lint-ignore no-explicit-any
async function buscarPorEmail(admin: any, email: string) {
  const porPagina = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: porPagina });
    if (error) return null;
    // deno-lint-ignore no-explicit-any
    const encontrado = data.users.find((u: any) => (u.email ?? '').toLowerCase() === email);
    if (encontrado) return encontrado;
    if (data.users.length < porPagina) return null;
  }
}

Deno.serve(async (req) => {
  const origen = req.headers.get('Origin') ?? '';
  const cors = {
    'Access-Control-Allow-Origin': ORIGENES.includes(origen) ? origen : ORIGENES[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };

  const responder = (cuerpo: unknown, estado = 200) =>
    new Response(JSON.stringify(cuerpo), {
      status: estado,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405);

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false }, db: { schema: 'equipo' } },
    );

    // Quien llama tiene que ser admin
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: quien, error: errQuien } = await admin.auth.getUser(token);
    if (errQuien || !quien?.user) return responder({ error: 'Sesión no válida' }, 401);

    const { data: yo } = await admin.from('usuario').select('admin').eq('id', quien.user.id).maybeSingle();
    if (!yo?.admin) return responder({ error: 'Solo los administradores pueden hacer esto' }, 403);

    const cuerpo = await req.json();

    if (cuerpo.accion === 'crear') {
      const usuario = String(cuerpo.usuario ?? '').trim();
      if (!PATRON_USUARIO.test(usuario)) {
        return responder({ error: 'Usuario no válido: 3-30 letras, números, punto, guion o guion bajo' }, 400);
      }

      const { data: existe } = await admin.from('usuario').select('id').ilike('usuario', usuario).maybeSingle();
      if (existe) return responder({ error: 'Ese nombre de usuario ya existe' }, 409);

      const email = `${usuario.toLowerCase()}@${DOMINIO}`;
      let id: string;
      let creadoAhora = false;

      const { data: creado, error } = await admin.auth.admin.createUser({
        email,
        password: passwordAleatoria(),
        email_confirm: true,
        user_metadata: { usuario },
      });
      if (error) {
        // Puede quedar un usuario de auth sin fila en equipo.usuario (p. ej. si
        // faltaba el trigger): se reaprovecha en vez de fallar.
        const huerfano = await buscarPorEmail(admin, email);
        if (!huerfano) return responder({ error: error.message }, 400);
        const { data: tieneFila } = await admin.from('usuario').select('id').eq('id', huerfano.id).maybeSingle();
        if (tieneFila) return responder({ error: error.message }, 400);
        const { error: errReparar } = await admin.auth.admin.updateUserById(huerfano.id, {
          password: passwordAleatoria(),
          user_metadata: { usuario },
        });
        if (errReparar) return responder({ error: errReparar.message }, 400);
        id = huerfano.id;
      } else {
        id = creado.user.id;
        creadoAhora = true;
      }

      // Si algo falla a partir de aqui, no dejar un login a medias
      const fallar = async (mensaje: string) => {
        if (creadoAhora) await admin.auth.admin.deleteUser(id);
        return responder({ error: mensaje }, 400);
      };

      // Normalmente el trigger handle_new_user ya creo la fila; si no, se crea aqui
      const { data: fila } = await admin.from('usuario').select('id').eq('id', id).maybeSingle();
      if (!fila) {
        const { error: errFila } = await admin.from('usuario').insert({ id, usuario, debe_cambiar_password: true });
        if (errFila) return await fallar('No se pudo crear el usuario: ' + errFila.message);
      }

      if (cuerpo.id_miembro) {
        const { data: vinculado, error: errMiembro } = await admin.from('miembro')
          .update({ id_usuario: id })
          .eq('id', cuerpo.id_miembro)
          .select('id');
        if (errMiembro) return await fallar('No se pudo vincular al miembro: ' + errMiembro.message);
        if (!vinculado?.length) return await fallar('No se pudo vincular: ese miembro no existe');
      }

      // Comprobacion final: el login tiene que encontrarlo
      const { data: final } = await admin.from('usuario').select('id').eq('id', id).maybeSingle();
      if (!final) return await fallar('El usuario no quedó guardado en la base de datos');

      return responder({ ok: true, id_usuario: id });
    }

    if (cuerpo.accion === 'resetear') {
      const id = String(cuerpo.id_usuario ?? '');
      const { error } = await admin.auth.admin.updateUserById(id, { password: passwordAleatoria() });
      if (error) return responder({ error: error.message }, 400);

      // El cambio de contrasena pone el flag a false: volver a ponerlo a true DESPUES
      const { error: errFlag } = await admin.from('usuario').update({ debe_cambiar_password: true }).eq('id', id);
      if (errFlag) return responder({ error: errFlag.message }, 400);

      return responder({ ok: true });
    }

    if (cuerpo.accion === 'renombrar') {
      const id = String(cuerpo.id_usuario ?? '');
      const usuario = String(cuerpo.usuario ?? '').trim();
      if (!PATRON_USUARIO.test(usuario)) {
        return responder({ error: 'Usuario no válido: 3-30 letras, números, punto, guion o guion bajo' }, 400);
      }

      const { data: existe } = await admin.from('usuario').select('id').ilike('usuario', usuario).neq('id', id).maybeSingle();
      if (existe) return responder({ error: 'Ese nombre de usuario ya existe' }, 409);

      // Si el email es el ficticio, se mantiene sincronizado con el usuario
      const { data: actual } = await admin.auth.admin.getUserById(id);
      if (actual?.user?.email?.endsWith('@' + DOMINIO)) {
        const { error } = await admin.auth.admin.updateUserById(id, {
          email: `${usuario.toLowerCase()}@${DOMINIO}`,
          email_confirm: true,
        });
        if (error) return responder({ error: error.message }, 400);
      }

      const { error } = await admin.from('usuario').update({ usuario }).eq('id', id);
      if (error) return responder({ error: error.message }, 400);

      return responder({ ok: true });
    }

    return responder({ error: 'Acción desconocida' }, 400);
  } catch (e) {
    return responder({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

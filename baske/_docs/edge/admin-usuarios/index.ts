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

      const { data: creado, error } = await admin.auth.admin.createUser({
        email: `${usuario.toLowerCase()}@${DOMINIO}`,
        password: passwordAleatoria(),
        email_confirm: true,
        user_metadata: { usuario },
      });
      if (error) return responder({ error: error.message }, 400);

      // El trigger handle_new_user ya creo la fila en equipo.usuario
      if (cuerpo.id_miembro) {
        const { error: errMiembro } = await admin.from('miembro')
          .update({ id_usuario: creado.user.id })
          .eq('id', cuerpo.id_miembro);
        if (errMiembro) return responder({ error: 'Usuario creado, pero no se pudo vincular al miembro: ' + errMiembro.message }, 400);
      }

      return responder({ ok: true, id_usuario: creado.user.id });
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

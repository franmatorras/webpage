// Credenciales del proyecto Supabase *de la fiesta* — separado del de Lecturas.
//
// Este archivo se sirve al navegador, así que solo puede contener la URL pública
// y la clave publishable ("anon"). Nunca la service_role.
//
// La clave de la fiesta permite escribir (cualquiera puede subir fotos), por eso
// vive en un proyecto aparte: aunque alguien abuse de ella, no alcanza la base de
// datos de la biblioteca personal.
//
// Los nombres llevan prefijo FIESTA_ a propósito: supabase-config.js declara
// SUPABASE_URL con const, y dos const con el mismo nombre en la misma página dan
// "SyntaxError: Identifier 'SUPABASE_URL' has already been declared".
const FIESTA_SUPABASE_URL = 'https://itegkxwkowgjridluhwp.supabase.co';
const FIESTA_SUPABASE_ANON_KEY = 'sb_publishable_mzye-2hgXORThm7WLsjj0w_Zzt0XLOU';

// Hash SHA-256 de la contraseña para subir fotos (projects/fotos.html).
// Vacío = subida cerrada: la página muestra un aviso y no enseña el formulario.
//
// OJO: es una puerta de interfaz, no seguridad. Con la clave anon de arriba se
// puede subir igualmente sin pasar por ella; lo que protege de verdad son las
// políticas de fiesta_setup.sql.
//
// No distingue mayúsculas ni espacios al principio o al final (los teclados de
// móvil ponen la primera en mayúscula solos). Mejor sin tildes ni eñes.
//
// Para poner o cambiar la contraseña, en PowerShell:
//
//   $clave = 'la-contraseña'
//   $t = ('fiesta-cumple:' + $clave.Trim().ToLowerInvariant()).Normalize()
//   -join ([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($t)) | ForEach-Object { $_.ToString('x2') })
//
// y pegar el resultado aquí. Al cambiarla, todos los móviles que ya la habían
// puesto vuelven a pedirla.
// Aquí va el HASH que devuelve el comando de arriba (64 caracteres, 0-9 y a-f),
// nunca la contraseña en claro: la página compara hashes, no textos.
const FIESTA_CLAVE_HASH = 'c64a64b29454c81c85b127ad255311fc71200cbfdb8e4e1b391bc9e219882d6e';

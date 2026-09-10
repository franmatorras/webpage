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
//
// TODO: sustituir por los datos reales del nuevo proyecto (Project Settings > API).
// Hasta entonces el muro de fotos muestra un aviso y no intenta conectarse.
const FIESTA_SUPABASE_URL = 'https://itegkxwkowgjridluhwp.supabase.co';
const FIESTA_SUPABASE_ANON_KEY = 'sb_publishable_mzye-2hgXORThm7WLsjj0w_Zzt0XLOU';

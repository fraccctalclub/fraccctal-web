// Login de fundadoras: magic link por email, vía Supabase.
// Se importa como módulo ES desde un CDN — no hace falta build ni npm para esto,
// corre directo en el navegador.
//
// EDITAR: pegar acá la URL y la anon key de tu proyecto de Supabase
// (Project Settings → API). La anon key es pública a propósito: no sirve para
// escribir datos, solo para pedir el login — la protección real vive en las
// políticas de Supabase y en las Netlify Functions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "PEGAR_URL_DE_SUPABASE";
const SUPABASE_ANON_KEY = "PEGAR_ANON_KEY_DE_SUPABASE";

export const isConfigured =
  SUPABASE_URL !== "PEGAR_URL_DE_SUPABASE" && SUPABASE_ANON_KEY !== "PEGAR_ANON_KEY_DE_SUPABASE";

export const supabase = isConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

export async function sendMagicLink(email) {
  if (!isConfigured) return { error: { message: "not_configured" } };
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/preventa.html` },
  });
  return { error };
}

export async function getSession() {
  if (!isConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signOut() {
  if (!isConfigured) return;
  await supabase.auth.signOut();
}

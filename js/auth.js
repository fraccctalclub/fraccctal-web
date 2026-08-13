// Login de fundadoras: magic link por email, vía Supabase.
// Se importa como módulo ES desde un CDN — no hace falta build ni npm para esto,
// corre directo en el navegador.
//
// EDITAR: pegar aquí la URL y la anon key de tu proyecto de Supabase
// (Project Settings → API). La anon key es pública a propósito: no sirve para
// escribir datos, solo para pedir el login — la protección real vive en las
// políticas de Supabase y en las Netlify Functions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://hvxjahxcbnaumnfsnywf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2eGphaHhjYm5hdW1uZnNueXdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0OTc3MzksImV4cCI6MjEwMTA3MzczOX0.MnQNDGhr9ePdtOTn-bXaHZyvk3-AIvRcAOaAG69_ASc";

export const isConfigured =
  SUPABASE_URL !== "PEGAR_URL_DE_SUPABASE" && SUPABASE_ANON_KEY !== "PEGAR_ANON_KEY_DE_SUPABASE";

export const supabase = isConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Antes de mandar el magic link (y de que Supabase cree una cuenta para ese
// email), chequeamos que sea una fundadora o miembro activa. Sin esto,
// cualquier email podría pedirse un link y entrar a preventa.html.
//
// Reintenta con una pequeña espera: justo después de pagar, la persona puede
// llegar acá (o al gate de un encuentro) antes de que el webhook de Stripe
// termine de escribir su fila en Supabase — sin esto, ese primer chequeo le
// da "no sos socia" aunque el pago ya se haya confirmado.
async function checkMembershipOnce(email) {
  try {
    const res = await fetch("/.netlify/functions/check-membership", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.isMember;
  } catch {
    return false;
  }
}

export async function checkMembership(email, { retries = 2, delayMs = 1500 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (await checkMembershipOnce(email)) return true;
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}

export async function sendMagicLink(email) {
  if (!isConfigured) return { error: { message: "not_configured" } };

  const isMember = await checkMembership(email);
  if (!isMember) return { error: { message: "no_es_socia" } };

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

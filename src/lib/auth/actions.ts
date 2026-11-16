"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const credentialsSchema = z.object({
  email: z.string().email("Informe um e-mail válido."),
  password: z.string().min(6, "A senha deve ter ao menos 6 caracteres."),
});

export interface AuthState {
  error?: string;
}

/** Login com e-mail e senha (Supabase Auth). */
export async function signInAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  // Sanitiza o destino: aceita apenas caminhos internos (evita open redirect).
  const rawRedirect = (formData.get("redirectTo") as string) || "/dashboard";
  const redirectTo =
    rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
      ? rawRedirect
      : "/dashboard";

  if (!isSupabaseConfigured()) {
    // Modo demonstração: sem backend, segue direto para a área interna.
    redirect(redirectTo);
  }

  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "E-mail ou senha incorretos." };
  }

  redirect(redirectTo);
}

/** Encerra a sessão atual. */
export async function signOutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

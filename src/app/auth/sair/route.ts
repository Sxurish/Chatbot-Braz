import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const ALLOWED = new Set(["sem-acesso", "sessao"]);

/** Encerra a sessão e volta ao login (usado quando o acesso foi retirado). */
export async function GET(request: NextRequest) {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  const motivo = request.nextUrl.searchParams.get("motivo") ?? "";
  const url = new URL("/login", request.url);
  if (ALLOWED.has(motivo)) url.searchParams.set("motivo", motivo);
  return NextResponse.redirect(url);
}

import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // Rotas de API (chatbot público e webhooks da Meta) não usam sessão de
  // usuário — evita o custo de auth.getUser() por request e mantém a
  // resposta rápida exigida pelos webhooks.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Aplica a todas as rotas, exceto:
     * - _next/static, _next/image (assets)
     * - favicon e arquivos estáticos comuns
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

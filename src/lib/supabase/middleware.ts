import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "./config";

/**
 * Atualiza/renova a sessão do Supabase a cada requisição e protege as rotas
 * do CRM. Deve ser chamada a partir do middleware raiz.
 *
 * Em modo demonstração (sem Supabase configurado) não há proteção de rota —
 * o app fica acessível para avaliação da interface.
 */
export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request });

  // Sem Supabase configurado: segue sem autenticação (modo demo).
  if (!isSupabaseConfigured()) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthPage = pathname === "/login";
  const isProtected = CRM_PREFIXES.some((p) => pathname.startsWith(p));

  // Não autenticado tentando acessar área protegida → login.
  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  // Autenticado na página de login → dashboard.
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

/** Prefixos das rotas do CRM que exigem autenticação. */
const CRM_PREFIXES = [
  "/dashboard",
  "/leads",
  "/clientes",
  "/conversas",
  "/casos",
  "/processos",
  "/contratos",
  "/documentos",
  "/agenda",
  "/tarefas",
  "/follow-up",
  "/financeiro",
  "/notificacoes",
  "/metricas",
  "/base-conhecimento",
  "/equipe",
  "/lgpd",
  "/auditoria",
  "/configuracoes",
];

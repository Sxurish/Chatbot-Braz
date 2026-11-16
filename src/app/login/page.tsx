import Link from "next/link";
import { Gavel, Info } from "lucide-react";
import { LoginForm } from "./login-form";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { OFFICE_OAB } from "@/lib/constants";

const MOTIVOS: Record<string, string> = {
  "sem-acesso":
    "Seu acesso ao CRM não está ativo. Fale com o administrador do escritório.",
  sessao: "Sua sessão expirou. Entre de novo ou peça um novo código.",
};

export const metadata = {
  title: "Acessar CRM — Dr. Jean Braz",
};

export default async function LoginPage(
  props: {
    searchParams: Promise<{ redirectTo?: string; motivo?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const demoMode = !isSupabaseConfigured();
  const redirectTo = searchParams.redirectTo ?? "/dashboard";
  const notice = searchParams.motivo ? MOTIVOS[searchParams.motivo] : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-navy px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-gold text-brand-navy">
            <Gavel className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-semibold text-white">Dr. Jean Braz</h1>
          <p className="text-sm text-brand-gold">CRM Jurídico • {OFFICE_OAB}</p>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-xl">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">
            Acesso da equipe
          </h2>
          <p className="mb-6 text-sm text-slate-500">
            Entre com suas credenciais para acessar o painel interno.
          </p>

          {demoMode && (
            <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Modo demonstração ativo (Supabase não configurado). Clique em{" "}
                <strong>Entrar</strong> para acessar o painel com dados de exemplo.
              </span>
            </div>
          )}

          {notice && (
            <div role="alert" className="mb-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          <LoginForm redirectTo={redirectTo} demoMode={demoMode} />

          <div className="mt-6 flex items-center justify-between border-t pt-4 text-sm">
            <Link href="/acesso?modo=primeiro" className="font-medium text-brand-primary hover:underline">
              Primeiro acesso
            </Link>
            <Link href="/acesso?modo=senha" className="text-slate-500 hover:text-brand-primary">
              Esqueci minha senha
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          <Link href="/" className="hover:text-white">
            ← Voltar para o site
          </Link>
        </p>
      </div>
    </main>
  );
}

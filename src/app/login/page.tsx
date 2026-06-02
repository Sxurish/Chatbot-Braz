import Link from "next/link";
import { Gavel, Info } from "lucide-react";
import { LoginForm } from "./login-form";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = {
  title: "Acessar CRM — Dr. Jean Braz",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { redirectTo?: string };
}) {
  const demoMode = !isSupabaseConfigured();
  const redirectTo = searchParams.redirectTo ?? "/dashboard";

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-navy px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-gold text-brand-navy">
            <Gavel className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-semibold text-white">Dr. Jean Braz</h1>
          <p className="text-sm text-brand-gold">CRM Jurídico • OAB/SP</p>
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

          <LoginForm redirectTo={redirectTo} demoMode={demoMode} />
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

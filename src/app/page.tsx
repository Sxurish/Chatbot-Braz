import Link from "next/link";
import { Gavel, MessageSquare, ShieldCheck, LayoutDashboard, ArrowRight } from "lucide-react";

const AREAS = [
  "Direito Penal",
  "Direito Civil",
  "Direito Administrativo",
  "Direito Previdenciário",
  "Direito Bancário",
  "Regularização Imobiliária",
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-brand-navy text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gold text-brand-navy">
            <Gavel className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="font-semibold">Dr. Jean Braz</p>
            <p className="text-xs text-brand-gold">Advocacia • OAB/SP</p>
          </div>
        </div>
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-md border border-white/20 px-4 py-2 text-sm hover:bg-white/10"
        >
          <LayoutDashboard className="h-4 w-4" /> Acessar CRM
        </Link>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-20 pt-12 lg:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-gold/30 bg-brand-gold/10 px-3 py-1 text-xs font-medium text-brand-gold">
              <ShieldCheck className="h-3.5 w-3.5" /> Atendimento ético e em conformidade com a LGPD
            </span>
            <h1 className="mt-6 text-4xl font-bold leading-tight lg:text-5xl">
              Atendimento jurídico moderno, técnico e estratégico
            </h1>
            <p className="mt-4 max-w-lg text-slate-300">
              Converse com o assistente virtual do escritório para um pré-atendimento
              inicial. Coletamos suas informações com segurança e encaminhamos seu caso
              para análise da equipe jurídica.
            </p>
            <p className="mt-3 text-sm text-slate-400">
              Este atendimento é inicial e informativo. Não substitui consulta jurídica
              formal, não constitui parecer jurídico e não representa garantia de
              resultado.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/atendimento"
                className="flex items-center gap-2 rounded-md bg-brand-gold px-6 py-3 font-medium text-brand-navy hover:bg-brand-gold/90"
              >
                <MessageSquare className="h-5 w-5" /> Iniciar pré-atendimento
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-8">
            <h2 className="text-lg font-semibold">Áreas de atuação</h2>
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {AREAS.map((area) => (
                <li
                  key={area}
                  className="flex items-center gap-2 rounded-lg bg-white/5 px-4 py-3 text-sm text-slate-200"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-gold" />
                  {area}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}

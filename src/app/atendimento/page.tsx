import Link from "next/link";
import { ArrowLeft, Gavel } from "lucide-react";
import { ChatWidget } from "@/components/chat/chat-widget";

export const metadata = {
  title: "Pré-atendimento — Dr. Jean Braz",
  description:
    "Atendimento inicial inteligente. Triagem jurídica em conformidade com a LGPD.",
};

export default function AtendimentoPage() {
  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-navy text-brand-gold">
              <Gavel className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold text-slate-900">Dr. Jean Braz</span>
          </div>
          <Link
            href="/"
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-brand-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Início
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">Pré-atendimento jurídico</h1>
          <p className="mt-2 text-sm text-slate-500">
            Converse com nosso assistente virtual para uma triagem inicial. As informações
            serão organizadas e encaminhadas para análise da equipe jurídica.
          </p>
        </div>
        <ChatWidget />
      </div>
    </main>
  );
}

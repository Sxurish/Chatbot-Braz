import Link from "next/link";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

/** Tela exibida a quem não é Admin numa área restrita (Financeiro, Contratos). */
export function AdminOnly({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="mx-auto mt-10 max-w-md rounded-lg border bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-navy/5">
          <Lock className="h-5 w-5 text-brand-navy" />
        </div>
        <h2 className="text-base font-semibold text-slate-900">Acesso restrito</h2>
        <p className="mt-2 text-sm text-slate-600">
          Esta área tem dados financeiros e só pode ser aberta por administradores
          do escritório.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-md bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-primary/90"
        >
          Voltar ao dashboard
        </Link>
      </div>
    </>
  );
}

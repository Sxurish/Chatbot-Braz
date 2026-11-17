"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Barra do topo (some na impressão): voltar e imprimir / salvar em PDF. */
export function PrintToolbar({ backHref }: { backHref: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para o lead
      </Link>
      <div className="flex items-center gap-3">
        <span className="hidden text-xs text-slate-500 sm:inline">
          Para PDF, escolha &quot;Salvar como PDF&quot; na janela de impressão.
        </span>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Imprimir / salvar PDF
        </Button>
      </div>
    </div>
  );
}

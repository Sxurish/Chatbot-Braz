import Link from "next/link";
import { Gavel } from "lucide-react";
import { OFFICE_OAB } from "@/lib/constants";

/** Moldura das telas de acesso (login, primeiro acesso, criar senha). */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-navy px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-gold text-brand-navy">
            <Gavel className="h-7 w-7" />
          </div>
          <p className="text-xl font-semibold text-white">Dr. Jean Braz</p>
          <p className="text-sm text-brand-gold">CRM Jurídico • {OFFICE_OAB}</p>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-xl">
          <h1 className="mb-1 text-lg font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="mb-6 text-sm text-slate-500">{subtitle}</p>}
          {children}
        </div>

        <div className="mt-6 text-center text-xs text-slate-400">
          {footer ?? (
            <Link href="/" className="hover:text-white">
              ← Voltar para o site
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

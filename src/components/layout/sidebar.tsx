"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Briefcase,
  Scale,
  FileSignature,
  MessagesSquare,
  FolderOpen,
  CalendarDays,
  ListChecks,
  Bell,
  Repeat,
  Wallet,
  BarChart3,
  BookOpen,
  Settings,
  ShieldCheck,
  ScrollText,
  Gavel,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Visão geral",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Atendimento",
    items: [
      { href: "/leads", label: "Leads", icon: Users },
      { href: "/clientes", label: "Clientes", icon: UserCheck },
      { href: "/conversas", label: "Conversas", icon: MessagesSquare },
      { href: "/follow-up", label: "Follow-up", icon: Repeat },
    ],
  },
  {
    title: "Jurídico",
    items: [
      { href: "/casos", label: "Casos", icon: Briefcase },
      { href: "/processos", label: "Processos", icon: Scale },
      { href: "/contratos", label: "Contratos", icon: FileSignature },
      { href: "/documentos", label: "Documentos", icon: FolderOpen },
    ],
  },
  {
    title: "Operação",
    items: [
      { href: "/agenda", label: "Agenda", icon: CalendarDays },
      { href: "/tarefas", label: "Tarefas", icon: ListChecks },
      { href: "/notificacoes", label: "Notificações", icon: Bell },
      { href: "/financeiro", label: "Financeiro", icon: Wallet },
    ],
  },
  {
    title: "Gestão",
    items: [
      { href: "/metricas", label: "Métricas", icon: BarChart3 },
      { href: "/base-conhecimento", label: "Base de conhecimento", icon: BookOpen },
      { href: "/templates", label: "Templates de documentos", icon: FileSignature },
      { href: "/equipe", label: "Usuários / Equipe", icon: ShieldCheck },
      { href: "/lgpd", label: "Políticas e consentimentos", icon: ScrollText },
      { href: "/auditoria", label: "Logs de auditoria", icon: ScrollText },
      { href: "/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-brand-navy text-slate-200 lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-white/10 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-gold text-brand-navy">
          <Gavel className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-white">Dr. Jean Braz</p>
          <p className="text-[11px] text-brand-gold">CRM Jurídico</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-6">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {group.title}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-brand-primary text-white"
                          : "text-slate-300 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-4">
        <Link
          href="/atendimento"
          className="block rounded-md bg-brand-gold/10 px-3 py-2 text-center text-xs font-medium text-brand-gold hover:bg-brand-gold/20"
        >
          Abrir chatbot de atendimento ↗
        </Link>
      </div>
    </aside>
  );
}

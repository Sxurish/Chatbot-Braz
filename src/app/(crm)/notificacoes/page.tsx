import Link from "next/link";
import { MarkAllRead, ReadToggle } from "./read-buttons";
import {
  Bell,
  AlertTriangle,
  FileText,
  CalendarClock,
  Clock,
  Repeat,
  UserPlus,
  FileSignature,
  Wallet,
  Gavel,
  ServerCrash,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListToolbar } from "@/components/crm/list-toolbar";
import { listNotifications } from "@/lib/data/crm";
import type { RawParams } from "@/lib/list-params";
import { optionsOf } from "@/lib/list-views/common";
import {
  NOTIFICATION_SORT_LABELS,
  NOTIFICATION_SORTS,
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LABELS,
  READ_FILTERS,
  READ_FILTER_LABELS,
  filterNotifications,
  isNotificationViewFiltered,
  parseNotificationView,
  sortNotifications,
} from "@/lib/list-views/notificacoes";
import { timeAgo } from "@/lib/utils";
import type { NotificationType } from "@/lib/types";

const ICONS: Record<
  NotificationType,
  { icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  novo_lead: { icon: UserPlus, tone: "bg-blue-100 text-blue-600" },
  lead_urgente: { icon: AlertTriangle, tone: "bg-red-100 text-red-600" },
  documento_enviado: { icon: FileText, tone: "bg-indigo-100 text-indigo-600" },
  consulta_agendada: { icon: CalendarClock, tone: "bg-emerald-100 text-emerald-600" },
  tarefa_vencendo: { icon: Clock, tone: "bg-amber-100 text-amber-600" },
  tarefa_atrasada: { icon: Clock, tone: "bg-red-100 text-red-600" },
  lead_aguardando: { icon: Clock, tone: "bg-slate-100 text-slate-600" },
  follow_up_pendente: { icon: Repeat, tone: "bg-amber-100 text-amber-600" },
  contrato_enviado: { icon: FileSignature, tone: "bg-indigo-100 text-indigo-600" },
  contrato_assinado: { icon: FileSignature, tone: "bg-emerald-100 text-emerald-600" },
  pagamento_atraso: { icon: Wallet, tone: "bg-red-100 text-red-600" },
  andamento_novo: { icon: Gavel, tone: "bg-violet-100 text-violet-600" },
  automacao_falhou: { icon: ServerCrash, tone: "bg-red-100 text-red-600" },
};

export default async function NotificationsPage(props: { searchParams: Promise<RawParams> }) {
  const sp = await props.searchParams;
  const all = await listNotifications();
  const unread = all.filter((n) => !n.read).length;
  const view = parseNotificationView(sp);
  const notifications = sortNotifications(filterNotifications(all, view), view.ordem);

  return (
    <>
      <PageHeader
        title="Notificações"
        description={
          unread > 0
            ? `${unread} não lida(s). Alertas internos da operação.`
            : "Alertas internos da operação."
        }
        action={unread > 0 ? <MarkAllRead /> : undefined}
      />

      {all.length > 0 && (
        <ListToolbar
          path="/notificacoes"
          search={{ value: view.q, placeholder: "Buscar no título ou no texto" }}
          selects={[
            {
              name: "leitura",
              label: "Leitura",
              value: view.leitura,
              options: optionsOf(READ_FILTERS, READ_FILTER_LABELS),
              allLabel: "Lidas e não lidas",
            },
            {
              name: "tipo",
              label: "Tipo",
              value: view.tipo,
              options: optionsOf(NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABELS),
            },
          ]}
          sort={{ value: view.ordem, options: optionsOf(NOTIFICATION_SORTS, NOTIFICATION_SORT_LABELS) }}
          active={isNotificationViewFiltered(view)}
          count={{
            shown: notifications.length,
            total: all.length,
            singular: "notificação",
            plural: "notificações",
          }}
        />
      )}

      {notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={all.length > 0 ? "Nenhuma notificação encontrada" : "Nenhuma notificação"}
          description={
            all.length > 0
              ? "Mude ou limpe os filtros para ver outras notificações."
              : "Você será avisado sobre novos leads, prazos e documentos."
          }
        />
      ) : (
        <Card className="divide-y divide-slate-100">
          {notifications.map((n) => {
            const cfg = ICONS[n.type];
            const Icon = cfg.icon;
            const href =
              n.entity_type === "lead" && n.entity_id
                ? `/leads/${n.entity_id}`
                : n.entity_type === "process" && n.entity_id
                  ? `/processos/${n.entity_id}`
                  : n.entity_type === "task"
                    ? "/tarefas"
                    : n.entity_type === "automation"
                      ? "/automacoes"
                      : null;

            const content = (
              <div
                className={`flex items-start gap-3 p-4 ${
                  n.read ? "" : "bg-brand-primary/[0.03]"
                }`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${cfg.tone}`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-900">{n.title}</p>
                    {!n.read && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary" />
                    )}
                  </div>
                  {n.body && <p className="text-sm text-slate-600">{n.body}</p>}
                  <p className="mt-0.5 text-xs text-slate-400">{timeAgo(n.created_at)}</p>
                </div>
              </div>
            );

            return (
              <div key={n.id} className="flex items-center gap-1 pr-3">
                {href ? (
                  <Link href={href} className="block min-w-0 flex-1 hover:bg-slate-50">
                    {content}
                  </Link>
                ) : (
                  <div className="min-w-0 flex-1">{content}</div>
                )}
                <ReadToggle id={n.id} read={n.read} />
              </div>
            );
          })}
        </Card>
      )}

      <p className="mt-4 text-xs text-slate-400">
        Integrações futuras: e-mail, WhatsApp, Telegram, Slack e n8n.
      </p>
    </>
  );
}

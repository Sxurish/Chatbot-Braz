import Link from "next/link";
import { MessagesSquare, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ChannelBadge } from "@/components/crm/channel-badge";
import { listConversations } from "@/lib/data/conversations";
import { timeAgo } from "@/lib/utils";

export default async function ConversationsPage() {
  const conversations = await listConversations();

  return (
    <>
      <PageHeader
        title="Conversas"
        description="Atendimentos do chatbot por canal (site, WhatsApp e Instagram)."
      />

      {conversations.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="Nenhuma conversa ainda"
          description="As conversas do chatbot e dos canais de mensageria aparecerão aqui."
        />
      ) : (
        <Card className="divide-y divide-slate-100">
          {conversations.map((c) => {
            const inner = (
              <div className="flex items-center justify-between gap-4 p-4 hover:bg-slate-50">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-slate-900">
                      {c.contact_name ?? c.external_contact_id ?? "Contato"}
                    </p>
                    <ChannelBadge channel={c.channel} />
                    {c.status === "encerrada" && (
                      <Badge className="border-slate-200 bg-slate-50 text-slate-500">
                        Encerrada
                      </Badge>
                    )}
                  </div>
                  {c.last_message && (
                    <p className="mt-1 truncate text-sm text-slate-500">
                      {c.last_message}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-slate-400">
                    {c.message_count} mensagem(ns)
                    {c.last_message_at ? ` • ${timeAgo(c.last_message_at)}` : ""}
                  </p>
                </div>
                {c.lead_id && (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-brand-primary">
                    Ver lead <ArrowRight className="h-3 w-3" />
                  </span>
                )}
              </div>
            );

            return c.lead_id ? (
              <Link key={c.id} href={`/leads/${c.lead_id}`} className="block">
                {inner}
              </Link>
            ) : (
              <div key={c.id}>{inner}</div>
            );
          })}
        </Card>
      )}

      <p className="mt-4 text-xs text-slate-400">
        Conversas de WhatsApp e Instagram são criadas automaticamente quando os
        webhooks estão configurados (ver docs/INTEGRACAO-CANAIS.md).
      </p>
    </>
  );
}

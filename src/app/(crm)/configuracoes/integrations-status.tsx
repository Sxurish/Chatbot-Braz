import {
  CheckCircle2,
  Circle,
  Copy,
  MessageSquare,
  Instagram,
  Bot,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { IntegrationStatus } from "@/lib/data/settings";

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge
      className={
        ok
          ? "gap-1 border-emerald-200 bg-emerald-50 text-emerald-700"
          : "gap-1 border-slate-200 bg-slate-50 text-slate-600"
      }
    >
      {ok ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <Circle className="h-3 w-3" />
      )}
      {label}
    </Badge>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-mono text-xs text-slate-700">{value}</span>
    </div>
  );
}

export function IntegrationsStatus({ status }: { status: IntegrationStatus }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Integrações</CardTitle>
        <CardDescription>
          Status dos canais de mensageria e do provedor de IA. Chaves continuam
          protegidas no servidor (.env) — esta visão é apenas para diagnóstico.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* WhatsApp */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
              <MessageSquare className="h-4 w-4 text-emerald-600" />
              WhatsApp Cloud API
            </div>
            <StatusBadge
              ok={status.whatsapp.configured}
              label={status.whatsapp.configured ? "Configurado" : "Pendente"}
            />
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2">
            <Row
              label="Phone Number ID"
              value={status.whatsapp.phone_number_id_masked ?? "—"}
            />
            <Row
              label="URL do webhook"
              value={
                <span className="inline-flex items-center gap-1">
                  {status.whatsapp.webhook_url}
                  <Copy className="h-3 w-3 text-slate-400" />
                </span>
              }
            />
          </div>
        </div>

        {/* Instagram */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
              <Instagram className="h-4 w-4 text-pink-600" />
              Instagram Messaging
            </div>
            <StatusBadge
              ok={status.instagram.configured}
              label={status.instagram.configured ? "Configurado" : "Pendente"}
            />
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2">
            <Row label="URL do webhook" value={status.instagram.webhook_url} />
            {!status.instagram.configured && (
              <p className="pt-1 text-xs text-amber-600">{status.instagram.note}</p>
            )}
          </div>
        </div>

        {/* IA */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
              <Bot className="h-4 w-4 text-brand-primary" />
              Provedor de IA
            </div>
            <StatusBadge
              ok={status.ai.has_api_key}
              label={
                status.ai.provider === "mock"
                  ? "Mock ativo"
                  : status.ai.has_api_key
                    ? "Chave ok"
                    : "Sem chave"
              }
            />
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2">
            <Row label="Provedor ativo" value={status.ai.provider} />
            <Row
              label="Variável de ambiente"
              value={
                status.ai.provider === "mock"
                  ? "n/a"
                  : status.ai.has_api_key
                    ? "presente"
                    : "ausente"
              }
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

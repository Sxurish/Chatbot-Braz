import {
  COMMERCIAL_STATUS_LABELS,
  LEGAL_AREA_LABELS,
  LEGAL_STATUS_LABELS,
} from "./constants";
import type {
  CommercialStatus,
  LeadSource,
  LegalStatus,
  Lead,
  TeamUser,
} from "./types";

/**
 * Ordem das etapas no funil comercial. As etapas finais (perdido, não
 * qualificado) ficam de fora porque não representam progresso.
 */
const COMMERCIAL_ORDER: CommercialStatus[] = [
  "novo_lead",
  "em_qualificacao",
  "aguardando_documentos",
  "consulta_agendada",
  "consulta_realizada",
  "proposta_enviada",
  "negociacao",
  "contrato_enviado",
  "contrato_assinado",
  "cliente_ativo",
];

const COMMERCIAL_LOST: CommercialStatus[] = ["perdido", "nao_qualificado"];

const LEGAL_ORDER: LegalStatus[] = [
  "triagem_inicial",
  "analise_documental",
  "estrategia_em_definicao",
  "aguardando_procuracao",
  "aguardando_contrato",
  "em_elaboracao",
  "protocolado",
  "em_andamento",
  "aguardando_audiencia",
  "aguardando_decisao",
  "recurso",
  "encerrado",
];

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  /** Percentual sobre o total inicial (0..100). */
  pctTotal: number;
  /** Percentual em relação à etapa anterior (0..100). */
  pctPrev: number;
}

export interface FunnelResult {
  steps: FunnelStep[];
  total: number;
  lost: number;
}

/**
 * Para cada etapa, conta quantos leads chegaram OU passaram por ela.
 * Um lead em "consulta_realizada" também conta nas etapas anteriores
 * (novo_lead, em_qualificacao, etc.) — isso permite ler o funil como
 * "quantos chegaram até aqui".
 */
function buildOrderedFunnel<T extends string>(
  leads: Pick<Lead, "commercial_status" | "legal_status">[],
  pick: (l: Pick<Lead, "commercial_status" | "legal_status">) => T,
  order: T[],
  labels: Record<T, string>
): { steps: FunnelStep[]; total: number } {
  const indexOf = new Map<T, number>();
  order.forEach((s, i) => indexOf.set(s, i));

  const counts = new Array(order.length).fill(0) as number[];
  for (const lead of leads) {
    const status = pick(lead);
    const idx = indexOf.get(status);
    if (idx === undefined) continue;
    for (let i = 0; i <= idx; i++) counts[i] += 1;
  }

  const total = counts[0] ?? 0;
  const steps: FunnelStep[] = order.map((key, i) => ({
    key,
    label: labels[key],
    count: counts[i],
    pctTotal: total ? Math.round((counts[i] / total) * 100) : 0,
    pctPrev: i === 0 ? 100 : counts[i - 1] ? Math.round((counts[i] / counts[i - 1]) * 100) : 0,
  }));

  return { steps, total };
}

export function buildCommercialFunnel(leads: Lead[]): FunnelResult {
  const { steps, total } = buildOrderedFunnel(
    leads,
    (l) => l.commercial_status,
    COMMERCIAL_ORDER,
    COMMERCIAL_STATUS_LABELS
  );
  const lost = leads.filter((l) =>
    COMMERCIAL_LOST.includes(l.commercial_status)
  ).length;
  return { steps, total, lost };
}

export function buildLegalFunnel(leads: Lead[]): FunnelResult {
  const inLegal = leads.filter((l) => Boolean(l.legal_status));
  const { steps, total } = buildOrderedFunnel(
    inLegal,
    (l) => l.legal_status,
    LEGAL_ORDER,
    LEGAL_STATUS_LABELS
  );
  return { steps, total, lost: 0 };
}

// ---------------------------------------------------------------------------
// Rankings
// ---------------------------------------------------------------------------
export interface RankingItem {
  key: string;
  label: string;
  count: number;
  pct: number;
}

function rank<T extends string>(
  values: T[],
  labelFor: (key: T) => string,
  limit = 10
): RankingItem[] {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const total = values.length;
  return Array.from(counts.entries())
    .map(([key, count]) => ({
      key,
      label: labelFor(key),
      count,
      pct: total ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

const SOURCE_LABELS: Record<LeadSource, string> = {
  chatbot: "Chatbot (site)",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  google: "Google",
  indicacao: "Indicação",
  site: "Site",
  telefone: "Telefone",
  outro: "Outro",
};

export function buildAreaRanking(leads: Lead[]): RankingItem[] {
  return rank(
    leads.map((l) => l.legal_area),
    (key) => LEGAL_AREA_LABELS[key] ?? key
  );
}

export function buildSourceRanking(leads: Lead[]): RankingItem[] {
  return rank(
    leads.map((l) => l.source),
    (key) => SOURCE_LABELS[key] ?? key
  );
}

// ---------------------------------------------------------------------------
// Carga por responsável
// ---------------------------------------------------------------------------
export interface WorkloadRow {
  userId: string | null;
  name: string;
  total: number;
  urgent: number;
  stale: number;
}

const STALE_AFTER_DAYS = 7;
const STALE_STATUSES: CommercialStatus[] = [
  "novo_lead",
  "em_qualificacao",
  "aguardando_documentos",
];

function isStale(lead: Lead): boolean {
  if (!STALE_STATUSES.includes(lead.commercial_status)) return false;
  const created = new Date(lead.created_at).getTime();
  const days = (Date.now() - created) / (1000 * 60 * 60 * 24);
  return days >= STALE_AFTER_DAYS;
}

export function buildWorkload(leads: Lead[], team: TeamUser[]): WorkloadRow[] {
  const userById = new Map(team.map((u) => [u.id, u]));
  const buckets = new Map<string | null, WorkloadRow>();

  for (const lead of leads) {
    const key = lead.assigned_to ?? null;
    const name =
      (key && userById.get(key)?.name) ?? (key ? "Usuário removido" : "Sem responsável");
    const current =
      buckets.get(key) ??
      ({ userId: key, name, total: 0, urgent: 0, stale: 0 } as WorkloadRow);
    current.total += 1;
    if (lead.urgency === "alta") current.urgent += 1;
    if (isStale(lead)) current.stale += 1;
    buckets.set(key, current);
  }

  return Array.from(buckets.values()).sort((a, b) => b.total - a.total);
}

export const STALE_THRESHOLD_DAYS = STALE_AFTER_DAYS;

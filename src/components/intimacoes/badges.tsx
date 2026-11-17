import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  AI_CONFIDENCE_LABELS,
  AI_STATUS_LABELS,
  PUBLICATION_STATUS_LABELS,
  type CourtPublication,
  type PublicationStatus,
} from "@/lib/intimacoes/types";

const STATUS_TONE: Record<PublicationStatus, string> = {
  para_conferir: "border-amber-200 bg-amber-50 text-amber-800",
  confirmada: "border-emerald-200 bg-emerald-50 text-emerald-700",
  descartada: "border-slate-200 bg-slate-100 text-slate-500",
};

export function PublicationStatusBadge({ status }: { status: PublicationStatus }) {
  return <Badge className={STATUS_TONE[status]}>{PUBLICATION_STATUS_LABELS[status]}</Badge>;
}

const CONFIDENCE_TONE = {
  alta: "border-sky-200 bg-sky-50 text-sky-700",
  media: "border-amber-200 bg-amber-50 text-amber-800",
  baixa: "border-red-200 bg-red-50 text-red-700",
} as const;

/** Selo da leitura da IA: confiança quando lida; senão a situação da leitura. */
export function AiBadge({ pub, className }: { pub: Pick<CourtPublication, "ai_status" | "ai_reading">; className?: string }) {
  if (pub.ai_status === "pronta" && pub.ai_reading) {
    const c = pub.ai_reading.confidence;
    return <Badge className={cn(CONFIDENCE_TONE[c], className)}>IA · {AI_CONFIDENCE_LABELS[c].toLowerCase()}</Badge>;
  }
  const tone = pub.ai_status === "falhou" ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-500";
  return <Badge className={cn(tone, className)}>{AI_STATUS_LABELS[pub.ai_status]}</Badge>;
}

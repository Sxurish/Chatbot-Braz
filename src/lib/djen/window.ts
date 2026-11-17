/**
 * Janela de datas que a rotina horária pede ao DJEN.
 * Sempre no fuso de Brasília.
 */
import { addDays, isoDateInSaoPaulo } from "@/lib/digest/dates";
import { parseDjenDate } from "@/lib/djen/parse";

/** Dias buscados na primeira execução. */
export const DJEN_FIRST_RUN_DAYS = 30;
/** Dias que repetimos antes do último dia buscado (o DJEN pode publicar com atraso). */
export const DJEN_OVERLAP_DAYS = 1;

export interface DjenWindow {
  /** AAAA-MM-DD. */
  from: string;
  /** AAAA-MM-DD (hoje em Brasília). */
  to: string;
  firstRun: boolean;
}

/**
 * Do último dia buscado com sucesso menos 1 dia até hoje.
 * Sem busca anterior (ou data inválida): os últimos 30 dias.
 */
export function djenSearchWindow(lastSuccessDate: string | null | undefined, now: Date = new Date()): DjenWindow {
  const today = isoDateInSaoPaulo(now);
  const last = parseDjenDate(lastSuccessDate ?? null);
  if (!last) {
    return { from: addDays(today, -DJEN_FIRST_RUN_DAYS), to: today, firstRun: true };
  }
  let from = addDays(last, -DJEN_OVERLAP_DAYS);
  // Data no futuro (relógio errado): busca só hoje.
  if (from > today) from = today;
  return { from, to: today, firstRun: false };
}

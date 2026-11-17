"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isIsoDate } from "@/lib/prazos/calendar";
import { MAX_DAYS } from "@/lib/prazos/compute";
import { confirmPublication, discardPublication, linkPublicationProcess } from "@/lib/intimacoes/confirm";

/**
 * Ações da tela de intimações. Quem grava é src/lib/intimacoes/confirm.ts,
 * com o login de quem está usando (RLS). Visualizador só lê. No modo
 * demonstração confere os dados e não grava nada.
 */

export interface IntimacaoActionState {
  ok?: boolean;
  error?: string;
  message?: string;
  /** Depois de confirmar: data final e link da tarefa. */
  finalDate?: string;
  taskLink?: string;
  closed?: "confirmada" | "descartada";
}

const DEMO_NOTICE = "Modo demonstração: conferido, mas nada foi gravado. Configure o Supabase para registrar.";
const UUID_RE = /^[0-9a-f-]{36}$/i;
const DEMO_ID_RE = /^[a-z]+-\d{3}$/;
const id = z.string().refine((v) => UUID_RE.test(v) || (!isSupabaseConfigured() && DEMO_ID_RE.test(v)), "Registro inválido.");
const optionalId = z
  .string()
  .trim()
  .transform((v) => v || null)
  .refine((v) => v === null || UUID_RE.test(v) || (!isSupabaseConfigured() && DEMO_ID_RE.test(v)), "Processo inválido.");

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

function checked(formData: FormData, key: string): boolean {
  const v = formData.get(key);
  return v === "on" || v === "true";
}

async function writer(): Promise<{ error: string } | { userId: string }> {
  const user = await getCurrentUser();
  if (!user.active) return { error: "Perfil inativo." };
  if (user.role === "visualizador") return { error: "Seu perfil só pode consultar." };
  return { userId: user.id };
}

function refresh(publicationId: string, processIds: (string | null | undefined)[] = []) {
  revalidatePath("/intimacoes");
  revalidatePath(`/intimacoes/${publicationId}`);
  for (const p of new Set(processIds.filter(Boolean))) revalidatePath(`/processos/${p}`);
}

const confirmSchema = z
  .object({
    publication_id: id,
    days: z.coerce
      .number({ error: "Informe o número de dias." })
      .int("Use um número inteiro de dias.")
      .min(1, "Informe o número de dias (1 ou mais).")
      .max(MAX_DAYS, `Prazo longo demais (máx. ${MAX_DAYS} dias).`),
    unit: z.enum(["uteis", "corridos"], { error: "Escolha dias úteis ou corridos." }),
    start_kind: z.enum(["disponibilizacao", "intimacao"], { error: "Escolha de onde o prazo conta." }),
    dobro: z.boolean(),
    title: z.string().trim().min(2, "Diga o que vence (ex.: Contestação).").max(200, "Título longo demais."),
    process_id: optionalId,
    update_process_deadline: z.boolean(),
    override_date: z.string().trim().refine((v) => v === "" || isIsoDate(v), "Data ajustada inválida."),
    override_reason: z.string().trim().max(1000, "Motivo longo demais (máx. 1.000)."),
    note: z.string().trim().max(2000, "Observação longa demais (máx. 2.000)."),
  })
  .refine((d) => !d.override_date || d.override_reason.length >= 5, {
    message: "Explique o motivo do ajuste da data.",
  })
  .refine((d) => !d.update_process_deadline || Boolean(d.process_id), {
    message: "Escolha o processo para atualizar o próximo prazo.",
  });

export async function confirmPublicationAction(_prev: IntimacaoActionState, formData: FormData): Promise<IntimacaoActionState> {
  const g = await writer();
  if ("error" in g) return { error: g.error };
  const parsed = confirmSchema.safeParse({
    publication_id: text(formData, "publication_id"),
    days: text(formData, "days"),
    unit: text(formData, "unit"),
    start_kind: text(formData, "start_kind"),
    dobro: checked(formData, "dobro"),
    title: text(formData, "title"),
    process_id: text(formData, "process_id"),
    update_process_deadline: checked(formData, "update_process_deadline"),
    override_date: text(formData, "override_date"),
    override_reason: text(formData, "override_reason"),
    note: text(formData, "note"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const db = await createClient();
  const { data: before } = await db.from("court_publications").select("process_id").eq("id", d.publication_id).maybeSingle();
  const out = await confirmPublication(db, {
    publicationId: d.publication_id,
    userId: g.userId,
    days: d.days,
    unit: d.unit,
    startKind: d.start_kind,
    dobro: d.dobro,
    title: d.title,
    processId: d.process_id,
    updateProcessDeadline: d.update_process_deadline,
    overrideFinalDate: d.override_date || null,
    overrideReason: d.override_reason || null,
    note: d.note || null,
    channel: "painel",
  });
  if (!out.ok) return { error: out.error };
  refresh(d.publication_id, [out.processId, (before as { process_id: string | null } | null)?.process_id]);
  revalidatePath("/tarefas");
  revalidatePath("/prazos");
  return {
    ok: true,
    closed: "confirmada",
    finalDate: out.finalDate,
    taskLink: "/tarefas",
    message: "Intimação conferida: o prazo foi registrado e a tarefa criada com prioridade alta.",
  };
}

const discardSchema = z.object({
  publication_id: id,
  reason: z.string().trim().min(3, "Informe o motivo do descarte.").max(1000, "Motivo longo demais (máx. 1.000)."),
});

export async function discardPublicationAction(_prev: IntimacaoActionState, formData: FormData): Promise<IntimacaoActionState> {
  const g = await writer();
  if ("error" in g) return { error: g.error };
  const parsed = discardSchema.safeParse({ publication_id: text(formData, "publication_id"), reason: text(formData, "reason") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const db = await createClient();
  const { data: before } = await db.from("court_publications").select("process_id").eq("id", parsed.data.publication_id).maybeSingle();
  const out = await discardPublication(db, {
    publicationId: parsed.data.publication_id,
    userId: g.userId,
    reason: parsed.data.reason,
    channel: "painel",
  });
  if (!out.ok) return { error: out.error };
  refresh(parsed.data.publication_id, [(before as { process_id: string | null } | null)?.process_id]);
  return { ok: true, closed: "descartada", message: "Intimação descartada. Ela fica no histórico com o motivo." };
}

const linkSchema = z.object({ publication_id: id, process_id: optionalId });

export async function linkPublicationProcessAction(_prev: IntimacaoActionState, formData: FormData): Promise<IntimacaoActionState> {
  const g = await writer();
  if ("error" in g) return { error: g.error };
  const parsed = linkSchema.safeParse({ publication_id: text(formData, "publication_id"), process_id: text(formData, "process_id") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  if (!isSupabaseConfigured()) return { ok: true, message: DEMO_NOTICE };

  const db = await createClient();
  const { data: before } = await db.from("court_publications").select("process_id").eq("id", parsed.data.publication_id).maybeSingle();
  const out = await linkPublicationProcess(db, {
    publicationId: parsed.data.publication_id,
    processId: parsed.data.process_id,
    userId: g.userId,
    channel: "painel",
  });
  if (!out.ok) return { error: out.error };
  refresh(parsed.data.publication_id, [parsed.data.process_id, (before as { process_id: string | null } | null)?.process_id]);
  return { ok: true, message: parsed.data.process_id ? "Processo vinculado." : "Vínculo removido." };
}

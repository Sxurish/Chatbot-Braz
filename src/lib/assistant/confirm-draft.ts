import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAttachment } from "@/lib/assistant/attachments";
import {
  buildInsertPlan,
  DRAFT_DEFS,
  pickDraftFields,
  validateDraft,
  type DraftKind,
} from "@/lib/assistant/draft-schema";
import { claimDraft, discardDraft, finishDraft, getDraft } from "@/lib/assistant/drafts";
import type { AssistantSession } from "@/lib/assistant/session";

export type ConfirmResult =
  | { ok: true; link: string; message: string }
  | { ok: false; error: string; field?: string; status?: number };

const PAGES: Record<DraftKind, string[]> = {
  processo: ["/processos", "/casos"],
  lead: ["/leads"],
  tarefa: ["/tarefas"],
  prazo: ["/tarefas", "/processos"],
  compromisso: ["/agenda"],
  documento: ["/documentos"],
};

export function canWrite(session: AssistantSession) {
  return session.user.role !== "visualizador";
}

/**
 * Confirma um rascunho: valida de novo os dados editados no cartão e grava
 * com o login de quem confirmou (as regras de RLS valem). Só aqui o
 * assistente cria registros no CRM.
 */
export async function confirmDraft(
  session: AssistantSession,
  draftId: string,
  rawData: unknown
): Promise<ConfirmResult> {
  const { user } = session;
  if (!canWrite(session)) {
    return { ok: false, status: 403, error: "Seu papel na equipe é só de visualização." };
  }
  const draft = await getDraft(user.id, draftId);
  if (!draft) return { ok: false, status: 404, error: "Rascunho não encontrado." };
  if (draft.status !== "pendente") {
    return {
      ok: false,
      status: 409,
      error: draft.status === "descartado" ? "Este rascunho foi descartado." : "Este rascunho já foi confirmado.",
    };
  }

  const data = pickDraftFields(draft.kind, rawData);
  const valid = validateDraft(draft.kind, data);
  if (!valid.ok) return { ok: false, status: 400, error: valid.error, field: valid.field };

  const plan = buildInsertPlan(draft.kind, valid.data);
  const attachment = draft.attachment_id ? await getAttachment(user.id, draft.attachment_id) : null;
  if (draft.kind === "documento" && !attachment) {
    return { ok: false, status: 400, error: "O arquivo deste rascunho não está mais disponível. Envie de novo." };
  }

  if (!(await claimDraft(user.id, draftId, data))) {
    return { ok: false, status: 409, error: "Este rascunho já está sendo confirmado." };
  }

  const title = DRAFT_DEFS[draft.kind].title.replace(/^Novo |^Nova /, "");

  if (!isSupabaseConfigured()) {
    const link = plan.link.replace("{id}", "lead-001");
    await finishDraft(user.id, draftId, { status: "confirmado", link });
    return { ok: true, link, message: `Modo demonstração: ${title.toLowerCase()} conferido, mas nada foi gravado.` };
  }

  const supabase = await createClient();
  let createdCaseId: string | null = null;
  try {
    if (plan.newCase) {
      const { data: c, error } = await supabase
        .from("cases")
        .insert({ ...plan.newCase, assigned_to: user.id })
        .select("id")
        .single();
      if (error || !c) throw new Error(`caso: ${error?.message}`);
      createdCaseId = c.id as string;
      plan.row.case_id = createdCaseId;
    }

    let row = plan.row;
    if (plan.table === "documents") {
      row = {
        ...row,
        file_type: attachment!.mime_type,
        file_size: attachment!.size_bytes,
        storage_path: attachment!.storage_path,
        uploaded_by: user.id,
      };
    }
    const { data: created, error } = await supabase.from(plan.table).insert(row).select("id").single();
    if (error || !created) throw new Error(`${plan.table}: ${error?.message}`);
    const newId = created.id as string;

    if (plan.processDeadline) {
      await supabase
        .from("processes")
        .update({ next_deadline: plan.processDeadline.deadline, updated_at: new Date().toISOString() })
        .eq("id", plan.processDeadline.processId);
    }

    // Arquivo enviado ao assistente vira documento do CRM ligado ao cadastro novo.
    let documentId: string | null = plan.table === "documents" ? newId : null;
    if (attachment && plan.attach && plan.table !== "documents") {
      const links: Record<string, string | null> = {
        lead_id: plan.attach.links.lead_id ?? null,
        client_id: plan.attach.links.client_id ?? null,
        case_id: (plan.row.case_id as string | null) ?? plan.attach.links.case_id ?? null,
        process_id: plan.attach.links.process_id ?? null,
      };
      if (plan.table === "processes") links.process_id = newId;
      if (plan.table === "leads") links.lead_id = newId;
      const { data: doc } = await supabase
        .from("documents")
        .insert({
          ...links,
          file_name: attachment.file_name,
          file_type: attachment.mime_type,
          file_size: attachment.size_bytes,
          storage_path: attachment.storage_path,
          category: plan.attach.category,
          uploaded_by: user.id,
          review_status: "pendente",
        })
        .select("id")
        .single();
      documentId = (doc?.id as string | undefined) ?? null;
    }
    if (attachment && documentId) {
      await supabase
        .from("assistant_attachments")
        .update({ document_id: documentId })
        .eq("id", attachment.id)
        .eq("user_id", user.id);
    }

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "assistant_confirm",
      entity_type: plan.table,
      entity_id: newId,
      metadata: { draft_id: draftId, kind: draft.kind, new_case_id: createdCaseId },
    });

    const link = plan.link.replace("{id}", newId);
    await finishDraft(user.id, draftId, { status: "confirmado", table: plan.table, resultId: newId, link });
    for (const p of PAGES[draft.kind]) revalidatePath(p);
    if (link.startsWith("/leads/")) revalidatePath(link);
    return { ok: true, link, message: `${title.charAt(0).toUpperCase()}${title.slice(1)} cadastrado.` };
  } catch (err) {
    console.error("[assistente] confirmar rascunho", err);
    if (createdCaseId) await supabase.from("cases").delete().eq("id", createdCaseId);
    await finishDraft(user.id, draftId, { status: "pendente" });
    return {
      ok: false,
      status: 500,
      error: "Não consegui gravar agora. Confira os dados e tente de novo.",
    };
  }
}

export async function rejectDraft(session: AssistantSession, draftId: string): Promise<ConfirmResult> {
  const ok = await discardDraft(session.user.id, draftId);
  return ok
    ? { ok: true, link: "", message: "Rascunho descartado." }
    : { ok: false, status: 409, error: "Este rascunho não está mais pendente." };
}

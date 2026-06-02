import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  KNOWLEDGE_CATEGORIES,
  type KnowledgeCategory,
  type KnowledgeEntry,
} from "@/lib/data/knowledge-types";

export type { KnowledgeCategory, KnowledgeEntry } from "@/lib/data/knowledge-types";
export { KNOWLEDGE_CATEGORIES } from "@/lib/data/knowledge-types";

/** Limite de caracteres injetados no system-prompt do chatbot. */
export const KNOWLEDGE_PROMPT_BUDGET = 4000;

/** Lista todas as entradas (ativas e inativas) para a UI do admin. */
export async function listKnowledge(): Promise<KnowledgeEntry[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = createClient();
  const { data } = await supabase
    .from("knowledge_base")
    .select("id, title, category, content, is_active, created_at, updated_at")
    .order("category", { ascending: true, nullsFirst: false })
    .order("title", { ascending: true });

  return (data ?? []) as KnowledgeEntry[];
}

/** Busca uma entrada pelo id (para edição). */
export async function getKnowledge(id: string): Promise<KnowledgeEntry | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = createClient();
  const { data } = await supabase
    .from("knowledge_base")
    .select("id, title, category, content, is_active, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  return (data as KnowledgeEntry | null) ?? null;
}

/**
 * Monta o bloco de contexto para injetar no system-prompt do chatbot.
 * Só inclui entradas ativas, agrupadas por categoria, truncado em
 * KNOWLEDGE_PROMPT_BUDGET para não estourar a janela do modelo.
 * Retorna string vazia se não houver base configurada (modo demo).
 */
export async function getActiveKnowledgeForPrompt(): Promise<string> {
  if (!isSupabaseConfigured()) return "";

  const supabase = createClient();
  const { data } = await supabase
    .from("knowledge_base")
    .select("title, category, content")
    .eq("is_active", true)
    .order("category", { ascending: true })
    .order("title", { ascending: true });

  if (!data || data.length === 0) return "";

  const groups = new Map<KnowledgeCategory, { title: string; content: string }[]>();
  for (const row of data as Array<Pick<KnowledgeEntry, "title" | "category" | "content">>) {
    if (!row.category) continue;
    const key = row.category as KnowledgeCategory;
    if (!KNOWLEDGE_CATEGORIES[key]) continue;
    const list = groups.get(key) ?? [];
    list.push({ title: row.title, content: (row.content ?? "").trim() });
    groups.set(key, list);
  }
  if (groups.size === 0) return "";

  const sections: string[] = [];
  for (const [cat, entries] of groups) {
    const lines = [`## ${KNOWLEDGE_CATEGORIES[cat].label}`];
    for (const e of entries) {
      lines.push(e.content ? `- ${e.title}: ${e.content}` : `- ${e.title}`);
    }
    sections.push(lines.join("\n"));
  }

  let block = sections.join("\n\n");
  if (block.length > KNOWLEDGE_PROMPT_BUDGET) {
    block = block.slice(0, KNOWLEDGE_PROMPT_BUDGET - 20).trimEnd() + "\n[…truncado]";
  }
  return block;
}

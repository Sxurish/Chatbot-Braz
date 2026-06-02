import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  TEMPLATE_BUCKET,
  type DocumentTemplate,
} from "@/lib/data/templates-types";

export type { DocumentTemplate } from "@/lib/data/templates-types";

export async function listTemplates(
  onlyActive = false
): Promise<DocumentTemplate[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = createClient();
  let query = supabase
    .from("document_templates")
    .select("*")
    .order("name", { ascending: true });

  if (onlyActive) query = query.eq("active", true);
  const { data } = await query;
  return (data ?? []) as DocumentTemplate[];
}

export async function getTemplate(
  id: string
): Promise<DocumentTemplate | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createClient();
  const { data } = await supabase
    .from("document_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as DocumentTemplate | null) ?? null;
}

/** Baixa o conteúdo .docx do template como Buffer. */
export async function downloadTemplateFile(
  storagePath: string
): Promise<Buffer | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(TEMPLATE_BUCKET)
    .download(storagePath);
  if (error || !data) return null;
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Detecta placeholders {{var}} no XML do .docx. O regex aceita pontos e
 * underscores para suportar caminhos como cliente.nome ou lead_nome.
 *
 * Usa o próprio pizzip pra extrair word/document.xml — bem mais rápido do que
 * carregar docxtemplater só pra introspecção.
 */
export async function extractPlaceholders(
  buffer: Buffer
): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const PizZip = require("pizzip") as typeof import("pizzip");
  try {
    const zip = new PizZip(buffer);
    const xml = zip.file("word/document.xml")?.asText() ?? "";
    if (!xml) return [];
    // O Word pode quebrar {{ e }} em runs separados; primeiro junta runs
    // contíguos para captar placeholders inteiros.
    const flattened = xml.replace(/<\/w:t>[^<]*<w:t[^>]*>/g, "");
    const matches = flattened.match(/\{\{\s*([\w.]+)\s*\}\}/g) ?? [];
    const set = new Set<string>();
    for (const m of matches) {
      const key = m.replace(/[{}\s]/g, "");
      if (key) set.add(key);
    }
    return Array.from(set).sort();
  } catch {
    return [];
  }
}

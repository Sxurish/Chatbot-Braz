/**
 * Tipos e constantes da base de conhecimento — seguros para Client Components.
 * Não importar `server-only` aqui.
 */

export type KnowledgeCategory =
  | "mensagem_padrao"
  | "documento_area"
  | "glossario";

export const KNOWLEDGE_CATEGORIES: Record<
  KnowledgeCategory,
  { label: string; description: string }
> = {
  mensagem_padrao: {
    label: "Mensagens padrão",
    description: "Modelos de resposta usados pela equipe e pelo chatbot.",
  },
  documento_area: {
    label: "Documentos por área",
    description: "Lista de documentos necessários por área jurídica.",
  },
  glossario: {
    label: "Glossário",
    description: "Termos jurídicos explicados em linguagem simples.",
  },
};

export interface KnowledgeEntry {
  id: string;
  title: string;
  category: KnowledgeCategory | null;
  content: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

import "server-only";
import type { Lead } from "@/lib/types";
import type { OfficeData } from "@/lib/data/settings";

/** Contexto bruto vindo do banco para resolver os placeholders padrão. */
export interface RenderContext {
  lead: Lead | null;
  client: {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    city?: string | null;
    state?: string | null;
  } | null;
  caseTitle: string | null;
  office: {
    name: string;
    data: OfficeData;
  };
  legalAreaLabel?: string;
}

const MONTHS_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function todayShort(): string {
  const d = new Date();
  return d.toLocaleDateString("pt-BR");
}

function todayExtenso(): string {
  const d = new Date();
  return `${d.getDate()} de ${MONTHS_PT[d.getMonth()]} de ${d.getFullYear()}`;
}

/**
 * Resolve os placeholders auto-preenchidos.
 * Retorna um Record<placeholder, valor> achatado pelo docxtemplater.
 *
 * O docxtemplater entende dot-notation ({{cliente.nome}}) quando se passa um
 * objeto aninhado; para evitar surpresas com placeholders em runs quebrados,
 * também duplicamos as chaves achatadas (com pontos).
 */
export function buildAutoFilledData(ctx: RenderContext): Record<string, string> {
  const flat: Record<string, string> = {};

  const set = (k: string, v: string | null | undefined) => {
    flat[k] = (v ?? "").toString();
  };

  // Cliente
  set("cliente.nome", ctx.client?.full_name ?? ctx.lead?.full_name);
  set("cliente.email", ctx.client?.email ?? ctx.lead?.email);
  set("cliente.telefone", ctx.client?.phone ?? ctx.lead?.phone);
  set("cliente.cidade", ctx.client?.city ?? ctx.lead?.city);
  set("cliente.estado", ctx.client?.state ?? ctx.lead?.state);

  // Lead
  set("lead.nome", ctx.lead?.full_name);
  set("lead.telefone", ctx.lead?.phone);
  set("lead.email", ctx.lead?.email);
  set("lead.area", ctx.legalAreaLabel ?? ctx.lead?.legal_area ?? "");
  set("lead.resumo", ctx.lead?.case_summary ?? "");

  // Caso
  set("caso.titulo", ctx.caseTitle);

  // Escritório
  set("escritorio.nome", ctx.office.name);
  set("escritorio.oab", ctx.office.data.oab);
  set("escritorio.cnpj", ctx.office.data.cnpj);
  set("escritorio.endereco", ctx.office.data.address);
  set("escritorio.telefone", ctx.office.data.phone);
  set("escritorio.email", ctx.office.data.email);

  // Data
  set("data.hoje", todayShort());
  set("data.hoje_extenso", todayExtenso());

  return flat;
}

/**
 * Renderiza o .docx aplicando os valores. Recebe o buffer do template e devolve
 * o buffer do documento gerado. Usa nullGetter para deixar placeholder vazio
 * em vez de falhar (útil quando o usuário não preencheu um campo opcional).
 */
export async function renderDocxTemplate(
  buffer: Buffer,
  data: Record<string, string>
): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const PizZip = require("pizzip") as typeof import("pizzip");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Docxtemplater =
    require("docxtemplater") as typeof import("docxtemplater");

  const zip = new PizZip(buffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });

  doc.render(data);

  const out = doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  return out as Buffer;
}

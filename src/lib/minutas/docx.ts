import PizZip from "pizzip";
import { MINUTA_WARNING } from "@/lib/minutas/types";

/**
 * Gera o .docx de uma minuta (função pura: texto entra, Buffer sai).
 * WordprocessingML mínimo montado à mão com pizzip: cabeçalho com o nome do
 * escritório e a OAB, aviso de minuta no topo e no rodapé, título e corpo.
 * O corpo aceita o Markdown simples que a IA escreve (## títulos, listas,
 * **negrito**); cada linha vira um parágrafo.
 */

export interface MinutaDocxInput {
  officeName: string;
  oab: string;
  title: string;
  body: string;
}

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const W_NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

export function escapeXml(text: string): string {
  return text
    // Caracteres de controle não são válidos em XML 1.0.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface RunOpts {
  bold?: boolean;
  size?: number;
  color?: string;
}

function run(text: string, opts: RunOpts = {}): string {
  const props = [
    opts.bold ? "<w:b/>" : "",
    opts.color ? `<w:color w:val="${opts.color}"/>` : "",
    opts.size ? `<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>` : "",
  ].join("");
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

/** Texto com **negrito** em runs. */
function inlineRuns(text: string, base: RunOpts = {}): string {
  const out: string[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (!part) continue;
    if (/^\*\*[^*]+\*\*$/.test(part)) out.push(run(part.slice(2, -2), { ...base, bold: true }));
    else out.push(run(part.replace(/\*\*/g, ""), base));
  }
  return out.join("");
}

interface ParaOpts {
  align?: "left" | "center" | "both" | "right";
  indent?: number;
  hanging?: number;
  after?: number;
  before?: number;
}

function para(runs: string, opts: ParaOpts = {}): string {
  const props = [
    opts.before !== undefined || opts.after !== undefined
      ? `<w:spacing w:before="${opts.before ?? 0}" w:after="${opts.after ?? 160}"/>`
      : "",
    opts.indent ? `<w:ind w:left="${opts.indent}"${opts.hanging ? ` w:hanging="${opts.hanging}"` : ""}/>` : "",
    opts.align ? `<w:jc w:val="${opts.align}"/>` : "",
  ].join("");
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${runs}</w:p>`;
}

/** Converte o corpo (Markdown simples) em parágrafos do Word. */
export function bodyToParagraphs(body: string): string[] {
  const out: string[] = [];
  for (const rawLine of body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    const heading = line.match(/^\s*#{1,6}\s+(.*)$/);
    if (heading) {
      out.push(para(inlineRuns(heading[1].replace(/\*\*/g, ""), { bold: true, size: 24 }), { before: 240, after: 120 }));
      continue;
    }
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      out.push(para(run("•  ") + inlineRuns(bullet[1]), { indent: 720, hanging: 360, align: "both" }));
      continue;
    }
    const numbered = line.match(/^\s*(\d+[.)])\s+(.*)$/);
    if (numbered) {
      out.push(para(run(`${numbered[1]}  `) + inlineRuns(numbered[2]), { indent: 720, hanging: 360, align: "both" }));
      continue;
    }
    out.push(para(inlineRuns(line.trim()), { align: "both" }));
  }
  return out;
}

function documentXml(input: MinutaDocxInput): string {
  const warning = para(run(MINUTA_WARNING.toUpperCase(), { bold: true, color: "B91C1C" }), {
    align: "center",
    after: 240,
  });
  const title = para(run(input.title.trim() || "Minuta", { bold: true, size: 28 }), { align: "center", after: 360 });
  const body = bodyToParagraphs(input.body).join("");
  const sect =
    '<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/>' +
    '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1701" w:right="1134" w:bottom="1134" w:left="1701" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W_NS}><w:body>${warning}${title}${body}${sect}</w:body></w:document>`;
}

function headerXml(input: MinutaDocxInput): string {
  const line = [input.officeName.trim(), input.oab.trim()].filter(Boolean).join(" | ");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W_NS}>${para(run(line, { bold: true, size: 20 }), { align: "center", after: 0 })}</w:hdr>`;
}

function footerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${W_NS}>${para(run(MINUTA_WARNING, { size: 16, color: "B91C1C" }), { align: "center", after: 0 })}</w:ftr>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;

/** Monta o .docx da minuta. */
export function buildMinutaDocx(input: MinutaDocxInput): Buffer {
  const zip = new PizZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", ROOT_RELS);
  zip.file("word/_rels/document.xml.rels", DOC_RELS);
  zip.file("word/styles.xml", STYLES);
  zip.file("word/header1.xml", headerXml(input));
  zip.file("word/footer1.xml", footerXml());
  zip.file("word/document.xml", documentXml(input));
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}

/** Nome de arquivo seguro para a minuta. */
export function minutaFileName(title: string, now = new Date()): string {
  const base = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60);
  const day = now.toISOString().slice(0, 10);
  return `Minuta_${base || "documento"}_${day}.docx`;
}

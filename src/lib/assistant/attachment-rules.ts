/**
 * Regras dos anexos do assistente (usadas no servidor e no navegador).
 */

export const ATTACHMENT_MIMES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;
export type AttachmentMime = (typeof ATTACHMENT_MIMES)[number];

/** PDF até 15 MB; imagem até 5 MB (limite da IA). O navegador reduz prints grandes antes de enviar. */
export const MAX_PDF_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Lado maior da imagem depois de reduzida (a IA não ganha nada acima disso). */
export const MAX_IMAGE_SIDE = 1568;
/** Anexos que não viraram documento do CRM são apagados depois disso. */
export const ATTACHMENT_RETENTION_DAYS = 7;

export const ACCEPT_ATTRIBUTE = "application/pdf,image/png,image/jpeg,image/webp,image/gif";

export function isAllowedMime(mime: string): mime is AttachmentMime {
  return (ATTACHMENT_MIMES as readonly string[]).includes(mime);
}

export function maxBytesFor(mime: AttachmentMime): number {
  return mime === "application/pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
}

/** Confere o tipo real pelo começo do arquivo (assinatura), não pelo nome. */
export function detectMime(bytes: Uint8Array): AttachmentMime | null {
  const b = bytes;
  const starts = (...sig: number[]) => sig.every((v, i) => b[i] === v);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf"; // %PDF-
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (starts(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return "image/webp";
  }
  return null;
}

/** Valida nome, tipo e tamanho antes de enviar. Devolve a mensagem de erro ou null. */
export function checkAttachment(file: { name: string; type: string; size: number }): string | null {
  if (!isAllowedMime(file.type)) {
    return "Envie um PDF ou uma imagem (PNG, JPG, WEBP). Fotos do iPhone em HEIC: tire um print ou exporte como JPG.";
  }
  if (file.size <= 0) return "O arquivo está vazio.";
  if (file.size > maxBytesFor(file.type)) {
    return file.type === "application/pdf"
      ? "O PDF passa de 15 MB. Envie só as páginas que importam."
      : "A imagem passa de 5 MB.";
  }
  return null;
}

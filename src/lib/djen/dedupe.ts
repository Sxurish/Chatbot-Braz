/**
 * Chave estável de cada comunicação do DJEN, para não gravar a mesma
 * intimação duas vezes (a janela de busca se sobrepõe de propósito).
 */
import type { DjenCommunication } from "@/lib/djen/parse";

/**
 * Hash curto e estável (FNV-1a de 64 bits feito com duas metades de 32 bits,
 * sem BigInt). Não é criptográfico: serve só para montar a chave.
 */
export function stableTextHash(value: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x0100019d) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

type KeySource = Pick<DjenCommunication, "externalId" | "hash" | "text" | "availableDate" | "processNumber">;

/**
 * Chave do item: o id do DJEN; sem id, o hash do DJEN; sem os dois,
 * um hash do texto com a data e o processo.
 */
export function djenKey(item: KeySource): string {
  const id = (item.externalId ?? "").trim();
  if (id) return `id:${id}`;
  const hash = (item.hash ?? "").trim();
  if (hash) return `hash:${hash}`;
  return `txt:${stableTextHash(`${item.availableDate}|${item.processNumber ?? ""}|${item.text}`)}`;
}

/**
 * Separa os itens novos dos já vistos. Itens repetidos dentro do próprio
 * lote também contam como vistos (fica só o primeiro).
 */
export function splitNewAndSeen<T extends KeySource>(
  items: readonly T[],
  existingKeys: Iterable<string>,
): { fresh: Array<T & { key: string }>; seen: Array<T & { key: string }> } {
  const known = new Set(existingKeys);
  const fresh: Array<T & { key: string }> = [];
  const seen: Array<T & { key: string }> = [];
  for (const item of items) {
    const key = djenKey(item);
    if (known.has(key)) {
      seen.push({ ...item, key });
    } else {
      known.add(key);
      fresh.push({ ...item, key });
    }
  }
  return { fresh, seen };
}

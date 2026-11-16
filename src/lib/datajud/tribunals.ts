/**
 * Descobre o tribunal pelo número CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO).
 * J = segmento da Justiça, TR = tribunal. Assim a busca funciona para
 * processos de qualquer estado, instância ou tribunal, sem lista fixa.
 */

const UFS = [
  "ac", "al", "ap", "am", "ba", "ce", "df", "es", "go", "ma", "mt", "ms", "mg", "pa",
  "pb", "pr", "pe", "pi", "rj", "rn", "rs", "ro", "rr", "sc", "se", "sp", "to",
] as const;

export interface TribunalInfo {
  /** Sufixo do endpoint do DataJud: api_publica_<alias>. */
  alias: string;
  /** Nome curto para a tela (TJSP, TRF3, TRT2...). */
  label: string;
}

/** Só os 20 dígitos do número CNJ. */
export function cnjOnlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** Confere o dígito verificador do número CNJ (módulo 97, Resolução 65/CNJ). */
export function isValidCnj(value: string | null | undefined): boolean {
  const d = cnjOnlyDigits(value);
  if (d.length !== 20) return false;
  const n = d.slice(0, 7);
  const dv = d.slice(7, 9);
  const rest = d.slice(9); // AAAA J TR OOOO
  // Resto de divisão por 97 em pedaços (o número não cabe em 53 bits).
  let mod = 0;
  for (const ch of n + rest + "00") mod = (mod * 10 + Number(ch)) % 97;
  return 98 - mod === Number(dv);
}

export function tribunalFromCnj(value: string | null | undefined): TribunalInfo | null {
  const d = cnjOnlyDigits(value);
  if (d.length !== 20) return null;
  const j = d[13];
  const tr = Number(d.slice(14, 16));
  const uf = tr >= 1 && tr <= 27 ? UFS[tr - 1] : null;

  switch (j) {
    case "8": // Justiça Estadual
      if (!uf) return null;
      return uf === "df"
        ? { alias: "tjdft", label: "TJDFT" }
        : { alias: `tj${uf}`, label: `TJ${uf.toUpperCase()}` };
    case "4": // Justiça Federal
      if (tr === 0) return null; // CJF não é tribunal de processos
      return tr >= 1 && tr <= 6 ? { alias: `trf${tr}`, label: `TRF${tr}` } : null;
    case "5": // Justiça do Trabalho
      if (tr === 0) return { alias: "tst", label: "TST" };
      return tr >= 1 && tr <= 24 ? { alias: `trt${tr}`, label: `TRT${tr}` } : null;
    case "6": // Justiça Eleitoral
      if (tr === 0) return { alias: "tse", label: "TSE" };
      if (!uf) return null;
      return { alias: `tre-${uf}`, label: `TRE-${uf.toUpperCase()}` };
    case "3": // STJ
      return { alias: "stj", label: "STJ" };
    case "7": // Justiça Militar da União
      return { alias: "stm", label: "STM" };
    case "9": { // Justiça Militar Estadual (só MG, RS e SP têm tribunal próprio)
      const tjm: Record<string, TribunalInfo> = {
        mg: { alias: "tjmmg", label: "TJMMG" },
        rs: { alias: "tjmrs", label: "TJMRS" },
        sp: { alias: "tjmsp", label: "TJMSP" },
      };
      return uf ? tjm[uf] ?? null : null;
    }
    default: // 1 = STF e 2 = CNJ não estão no DataJud
      return null;
  }
}

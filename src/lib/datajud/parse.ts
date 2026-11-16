/**
 * Converte a resposta da API pública do DataJud (CNJ) em andamentos prontos
 * para gravar. Puro (sem rede), para testar com respostas de exemplo.
 */

export interface DatajudMovementRow {
  external_key: string;
  occurred_at: string; // ISO em UTC
  description: string;
  movement_code: number | null;
  instance: string | null;
}

export interface DatajudProcessInfo {
  tribunal: string | null;
  className: string | null;
  court: string | null;
  lastUpdate: string | null;
  instances: string[];
}

type Complemento = { codigo?: number; valor?: number | string; nome?: string; descricao?: string };
type Movimento = {
  codigo?: number | string;
  nome?: string;
  dataHora?: string;
  complementosTabelados?: Complemento[];
};
type Source = {
  numeroProcesso?: string;
  tribunal?: string;
  grau?: string;
  classe?: { codigo?: number; nome?: string };
  orgaoJulgador?: { nome?: string };
  dataHoraUltimaAtualizacao?: string;
  movimentos?: Movimento[];
};
export type DatajudSearchResponse = { hits?: { hits?: { _source?: Source }[] } };

/** Datas do DataJud vêm em ISO (às vezes sem fuso) ou "AAAAMMDDhhmmss". */
export function parseDatajudDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const v = value.trim();
  const compact = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?$/.exec(v);
  let iso: string;
  if (compact) {
    const [, y, mo, d, h = "00", mi = "00", s = "00"] = compact;
    iso = `${y}-${mo}-${d}T${h}:${mi}:${s}-03:00`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    iso = `${v}T00:00:00-03:00`;
  } else if (/^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(v)) {
    iso = `${v}-03:00`; // sem fuso: horário de Brasília
  } else {
    iso = v;
  }
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const year = new Date(t).getUTCFullYear();
  if (year < 1900 || year > 2100) return null;
  return new Date(t).toISOString();
}

/** FNV-1a 32 bits: chave curta e estável para o mesmo andamento. */
function shortHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function clean(text: string | undefined | null): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

export function describeMovement(m: Movimento): string {
  const name = clean(m.nome) || (m.codigo != null ? `Movimento ${m.codigo}` : "Movimento");
  const extras = (m.complementosTabelados ?? [])
    .map((c) => clean(c.nome))
    .filter((c) => c && c.toLowerCase() !== name.toLowerCase());
  const unique = Array.from(new Set(extras));
  return unique.length ? `${name} (${unique.join("; ")})` : name;
}

export function parseDatajudResponse(body: DatajudSearchResponse): {
  rows: DatajudMovementRow[];
  info: DatajudProcessInfo;
  found: boolean;
} {
  const hits = body.hits?.hits ?? [];
  const rows = new Map<string, DatajudMovementRow>();
  const instances: string[] = [];
  let info: DatajudProcessInfo = { tribunal: null, className: null, court: null, lastUpdate: null, instances };
  let latest = -Infinity;

  for (const hit of hits) {
    const src = hit._source;
    if (!src) continue;
    const grau = clean(src.grau) || null;
    if (grau && !instances.includes(grau)) instances.push(grau);
    const updated = parseDatajudDate(src.dataHoraUltimaAtualizacao);
    const updatedMs = updated ? Date.parse(updated) : -Infinity;
    // Os dados do processo vêm do registro mais recente (normalmente o grau atual).
    if (updatedMs >= latest) {
      latest = updatedMs;
      info = {
        tribunal: clean(src.tribunal) || null,
        className: clean(src.classe?.nome) || null,
        court: clean(src.orgaoJulgador?.nome) || null,
        lastUpdate: updated,
        instances,
      };
    }
    for (const m of src.movimentos ?? []) {
      const occurred = parseDatajudDate(m.dataHora);
      if (!occurred) continue;
      const description = describeMovement(m);
      const code = m.codigo != null && /^\d+$/.test(String(m.codigo)) ? Number(m.codigo) : null;
      const complements = (m.complementosTabelados ?? [])
        .map((c) => `${c.codigo ?? ""}=${c.valor ?? ""}`)
        .sort()
        .join(",");
      const key = `${grau ?? "-"}:${code ?? "-"}:${occurred}:${shortHash(`${description}|${complements}`)}`;
      if (!rows.has(key)) {
        rows.set(key, {
          external_key: key,
          occurred_at: occurred,
          description: description.slice(0, 2000),
          movement_code: code,
          instance: grau,
        });
      }
    }
  }

  return {
    rows: Array.from(rows.values()).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)),
    info,
    found: hits.length > 0,
  };
}

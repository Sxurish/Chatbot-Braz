/**
 * Banco falso, em memória, para os testes das intimações (IA e WhatsApp).
 * Entende o pedaço do cliente Supabase usado por ai-read.ts, notify.ts e
 * whatsapp-ok.ts: select/update/insert com eq, neq, in, is, not, gte, gt,
 * or (forma "a.eq.x,and(b.eq.y,c.gte.z)"), order, limit, range e maybeSingle.
 */

export type Row = Record<string, unknown>;

function cmp(a: unknown, b: unknown): number {
  return String(a).localeCompare(String(b));
}

type Filter = (r: Row) => boolean;

/** Converte um termo do .or() do PostgREST num filtro (só eq e gte, que é o que o código usa). */
function orTerm(term: string): Filter {
  const and = /^and\((.*)\)$/.exec(term);
  if (and) {
    const parts = and[1].split(",").map(orTerm);
    return (r) => parts.every((f) => f(r));
  }
  const [col, op, ...rest] = term.split(".");
  const value = rest.join(".").replace(/^"(.*)"$/, "$1");
  if (op === "eq") return (r) => String(r[col]) === value;
  if (op === "gte") return (r) => r[col] != null && cmp(r[col], value) >= 0;
  throw new Error(`or() não suportado no falso: ${term}`);
}

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

export function fakeDb(tables: Record<string, Row[]>) {
  const calls: { table: string; op: string; payload?: unknown }[] = [];

  function from(table: string) {
    const filters: Filter[] = [];
    let op: "select" | "update" | "insert" = "select";
    let payload: Row | Row[] | null = null;
    let limit = Infinity;
    let offset = 0;
    let single = false;

    const run = () => {
      const data = tables[table] ?? (tables[table] = []);
      if (op === "insert") {
        const list = Array.isArray(payload) ? payload : [payload!];
        for (const p of list) data.push({ id: `${table}-${data.length + 1}`, ...p });
        return { data: null, error: null };
      }
      const matched = data.filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        for (const r of matched) Object.assign(r, payload);
        return { data: null, error: null };
      }
      const rows = matched.slice(offset, offset + limit).map((r) => ({ ...r }));
      return { data: single ? rows[0] ?? null : rows, error: null };
    };

    const q = {
      select() {
        calls.push({ table, op: "select" });
        return q;
      },
      update(p: Row) {
        op = "update";
        payload = p;
        calls.push({ table, op, payload: p });
        return q;
      },
      insert(p: Row | Row[]) {
        op = "insert";
        payload = p;
        calls.push({ table, op, payload: p });
        return q;
      },
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
      gte: (c: string, v: unknown) => (filters.push((r) => r[c] != null && cmp(r[c], v) >= 0), q),
      gt: (c: string, v: unknown) => (filters.push((r) => r[c] != null && Number(r[c]) > Number(v)), q),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
      is: (c: string, v: unknown) => (filters.push((r) => (v === null ? r[c] == null : r[c] === v)), q),
      not: (c: string, operator: string, v: unknown) => {
        if (operator === "is" && v === null) filters.push((r) => r[c] != null);
        else throw new Error(`not() não suportado no falso: ${operator}`);
        return q;
      },
      or: (expr: string) => {
        const terms = splitTop(expr).map(orTerm);
        filters.push((r) => terms.some((f) => f(r)));
        return q;
      },
      order: () => q,
      limit: (n: number) => ((limit = n), q),
      range: (a: number, b: number) => ((offset = a), (limit = b - a + 1), q),
      maybeSingle: () => ((single = true), q),
      single: () => ((single = true), q),
      then<T>(resolve: (v: { data: unknown; error: null }) => T, reject?: (e: unknown) => T) {
        try {
          return Promise.resolve(resolve(run()));
        } catch (e) {
          return reject ? Promise.resolve(reject(e)) : Promise.reject(e);
        }
      },
    };
    return q;
  }

  return { client: { from } as never, tables, calls };
}

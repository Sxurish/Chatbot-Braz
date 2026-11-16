import { cnjDigits, phoneDigits, type DraftDuplicate } from "@/lib/assistant/draft-schema";
import type { Appointment, Client, Lead, Process, ProcessMovement } from "@/lib/types";

/**
 * Checagem de duplicados antes de criar (funções puras, testáveis).
 * Só avisa: quem decide se cria mesmo assim é a pessoa, no cartão.
 */

const MAX = 5;

export function findProcessDuplicates(processNumber: string | undefined, processes: Process[]): DraftDuplicate[] {
  const digits = cnjDigits(processNumber);
  if (digits.length < 15) return [];
  return processes
    .filter((p) => cnjDigits(p.process_number) === digits)
    .slice(0, MAX)
    .map((p) => ({
      label: `Processo ${p.process_number}`,
      reason: "Mesmo número de processo já cadastrado",
      link: `/processos/${encodeURIComponent(p.id)}`,
    }));
}

function sameName(a: string | null | undefined, b: string | null | undefined) {
  const norm = (v: string | null | undefined) =>
    String(v ?? "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  return norm(a).length > 3 && norm(a) === norm(b);
}

/** Telefones iguais comparando os últimos 8 dígitos (ignora DDI, DDD com zero, nono dígito). */
function samePhone(a: string | null | undefined, b: string | null | undefined) {
  const da = phoneDigits(a);
  const db = phoneDigits(b);
  return da.length >= 8 && db.length >= 8 && da.slice(-8) === db.slice(-8);
}

function sameEmail(a: string | null | undefined, b: string | null | undefined) {
  const ea = String(a ?? "").trim().toLowerCase();
  return ea.includes("@") && ea === String(b ?? "").trim().toLowerCase();
}

export function findPersonDuplicates(
  person: { full_name?: string; phone?: string; email?: string },
  leads: Lead[],
  clients: Client[]
): DraftDuplicate[] {
  const out: DraftDuplicate[] = [];
  const reasonFor = (r: { full_name: string; phone: string | null; email: string | null }) => {
    if (samePhone(person.phone, r.phone)) return "Mesmo telefone";
    if (sameEmail(person.email, r.email)) return "Mesmo e-mail";
    if (sameName(person.full_name, r.full_name)) return "Mesmo nome";
    return null;
  };
  for (const l of leads) {
    const reason = reasonFor(l);
    if (reason) out.push({ label: `Lead ${l.full_name}`, reason, link: `/leads/${l.id}` });
  }
  for (const c of clients) {
    const reason = reasonFor(c);
    if (reason) out.push({ label: `Cliente ${c.full_name}`, reason, link: "/clientes" });
  }
  return out.slice(0, MAX);
}

function minutes(time: string | null | undefined): number | null {
  const m = /^(\d{2}):(\d{2})/.exec(String(time ?? ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Compromissos no mesmo dia que se sobrepõem ao horário (sem fim, considera 1 hora). */
export function findAppointmentConflicts(
  slot: { date?: string; start_time?: string; end_time?: string },
  appointments: Appointment[]
): DraftDuplicate[] {
  const start = minutes(slot.start_time);
  if (!slot.date || start === null) return [];
  const end = minutes(slot.end_time) ?? start + 60;
  return appointments
    .filter((a) => a.date === slot.date && a.status !== "cancelada")
    .filter((a) => {
      const s = minutes(a.start_time);
      if (s === null) return false;
      const e = minutes(a.end_time) ?? s + 60;
      return s < end && start < e;
    })
    .slice(0, MAX)
    .map((a) => ({
      label: `${a.title} (${a.start_time.slice(0, 5)})`,
      reason: "Outro compromisso no mesmo horário",
      link: "/agenda",
    }));
}

const spDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function normText(v: string | null | undefined) {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Andamento já lançado no mesmo processo e no mesmo dia (São Paulo) com texto
 * igual ou que começa igual (ignorando acentos, pontuação e maiúsculas).
 */
export function findMovementDuplicates(
  draft: { process_id?: string; occurred_at?: string; description?: string },
  movements: ProcessMovement[]
): DraftDuplicate[] {
  const day = draft.occurred_at?.slice(0, 10);
  const text = normText(draft.description);
  if (!draft.process_id || !day || text.length < 4) return [];
  return movements
    .filter((m) => m.process_id === draft.process_id && spDay.format(new Date(m.occurred_at)) === day)
    .filter((m) => {
      const other = normText(m.description);
      return other === text || (other.length >= 8 && text.startsWith(other)) || (text.length >= 8 && other.startsWith(text));
    })
    .slice(0, MAX)
    .map((m) => ({
      label: m.description.length > 80 ? `${m.description.slice(0, 77)}...` : m.description,
      reason: `Andamento ${m.source === "datajud" ? "do tribunal" : "da equipe"} no mesmo dia`,
      link: `/processos/${encodeURIComponent(m.process_id)}`,
    }));
}

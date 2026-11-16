import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Datas sempre no fuso de São Paulo: o servidor (UTC na Vercel) e o navegador
 * mostram o mesmo texto, sem erro de hidratação. Data pura (AAAA-MM-DD) não
 * muda de dia por causa do fuso.
 */
const TIME_ZONE = "America/Sao_Paulo";

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  const dateOnly = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: dateOnly ? "UTC" : TIME_ZONE,
  }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(date);
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/** Tempo relativo simples em pt-BR ("há 3 dias"). */
export function timeAgo(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  const intervals: [number, string][] = [
    [60, "segundo"],
    [60, "minuto"],
    [24, "hora"],
    [30, "dia"],
    [12, "mês"],
    [Number.POSITIVE_INFINITY, "ano"],
  ];
  let unit = seconds;
  let label = "segundo";
  for (const [divisor, name] of intervals) {
    if (unit < divisor) {
      label = name;
      break;
    }
    unit = Math.floor(unit / divisor);
    label = name;
  }
  const plural = unit !== 1 ? (label === "mês" ? "meses" : `${label}s`) : label;
  return `há ${unit} ${plural}`;
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
}

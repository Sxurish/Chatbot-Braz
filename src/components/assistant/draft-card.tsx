"use client";

import Link from "next/link";
import { useId, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ExternalLink,
  FileText,
  Loader2,
  Paperclip,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DRAFT_DEFS,
  linkLabelKey,
  type DraftData,
  type DraftView,
  type FieldDef,
} from "@/lib/assistant/draft-schema";

/**
 * Cartão de confirmação: o formulário que a IA preencheu. A pessoa confere,
 * corrige e só então clica em Confirmar (é aqui que o cadastro é gravado).
 */
export function DraftCard({
  draft,
  onChange,
  readOnly,
}: {
  draft: DraftView;
  onChange: (change: Partial<DraftView>) => void;
  readOnly?: boolean;
}) {
  const def = DRAFT_DEFS[draft.kind];
  const [data, setData] = useState<DraftData>(draft.data);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState<"confirmar" | "descartar" | null>(null);
  const [error, setError] = useState<{
    message: string;
    field?: string;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Depois de confirmado ou descartado, o cartão fica resumido.
  const done = draft.status !== "pendente";
  const uncertain = new Set(done ? [] : draft.uncertain);
  const fields = def.fields.filter(
    (f) => draft.attachment || !f.onlyWithAttachment,
  );
  const isPrimary = (f: FieldDef) =>
    f.required ||
    uncertain.has(f.key) ||
    (data[f.key] !== undefined && data[f.key] !== "" && data[f.key] !== null) ||
    (draft.kind === "processo" &&
      ["case_id", "new_case_title"].includes(f.key));
  const visible =
    done && !showAll ? [] : showAll ? fields : fields.filter(isPrimary);
  const hidden = fields.length - visible.length;
  const editable = draft.status === "pendente" && !readOnly && !busy;

  const set = (key: string, value: string | boolean | null) => {
    setData((prev) => ({ ...prev, [key]: value }));
    if (error?.field === key) setError(null);
  };

  async function act(action: "confirmar" | "descartar") {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(
        `/api/assistente/rascunhos/${encodeURIComponent(draft.id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "confirmar" ? { action, data } : { action },
          ),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({
          message: body.error ?? "Não deu certo. Tente de novo.",
          field: body.field,
        });
        if (res.status === 409)
          onChange({
            status: action === "confirmar" ? "confirmado" : "descartado",
          });
        return;
      }
      setNotice(body.message ?? null);
      onChange(
        action === "confirmar"
          ? { status: "confirmado", resultLink: body.link || null, data }
          : { status: "descartado" },
      );
    } catch {
      setError({ message: "Falha de conexão. Tente de novo." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      aria-label={`Rascunho: ${def.title}`}
      className={cn(
        "@container mt-3 overflow-hidden rounded-xl border bg-white",
        draft.status === "confirmado"
          ? "border-emerald-200"
          : draft.status === "descartado"
            ? "border-slate-200 opacity-70"
            : "border-brand-gold/60",
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b bg-slate-50 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-brand-primary" />
          <p className="truncate text-sm font-semibold text-slate-900">
            {def.title}
          </p>
        </div>
        <StatusBadge status={draft.status} />
      </header>

      <div className="space-y-3 px-3 py-3">
        {draft.status === "pendente" && (
          <p className="text-xs text-slate-500">
            Confira os dados. Nada foi gravado ainda.
            {uncertain.size > 0 &&
              " Os campos em amarelo a IA não teve certeza."}
          </p>
        )}

        {draft.attachment && (
          <p className="flex items-center gap-1.5 text-xs text-slate-600">
            <Paperclip className="h-3.5 w-3.5" /> Lido de:{" "}
            <span className="font-medium">{draft.attachment.name}</span>
          </p>
        )}

        {draft.duplicates.length > 0 && draft.status === "pendente" && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" /> Pode já existir no CRM:
            </p>
            <ul className="mt-1 space-y-0.5">
              {draft.duplicates.map((d, i) => (
                <li key={i}>
                  <Link href={d.link} className="underline underline-offset-2">
                    {d.label}
                  </Link>{" "}
                  · {d.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {visible.length > 0 && (
          <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2">
            {visible.map((f) => (
              <Field
                key={f.key}
                field={f}
                data={data}
                uncertain={uncertain.has(f.key)}
                invalid={error?.field === f.key}
                disabled={!editable}
                onChange={set}
              />
            ))}
          </div>
        )}

        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="flex items-center gap-1 text-xs font-medium text-brand-primary hover:underline"
          >
            <ChevronDown className="h-3.5 w-3.5" />{" "}
            {done
              ? "Ver os dados"
              : `Mostrar mais ${hidden} campo${hidden > 1 ? "s" : ""}`}
          </button>
        )}

        {error && (
          <p
            role="alert"
            className="flex items-start gap-1.5 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{" "}
            {error.message}
          </p>
        )}
        {notice && draft.status !== "pendente" && (
          <p className="text-xs text-slate-600">{notice}</p>
        )}
      </div>

      {draft.status === "pendente" && !readOnly && (
        <footer className="flex items-center justify-end gap-2 border-t px-3 py-2">
          <button
            type="button"
            onClick={() => act("descartar")}
            disabled={Boolean(busy)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            {busy === "descartar" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
            Descartar
          </button>
          <button
            type="button"
            onClick={() => act("confirmar")}
            disabled={Boolean(busy)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-primary px-4 text-sm font-medium text-white hover:bg-brand-primary/90 disabled:opacity-50"
          >
            {busy === "confirmar" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Confirmar
          </button>
        </footer>
      )}
      {draft.status === "confirmado" && draft.resultLink && (
        <footer className="border-t px-3 py-2">
          <Link
            href={draft.resultLink}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-primary hover:underline"
          >
            Abrir no CRM <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </footer>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: DraftView["status"] }) {
  const map = {
    pendente: ["Para conferir", "bg-amber-100 text-amber-800"],
    confirmando: ["Gravando…", "bg-slate-100 text-slate-700"],
    confirmado: ["Cadastrado", "bg-emerald-100 text-emerald-800"],
    descartado: ["Descartado", "bg-slate-100 text-slate-600"],
  } as const;
  const [label, cls] = map[status];
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
        cls,
      )}
    >
      {label}
    </span>
  );
}

function Field({
  field: f,
  data,
  uncertain,
  invalid,
  disabled,
  onChange,
}: {
  field: FieldDef;
  data: DraftData;
  uncertain: boolean;
  invalid: boolean;
  disabled: boolean;
  onChange: (key: string, value: string | boolean | null) => void;
}) {
  const id = `${useId()}-${f.key}`;
  const value = data[f.key];
  const ring = cn(
    uncertain && "border-amber-300 bg-amber-50",
    invalid && "border-red-400 ring-1 ring-red-300",
  );
  const wide = f.type === "textarea" || f.type === "checkbox";

  if (f.type === "checkbox") {
    return (
      <label
        className={cn(
          "flex items-center gap-2 text-sm text-slate-700",
          wide && "@lg:col-span-2",
        )}
      >
        <input
          type="checkbox"
          checked={value === true}
          disabled={disabled}
          onChange={(e) => onChange(f.key, e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-brand-primary"
        />
        {f.label}
      </label>
    );
  }

  const label = (
    <label
      htmlFor={id}
      className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600"
    >
      {f.label}
      {f.required && <span className="text-red-500">*</span>}
      {uncertain && <span className="text-amber-700">(conferir)</span>}
    </label>
  );

  if (f.type === "link") {
    const name = data[linkLabelKey(f.key)];
    return (
      <div>
        <p className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600">
          {f.label}
          {f.required && <span className="text-red-500">*</span>}
          {uncertain && <span className="text-amber-700">(conferir)</span>}
        </p>
        {value ? (
          <div
            className={cn(
              "flex h-10 items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm",
              ring,
            )}
          >
            <span className="truncate text-slate-800">
              {String(name ?? "Selecionado")}
            </span>
            {!disabled && (
              <button
                type="button"
                onClick={() => {
                  onChange(f.key, null);
                  onChange(linkLabelKey(f.key), null);
                }}
                className="text-slate-400 hover:text-slate-700"
                aria-label={`Tirar ${f.label}`}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : (
          <p
            className={cn(
              "flex h-10 items-center rounded-md border border-dashed border-slate-200 px-3 text-xs text-slate-400",
              ring,
            )}
          >
            Nenhum. Peça ao assistente para vincular.
          </p>
        )}
      </div>
    );
  }

  const common = {
    id,
    disabled,
    className: ring,
    "aria-invalid": invalid || undefined,
  };
  const str = typeof value === "string" ? value : "";

  return (
    <div className={cn(wide && "@lg:col-span-2")}>
      {label}
      {f.type === "textarea" ? (
        <Textarea
          {...common}
          rows={3}
          value={str}
          onChange={(e) => onChange(f.key, e.target.value)}
        />
      ) : f.type === "select" ? (
        <Select
          {...common}
          value={str}
          onChange={(e) => onChange(f.key, e.target.value)}
        >
          <option value="">—</option>
          {f.options!.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          {...common}
          type={
            f.type === "datetime"
              ? // Data sem horário (a IA pode mandar só AAAA-MM-DD): mostra como data.
                /^\d{4}-\d{2}-\d{2}$/.test(str)
                ? "date"
                : "datetime-local"
              : f.type === "text"
                ? "text"
                : f.type
          }
          placeholder={f.placeholder}
          value={str}
          onChange={(e) => onChange(f.key, e.target.value)}
        />
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { uploadDocumentAction, type UploadState } from "@/lib/data/documents";

const CATEGORIES: { value: string; label: string }[] = [
  { value: "documento_pessoal", label: "Documento pessoal" },
  { value: "contrato", label: "Contrato" },
  { value: "comprovante", label: "Comprovante" },
  { value: "intimacao", label: "Intimação" },
  { value: "processo", label: "Processo" },
  { value: "prova", label: "Prova" },
  { value: "laudo", label: "Laudo" },
  { value: "certidao", label: "Certidão" },
  { value: "decisao", label: "Decisão" },
  { value: "procuracao", label: "Procuração" },
  { value: "honorarios", label: "Honorários" },
  { value: "outros", label: "Outros" },
];

const initialState: UploadState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Upload className="h-4 w-4" />
      )}
      Enviar
    </Button>
  );
}

export function DocumentUpload({ leadId }: { leadId: string }) {
  const [state, formAction] = useFormState(uploadDocumentAction, initialState);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      const t = setTimeout(() => setOpen(false), 1500);
      return () => clearTimeout(t);
    }
  }, [state.ok]);

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" /> Enviar
      </Button>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="w-full space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
    >
      <input type="hidden" name="leadId" value={leadId} />

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="file"
          name="file"
          required
          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
          className="flex-1 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-primary file:px-3 file:py-1.5 file:text-sm file:text-white"
        />
        <Select name="category" defaultValue="outros" className="sm:w-44">
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </div>

      {state.error && (
        <p className="flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5" /> {state.error}
        </p>
      )}
      {state.ok && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-600">
          <CheckCircle2 className="h-3.5 w-3.5" /> Documento enviado com sucesso.
        </p>
      )}

      <div className="flex items-center gap-2">
        <SubmitButton />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </Button>
        <span className="ml-auto text-[10px] text-slate-400">
          PDF, imagens, DOC/DOCX, XLS/XLSX • máx. 10 MB
        </span>
      </div>
    </form>
  );
}

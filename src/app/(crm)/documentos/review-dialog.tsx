"use client";

import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import {
  updateReviewStatusAction,
  type ActionState,
} from "@/lib/data/documents-actions";
import {
  REVIEW_STATUS_LABELS,
  type DocumentRow,
  type ReviewStatus,
} from "@/lib/data/documents-types";

const initial: ActionState = {};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
    </Button>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (state.error)
    return (
      <p className="flex items-center gap-1.5 text-sm text-red-600">
        <AlertCircle className="h-4 w-4" /> {state.error}
      </p>
    );
  if (state.message)
    return (
      <p className="flex items-center gap-1.5 text-sm text-amber-600">
        <Info className="h-4 w-4" /> {state.message}
      </p>
    );
  if (state.ok)
    return (
      <p className="flex items-center gap-1.5 text-sm text-emerald-600">
        <CheckCircle2 className="h-4 w-4" /> Salvo.
      </p>
    );
  return null;
}

export function ReviewDialog({
  open,
  doc,
  onClose,
}: {
  open: boolean;
  doc: DocumentRow | null;
  onClose: () => void;
}) {
  const [state, action] = useFormState(updateReviewStatusAction, initial);

  useEffect(() => {
    if (state.ok) {
      const t = setTimeout(() => onClose(), 600);
      return () => clearTimeout(t);
    }
  }, [state.ok, onClose]);

  if (!doc) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Status de revisão"
      description={doc.file_name}
      className="max-w-md"
    >
      <form action={action} className="space-y-3">
        <input type="hidden" name="id" value={doc.id} />

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">
            Novo status *
          </label>
          <Select
            name="review_status"
            defaultValue={doc.review_status}
            required
          >
            {(Object.keys(REVIEW_STATUS_LABELS) as ReviewStatus[]).map((s) => (
              <option key={s} value={s}>
                {REVIEW_STATUS_LABELS[s].label}
              </option>
            ))}
          </Select>
        </div>

        <Feedback state={state} />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Submit />
        </div>
      </form>
    </Dialog>
  );
}

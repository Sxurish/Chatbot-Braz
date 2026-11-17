"use client";

import { useCallback, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Feedback, Field, SubmitButton, useCadastroForm } from "@/components/crm/cadastro-form";
import { LEGAL_AREA_LABELS, LEGAL_STATUS_LABELS } from "@/lib/constants";
import { createCaseAction, type CadastroState } from "@/lib/data/cadastros-actions";
import { LEGAL_AREAS, LEGAL_STATUSES } from "@/lib/data/cadastros-rules";
import type { SelectOption } from "@/lib/data/fase6-options";

interface Options {
  clients: SelectOption[];
  leads: SelectOption[];
  team: SelectOption[];
  currentUserId: string;
}

export function NewCaseButton(props: Options) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  return (
    <>
      <Button
        onClick={() => {
          setRound((r) => r + 1);
          setOpen(true);
        }}
      >
        <Plus className="h-4 w-4" /> Novo caso
      </Button>
      {open && <NewCaseDialog key={round} {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

function NewCaseDialog({ clients, leads, team, currentUserId, onClose }: Options & { onClose: () => void }) {
  const onSuccess = useCallback(
    (s: CadastroState) => {
      setTimeout(onClose, s.message ? 2500 : 900);
    },
    [onClose]
  );
  const { state, pending, onSubmit } = useCadastroForm(createCaseAction, onSuccess);
  const defaultResponsible = team.some((t) => t.id === currentUserId) ? currentUserId : "";

  return (
    <Dialog
      open
      onClose={onClose}
      title="Novo caso"
      description="Demanda jurídica de um cliente (ou de um lead ainda em negociação)."
      className="max-h-[92vh] max-w-lg overflow-y-auto"
    >
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <Field
          label="Cliente"
          htmlFor="case-client"
          hint={clients.length === 0 ? "Nenhum cliente cadastrado: use “Novo cliente” ou vincule a um lead." : undefined}
        >
          <Select id="case-client" name="client_id" defaultValue="">
            <option value="">Selecione o cliente</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Lead de origem" htmlFor="case-lead" hint="Escolha o cliente, o lead ou os dois.">
          <Select id="case-lead" name="lead_id" defaultValue="">
            <option value="">Nenhum</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Título *" htmlFor="case-title">
          <Input id="case-title" name="title" placeholder="Ex.: Revisão de aposentadoria — INSS" maxLength={200} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Área" htmlFor="case-area">
            <Select id="case-area" name="legal_area" defaultValue="nao_confirmada">
              {LEGAL_AREAS.map((a) => (
                <option key={a} value={a}>
                  {LEGAL_AREA_LABELS[a]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Subárea" htmlFor="case-subarea">
            <Input id="case-subarea" name="subarea" maxLength={120} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Status" htmlFor="case-status">
            <Select id="case-status" name="status" defaultValue="triagem_inicial">
              {LEGAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LEGAL_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Responsável" htmlFor="case-assigned">
            <Select id="case-assigned" name="assigned_to" defaultValue={defaultResponsible}>
              <option value="">Sem responsável</option>
              {team.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Resumo" htmlFor="case-summary">
          <Textarea id="case-summary" name="summary" rows={3} maxLength={4000} />
        </Field>

        <Feedback state={state} successText="Caso criado." />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <SubmitButton label="Criar caso" pending={pending} />
        </div>
      </form>
    </Dialog>
  );
}

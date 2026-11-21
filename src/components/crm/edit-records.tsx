"use client";

import { useCallback, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Feedback, Field, SubmitButton, useCadastroForm } from "@/components/crm/cadastro-form";
import {
  COMMERCIAL_STATUS_LABELS,
  FINANCIAL_STATUS_LABELS,
  LEGAL_AREA_LABELS,
  LEGAL_STATUS_LABELS,
  URGENCY_LABELS,
} from "@/lib/constants";
import { LEGAL_AREAS, LEGAL_STATUSES, UFS, URGENCIES } from "@/lib/data/cadastros-rules";
import { COMMERCIAL_STATUSES, FINANCIAL_STATUSES } from "@/lib/data/edicao-rules";
import { updateCaseAction, updateClientAction, updateLeadAction } from "@/lib/data/edicao-actions";
import type { SelectOption } from "@/lib/data/fase6-options";
import type { Case, Client, Lead } from "@/lib/types";

/**
 * Formulários de EDITAR lead, cliente e caso. Os campos e as validações são
 * os mesmos do cadastro (o servidor confere de novo em edicao-rules.ts).
 */

function EditButton({ onClick, label = "Editar" }: { onClick: () => void; label?: string }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      <Pencil className="h-4 w-4" /> {label}
    </Button>
  );
}

function useDialog() {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const show = useCallback(() => {
    setRound((r) => r + 1);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  return { open, round, show, close };
}

function useEditForm(
  action: Parameters<typeof useCadastroForm>[0],
  onClose: () => void
) {
  const onSuccess = useCallback(
    (s: { message?: string }) => setTimeout(onClose, s.message ? 2500 : 700),
    [onClose]
  );
  return useCadastroForm(action, onSuccess);
}

function Footer({ onClose, pending }: { onClose: () => void; pending: boolean }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button type="button" variant="ghost" size="sm" onClick={onClose}>
        Cancelar
      </Button>
      <SubmitButton label="Salvar" pending={pending} />
    </div>
  );
}

function UfSelect({ id, value }: { id: string; value: string | null }) {
  return (
    <Select id={id} name="state" defaultValue={value ?? ""}>
      <option value="">—</option>
      {UFS.map((uf) => (
        <option key={uf} value={uf}>
          {uf}
        </option>
      ))}
    </Select>
  );
}

function TeamSelect({ id, team, value }: { id: string; team: SelectOption[]; value: string | null }) {
  // Quem já é responsável continua na lista mesmo se saiu da equipe ativa.
  const known = !value || team.some((t) => t.id === value);
  return (
    <Select id={id} name="assigned_to" defaultValue={value ?? ""}>
      <option value="">Sem responsável</option>
      {!known && <option value={value!}>Responsável atual (fora da equipe ativa)</option>}
      {team.map((t) => (
        <option key={t.id} value={t.id}>
          {t.label}
        </option>
      ))}
    </Select>
  );
}

// ===========================================================================
// LEAD
// ===========================================================================
export function EditLeadButton({ lead, team }: { lead: Lead; team: SelectOption[] }) {
  const d = useDialog();
  return (
    <>
      <EditButton onClick={d.show} />
      {d.open && <EditLeadDialog key={d.round} lead={lead} team={team} onClose={d.close} />}
    </>
  );
}

function EditLeadDialog({ lead, team, onClose }: { lead: Lead; team: SelectOption[]; onClose: () => void }) {
  const { state, pending, onSubmit } = useEditForm(updateLeadAction, onClose);
  return (
    <Dialog open onClose={onClose} title="Editar lead" className="max-h-[92vh] max-w-2xl overflow-y-auto">
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <input type="hidden" name="id" value={lead.id} />
        <Field label="Nome completo *" htmlFor="el-name">
          <Input id="el-name" name="full_name" required maxLength={160} defaultValue={lead.full_name} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Status comercial" htmlFor="el-com">
            <Select id="el-com" name="commercial_status" defaultValue={lead.commercial_status}>
              {COMMERCIAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {COMMERCIAL_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status jurídico" htmlFor="el-leg">
            <Select id="el-leg" name="legal_status" defaultValue={lead.legal_status}>
              {LEGAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LEGAL_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status financeiro" htmlFor="el-fin">
            <Select id="el-fin" name="financial_status" defaultValue={lead.financial_status}>
              {FINANCIAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {FINANCIAL_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Telefone / WhatsApp" htmlFor="el-phone">
            <Input id="el-phone" name="phone" type="tel" inputMode="tel" defaultValue={lead.phone ?? ""} />
          </Field>
          <Field label="E-mail" htmlFor="el-email">
            <Input id="el-email" name="email" type="email" defaultValue={lead.email ?? ""} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
          <Field label="Cidade" htmlFor="el-city">
            <Input id="el-city" name="city" maxLength={80} defaultValue={lead.city ?? ""} />
          </Field>
          <Field label="UF" htmlFor="el-uf">
            <UfSelect id="el-uf" value={lead.state} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Área do caso" htmlFor="el-area">
            <Select id="el-area" name="legal_area" defaultValue={lead.legal_area}>
              {LEGAL_AREAS.map((a) => (
                <option key={a} value={a}>
                  {LEGAL_AREA_LABELS[a]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo do caso" htmlFor="el-type">
            <Input id="el-type" name="case_type" maxLength={120} defaultValue={lead.case_type ?? ""} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Urgência" htmlFor="el-urg">
            <Select id="el-urg" name="urgency" defaultValue={lead.urgency}>
              {URGENCIES.map((u) => (
                <option key={u} value={u}>
                  {URGENCY_LABELS[u]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Responsável" htmlFor="el-resp">
            <TeamSelect id="el-resp" team={team} value={lead.assigned_to} />
          </Field>
        </div>

        <Field label="Motivo da urgência" htmlFor="el-urg-reason">
          <Input id="el-urg-reason" name="urgency_reason" maxLength={300} defaultValue={lead.urgency_reason ?? ""} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Melhor horário para contato" htmlFor="el-time">
            <Input id="el-time" name="preferred_contact_time" maxLength={80} defaultValue={lead.preferred_contact_time ?? ""} />
          </Field>
          <Field label="Número do processo" htmlFor="el-proc">
            <Input id="el-proc" name="process_number" className="font-mono" defaultValue={lead.process_number ?? ""} />
          </Field>
        </div>

        <Field label="Resumo do caso" htmlFor="el-summary">
          <Textarea id="el-summary" name="case_summary" rows={4} maxLength={4000} defaultValue={lead.case_summary ?? ""} />
        </Field>

        <Field label="Próxima ação" htmlFor="el-next">
          <Input id="el-next" name="next_action" maxLength={300} defaultValue={lead.next_action ?? ""} />
        </Field>

        <p className="text-xs text-slate-500">
          A origem e o consentimento LGPD não mudam aqui: ficam como foram registrados.
        </p>

        <Feedback state={state} successText="Lead salvo." />
        <Footer onClose={onClose} pending={pending} />
      </form>
    </Dialog>
  );
}

// ===========================================================================
// CLIENTE
// ===========================================================================
export function EditClientButton({ client }: { client: Client }) {
  const d = useDialog();
  return (
    <>
      <EditButton onClick={d.show} />
      {d.open && <EditClientDialog key={d.round} client={client} onClose={d.close} />}
    </>
  );
}

function EditClientDialog({ client, onClose }: { client: Client; onClose: () => void }) {
  const { state, pending, onSubmit } = useEditForm(updateClientAction, onClose);
  return (
    <Dialog open onClose={onClose} title="Editar cliente" className="max-h-[92vh] max-w-lg overflow-y-auto">
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <input type="hidden" name="id" value={client.id} />
        <Field label="Nome completo ou razão social *" htmlFor="ec-name">
          <Input id="ec-name" name="full_name" required maxLength={160} defaultValue={client.full_name} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="CPF ou CNPJ" htmlFor="ec-doc">
            <Input id="ec-doc" name="cpf_cnpj" inputMode="numeric" className="font-mono" defaultValue={client.cpf_cnpj ?? ""} />
          </Field>
          <Field label="Situação" htmlFor="ec-status">
            <Select id="ec-status" name="status" defaultValue={client.status}>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </Select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Telefone / WhatsApp" htmlFor="ec-phone">
            <Input id="ec-phone" name="phone" type="tel" inputMode="tel" defaultValue={client.phone ?? ""} />
          </Field>
          <Field label="E-mail" htmlFor="ec-email">
            <Input id="ec-email" name="email" type="email" defaultValue={client.email ?? ""} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
          <Field label="Cidade" htmlFor="ec-city">
            <Input id="ec-city" name="city" maxLength={80} defaultValue={client.city ?? ""} />
          </Field>
          <Field label="UF" htmlFor="ec-uf">
            <UfSelect id="ec-uf" value={client.state} />
          </Field>
        </div>
        <Feedback state={state} successText="Cliente salvo." />
        <Footer onClose={onClose} pending={pending} />
      </form>
    </Dialog>
  );
}

// ===========================================================================
// CASO
// ===========================================================================
export function EditCaseButton({
  item,
  clients,
  team,
}: {
  item: Case;
  clients: SelectOption[];
  team: SelectOption[];
}) {
  const d = useDialog();
  return (
    <>
      <EditButton onClick={d.show} />
      {d.open && <EditCaseDialog key={d.round} item={item} clients={clients} team={team} onClose={d.close} />}
    </>
  );
}

function EditCaseDialog({
  item,
  clients,
  team,
  onClose,
}: {
  item: Case;
  clients: SelectOption[];
  team: SelectOption[];
  onClose: () => void;
}) {
  const { state, pending, onSubmit } = useEditForm(updateCaseAction, onClose);
  const knownClient = !item.client_id || clients.some((c) => c.id === item.client_id);
  return (
    <Dialog open onClose={onClose} title="Editar caso" className="max-h-[92vh] max-w-lg overflow-y-auto">
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <input type="hidden" name="id" value={item.id} />
        <Field label="Título do caso *" htmlFor="eca-title">
          <Input id="eca-title" name="title" required maxLength={200} defaultValue={item.title} />
        </Field>
        <Field label="Cliente" htmlFor="eca-client">
          <Select id="eca-client" name="client_id" defaultValue={item.client_id ?? ""}>
            <option value="">Sem cliente (só o lead)</option>
            {!knownClient && <option value={item.client_id!}>Cliente atual</option>}
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Área" htmlFor="eca-area">
            <Select id="eca-area" name="legal_area" defaultValue={item.legal_area}>
              {LEGAL_AREAS.map((a) => (
                <option key={a} value={a}>
                  {LEGAL_AREA_LABELS[a]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Subárea" htmlFor="eca-sub">
            <Input id="eca-sub" name="subarea" maxLength={120} defaultValue={item.subarea ?? ""} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Status" htmlFor="eca-status">
            <Select id="eca-status" name="status" defaultValue={item.status}>
              {LEGAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LEGAL_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Responsável" htmlFor="eca-resp">
            <TeamSelect id="eca-resp" team={team} value={item.assigned_to} />
          </Field>
        </div>
        <Field label="Resumo" htmlFor="eca-summary">
          <Textarea id="eca-summary" name="summary" rows={4} maxLength={4000} defaultValue={item.summary ?? ""} />
        </Field>
        <Feedback state={state} successText="Caso salvo." />
        <Footer onClose={onClose} pending={pending} />
      </form>
    </Dialog>
  );
}

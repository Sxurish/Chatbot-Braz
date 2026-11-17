"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DuplicateNotice, Feedback, Field, SubmitButton, useCadastroForm } from "@/components/crm/cadastro-form";
import { LEGAL_AREA_LABELS, URGENCY_LABELS } from "@/lib/constants";
import { createLeadAction, type CadastroState } from "@/lib/data/cadastros-actions";
import { LEGAL_AREAS, MANUAL_SOURCES, UFS, URGENCIES } from "@/lib/data/cadastros-rules";
import type { SelectOption } from "@/lib/data/fase6-options";

export function NewLeadButton({ team, currentUserId }: { team: SelectOption[]; currentUserId: string }) {
  const [open, setOpen] = useState(false);
  // Cada abertura monta o formulário de novo (sem resto da tentativa anterior).
  const [round, setRound] = useState(0);
  return (
    <>
      <Button
        onClick={() => {
          setRound((r) => r + 1);
          setOpen(true);
        }}
      >
        <Plus className="h-4 w-4" /> Novo lead
      </Button>
      {open && (
        <NewLeadDialog key={round} team={team} currentUserId={currentUserId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function NewLeadDialog({
  team,
  currentUserId,
  onClose,
}: {
  team: SelectOption[];
  currentUserId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const onSuccess = useCallback(
    (s: CadastroState) => {
      if (s.id) {
        router.push(`/leads/${s.id}`);
        onClose();
        return;
      }
      // Modo demonstração: mostra o aviso um pouco e fecha.
      setTimeout(onClose, 2500);
    },
    [router, onClose]
  );
  const { state, pending, onSubmit } = useCadastroForm(createLeadAction, onSuccess);
  const defaultResponsible = team.some((t) => t.id === currentUserId) ? currentUserId : "";

  return (
    <Dialog
      open
      onClose={onClose}
      title="Novo lead"
      description="Cadastro feito pela equipe (indicação, telefone, visita...)."
      className="max-h-[92vh] max-w-2xl overflow-y-auto"
    >
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <Field label="Nome completo *" htmlFor="lead-name">
          <Input id="lead-name" name="full_name" autoComplete="off" required maxLength={160} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Telefone / WhatsApp" htmlFor="lead-phone">
            <Input id="lead-phone" name="phone" type="tel" inputMode="tel" placeholder="(11) 98765-4321" />
          </Field>
          <Field label="E-mail" htmlFor="lead-email">
            <Input id="lead-email" name="email" type="email" placeholder="nome@exemplo.com" />
          </Field>
        </div>
        <p className="-mt-1 text-xs text-slate-500">Informe ao menos o telefone ou o e-mail.</p>

        <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
          <Field label="Cidade" htmlFor="lead-city">
            <Input id="lead-city" name="city" maxLength={80} />
          </Field>
          <Field label="UF" htmlFor="lead-uf">
            <Select id="lead-uf" name="state" defaultValue="">
              <option value="">—</option>
              {UFS.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Área do caso" htmlFor="lead-area">
            <Select id="lead-area" name="legal_area" defaultValue="nao_confirmada">
              {LEGAL_AREAS.map((a) => (
                <option key={a} value={a}>
                  {LEGAL_AREA_LABELS[a]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo do caso" htmlFor="lead-type">
            <Input id="lead-type" name="case_type" placeholder="Ex.: revisão de aposentadoria" maxLength={120} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Origem *" htmlFor="lead-source">
            <Select id="lead-source" name="source" defaultValue="" required>
              <option value="">Selecione</option>
              {MANUAL_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Urgência" htmlFor="lead-urgency">
            <Select id="lead-urgency" name="urgency" defaultValue="baixa">
              {URGENCIES.map((u) => (
                <option key={u} value={u}>
                  {URGENCY_LABELS[u]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Motivo da urgência" htmlFor="lead-urgency-reason">
          <Input id="lead-urgency-reason" name="urgency_reason" placeholder="Ex.: audiência na próxima semana" maxLength={300} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Responsável" htmlFor="lead-assigned">
            <Select id="lead-assigned" name="assigned_to" defaultValue={defaultResponsible}>
              <option value="">Sem responsável</option>
              {team.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Melhor horário para contato" htmlFor="lead-time">
            <Input id="lead-time" name="preferred_contact_time" placeholder="Ex.: manhã" maxLength={80} />
          </Field>
        </div>

        <Field label="Número do processo (se já existir)" htmlFor="lead-process">
          <Input id="lead-process" name="process_number" placeholder="0000000-00.0000.0.00.0000" className="font-mono" />
        </Field>

        <Field label="Observações / resumo do caso" htmlFor="lead-summary">
          <Textarea id="lead-summary" name="case_summary" rows={3} maxLength={4000} />
        </Field>

        <Field label="Próxima ação" htmlFor="lead-next">
          <Input id="lead-next" name="next_action" placeholder="Ex.: ligar amanhã para pedir documentos" maxLength={300} />
        </Field>

        <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
          <input type="checkbox" name="consent" className="mt-1 h-4 w-4 shrink-0 accent-brand-primary" />
          <span>
            A pessoa autorizou de forma expressa o uso dos dados (LGPD).
            <span className="block text-xs text-slate-500">
              Marque só se houver autorização por escrito ou mensagem. Sem isso, o lead fica como
              &quot;Não concedido&quot; e o consentimento é pedido no atendimento.
            </span>
          </span>
        </label>

        <DuplicateNotice state={state} pending={pending} />
        <Feedback state={state} successText="Lead cadastrado." />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <SubmitButton label="Cadastrar lead" pending={pending} />
        </div>
      </form>
    </Dialog>
  );
}

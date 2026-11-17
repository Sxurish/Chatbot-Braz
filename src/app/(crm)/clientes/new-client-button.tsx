"use client";

import { useCallback, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DuplicateNotice, Feedback, Field, SubmitButton, useCadastroForm } from "@/components/crm/cadastro-form";
import { createClientAction, type CadastroState } from "@/lib/data/cadastros-actions";
import { UFS } from "@/lib/data/cadastros-rules";

export function NewClientButton() {
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
        <Plus className="h-4 w-4" /> Novo cliente
      </Button>
      {open && <NewClientDialog key={round} onClose={() => setOpen(false)} />}
    </>
  );
}

function NewClientDialog({ onClose }: { onClose: () => void }) {
  const onSuccess = useCallback(
    (s: CadastroState) => {
      // Gravado: a lista atualiza sozinha (revalidatePath). Demonstração: deixa ler o aviso.
      setTimeout(onClose, s.message ? 2500 : 900);
    },
    [onClose]
  );
  const { state, pending, onSubmit } = useCadastroForm(createClientAction, onSuccess);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Novo cliente"
      description="Para quem já contratou e não passou pelo chatbot (indicação, retorno...)."
      className="max-h-[92vh] max-w-lg overflow-y-auto"
    >
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <Field label="Nome completo ou razão social *" htmlFor="client-name">
          <Input id="client-name" name="full_name" autoComplete="off" required maxLength={160} />
        </Field>

        <Field label="CPF ou CNPJ" htmlFor="client-doc" hint="Conferimos os dígitos verificadores.">
          <Input id="client-doc" name="cpf_cnpj" inputMode="numeric" placeholder="000.000.000-00" className="font-mono" />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Telefone / WhatsApp" htmlFor="client-phone">
            <Input id="client-phone" name="phone" type="tel" inputMode="tel" placeholder="(11) 98765-4321" />
          </Field>
          <Field label="E-mail" htmlFor="client-email">
            <Input id="client-email" name="email" type="email" placeholder="nome@exemplo.com" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
          <Field label="Cidade" htmlFor="client-city">
            <Input id="client-city" name="city" maxLength={80} />
          </Field>
          <Field label="UF" htmlFor="client-uf">
            <Select id="client-uf" name="state" defaultValue="">
              <option value="">—</option>
              {UFS.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <p className="text-xs text-slate-500">
          Se a pessoa já é um lead, prefira &quot;Converter em cliente&quot; na página do lead: o histórico fica junto.
        </p>

        <DuplicateNotice
          state={state}
          pending={pending}
          leadHint="Para não duplicar, abra o lead e use “Converter em cliente”."
        />
        <Feedback state={state} successText="Cliente cadastrado." />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <SubmitButton label="Cadastrar cliente" pending={pending} />
        </div>
      </form>
    </Dialog>
  );
}

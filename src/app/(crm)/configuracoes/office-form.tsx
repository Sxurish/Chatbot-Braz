"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Loader2, AlertCircle, Info, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  updateOfficeAction,
  type ActionState,
} from "@/lib/data/settings-actions";
import type { Settings } from "@/lib/data/settings";

const initial: ActionState = {};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-medium text-slate-700">{children}</label>;
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />} Salvar alterações
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
        <CheckCircle2 className="h-4 w-4" /> Alterações salvas.
      </p>
    );
  return null;
}

export function OfficeForm({
  settings,
  readOnly,
}: {
  settings: Settings;
  readOnly: boolean;
}) {
  const [state, action] = useFormState(updateOfficeAction, initial);
  const o = settings.office;
  const h = o.business_hours;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados do escritório</CardTitle>
        <CardDescription>
          Informações institucionais usadas na landing, no chatbot e nos documentos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <fieldset disabled={readOnly} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel>Nome do escritório *</FieldLabel>
                <Input
                  name="office_name"
                  defaultValue={settings.office_name}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>OAB do responsável</FieldLabel>
                <Input name="oab" defaultValue={o.oab} placeholder="OAB/SP 000.000" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel>CNPJ</FieldLabel>
                <Input
                  name="cnpj"
                  defaultValue={o.cnpj}
                  placeholder="00.000.000/0000-00"
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Telefone</FieldLabel>
                <Input
                  name="phone"
                  defaultValue={o.phone}
                  placeholder="(11) 0000-0000"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel>E-mail de contato</FieldLabel>
                <Input
                  type="email"
                  name="email"
                  defaultValue={o.email}
                  placeholder="contato@..."
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Endereço</FieldLabel>
                <Input
                  name="address"
                  defaultValue={o.address}
                  placeholder="Rua, número, cidade/UF"
                />
              </div>
            </div>

            <div className="space-y-2">
              <FieldLabel>Horário de atendimento</FieldLabel>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <span className="text-xs text-slate-500">Seg-Sex</span>
                  <Input
                    name="weekdays"
                    defaultValue={h?.weekdays}
                    placeholder="08:00 - 18:00"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-slate-500">Sábado</span>
                  <Input
                    name="saturday"
                    defaultValue={h?.saturday}
                    placeholder="Fechado"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-slate-500">Domingo</span>
                  <Input
                    name="sunday"
                    defaultValue={h?.sunday}
                    placeholder="Fechado"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5 sm:max-w-xs">
              <FieldLabel>Versão da Política de Privacidade *</FieldLabel>
              <Input
                name="privacy_policy_version"
                defaultValue={settings.privacy_policy_version}
                required
              />
              <p className="text-xs text-slate-500">
                Registrada em cada consentimento LGPD.
              </p>
            </div>
          </fieldset>

          <div className="flex items-center justify-between pt-2">
            <Feedback state={state} />
            <Submit disabled={readOnly} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

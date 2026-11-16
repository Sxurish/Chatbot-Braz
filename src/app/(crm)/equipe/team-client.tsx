"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Check, CheckCircle2, Copy, Loader2, RotateCw, UserPlus, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  cancelInviteAction,
  createInviteAction,
  renewInviteAction,
  updateMemberAction,
  type TeamActionState,
} from "@/lib/auth/team-actions";
import { INVITE_VALIDITY_DAYS, ROLE_OPTIONS } from "@/lib/auth/invite-rules";
import type { TeamInvite } from "@/lib/data/invites";
import type { TeamUser, UserRole } from "@/lib/types";
import { cn, formatDate, formatDateTime, getInitials } from "@/lib/utils";

const ROLE_LABEL = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.label])) as Record<UserRole, string>;

function instructions(email: string, loginUrl: string) {
  return `Olá! Seu acesso ao CRM do escritório Dr. Jean Braz foi liberado.\n\n1. Abra ${loginUrl}\n2. Clique em "Primeiro acesso"\n3. Use o e-mail ${email}\n4. Digite o código de 6 dígitos que chegar no e-mail e crie sua senha.\n\nO convite vale por ${INVITE_VALIDITY_DAYS} dias.`;
}

function CopyInstructions({ email, loginUrl, compact }: { email: string; loginUrl: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(instructions(email, loginUrl));
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // navegador sem permissão de cópia
        }
      }}
      title="Copiar instruções para mandar por WhatsApp"
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {compact ? null : copied ? "Copiado" : "Copiar instruções"}
    </Button>
  );
}

function SubmitInvite() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />} Criar convite
    </Button>
  );
}

export function InviteButton({ loginUrl }: { loginUrl: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(createInviteAction, {} as TeamActionState);
  const [email, setEmail] = useState("");

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" /> Convidar pessoa
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Convidar pessoa para a equipe"
        description={`A pessoa entra em "Primeiro acesso" na tela de login, confirma um código enviado por e-mail e cria a senha. O convite vale ${INVITE_VALIDITY_DAYS} dias.`}
      >
        {state.ok ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{state.message} Mande as instruções para a pessoa (por WhatsApp, por exemplo).</p>
            </div>
            <pre className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-xs text-slate-600">
              {instructions(email, loginUrl)}
            </pre>
            <div className="flex justify-end gap-2">
              <CopyInstructions email={email} loginUrl={loginUrl} />
              <Button type="button" onClick={() => setOpen(false)}>
                Concluir
              </Button>
            </div>
          </div>
        ) : (
          <form action={action} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="invite-name" className="block text-sm leading-6 font-medium text-slate-700">
                Nome
              </label>
              <Input id="invite-name" name="name" required maxLength={120} placeholder="Nome completo" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="invite-email" className="block text-sm leading-6 font-medium text-slate-700">
                E-mail
              </label>
              <Input
                id="invite-email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value.trim().toLowerCase())}
                placeholder="pessoa@escritoriobraz.adv.br"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="invite-role" className="block text-sm leading-6 font-medium text-slate-700">
                Papel
              </label>
              <Select id="invite-role" name="role" defaultValue="atendente">
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-slate-500">Financeiro e Contratos só aparecem para Administrador.</p>
            </div>
            {state.error && (
              <p role="alert" className="flex items-center gap-1.5 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" /> {state.error}
              </p>
            )}
            <div className="flex justify-end">
              <SubmitInvite />
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}

export function InviteList({ invites, loginUrl }: { invites: TeamInvite[]; loginUrl: string }) {
  return (
    <Card className="mb-6">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Convites</h2>
        <p className="text-xs text-slate-500">Pessoas que ainda não fizeram o primeiro acesso.</p>
      </div>
      <ul className="divide-y divide-slate-100">
        {invites.map((inv) => {
          const expired = Boolean(inv.expired);
          const cancelled = inv.status === "cancelado";
          return (
            <li key={inv.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{inv.name}</p>
                <p className="truncate text-xs text-slate-500">
                  {inv.email} · {ROLE_LABEL[inv.role]}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  className={cn(
                    cancelled
                      ? "border-slate-200 bg-slate-50 text-slate-500"
                      : expired
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                  )}
                >
                  {cancelled ? "Cancelado" : expired ? "Vencido" : `Pendente até ${formatDate(inv.expires_at)}`}
                </Badge>
                {!cancelled && (
                  <>
                    <CopyInstructions email={inv.email} loginUrl={loginUrl} compact />
                    <form action={renewInviteAction}>
                      <input type="hidden" name="id" value={inv.id} />
                      <Button type="submit" variant="outline" size="sm" title={`Renovar por mais ${INVITE_VALIDITY_DAYS} dias`}>
                        <RotateCw className="h-4 w-4" /> Renovar
                      </Button>
                    </form>
                    <form action={cancelInviteAction}>
                      <input type="hidden" name="id" value={inv.id} />
                      <Button type="submit" variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" title="Cancelar convite">
                        <X className="h-4 w-4" /> Cancelar
                      </Button>
                    </form>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function MemberRow({ user, editable }: { user: TeamUser; editable: boolean }) {
  return (
    <div className={cn("flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between", !user.active && "bg-slate-50/60")}>
      <div className="flex items-center gap-3">
        <Avatar fallback={getInitials(user.name)} />
        <div>
          <p className={cn("font-medium", user.active ? "text-slate-900" : "text-slate-400")}>
            {user.name}
            {!user.active && <span className="ml-2 text-xs font-normal text-slate-400">(desativado)</span>}
          </p>
          <p className="text-xs text-slate-500">{user.email}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="hidden text-xs text-slate-400 md:inline">Último acesso: {formatDateTime(user.last_login)}</span>
        {editable ? (
          <>
            <form action={updateMemberAction}>
              <input type="hidden" name="id" value={user.id} />
              <Select
                name="role"
                defaultValue={user.role}
                aria-label={`Papel de ${user.name}`}
                className="h-9 w-44"
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </form>
            <form action={updateMemberAction}>
              <input type="hidden" name="id" value={user.id} />
              <input type="hidden" name="active" value={user.active ? "false" : "true"} />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className={user.active ? "text-red-600 hover:bg-red-50" : "text-emerald-700 hover:bg-emerald-50"}
              >
                {user.active ? "Desativar" : "Reativar"}
              </Button>
            </form>
          </>
        ) : (
          <Badge className="border-brand-primary/20 bg-brand-primary/5 text-brand-primary">{ROLE_LABEL[user.role]}</Badge>
        )}
      </div>
    </div>
  );
}

import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { createServiceClient } from "@/lib/supabase/server";
import type { TeamUser } from "@/lib/types";

/**
 * Identidade "emprestada" para pedidos que não vêm do navegador (fase 4:
 * assistente pelo WhatsApp). No WhatsApp não há cookie de sessão: quem
 * pergunta é reconhecido pelo número cadastrado na tela Equipe. Dentro de
 * `runAsTeamMember`, `createClient()` devolve o cliente informado e
 * `getCurrentUser()` devolve essa pessoa (nunca o perfil de demonstração).
 *
 * TROCA DE SEGURANÇA: o cliente usado aqui é o service role, então as regras
 * de RLS do banco NÃO filtram nada. Quem chama compensa no código:
 *  - no WhatsApp nenhuma ferramenta financeira é oferecida, nem para Admin;
 *  - as tabelas do assistente (conversas, mensagens, rascunhos) são sempre
 *    filtradas e gravadas com o user_id da pessoa, explicitamente;
 *  - o que o banco preencheria com auth.uid() (ex.: autor do andamento) é
 *    preenchido no código;
 *  - papel "visualizador" não recebe ferramentas de rascunho.
 * O resto do CRM (leads, processos, tarefas...) já é aberto a toda a equipe
 * pelas regras de RLS, então o acesso não passa do que a pessoa tem no painel.
 */

export type ServiceClient = ReturnType<typeof createServiceClient>;

export interface TeamMemberContext {
  /** Cliente Supabase a usar (service role). Nulo no modo demonstração. */
  client: ServiceClient | null;
  /** Pessoa da equipe, ativa, reconhecida pelo número. */
  user: TeamUser;
  /** Canal de onde veio o pedido. */
  channel: "whatsapp";
}

const storage = new AsyncLocalStorage<TeamMemberContext>();

/** Roda `fn` como se a pessoa estivesse logada (só no servidor). */
export function runAsTeamMember<T>(context: TeamMemberContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(context, fn);
}

/** Identidade emprestada ativa neste pedido, se houver. */
export function getTeamMemberContext(): TeamMemberContext | null {
  return storage.getStore() ?? null;
}

/**
 * Links que o assistente pode mostrar: só caminhos internos do CRM (começam
 * com "/", sem "//" nem "\"). Usado no painel (markdown.tsx) e no WhatsApp.
 */
export function isSafeInternalHref(href: string): boolean {
  return /^\/(?!\/)[\w\-./?=&%#:]*$/.test(href) && !/^\/\\/.test(href);
}

/** Endereço público do CRM, para links absolutos fora do navegador (WhatsApp). */
export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://chatbot-braz.vercel.app").replace(/\/+$/, "");
}

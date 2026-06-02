import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type AiProvider = "mock" | "openai" | "anthropic" | "openrouter" | "google";

export interface BusinessHours {
  weekdays: string;
  saturday: string;
  sunday: string;
}

export interface OfficeData {
  cnpj?: string;
  oab?: string;
  address?: string;
  phone?: string;
  email?: string;
  business_hours?: BusinessHours;
}

export interface AiData {
  greeting?: string;
  legal_areas?: string[];
  urgency_keywords?: string[];
}

export interface Settings {
  office_name: string;
  privacy_policy_version: string;
  ai_provider: AiProvider;
  ai_model: string | null;
  office: OfficeData;
  ai: AiData;
  updated_at?: string;
}

const DEFAULT_SETTINGS: Settings = {
  office_name: "Escritório Dr. Jean Braz",
  privacy_policy_version: "1.0.0",
  ai_provider: "mock",
  ai_model: null,
  office: {
    cnpj: "",
    oab: "OAB/SP 000.000",
    address: "",
    phone: "",
    email: "contato@escritoriobraz.adv.br",
    business_hours: {
      weekdays: "08:00 - 18:00",
      saturday: "Fechado",
      sunday: "Fechado",
    },
  },
  ai: {
    greeting:
      "Olá! Sou a assistente do escritório do Dr. Jean Braz. Posso fazer uma triagem inicial do seu caso?",
    legal_areas: [
      "Direito Civil",
      "Direito de Família",
      "Direito Trabalhista",
      "Direito do Consumidor",
      "Direito Previdenciário",
    ],
    urgency_keywords: ["audiência hoje", "preso", "ameaça", "prazo vencendo"],
  },
};

/** Lê configurações do Supabase ou retorna o mock em modo demonstração. */
export async function getSettings(): Promise<Settings> {
  if (!isSupabaseConfigured()) return DEFAULT_SETTINGS;

  const supabase = createClient();
  const { data } = await supabase
    .from("settings")
    .select("office_name, privacy_policy_version, ai_provider, ai_model, data, updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (!data) return DEFAULT_SETTINGS;

  const extra = (data.data ?? {}) as { office?: OfficeData; ai?: AiData };
  return {
    office_name: data.office_name ?? DEFAULT_SETTINGS.office_name,
    privacy_policy_version:
      data.privacy_policy_version ?? DEFAULT_SETTINGS.privacy_policy_version,
    ai_provider: (data.ai_provider as AiProvider) ?? DEFAULT_SETTINGS.ai_provider,
    ai_model: data.ai_model ?? null,
    office: { ...DEFAULT_SETTINGS.office, ...(extra.office ?? {}) },
    ai: { ...DEFAULT_SETTINGS.ai, ...(extra.ai ?? {}) },
    updated_at: data.updated_at,
  };
}

/** Status de cada integração baseado nas variáveis de ambiente do servidor. */
export interface IntegrationStatus {
  whatsapp: {
    configured: boolean;
    phone_number_id_masked: string | null;
    webhook_url: string;
  };
  instagram: {
    configured: boolean;
    webhook_url: string;
    note: string;
  };
  ai: {
    provider: AiProvider;
    has_api_key: boolean;
  };
}

function maskTail(value: string | undefined, visible = 4): string | null {
  if (!value) return null;
  if (value.length <= visible) return "•".repeat(value.length);
  return "•".repeat(value.length - visible) + value.slice(-visible);
}

function aiKeyEnvName(provider: AiProvider): string | null {
  switch (provider) {
    case "openai":
      return "OPENAI_API_KEY";
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "openrouter":
      return "OPENROUTER_API_KEY";
    case "google":
      return "GOOGLE_GENERATIVE_AI_API_KEY";
    default:
      return null;
  }
}

export function getIntegrationStatus(provider: AiProvider): IntegrationStatus {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const keyEnv = aiKeyEnvName(provider);
  return {
    whatsapp: {
      configured: Boolean(
        process.env.WHATSAPP_ACCESS_TOKEN &&
          process.env.WHATSAPP_PHONE_NUMBER_ID &&
          process.env.WHATSAPP_VERIFY_TOKEN
      ),
      phone_number_id_masked: maskTail(process.env.WHATSAPP_PHONE_NUMBER_ID),
      webhook_url: `${appUrl}/api/webhooks/whatsapp`,
    },
    instagram: {
      configured: Boolean(
        process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_VERIFY_TOKEN
      ),
      webhook_url: `${appUrl}/api/webhooks/instagram`,
      note: "Rota do webhook ainda não implementada — preparada para a próxima fase.",
    },
    ai: {
      provider,
      has_api_key: provider === "mock" ? true : Boolean(keyEnv && process.env[keyEnv]),
    },
  };
}

import { describe, expect, it } from "vitest";
import {
  codeSchema,
  decideAccess,
  inviteExpiry,
  inviteSchema,
  isInviteUsable,
  normalizeEmail,
  passwordSchema,
  safeRedirect,
  INVITE_VALIDITY_DAYS,
} from "@/lib/auth/invite-rules";
import { hitLimit, resetLimit } from "@/lib/auth/rate-limit";

const NOW = new Date("2026-11-16T12:00:00Z");
const future = new Date(NOW.getTime() + 86_400_000).toISOString();
const past = new Date(NOW.getTime() - 1000).toISOString();

describe("convite", () => {
  it("vale 7 dias a partir de agora", () => {
    const exp = new Date(inviteExpiry(NOW)).getTime();
    expect(exp - NOW.getTime()).toBe(INVITE_VALIDITY_DAYS * 86_400_000);
  });

  it("só serve se estiver pendente e dentro do prazo", () => {
    expect(isInviteUsable({ status: "pendente", expires_at: future }, NOW)).toBe(true);
    expect(isInviteUsable({ status: "pendente", expires_at: past }, NOW)).toBe(false);
    expect(isInviteUsable({ status: "cancelado", expires_at: future }, NOW)).toBe(false);
    expect(isInviteUsable({ status: "aceito", expires_at: future }, NOW)).toBe(false);
    expect(isInviteUsable(null, NOW)).toBe(false);
  });

  it("valida nome, e-mail e papel", () => {
    const ok = inviteSchema.safeParse({ name: "Juliana", email: "  Ju@Ex.com ", role: "advogado" });
    expect(ok.success && ok.data.email).toBe("ju@ex.com");
    expect(inviteSchema.safeParse({ name: "J", email: "ju@ex.com", role: "advogado" }).success).toBe(false);
    expect(inviteSchema.safeParse({ name: "Juliana", email: "não-é-email", role: "advogado" }).success).toBe(false);
    expect(inviteSchema.safeParse({ name: "Juliana", email: "ju@ex.com", role: "dono" }).success).toBe(false);
  });

  it("normaliza o e-mail", () => {
    expect(normalizeEmail("  Dr.Jean@Braz.ADV.br ")).toBe("dr.jean@braz.adv.br");
    expect(normalizeEmail(undefined)).toBe("");
  });
});

describe("decideAccess", () => {
  const invite = { status: "pendente" as const, expires_at: future };

  it("perfil ativo entra no CRM", () => {
    expect(decideAccess({ active: true }, null, NOW)).toBe("allow");
    expect(decideAccess({ active: true }, invite, NOW)).toBe("allow");
  });

  it("convite válido sem perfil ativo vai para criar senha", () => {
    expect(decideAccess(null, invite, NOW)).toBe("set_password");
    expect(decideAccess({ active: false }, invite, NOW)).toBe("set_password");
  });

  it("sem perfil ativo e sem convite válido fica de fora", () => {
    expect(decideAccess(null, null, NOW)).toBe("deny");
    expect(decideAccess({ active: false }, null, NOW)).toBe("deny");
    expect(decideAccess({ active: false }, { status: "pendente", expires_at: past }, NOW)).toBe("deny");
    expect(decideAccess(null, { status: "cancelado", expires_at: future }, NOW)).toBe("deny");
  });
});

describe("código e senha", () => {
  it("código tem exatamente 6 números", () => {
    expect(codeSchema.safeParse("123456").success).toBe(true);
    expect(codeSchema.safeParse(" 123456 ").success).toBe(true);
    expect(codeSchema.safeParse("12345").success).toBe(false);
    expect(codeSchema.safeParse("1234567").success).toBe(false);
    expect(codeSchema.safeParse("12a456").success).toBe(false);
  });

  it("senha exige 8 caracteres, letra, número e confirmação igual", () => {
    expect(passwordSchema.safeParse({ password: "braz2026", confirm: "braz2026" }).success).toBe(true);
    expect(passwordSchema.safeParse({ password: "b2026", confirm: "b2026" }).success).toBe(false);
    expect(passwordSchema.safeParse({ password: "12345678", confirm: "12345678" }).success).toBe(false);
    expect(passwordSchema.safeParse({ password: "abcdefgh", confirm: "abcdefgh" }).success).toBe(false);
    const diff = passwordSchema.safeParse({ password: "braz2026", confirm: "braz2027" });
    expect(diff.success).toBe(false);
    expect(diff.error?.issues[0].path).toEqual(["confirm"]);
  });
});

describe("safeRedirect", () => {
  it("aceita só caminhos internos", () => {
    expect(safeRedirect("/leads/1")).toBe("/leads/1");
    expect(safeRedirect("https://golpe.com")).toBe("/dashboard");
    expect(safeRedirect("//golpe.com")).toBe("/dashboard");
    expect(safeRedirect("/\\golpe.com")).toBe("/dashboard");
    expect(safeRedirect(undefined)).toBe("/dashboard");
  });
});

describe("limite de tentativas", () => {
  it("bloqueia depois do máximo e libera quando a janela passa", () => {
    const key = "teste:limite";
    resetLimit(key);
    const t0 = 1_000_000;
    expect(hitLimit(key, 3, 60_000, t0)).toBe(false);
    expect(hitLimit(key, 3, 60_000, t0 + 1)).toBe(false);
    expect(hitLimit(key, 3, 60_000, t0 + 2)).toBe(false);
    expect(hitLimit(key, 3, 60_000, t0 + 3)).toBe(true);
    expect(hitLimit(key, 3, 60_000, t0 + 60_005)).toBe(false);
    resetLimit(key);
  });
});

import { describe, expect, it } from "vitest";
import { budgetMessage, computeCostUsd, getBudgetStatus } from "@/lib/assistant/cost";

describe("custo e limite de gasto", () => {
  it("calcula o custo do Haiku por milhão de tokens", () => {
    // 1M de entrada (US$ 0,10) + 1M de saída (US$ 0,50)
    expect(
      computeCostUsd("claude-haiku-5-5", { input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheWrite: 0 })
    ).toBeCloseTo(0.6, 6);
  });

  it("modelo desconhecido usa o preço mais alto (conservador)", () => {
    const usage = { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 };
    expect(computeCostUsd("modelo-x", usage)).toBeGreaterThan(computeCostUsd("claude-haiku-5-5", usage));
  });

  it("aplica as faixas: ok, aviso em 80%, acima de 100% e trava", () => {
    expect(getBudgetStatus(10, 50).level).toBe("ok");
    expect(getBudgetStatus(40, 50).level).toBe("warning");
    const over = getBudgetStatus(50, 50);
    expect(over.level).toBe("over");
    expect(over.allowChat).toBe(true);
    expect(over.allowDocuments).toBe(false);
    const blocked = getBudgetStatus(75, 50);
    expect(blocked.level).toBe("blocked");
    expect(blocked.allowChat).toBe(false);
  });

  it("sem limite definido, bloqueia", () => {
    expect(getBudgetStatus(0, 0).level).toBe("blocked");
  });

  it("mensagens de aviso", () => {
    expect(budgetMessage(getBudgetStatus(10, 50))).toBeNull();
    expect(budgetMessage(getBudgetStatus(41, 50))).toMatch(/82%/);
  });
});

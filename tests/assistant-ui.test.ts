import { describe, expect, it } from "vitest";
import { isSafeInternalHref, parseBlocks, renderInline } from "@/components/assistant/markdown";
import { describePage } from "@/lib/assistant/prompt";

describe("links nas respostas", () => {
  it.each(["/leads/lead-002", "/processos", "/agenda?dia=2026-06-01"])("aceita link interno %s", (href) => {
    expect(isSafeInternalHref(href)).toBe(true);
  });

  it.each([
    "https://site-falso.com",
    "//site-falso.com",
    "javascript:alert(1)",
    "/\\site-falso.com",
    "leads/1",
  ])("recusa %s", (href) => {
    expect(isSafeInternalHref(href)).toBe(false);
  });

  it("link dentro de negrito continua link", () => {
    const [strong] = renderInline("**[1002345-67](/processos/proc-001)**") as {
      props: { children: { props: { href: string } }[] };
    }[];
    expect(strong.props.children[0].props.href).toBe("/processos/proc-001");
  });

  it("monta listas e parágrafos", () => {
    const blocks = parseBlocks("Resumo:\n- um\n- dois\n\n1. primeiro\n2. segundo");
    expect(blocks.map((b) => b.kind)).toEqual(["p", "ul", "ol"]);
  });
});

describe("contexto da tela", () => {
  it("reconhece a ficha de um lead", () => {
    expect(describePage("/leads/lead-001")).toContain('lead de id "lead-001"');
  });
  it("ignora caminhos inválidos", () => {
    expect(describePage("https://x.com")).toBeNull();
    expect(describePage(null)).toBeNull();
  });
});

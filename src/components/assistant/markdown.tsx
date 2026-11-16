import Link from "next/link";
import { Fragment, type ReactNode } from "react";

/**
 * Markdown mínimo e seguro para as respostas do assistente: parágrafos, listas,
 * **negrito**, _itálico_, `código` e links. Nada de HTML cru; links só para
 * caminhos internos do CRM (começam com "/"). Qualquer outro link vira texto.
 */

export function isSafeInternalHref(href: string): boolean {
  return /^\/(?!\/)[\w\-./?=&%#:]*$/.test(href) && !/^\/\\/.test(href);
}

const INLINE = /(\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|(?<![\w])_([^_]+)_(?![\w]))/g;

export function renderInline(text: string, keyPrefix = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const key = `${keyPrefix}-${n++}`;
    if (m[2] !== undefined && m[3] !== undefined) {
      const href = m[3];
      out.push(
        isSafeInternalHref(href) ? (
          <Link key={key} href={href} className="font-medium text-brand-primary underline underline-offset-2 hover:text-brand-navy">
            {m[2]}
          </Link>
        ) : (
          <Fragment key={key}>{m[2]}</Fragment>
        )
      );
    } else if (m[4] !== undefined) {
      out.push(<strong key={key} className="font-semibold text-slate-900">{m[4]}</strong>);
    } else if (m[5] !== undefined) {
      out.push(<code key={key} className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em]">{m[5]}</code>);
    } else if (m[6] !== undefined) {
      out.push(<em key={key}>{m[6]}</em>);
    }
    last = idx + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "h"; text: string };

export function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };
  for (const raw of source.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const heading = line.match(/^\s*#{1,6}\s+(.*)$/);
    if (!line.trim()) {
      flush();
    } else if (heading) {
      flush();
      blocks.push({ kind: "h", text: heading[1] });
    } else if (bullet) {
      if (current?.kind !== "ul") {
        flush();
        current = { kind: "ul", items: [] };
      }
      current.items.push(bullet[1]);
    } else if (ordered) {
      if (current?.kind !== "ol") {
        flush();
        current = { kind: "ol", items: [] };
      }
      current.items.push(ordered[1]);
    } else if (current && current.kind !== "p" && /^\s{2,}/.test(raw)) {
      // continuação de item de lista
      current.items[current.items.length - 1] += ` ${line.trim()}`;
    } else {
      if (current?.kind !== "p") {
        flush();
        current = { kind: "p", lines: [] };
      }
      current.lines.push(line);
    }
  }
  flush();
  return blocks;
}

export function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="space-y-2 text-sm leading-relaxed text-slate-700">
      {blocks.map((b, i) => {
        if (b.kind === "h") {
          return (
            <p key={i} className="font-semibold text-slate-900">
              {renderInline(b.text, `h${i}`)}
            </p>
          );
        }
        if (b.kind === "ul" || b.kind === "ol") {
          const List = b.kind === "ul" ? "ul" : "ol";
          return (
            <List key={i} className={b.kind === "ul" ? "list-disc space-y-1 pl-5" : "list-decimal space-y-1 pl-5"}>
              {b.items.map((item, j) => (
                <li key={j}>{renderInline(item, `l${i}-${j}`)}</li>
              ))}
            </List>
          );
        }
        return (
          <p key={i}>
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {renderInline(l, `p${i}-${j}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

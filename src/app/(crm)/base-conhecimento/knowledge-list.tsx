"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import {
  toggleKnowledgeAction,
  deleteKnowledgeAction,
} from "@/lib/data/knowledge-actions";
import {
  KNOWLEDGE_CATEGORIES,
  type KnowledgeCategory,
  type KnowledgeEntry,
} from "@/lib/data/knowledge-types";
import { KnowledgeDialog } from "./knowledge-dialog";

const TABS = (Object.keys(KNOWLEDGE_CATEGORIES) as KnowledgeCategory[]).map(
  (key) => ({ key, label: KNOWLEDGE_CATEGORIES[key].label })
);

function ToggleInner({ active }: { active: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title={active ? "Desativar" : "Ativar"}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : active ? (
        <Eye className="h-4 w-4" />
      ) : (
        <EyeOff className="h-4 w-4" />
      )}
    </button>
  );
}

function ToggleButton({ entry }: { entry: KnowledgeEntry }) {
  const [, action] = useFormState(toggleKnowledgeAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="id" value={entry.id} />
      <input
        type="hidden"
        name="is_active"
        value={entry.is_active ? "false" : "true"}
      />
      <ToggleInner active={entry.is_active} />
    </form>
  );
}

function DeleteButton({ entry }: { entry: KnowledgeEntry }) {
  const [armed, setArmed] = useState(false);
  const [, action] = useFormState(deleteKnowledgeAction, {});

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        title="Excluir"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-1">
      <input type="hidden" name="id" value={entry.id} />
      <ConfirmDelete onCancel={() => setArmed(false)} />
    </form>
  );
}

function ConfirmDelete({ onCancel }: { onCancel: () => void }) {
  const { pending } = useFormStatus();
  return (
    <>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          "Confirmar"
        )}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
      >
        Cancelar
      </button>
    </>
  );
}

export function KnowledgeList({
  entries,
  canEdit,
}: {
  entries: KnowledgeEntry[];
  canEdit: boolean;
}) {
  const [tab, setTab] = useState<KnowledgeCategory>("mensagem_padrao");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<KnowledgeEntry | null>(null);
  const [creating, setCreating] = useState(false);

  const counts = useMemo(() => {
    const map: Record<KnowledgeCategory, number> = {
      mensagem_padrao: 0,
      documento_area: 0,
      glossario: 0,
    };
    for (const e of entries) {
      if (e.category && map[e.category as KnowledgeCategory] !== undefined) {
        map[e.category as KnowledgeCategory]++;
      }
    }
    return map;
  }, [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (e.category !== tab) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        (e.content ?? "").toLowerCase().includes(q)
      );
    });
  }, [entries, tab, search]);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Entradas</CardTitle>
              <CardDescription>
                {KNOWLEDGE_CATEGORIES[tab].description}
              </CardDescription>
            </div>
            {canEdit && (
              <Button onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" /> Nova entrada
              </Button>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-b border-slate-200">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "relative px-3 py-2 text-sm font-medium transition-colors",
                  tab === t.key
                    ? "text-brand-primary"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                {t.label}
                <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                  {counts[t.key]}
                </span>
                {tab === t.key && (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 bg-brand-primary" />
                )}
              </button>
            ))}
          </div>

          <div className="mt-4 max-w-sm">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por título ou conteúdo..."
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {filtered.length === 0 ? (
            <EmptyState
              title="Nenhuma entrada nesta categoria"
              description={
                search
                  ? "Ajuste a busca ou crie uma nova entrada."
                  : "Comece cadastrando a primeira entrada."
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="truncate text-sm font-medium text-slate-900">
                        {entry.title}
                      </h4>
                      {!entry.is_active && (
                        <Badge className="border-slate-200 bg-slate-100 text-slate-600">
                          Inativa
                        </Badge>
                      )}
                    </div>
                    {entry.content && (
                      <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-slate-600">
                        {entry.content}
                      </p>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 items-center gap-1">
                      <ToggleButton entry={entry} />
                      <button
                        type="button"
                        onClick={() => setEditing(entry)}
                        title="Editar"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <DeleteButton entry={entry} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <>
          <KnowledgeDialog
            open={creating}
            onClose={() => setCreating(false)}
            defaultCategory={tab}
          />
          <KnowledgeDialog
            open={Boolean(editing)}
            onClose={() => setEditing(null)}
            entry={editing}
          />
        </>
      )}
    </>
  );
}

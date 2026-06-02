"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { RotateCcw, Search } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  CATEGORY_LABELS,
  REVIEW_STATUS_LABELS,
  type ReviewStatus,
} from "@/lib/data/documents-types";
import type { DocumentCategory } from "@/lib/types";

const LINK_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "lead", label: "Lead" },
  { value: "client", label: "Cliente" },
  { value: "case", label: "Caso" },
  { value: "process", label: "Processo" },
  { value: "none", label: "Sem vínculo" },
];

export function DocumentsFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(params.get("q") ?? "");

  const currentCategory = params.get("category") ?? "";
  const currentReview = params.get("review") ?? "";
  const currentLink = params.get("link") ?? "";
  const hasFilter = Boolean(
    currentCategory || currentReview || currentLink || params.get("q")
  );

  // debounce de busca
  useEffect(() => {
    const t = setTimeout(() => {
      const current = params.get("q") ?? "";
      if (searchValue === current) return;
      const next = new URLSearchParams(params.toString());
      if (searchValue) next.set("q", searchValue);
      else next.delete("q");
      next.delete("page");
      startTransition(() => router.replace(`/documentos?${next.toString()}`));
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    startTransition(() => router.replace(`/documentos?${next.toString()}`));
  }

  function clearAll() {
    setSearchValue("");
    startTransition(() => router.replace("/documentos"));
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Buscar</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Nome do arquivo..."
            className="w-56 pl-9"
            disabled={pending}
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Categoria</label>
        <Select
          value={currentCategory}
          onChange={(e) => update("category", e.target.value)}
          disabled={pending}
          className="w-44"
        >
          <option value="">Todas</option>
          {(Object.keys(CATEGORY_LABELS) as DocumentCategory[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Revisão</label>
        <Select
          value={currentReview}
          onChange={(e) => update("review", e.target.value)}
          disabled={pending}
          className="w-36"
        >
          <option value="">Todas</option>
          {(Object.keys(REVIEW_STATUS_LABELS) as ReviewStatus[]).map((s) => (
            <option key={s} value={s}>
              {REVIEW_STATUS_LABELS[s].label}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Vínculo</label>
        <Select
          value={currentLink}
          onChange={(e) => update("link", e.target.value)}
          disabled={pending}
          className="w-36"
        >
          {LINK_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>

      {hasFilter && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clearAll}
          disabled={pending}
        >
          <RotateCcw className="h-4 w-4" /> Limpar
        </Button>
      )}
    </div>
  );
}

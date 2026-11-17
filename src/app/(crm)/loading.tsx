/**
 * Mostrado na hora em que a pessoa troca de aba, enquanto o servidor busca os
 * dados da página nova (antes a tela ficava parada até tudo chegar).
 */
export default function CrmLoading() {
  return (
    <div role="status" aria-live="polite" aria-label="Carregando" className="animate-pulse">
      <span className="sr-only">Carregando…</span>
      <div className="mb-6 space-y-2">
        <div className="h-6 w-48 rounded bg-slate-200" />
        <div className="h-4 w-80 max-w-full rounded bg-slate-100" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 rounded-xl border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-5">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-4 rounded bg-slate-100" style={{ width: `${90 - i * 8}%` }} />
        ))}
      </div>
    </div>
  );
}

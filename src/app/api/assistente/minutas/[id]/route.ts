import { updateMinutaText } from "@/lib/minutas/store";
import { minutaAccess, readMinutaText } from "@/lib/minutas/save";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Minuta do próprio usuário (Admin ou Advogado). */
export async function GET(_req: Request, { params }: Params) {
  const access = await minutaAccess((await params).id);
  if (!access.ok) return access.response;
  return Response.json({ minuta: access.minuta });
}

/** Grava o texto editado no cartão. */
export async function PATCH(request: Request, { params }: Params) {
  const access = await minutaAccess((await params).id);
  if (!access.ok) return access.response;
  const read = await readMinutaText(request);
  if (!read.ok) return read.response;
  const ok = await updateMinutaText(access.session.user.id, access.minuta.id, read.text);
  if (!ok) return Response.json({ error: "Não consegui gravar a edição agora." }, { status: 500 });
  return Response.json({ ok: true });
}

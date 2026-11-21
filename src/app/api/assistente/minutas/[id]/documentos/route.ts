import { minutaAccess, readMinutaText, saveMinutaToDocuments } from "@/lib/minutas/save";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Salva a minuta (texto editado) em Documentos, ligada ao processo, caso, lead ou cliente. */
export async function POST(request: Request, { params }: Params) {
  const access = await minutaAccess((await params).id);
  if (!access.ok) return access.response;
  const read = await readMinutaText(request);
  if (!read.ok) return read.response;
  const result = await saveMinutaToDocuments(access.session, access.minuta, read.text);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result);
}

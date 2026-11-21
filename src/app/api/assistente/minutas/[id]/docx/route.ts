import { DOCX_MIME, minutaFileName } from "@/lib/minutas/docx";
import { updateMinutaText } from "@/lib/minutas/store";
import { minutaAccess, readMinutaText, renderMinutaDocx } from "@/lib/minutas/save";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Gera o .docx com o texto editado no cartão (e guarda a edição). */
export async function POST(request: Request, { params }: Params) {
  const access = await minutaAccess((await params).id);
  if (!access.ok) return access.response;
  const read = await readMinutaText(request);
  if (!read.ok) return read.response;
  await updateMinutaText(access.session.user.id, access.minuta.id, read.text);
  const bytes = await renderMinutaDocx(read.text);
  const name = minutaFileName(read.text.title);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": DOCX_MIME,
      "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}

import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { AccessCodeForm } from "./access-code-form";

export const metadata = { title: "Primeiro acesso — CRM Dr. Jean Braz" };

export default async function AccessPage(props: { searchParams: Promise<{ modo?: string }> }) {
  const { modo } = await props.searchParams;
  const reset = modo === "senha";

  return (
    <AuthShell
      title={reset ? "Esqueci minha senha" : "Primeiro acesso"}
      subtitle={
        reset
          ? "Informe o e-mail cadastrado. Vamos enviar um código para você criar uma nova senha."
          : "Use o e-mail que o administrador cadastrou. Vamos enviar um código de 6 dígitos para confirmar que é você."
      }
      footer={
        <Link href="/login" className="hover:text-white">
          ← Voltar para o login
        </Link>
      }
    >
      <AccessCodeForm />
    </AuthShell>
  );
}

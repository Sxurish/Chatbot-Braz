import { AuthShell } from "@/components/auth/auth-shell";
import { SetPasswordForm } from "./set-password-form";

export const metadata = { title: "Criar senha — CRM Dr. Jean Braz" };

export default function SetPasswordPage() {
  return (
    <AuthShell
      title="Crie sua senha"
      subtitle="E-mail confirmado. Agora escolha a senha que você vai usar para entrar no CRM."
    >
      <SetPasswordForm />
    </AuthShell>
  );
}

import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Crear contraseña" };

export default function UpdatePasswordPage() {
  return (
    <AuthShell title="Crea tu contraseña" subtitle="Mínimo 10 caracteres. Úsala sólo para este sistema.">
      <PasswordForm />
    </AuthShell>
  );
}

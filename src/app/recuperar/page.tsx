import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { RecoverForm } from "./recover-form";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function RecoverPage() {
  return (
    <AuthShell title="Recuperar contraseña" subtitle="Te enviaremos un enlace a tu correo.">
      <RecoverForm />
    </AuthShell>
  );
}

import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

const NOTICES: Record<string, string> = {
  inactivo: "Tu cuenta está desactivada. Habla con el administrador.",
  enlace: "El enlace expiró o ya se usó. Pide uno nuevo.",
  salida: "Cerraste sesión.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  const notice = typeof error === "string" ? NOTICES[error] : undefined;

  return (
    <AuthShell title="Bienvenido" subtitle="Ingresa con tu cuenta del personal de la clínica.">
      <LoginForm next={typeof next === "string" ? next : undefined} notice={notice} />
    </AuthShell>
  );
}

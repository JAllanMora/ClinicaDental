import { AuthShell } from "@/components/auth-shell";
import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <AuthShell title="No encontrado" subtitle="La página o el expediente no existe, o no tienes acceso a él.">
      <ButtonLink href="/" className="w-full">
        Ir al inicio
      </ButtonLink>
    </AuthShell>
  );
}

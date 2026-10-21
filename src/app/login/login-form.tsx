"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { login, type LoginState } from "./actions";

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="space-y-4">
      {notice && <Alert tone="info">{notice}</Alert>}
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="next" value={next ?? "/"} />
      <Field label="Correo electrónico">
        <input name="email" type="email" autoComplete="email" required className="field" />
      </Field>
      <Field label="Contraseña">
        <input name="password" type="password" autoComplete="current-password" required className="field" />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Entrando…" : "Iniciar sesión"}
      </Button>
      <p className="text-center text-sm">
        <Link href="/recuperar" className="text-brand-600 hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </p>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { updatePassword, type PasswordState } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(updatePassword, {});

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}
      <Field label="Nueva contraseña">
        <input name="password" type="password" autoComplete="new-password" minLength={10} required className="field" />
      </Field>
      <Field label="Confirmar contraseña">
        <input name="confirm" type="password" autoComplete="new-password" minLength={10} required className="field" />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Guardando…" : "Guardar y entrar"}
      </Button>
    </form>
  );
}

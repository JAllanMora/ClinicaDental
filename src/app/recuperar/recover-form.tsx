"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { requestReset, type RecoverState } from "./actions";

export function RecoverForm() {
  const [state, action, pending] = useActionState<RecoverState, FormData>(requestReset, {});

  if (state.sent) {
    return (
      <div className="space-y-4">
        <Alert tone="success">Si el correo está registrado, recibirás un enlace en unos minutos.</Alert>
        <Link href="/login" className="block text-center text-sm text-brand-600 hover:underline">
          Volver a iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}
      <Field label="Correo electrónico">
        <input name="email" type="email" required className="field" />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Enviando…" : "Enviar enlace"}
      </Button>
      <Link href="/login" className="block text-center text-sm text-brand-600 hover:underline">
        Volver
      </Link>
    </form>
  );
}

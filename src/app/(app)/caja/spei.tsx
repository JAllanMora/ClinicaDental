"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { money } from "@/lib/format";
import { validateSpei, type SpeiResult } from "./actions";

type Bank = { clave: string; nombre: string };
type PendingPayment = { id: string; label: string; amount: number };

export function SpeiValidator({
  banks,
  payments,
  today,
  configured,
}: {
  banks: Bank[];
  payments: PendingPayment[];
  today: string;
  configured: boolean;
}) {
  const [state, action, pending] = useActionState<SpeiResult, FormData>(validateSpei, {});
  const [paymentId, setPaymentId] = useState("");
  const [amount, setAmount] = useState("");

  if (!configured) {
    return (
      <p className="text-sm text-brand-700/80">
        Falta configurar la cuenta receptora. El administrador la captura en <b>Configuración → Transferencias SPEI</b>.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3" data-testid="spei-form">
      {state.error && <Alert>{state.error}</Alert>}
      {state.message && <Alert tone={state.status === "valida" ? "success" : "error"}>{state.message}</Alert>}
      {payments.length > 0 && (
        <Field label="Cobro a validar (opcional)">
          <select
            name="payment_id"
            value={paymentId}
            onChange={(e) => {
              setPaymentId(e.target.value);
              const p = payments.find((x) => x.id === e.target.value);
              if (p) setAmount(String(p.amount));
            }}
            className="field"
          >
            <option value="">Sin ligar a un cobro</option>
            {payments.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} · {money(p.amount)}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Clave de rastreo SPEI">
        <input name="tracking_key" required minLength={6} maxLength={40} placeholder="Viene en el comprobante del paciente" className="field font-mono uppercase" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fecha de la transferencia">
          <input name="date" type="date" required max={today} defaultValue={today} className="field" />
        </Field>
        <Field label="Monto">
          <input name="amount" type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="field" />
        </Field>
      </div>
      <Field label="Banco que envía" hint="Banxico lo exige para encontrar la operación.">
        {banks.length ? (
          <select name="sender" required defaultValue="" className="field">
            <option value="" disabled>
              Elige el banco del paciente
            </option>
            {banks.map((b) => (
              <option key={b.clave} value={b.clave}>
                {b.nombre}
              </option>
            ))}
          </select>
        ) : (
          <input name="sender" required inputMode="numeric" placeholder="Clave Banxico del banco (ej. 40012 BBVA)" className="field" />
        )}
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Consultando Banxico…" : "Validar con Banxico"}
      </Button>
    </form>
  );
}

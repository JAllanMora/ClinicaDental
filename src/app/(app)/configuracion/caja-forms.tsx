"use client";

import { useActionState } from "react";
import { Alert, Button, Field } from "@/components/ui";
import type { PaymentMethodFee, PermissionKey, SpeiSettings } from "@/lib/database.types";
import { METHODS } from "@/lib/finance";
import { PERMISSIONS } from "@/lib/permission-catalog";
import type { ActionState } from "./actions";
import { saveFees, savePermissions, saveSpeiSettings } from "./caja-actions";

type Role = "reception" | "dentist";
const ROLES: { key: Role; label: string }[] = [
  { key: "reception", label: "Recepción" },
  { key: "dentist", label: "Odontólogo" },
];

export function PermissionsForm({ granted }: { granted: Record<Role, PermissionKey[]> }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(savePermissions, {});
  return (
    <form action={action} className="space-y-4" data-testid="permissions-form">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="success">{state.ok}</Alert>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-brand-700/70">
            <tr>
              <th className="py-2 font-medium">Módulo</th>
              {ROLES.map((r) => (
                <th key={r.key} className="w-32 py-2 text-center font-medium">
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {PERMISSIONS.map((p) => (
              <tr key={p.key}>
                <td className="py-2.5 pr-4">
                  <span className="font-medium text-brand-900">{p.label}</span>
                  <span className="block text-xs text-brand-700/70">
                    <b>Recepción:</b> {p.help.reception} <b>Odontólogo:</b> {p.help.dentist}
                  </span>
                </td>
                {ROLES.map((r) => (
                  <td key={r.key} className="py-2.5 text-center">
                    <input
                      type="checkbox"
                      name={`${r.key}:${p.key}`}
                      defaultChecked={granted[r.key].includes(p.key)}
                      aria-label={`${p.label} para ${r.label}`}
                      className="h-4 w-4 accent-magenta-500"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-brand-700/70">
        Pacientes, agenda e inicio los ven todos. Configuración y bitácora son sólo del administrador. El odontólogo siempre ve el
        expediente de sus propios pacientes.
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar permisos"}
      </Button>
    </form>
  );
}

export function FeesForm({ fees }: { fees: PaymentMethodFee[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveFees, {});
  const byMethod = new Map(fees.map((f) => [f.method, f]));
  return (
    <form action={action} className="space-y-4" data-testid="fees-form">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="success">{state.ok}</Alert>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-brand-700/70">
            <tr>
              <th className="py-2 font-medium">Forma de pago</th>
              <th className="w-28 py-2 font-medium">Comisión %</th>
              <th className="w-28 py-2 font-medium">Cuota fija $</th>
              <th className="w-28 py-2 text-center font-medium">+ IVA 16 %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {METHODS.map((m) => {
              const f = byMethod.get(m.key);
              return (
                <tr key={m.key}>
                  <td className="py-2 font-medium text-brand-900">{m.label}</td>
                  <td className="py-2 pr-2">
                    <input name={`${m.key}:pct`} type="number" min={0} max={30} step="0.001" defaultValue={Number(f?.pct ?? 0)} className="field" aria-label={`Comisión % ${m.label}`} />
                  </td>
                  <td className="py-2 pr-2">
                    <input name={`${m.key}:fixed`} type="number" min={0} step="0.01" defaultValue={Number(f?.fixed_fee ?? 0)} className="field" aria-label={`Cuota fija ${m.label}`} />
                  </td>
                  <td className="py-2 text-center">
                    <input name={`${m.key}:iva`} type="checkbox" defaultChecked={f?.add_iva ?? false} className="h-4 w-4 accent-magenta-500" aria-label={`IVA ${m.label}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar comisiones"}
      </Button>
    </form>
  );
}

export function SpeiSettingsForm({ settings, banks }: { settings: SpeiSettings | null; banks: { clave: string; nombre: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveSpeiSettings, {});
  return (
    <form action={action} className="space-y-3" data-testid="spei-settings-form">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="success">{state.ok}</Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Banco receptor">
          {banks.length ? (
            <select name="receiver_bank_code" required defaultValue={settings?.receiver_bank_code ?? ""} className="field">
              <option value="" disabled>
                Elige el banco
              </option>
              {banks.map((b) => (
                <option key={b.clave} value={b.clave}>
                  {b.nombre}
                </option>
              ))}
            </select>
          ) : (
            <input name="receiver_bank_code" required defaultValue={settings?.receiver_bank_code ?? ""} placeholder="Clave Banxico (ej. 40012)" className="field" />
          )}
        </Field>
        <Field label="CLABE (18 dígitos)">
          <input name="clabe" required inputMode="numeric" defaultValue={settings?.clabe ?? ""} maxLength={22} className="field font-mono" />
        </Field>
        <Field label="Titular (opcional)">
          <input name="holder" defaultValue={settings?.holder ?? ""} className="field" />
        </Field>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar cuenta"}
      </Button>
    </form>
  );
}

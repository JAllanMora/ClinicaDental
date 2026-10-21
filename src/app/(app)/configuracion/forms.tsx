"use client";

import { useActionState, useTransition } from "react";
import type { Profile } from "@/lib/database.types";
import { Alert, Button, Field } from "@/components/ui";
import { addBranch, addChair, inviteUser, toggleChair, updateStaff, type ActionState } from "./actions";

const ROLES = [
  { value: "reception", label: "Recepción" },
  { value: "dentist", label: "Odontólogo" },
  { value: "admin", label: "Administrador" },
];

function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <Alert>{state.error}</Alert>;
  if (state.ok) return <Alert tone="success">{state.ok}</Alert>;
  return null;
}

export function InviteForm({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(inviteUser, {});
  return (
    <form action={action} className="space-y-3">
      <Feedback state={state} />
      {!enabled && (
        <Alert tone="info">
          Para invitar usuarios configura <code>SUPABASE_SERVICE_ROLE_KEY</code> en las variables de entorno.
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
        <Field label="Nombre completo">
          <input name="full_name" required className="field" placeholder="Dra. Ana López" />
        </Field>
        <Field label="Correo">
          <input name="email" type="email" required className="field" />
        </Field>
        <Field label="Rol">
          <select name="role" defaultValue="dentist" className="field">
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" disabled={pending || !enabled}>
          {pending ? "Enviando…" : "Invitar"}
        </Button>
      </div>
    </form>
  );
}

export function StaffRow({ person, isMe }: { person: Profile; isMe: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateStaff.bind(null, person.id), {});
  return (
    // Remontar al guardar: React no restaura los <select> al reiniciar el formulario.
    <form key={person.updated_at} action={action} className="space-y-3 py-4">
      <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_1fr_auto_auto] md:items-end">
        <Field label={person.email ?? "Nombre"}>
          <input name="full_name" defaultValue={person.full_name} required className="field" />
        </Field>
        <Field label="Rol">
          <select name="role" defaultValue={person.role} className="field" disabled={isMe}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          {isMe && <input type="hidden" name="role" value={person.role} />}
        </Field>
        <Field label="Especialidad">
          <input name="specialty" defaultValue={person.specialty ?? ""} className="field" placeholder="Ej. Ortodoncia" />
        </Field>
        <Field label="Cédula profesional">
          <input name="professional_id" defaultValue={person.professional_id ?? ""} className="field" />
        </Field>
        <div className="flex items-end gap-3 pb-1">
          <label className="flex flex-col items-center text-xs text-brand-800">
            Color
            <input type="color" name="color" defaultValue={person.color} className="mt-1 h-8 w-10 cursor-pointer rounded border border-brand-200" />
          </label>
          <label className="flex flex-col items-center text-xs text-brand-800">
            Activo
            <input type="checkbox" name="active" defaultChecked={person.active} disabled={isMe} className="mt-2 h-5 w-5 accent-brand-500" />
            {isMe && <input type="hidden" name="active" value="on" />}
          </label>
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "…" : "Guardar"}
        </Button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function BranchForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(addBranch, {});
  return (
    <form action={action} className="space-y-3">
      <Feedback state={state} />
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <Field label="Nombre">
          <input name="name" required className="field" />
        </Field>
        <Field label="Dirección">
          <input name="address" className="field" />
        </Field>
        <Field label="Teléfono">
          <input name="phone" className="field" />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending}>
          Agregar sucursal
        </Button>
      </div>
    </form>
  );
}

export function ChairForm({ branchId }: { branchId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addChair.bind(null, branchId), {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input name="name" required placeholder="Nuevo sillón / consultorio" className="field max-w-60" />
      <Button type="submit" variant="ghost" disabled={pending}>
        + Agregar
      </Button>
      {state.error && <span className="text-sm text-red-700">{state.error}</span>}
    </form>
  );
}

export function ChairToggle({ id, name, active }: { id: string; name: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => toggleChair(id, !active))}
      title={active ? "Clic para desactivar" : "Clic para activar"}
      className={`rounded-full px-3 py-1 text-sm transition ${
        active ? "bg-brand-100 text-brand-800 hover:bg-brand-200" : "bg-gray-100 text-gray-400 line-through hover:bg-gray-200"
      }`}
    >
      {name}
    </button>
  );
}

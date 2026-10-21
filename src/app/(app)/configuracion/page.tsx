import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppointmentTypeRow, TreatmentRow, BranchForm, ChairForm, ChairToggle, InviteForm, StaffRow } from "./forms";

export const metadata: Metadata = { title: "Configuración" };

export default async function SettingsPage() {
  const me = await requireProfile(["admin"]);
  const supabase = await createClient();
  const [{ data: staff }, { data: branches }, { data: types }, { data: treatments }] = await Promise.all([
    supabase.from("profiles").select("*").order("active", { ascending: false }).order("full_name"),
    supabase.from("branches").select("*, chairs(*)").order("name"),
    supabase.from("appointment_types").select("*").order("active", { ascending: false }).order("name"),
    supabase.from("treatments").select("*").order("active", { ascending: false }).order("category").order("name"),
  ]);
  const categories = [...new Set((treatments ?? []).map((t) => t.category))];

  return (
    <>
      <PageHeader title="Configuración" description="Personal, roles, sucursales, sillones, tipos de cita y aranceles." />

      <div className="space-y-6">
        <Card>
          <h2 className="font-semibold text-brand-900">Invitar a un miembro del personal</h2>
          <p className="mb-4 mt-1 text-sm text-brand-700/80">
            Recibirá un correo para crear su contraseña. Recepción: altas, agenda y cobros. Odontólogo: expedientes de sus
            pacientes. Administrador: todo, incluidos reportes y configuración.
          </p>
          <InviteForm enabled={!!process.env.SUPABASE_SERVICE_ROLE_KEY} />
        </Card>

        <Card>
          <h2 className="font-semibold text-brand-900">Personal</h2>
          <div className="divide-y divide-brand-100">
            {staff?.map((p) => <StaffRow key={p.id} person={p} isMe={p.id === me.id} />)}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold text-brand-900">Sucursales y sillones</h2>
          <div className="space-y-5">
            {branches?.map((b) => (
              <div key={b.id} className="rounded-xl border border-brand-100 p-4">
                <div className="mb-3">
                  <div className="font-medium text-brand-900">{b.name}</div>
                  <div className="text-xs text-brand-700/70">{[b.address, b.phone].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="mb-3 flex flex-wrap gap-2">
                  {b.chairs
                    .sort((x, y) => x.name.localeCompare(y.name, "es"))
                    .map((c) => (
                      <ChairToggle key={c.id} id={c.id} name={c.name} active={c.active} />
                    ))}
                </div>
                <ChairForm branchId={b.id} />
              </div>
            ))}
            <BranchForm />
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold text-brand-900">Tipos de cita</h2>
          <p className="mb-3 mt-1 text-sm text-brand-700/80">La duración se usa como sugerencia al agendar; el color identifica la cita en la agenda.</p>
          <div className="divide-y divide-brand-50">
            {types?.map((t) => <AppointmentTypeRow key={t.id} type={t} />)}
            <AppointmentTypeRow />
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold text-brand-900">Aranceles (lista de precios)</h2>
          <p className="mb-3 mt-1 text-sm text-brand-700/80">
            Precios en MXN que se proponen al armar un presupuesto. La comisión especial reemplaza a la del odontólogo para ese
            tratamiento (déjala vacía para usar la general).
          </p>
          <div className="divide-y divide-brand-50">
            <TreatmentRow categories={categories} />
            {treatments?.map((t) => <TreatmentRow key={t.id} treatment={t} categories={categories} />)}
          </div>
        </Card>
      </div>
    </>
  );
}

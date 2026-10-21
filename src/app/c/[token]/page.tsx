import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { AuthShell } from "@/components/auth-shell";
import { clinicParts, longDay, minutesToLabel } from "@/lib/agenda";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Tu cita", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ConfirmPage({ params }: PageProps<"/c/[token]">) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = UUID.test(token) ? await supabase.rpc("appointment_by_token", { p_token: token }) : { data: null };
  const appt = data?.[0];

  if (!appt) {
    return (
      <AuthShell title="Enlace no válido" subtitle="No encontramos esta cita. Si necesitas ayuda, comunícate con la clínica.">
        <span />
      </AuthShell>
    );
  }

  async function respond(formData: FormData) {
    "use server";
    const response = formData.get("response") === "cambio" ? "cambio" : "confirmada";
    const db = await createClient();
    await db.rpc("respond_appointment", { p_token: token, p_response: response });
    revalidatePath(`/c/${token}`);
  }

  const s = clinicParts(appt.starts_at);
  const e = clinicParts(appt.ends_at);
  const past = new Date(appt.starts_at) < new Date();
  const closed = past || !["programada", "confirmada"].includes(appt.status);

  return (
    <AuthShell title={`Hola, ${appt.patient_first_name}`} subtitle="Estos son los datos de tu cita.">
      <dl className="space-y-3 rounded-xl bg-brand-50 p-4 text-sm">
        <div>
          <dt className="text-xs text-brand-700/70">Fecha</dt>
          <dd className="font-medium text-brand-950 first-letter:uppercase">{longDay(s.day)}</dd>
        </div>
        <div>
          <dt className="text-xs text-brand-700/70">Hora</dt>
          <dd className="font-medium text-brand-950">
            {minutesToLabel(s.minutes)} a {minutesToLabel(e.minutes)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-brand-700/70">Con</dt>
          <dd className="font-medium text-brand-950">{appt.dentist_name}</dd>
        </div>
        <div>
          <dt className="text-xs text-brand-700/70">Dónde</dt>
          <dd className="font-medium text-brand-950">
            {appt.branch_name}
            {appt.branch_address && <span className="block font-normal text-brand-700">{appt.branch_address}</span>}
          </dd>
        </div>
      </dl>

      <div className="mt-6">
        {appt.status === "cancelada" ? (
          <p className="text-sm text-brand-800">Esta cita fue cancelada.</p>
        ) : appt.patient_response === "confirmada" || (appt.status === "confirmada" && !appt.patient_response) ? (
          <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">¡Gracias! Tu cita está confirmada. Te esperamos.</p>
        ) : appt.patient_response === "cambio" ? (
          <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Recibimos tu solicitud de cambio. La clínica te contactará para elegir otro horario.
          </p>
        ) : closed ? (
          <p className="text-sm text-brand-800">Esta cita ya no admite cambios en línea.</p>
        ) : (
          <form action={respond} className="grid gap-2">
            <button name="response" value="confirmada" className="rounded-lg bg-brand-500 px-4 py-3 font-medium text-white hover:bg-brand-600">
              Confirmo mi asistencia
            </button>
            <button name="response" value="cambio" className="rounded-lg border border-brand-200 px-4 py-3 font-medium text-brand-800 hover:bg-brand-50">
              Necesito cambiarla
            </button>
          </form>
        )}
        {appt.branch_phone && (
          <p className="mt-4 text-center text-sm text-brand-700">
            ¿Dudas? Llámanos al{" "}
            <a href={`tel:${appt.branch_phone}`} className="font-medium text-magenta-500">
              {appt.branch_phone}
            </a>
          </p>
        )}
      </div>
    </AuthShell>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { ageFrom, fullName, initials, normalizeSearch, recordNumber } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pacientes" };

const PAGE_SIZE = 50;

export default async function PatientsPage({ searchParams }: PageProps<"/pacientes">) {
  const profile = await requireProfile();
  const { q, inactivos } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const showInactive = inactivos === "1";

  const supabase = await createClient();
  let request = supabase
    .from("patients")
    .select("id, record_number, first_name, last_name, second_last_name, birth_date, phone, active, primary_dentist:profiles!patients_primary_dentist_id_fkey(full_name)", { count: "exact" })
    .order("last_name")
    .order("first_name")
    .limit(PAGE_SIZE);

  if (!showInactive) request = request.eq("active", true);

  // Un número puede ser expediente (EXP-00012) o parte de un teléfono.
  const expMatch = query.trim().match(/^(?:exp-?\s*)?(\d+)$/i);
  if (expMatch) {
    const digits = expMatch[1];
    request = request.or(`search.ilike.%${digits}%,record_number.eq.${Number(digits)}`);
  } else {
    for (const term of normalizeSearch(query).split(/\s+/).filter(Boolean)) {
      request = request.ilike("search", `%${term}%`);
    }
  }

  const { data: patients, count } = await request;

  return (
    <>
      <PageHeader
        title="Pacientes"
        description={
          profile.role === "dentist"
            ? "Tus pacientes asignados."
            : `${count ?? 0} expediente${count === 1 ? "" : "s"}${showInactive ? " (incluye inactivos)" : ""}.`
        }
        actions={<ButtonLink href="/pacientes/nuevo">+ Nuevo paciente</ButtonLink>}
      />

      <form className="mb-5 flex flex-wrap gap-2" role="search">
        <input
          name="q"
          defaultValue={query}
          placeholder="Buscar por nombre, teléfono, correo, CURP o número de expediente…"
          className="field max-w-xl flex-1"
          autoFocus
        />
        {showInactive && <input type="hidden" name="inactivos" value="1" />}
        <button className="rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600">Buscar</button>
        <Link
          href={showInactive ? `/pacientes${query ? `?q=${encodeURIComponent(query)}` : ""}` : `/pacientes?inactivos=1${query ? `&q=${encodeURIComponent(query)}` : ""}`}
          className="self-center text-sm text-brand-600 hover:underline"
        >
          {showInactive ? "Ocultar inactivos" : "Ver inactivos"}
        </Link>
      </form>

      {!patients?.length ? (
        <EmptyState title={query ? "Sin resultados" : "Aún no hay pacientes"}>
          {query ? "Prueba con otro nombre o teléfono." : "Da de alta al primer paciente con el botón de arriba."}
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-brand-50 text-left text-xs uppercase tracking-wide text-brand-700">
              <tr>
                <th className="px-4 py-3 font-medium">Paciente</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Expediente</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Teléfono</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Odontólogo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-50">
              {patients.map((p) => {
                const name = fullName(p);
                const age = ageFrom(p.birth_date);
                return (
                  <tr key={p.id} className="transition hover:bg-brand-50/60">
                    <td className="px-4 py-3">
                      <Link href={`/pacientes/${p.id}`} className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                          {initials(name)}
                        </span>
                        <span>
                          <span className="font-medium text-brand-900">{name}</span>
                          <span className="block text-xs text-brand-700/70">
                            {age !== null ? `${age} años` : "Edad sin registrar"}
                            {!p.active && (
                              <Badge tone="gray" className="ml-2">
                                Inactivo
                              </Badge>
                            )}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="hidden px-4 py-3 font-mono text-xs text-brand-700 sm:table-cell">{recordNumber(p.record_number)}</td>
                    <td className="hidden px-4 py-3 text-brand-800 md:table-cell">{p.phone ?? "—"}</td>
                    <td className="hidden px-4 py-3 text-brand-800 lg:table-cell">{p.primary_dentist?.full_name ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {count !== null && count > PAGE_SIZE && (
            <p className="border-t border-brand-50 px-4 py-3 text-xs text-brand-700/80">
              Mostrando {PAGE_SIZE} de {count}. Afina la búsqueda para encontrar a un paciente.
            </p>
          )}
        </div>
      )}
    </>
  );
}

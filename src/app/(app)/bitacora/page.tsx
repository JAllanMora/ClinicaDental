import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bitácora" };

const TABLES: Record<string, string> = {
  patients: "Paciente",
  medical_histories: "Historia clínica",
  patient_care_team: "Equipo de atención",
  profiles: "Personal",
  branches: "Sucursal",
  chairs: "Sillón",
};

const ACTIONS = {
  INSERT: { label: "Creó", tone: "green" },
  UPDATE: { label: "Modificó", tone: "amber" },
  DELETE: { label: "Eliminó", tone: "red" },
} as const;

const PAGE = 100;

export default async function AuditPage({ searchParams }: PageProps<"/bitacora">) {
  await requireProfile(["admin"]);
  const { tabla, registro, pagina } = await searchParams;
  const page = Math.max(0, Number(pagina ?? 0) || 0);

  const supabase = await createClient();
  let q = supabase
    .from("audit_log")
    .select("*")
    .order("occurred_at", { ascending: false })
    .range(page * PAGE, page * PAGE + PAGE - 1);
  if (typeof tabla === "string" && tabla) q = q.eq("table_name", tabla);
  if (typeof registro === "string" && registro) q = q.eq("record_id", registro);
  const { data: rows } = await q;

  const link = (params: Record<string, string | number | undefined>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") sp.set(k, String(v));
    return `/bitacora${sp.size ? `?${sp}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Bitácora de auditoría"
        description="Registro inmutable de quién creó o modificó cada dato y cuándo (NOM-024-SSA3)."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link href={link({})}>
          <Badge tone={!tabla ? "magenta" : "brand"}>Todo</Badge>
        </Link>
        {Object.entries(TABLES).map(([key, label]) => (
          <Link key={key} href={link({ tabla: key })}>
            <Badge tone={tabla === key ? "magenta" : "brand"}>{label}</Badge>
          </Link>
        ))}
      </div>

      {!rows?.length ? (
        <EmptyState title="Sin movimientos registrados" />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-brand-50">
            {rows.map((r) => {
              const action = ACTIONS[r.action];
              return (
                <li key={r.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-5 py-3 text-sm">
                  <span className="w-40 shrink-0 text-xs text-brand-700/70">{formatDateTime(r.occurred_at)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-brand-900">{r.actor_email ?? "Sistema"}</span>{" "}
                    <Badge tone={action.tone}>{action.label}</Badge>{" "}
                    <span className="text-brand-800">{TABLES[r.table_name] ?? r.table_name}</span>{" "}
                    {r.record_id && (
                      <Link
                        href={link({ tabla: r.table_name, registro: r.record_id })}
                        className="font-mono text-xs text-brand-500 hover:underline"
                      >
                        {r.record_id.slice(0, 8)}
                      </Link>
                    )}
                    {r.changed && r.changed.length > 0 && (
                      <span className="mt-1 block text-xs text-brand-700/70">Campos: {r.changed.join(", ")}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="mt-4 flex justify-between text-sm">
        {page > 0 ? (
          <Link href={link({ tabla: tabla as string, registro: registro as string, pagina: page - 1 })} className="text-brand-600 hover:underline">
            ← Más recientes
          </Link>
        ) : (
          <span />
        )}
        {rows?.length === PAGE && (
          <Link href={link({ tabla: tabla as string, registro: registro as string, pagina: page + 1 })} className="text-brand-600 hover:underline">
            Anteriores →
          </Link>
        )}
      </div>
    </>
  );
}

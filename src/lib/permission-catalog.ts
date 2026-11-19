import type { AppRole, PermissionKey } from "@/lib/database.types";

type Role = Exclude<AppRole, "admin">;

/** Catálogo de permisos que el administrador puede dar o quitar a cada rol. */
export const PERMISSIONS: { key: PermissionKey; label: string; help: Record<Role, string> }[] = [
  {
    key: "expediente",
    label: "Expediente clínico",
    help: {
      reception: "Consultar el expediente y capturar la historia clínica. Odontograma, notas y consentimientos siguen siendo del odontólogo.",
      dentist: "Ver el expediente de todos los pacientes, no sólo los de su equipo de atención.",
    },
  },
  { key: "caja", label: "Caja y cobros", help: { reception: "Registrar cobros, egresos, validar SPEI y cerrar el corte.", dentist: "Registrar cobros, egresos, validar SPEI y cerrar el corte." } },
  { key: "whatsapp", label: "WhatsApp", help: { reception: "Ver y atender los chats del bot.", dentist: "Ver y atender los chats del bot." } },
  { key: "inventario", label: "Inventario", help: { reception: "Existencias, entradas y salidas.", dentist: "Existencias y salidas de material." } },
  { key: "laboratorio", label: "Laboratorio", help: { reception: "Órdenes de laboratorio.", dentist: "Órdenes de laboratorio de sus pacientes." } },
  { key: "tablet", label: "Modo tablet", help: { reception: "Cuestionario de salud y firmas en tablet.", dentist: "Cuestionario de salud y firmas en tablet." } },
  {
    key: "comisiones",
    label: "Comisiones",
    help: { reception: "Ver lo que le corresponde a cada odontólogo (sin costos ni porcentajes).", dentist: "Ver sus propias comisiones." },
  },
  { key: "reportes", label: "Reportes", help: { reception: "Ingresos, citas y saldos por cobrar.", dentist: "Ingresos, citas y saldos por cobrar." } },
  {
    key: "finanzas",
    label: "Finanzas (sólo lectura)",
    help: { reception: "Ver el estado de resultados y los gastos. No puede capturar ni modificar.", dentist: "Ver el estado de resultados y los gastos. No puede capturar ni modificar." },
  },
];

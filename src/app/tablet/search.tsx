"use client";

import { useRouter } from "next/navigation";
import { PatientPicker } from "../(app)/agenda/agenda-board";

export function TabletPatientSearch() {
  const router = useRouter();
  return <PatientPicker value={null} onChange={(p) => p && router.push(`/tablet/${p.id}`)} />;
}

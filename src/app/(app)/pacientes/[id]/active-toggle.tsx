"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui";
import { setPatientActive } from "../actions";

export function ActiveToggle({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant={active ? "danger" : "secondary"}
      disabled={pending}
      onClick={() => start(() => setPatientActive(id, !active))}
    >
      {active ? "Marcar como inactivo" : "Reactivar expediente"}
    </Button>
  );
}

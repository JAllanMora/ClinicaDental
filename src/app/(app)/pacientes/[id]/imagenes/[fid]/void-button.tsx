"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui";
import { voidFile } from "../actions";

export function VoidFileButton({ patientId, id }: { patientId: string; id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="danger"
      disabled={pending}
      onClick={() => {
        const reason = window.prompt("Motivo para anular el archivo (se conserva en el expediente):");
        if (reason === null) return;
        start(async () => {
          await voidFile(patientId, id, reason);
          router.push(`/pacientes/${patientId}/imagenes`);
        });
      }}
    >
      Anular
    </Button>
  );
}

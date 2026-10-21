"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Button } from "@/components/ui";
import { revokeConsent } from "../actions";

export function ConsentActions({ patientId, id, revoked }: { patientId: string; id: string; revoked: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="no-print flex flex-wrap justify-between gap-2">
      <Link href={`/pacientes/${patientId}/consentimientos`} className="text-sm text-brand-600 hover:underline">
        ← Consentimientos
      </Link>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => window.print()}>
          Imprimir / PDF
        </Button>
        {!revoked && (
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => {
              const reason = window.prompt("Motivo de la revocación:");
              if (reason !== null) start(() => revokeConsent(patientId, id, reason));
            }}
          >
            Revocar
          </Button>
        )}
      </div>
    </div>
  );
}

import Link from "next/link";

export default function TabletDone() {
  return (
    <div className="pt-16 text-center">
      <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-100 text-4xl text-emerald-600">✓</div>
      <h1 className="mt-6 text-3xl font-semibold text-brand-900">¡Gracias!</h1>
      <p className="mt-2 text-brand-700">Tus respuestas se guardaron. Por favor regresa la tablet al personal de la clínica.</p>
      <Link href="/tablet" className="mt-10 inline-block rounded-xl px-5 py-3 text-base text-brand-600 hover:bg-brand-50">
        Volver al inicio (personal)
      </Link>
    </div>
  );
}

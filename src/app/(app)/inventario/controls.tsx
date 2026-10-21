"use client";

import { useActionState, useState, useTransition } from "react";
import type { InventoryItem } from "@/lib/database.types";
import { Alert, Button, Field } from "@/components/ui";
import { saveItem, stockIn, stockOut } from "./actions";

export function ItemForm({ item, branchId, categories }: { item?: InventoryItem; branchId: string; categories: string[] }) {
  const [state, action, pending] = useActionState(saveItem.bind(null, item?.id ?? null, branchId), {});
  return (
    <form key={item?.updated_at ?? state.ok} action={action} className="space-y-3">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="success">{state.ok}</Alert>}
      <Field label="Artículo">
        <input name="name" required defaultValue={item?.name} placeholder="Ej. Resina A2 jeringa 4 g" className="field" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoría">
          <input name="category" required defaultValue={item?.category ?? "Consumibles"} list="inv-categories" className="field" />
        </Field>
        <Field label="Unidad">
          <input name="unit" required defaultValue={item?.unit ?? "pieza"} className="field" />
        </Field>
        <Field label="Stock mínimo">
          <input name="min_stock" type="number" min={0} step="0.5" defaultValue={item?.min_stock ?? 0} className="field" />
        </Field>
        <Field label="Clave / SKU">
          <input name="sku" defaultValue={item?.sku ?? ""} className="field" />
        </Field>
      </div>
      <Field label="Proveedor">
        <input name="supplier" defaultValue={item?.supplier ?? ""} className="field" />
      </Field>
      <datalist id="inv-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <Button type="submit" disabled={pending} className="w-full">
        {item ? "Guardar artículo" : "Agregar artículo"}
      </Button>
    </form>
  );
}

export function StockButtons({ itemId, unit }: { itemId: string; unit: string }) {
  const [mode, setMode] = useState<"in" | "out" | null>(null);
  const [qty, setQty] = useState("");
  const [lot, setLot] = useState("");
  const [expires, setExpires] = useState("");
  const [cost, setCost] = useState("");
  const [kind, setKind] = useState<"salida" | "merma" | "ajuste">("salida");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const n = Number(qty);
      const res = mode === "in" ? await stockIn(itemId, { qty: n, lot, expires, cost }) : await stockOut(itemId, { qty: n, kind, reason });
      setMsg(res);
      if (!res.error) {
        setMode(null);
        setQty("");
        setLot("");
        setExpires("");
        setCost("");
        setReason("");
      }
    });

  if (!mode)
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <span className="flex gap-1.5">
          <button type="button" onClick={() => (setMsg(null), setMode("in"))} className="rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
            + Entrada
          </button>
          <button type="button" onClick={() => (setMsg(null), setMode("out"))} className="rounded-lg border border-brand-200 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50">
            − Salida
          </button>
        </span>
        {msg?.ok && <span className="text-[11px] text-emerald-700">{msg.ok}</span>}
      </span>
    );

  return (
    <div className="mt-2 w-full space-y-2 rounded-xl border border-brand-100 bg-brand-50/60 p-3 text-left">
      {msg?.error && <Alert>{msg.error}</Alert>}
      <div className="grid gap-2 sm:grid-cols-4">
        <Field label={`Cantidad (${unit})`}>
          <input type="number" min="0.5" step="0.5" value={qty} onChange={(e) => setQty(e.target.value)} className="field" autoFocus />
        </Field>
        {mode === "in" ? (
          <>
            <Field label="Lote">
              <input value={lot} onChange={(e) => setLot(e.target.value)} className="field" />
            </Field>
            <Field label="Caducidad">
              <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className="field" />
            </Field>
            <Field label="Costo unitario">
              <input type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} className="field" />
            </Field>
          </>
        ) : (
          <>
            <Field label="Tipo">
              <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="field">
                <option value="salida">Consumo</option>
                <option value="merma">Merma / caducado</option>
                <option value="ajuste">Ajuste de conteo</option>
              </select>
            </Field>
            <Field label="Motivo" className="sm:col-span-2">
              <input value={reason} onChange={(e) => setReason(e.target.value)} className="field" />
            </Field>
          </>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setMode(null)}>
          Cancelar
        </Button>
        <Button disabled={pending || !(Number(qty) > 0)} onClick={submit}>
          {mode === "in" ? "Registrar entrada" : "Registrar salida"}
        </Button>
      </div>
    </div>
  );
}

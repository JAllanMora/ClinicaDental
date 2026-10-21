"use client";

import { useEffect, useRef, useState } from "react";

/** Lienzo para firmar con el dedo, lápiz o mouse. Devuelve un PNG en data URL. */
export function SignaturePad({
  onChange,
  label,
  height = 180,
}: {
  onChange: (dataUrl: string | null) => void;
  label: string;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmptyState] = useState(true);
  const emptyRef = useRef(true);
  const setEmpty = (v: boolean) => {
    emptyRef.current = v;
    setEmptyState(v);
  };

  useEffect(() => {
    const canvas = canvasRef.current!;
    let lastWidth = 0;
    const setup = (ctx: CanvasRenderingContext2D, ratio: number) => {
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#2d0a2a";
    };
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const { width } = canvas.getBoundingClientRect();
      if (Math.abs(width - lastWidth) < 1) return;
      // Conservar la firma al girar la tablet o cambiar el tamaño de la ventana.
      const previous = lastWidth > 0 ? canvas.toDataURL("image/png") : null;
      lastWidth = width;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      const ctx = canvas.getContext("2d")!;
      setup(ctx, ratio);
      if (previous && !emptyRef.current) {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, width, height);
          onChange(canvas.toDataURL("image/png"));
        };
        img.src = previous;
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const ctx = e.currentTarget.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1, 0, Math.PI * 2);
    ctx.fillStyle = "#2d0a2a";
    ctx.fill();
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const ctx = e.currentTarget.getContext("2d")!;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };

  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    setEmpty(false);
    onChange(canvasRef.current!.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
    onChange(null);
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="label mb-0">{label}</span>
        <button type="button" onClick={clear} className="text-xs text-brand-600 hover:underline">
          Borrar firma
        </button>
      </div>
      <div className="relative rounded-xl border-2 border-dashed border-brand-200 bg-white">
        <canvas
          ref={canvasRef}
          style={{ height, touchAction: "none" }}
          className="block w-full cursor-crosshair rounded-xl"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          aria-label={label}
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-brand-300">
            Firma aquí con el dedo o el lápiz
          </span>
        )}
        <span className="pointer-events-none absolute bottom-8 left-6 right-6 border-b border-brand-200" />
      </div>
    </div>
  );
}

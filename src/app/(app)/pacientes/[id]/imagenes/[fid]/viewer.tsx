"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Card, cx } from "@/components/ui";
import { type DicomImage, decodeDicom, renderGray } from "@/lib/dicom";

const StlViewer = dynamic(() => import("./stl-viewer"), {
  ssr: false,
  loading: () => <div className="grid h-[70vh] place-items-center text-sm text-brand-200">Cargando visor 3D…</div>,
});

type Adjust = { zoom: number; x: number; y: number; brightness: number; contrast: number; invert: boolean; rotate: number };
const INITIAL: Adjust = { zoom: 1, x: 0, y: 0, brightness: 100, contrast: 100, invert: false, rotate: 0 };

/** Lienzo con zoom (rueda o botones), arrastre y ajustes de brillo/contraste/inversión. */
function Stage({ children, adjust, setAdjust }: { children: React.ReactNode; adjust: Adjust; setAdjust: (a: Adjust) => void }) {
  const drag = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      className="relative h-[70vh] cursor-grab touch-none overflow-hidden rounded-2xl bg-black active:cursor-grabbing"
      onWheel={(e) => setAdjust({ ...adjust, zoom: Math.min(8, Math.max(0.5, adjust.zoom * (e.deltaY < 0 ? 1.15 : 0.87))) })}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX - adjust.x, y: e.clientY - adjust.y };
      }}
      onPointerMove={(e) => drag.current && setAdjust({ ...adjust, x: e.clientX - drag.current.x, y: e.clientY - drag.current.y })}
      onPointerUp={() => (drag.current = null)}
    >
      <div
        className="absolute inset-0 grid place-items-center"
        style={{
          transform: `translate(${adjust.x}px, ${adjust.y}px) scale(${adjust.zoom}) rotate(${adjust.rotate}deg)`,
          filter: `brightness(${adjust.brightness}%) contrast(${adjust.contrast}%) ${adjust.invert ? "invert(1)" : ""}`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Controls({ adjust, setAdjust, extra }: { adjust: Adjust; setAdjust: (a: Adjust) => void; extra?: React.ReactNode }) {
  const btn = "rounded-lg border border-brand-200 bg-white px-3 py-1.5 text-sm text-brand-800 hover:bg-brand-50";
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button type="button" className={btn} onClick={() => setAdjust({ ...adjust, zoom: adjust.zoom * 1.25 })} aria-label="Acercar">
        +
      </button>
      <button type="button" className={btn} onClick={() => setAdjust({ ...adjust, zoom: adjust.zoom / 1.25 })} aria-label="Alejar">
        −
      </button>
      <button type="button" className={btn} onClick={() => setAdjust({ ...adjust, rotate: (adjust.rotate + 90) % 360 })}>
        Girar
      </button>
      <button type="button" className={cx(btn, adjust.invert && "bg-brand-500 text-white hover:bg-brand-600")} onClick={() => setAdjust({ ...adjust, invert: !adjust.invert })}>
        Invertir
      </button>
      <label className="flex items-center gap-2 text-brand-800">
        Brillo
        <input type="range" min={30} max={250} value={adjust.brightness} onChange={(e) => setAdjust({ ...adjust, brightness: +e.target.value })} className="accent-magenta-500" />
      </label>
      <label className="flex items-center gap-2 text-brand-800">
        Contraste
        <input type="range" min={30} max={300} value={adjust.contrast} onChange={(e) => setAdjust({ ...adjust, contrast: +e.target.value })} className="accent-magenta-500" />
      </label>
      {extra}
      <button type="button" className="text-brand-600 hover:underline" onClick={() => setAdjust(INITIAL)}>
        Restablecer
      </button>
    </div>
  );
}

function ImageViewer({ url, name }: { url: string; name: string }) {
  const [adjust, setAdjust] = useState(INITIAL);
  return (
    <Card className="space-y-3 p-3">
      <Stage adjust={adjust} setAdjust={setAdjust}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={name} draggable={false} className="max-h-full max-w-full select-none" />
      </Stage>
      <Controls adjust={adjust} setAdjust={setAdjust} />
    </Card>
  );
}

function DicomViewer({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<DicomImage | null>(null);
  const [jpegUrl, setJpegUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adjust, setAdjust] = useState(INITIAL);
  const [wl, setWl] = useState<{ c: number; w: number } | null>(null);

  useEffect(() => {
    let revoke: string | null = null;
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        const decoded = decodeDicom(buf);
        setImg(decoded);
        if (decoded.kind === "gray") setWl({ c: decoded.info.windowCenter, w: decoded.info.windowWidth });
        if (decoded.kind === "jpeg") setJpegUrl((revoke = URL.createObjectURL(decoded.blob)));
      })
      .catch(() => setError("No se pudo leer el archivo DICOM."));
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [url]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img || (img.kind !== "gray" && img.kind !== "rgb")) return;
    canvas.width = img.info.columns;
    canvas.height = img.info.rows;
    const ctx = canvas.getContext("2d")!;
    let rgba: Uint8ClampedArray<ArrayBuffer>;
    if (img.kind === "gray") {
      rgba = renderGray(img, wl?.c ?? img.info.windowCenter, wl?.w ?? img.info.windowWidth, false);
    } else {
      rgba = new Uint8ClampedArray(img.info.rows * img.info.columns * 4);
      for (let i = 0; i < img.info.rows * img.info.columns; i++) {
        rgba.set([img.rgb[i * 3], img.rgb[i * 3 + 1], img.rgb[i * 3 + 2], 255], i * 4);
      }
    }
    ctx.putImageData(new ImageData(rgba, img.info.columns, img.info.rows), 0, 0);
  }, [img, wl]);

  if (error) return <Card>{error}</Card>;
  if (!img) return <Card className="grid h-[70vh] place-items-center text-sm text-brand-700">Leyendo DICOM…</Card>;

  return (
    <Card className="space-y-3 p-3">
      {img.kind === "unsupported" ? (
        <div className="grid h-[40vh] place-items-center rounded-2xl bg-brand-950 p-6 text-center text-sm text-brand-100">{img.reason}</div>
      ) : (
        <Stage adjust={adjust} setAdjust={setAdjust}>
          {img.kind === "jpeg" && jpegUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={jpegUrl} alt="DICOM" draggable={false} className="max-h-full max-w-full select-none" />
          ) : (
            <canvas ref={canvasRef} data-testid="dicom-canvas" className="max-h-full max-w-full" />
          )}
        </Stage>
      )}
      <Controls
        adjust={adjust}
        setAdjust={setAdjust}
        extra={
          img.kind === "gray" &&
          wl && (
            <>
              <label className="flex items-center gap-2 text-brand-800">
                Nivel
                <input type="range" min={img.min} max={img.max} value={wl.c} onChange={(e) => setWl({ ...wl, c: +e.target.value })} className="accent-brand-500" />
              </label>
              <label className="flex items-center gap-2 text-brand-800">
                Ventana
                <input type="range" min={1} max={Math.max(2, img.max - img.min)} value={wl.w} onChange={(e) => setWl({ ...wl, w: +e.target.value })} className="accent-brand-500" />
              </label>
            </>
          )
        }
      />
      <p className="text-xs text-brand-700/70">
        DICOM · {img.info.columns}×{img.info.rows}
        {img.info.modality && ` · ${img.info.modality}`}
        {img.info.manufacturer && ` · ${img.info.manufacturer}`}
        {img.info.patientName && ` · Paciente en archivo: ${img.info.patientName}`}
        {img.info.studyDate && ` · Estudio ${img.info.studyDate.replace(/(\d{4})(\d{2})(\d{2})/, "$3/$2/$1")}`}
      </p>
    </Card>
  );
}

export function FileViewer({ url, format, name }: { url: string; format: string; name: string }) {
  if (format === "imagen") return <ImageViewer url={url} name={name} />;
  if (format === "dicom") return <DicomViewer url={url} />;
  if (format === "stl")
    return (
      <Card className="p-3">
        <StlViewer url={url} />
      </Card>
    );
  if (format === "pdf")
    return (
      <Card className="p-0">
        <iframe src={url} title={name} className="h-[75vh] w-full rounded-2xl" />
      </Card>
    );
  return <Card>Vista previa no disponible. Usa el botón Descargar.</Card>;
}

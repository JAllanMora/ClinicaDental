"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

/** Visor 3D de escaneos intraorales (STL): rotar, acercar y desplazar. */
export default function StlViewer({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Cargando modelo…");

  useEffect(() => {
    const el = ref.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#1b0719");
    const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.1, 5000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x44203f, 1.2));
    const light = new THREE.DirectionalLight(0xffffff, 1.6);
    camera.add(light);
    light.position.set(1, 1, 2);
    scene.add(camera);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    let frame = 0;
    let disposed = false;
    new STLLoader().load(
      url,
      (geometry) => {
        if (disposed) return;
        geometry.computeVertexNormals();
        geometry.center();
        const material = new THREE.MeshStandardMaterial({ color: "#f3e8f7", roughness: 0.55, metalness: 0.05 });
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
        geometry.computeBoundingSphere();
        const r = geometry.boundingSphere?.radius ?? 50;
        camera.position.set(0, -r * 0.6, r * 2.6);
        controls.update();
        setStatus("");
      },
      undefined,
      () => setStatus("No se pudo cargar el modelo STL."),
    );

    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(loop);
    };
    loop();

    const onResize = () => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener("resize", onResize);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [url]);

  return (
    <div className="relative">
      <div ref={ref} className="h-[70vh] w-full overflow-hidden rounded-2xl" data-testid="stl-viewer" />
      {status && <div className="absolute inset-0 grid place-items-center text-sm text-brand-100">{status}</div>}
      <p className="mt-2 text-xs text-brand-700/70">Arrastra para girar · rueda o pellizco para acercar · clic derecho o dos dedos para desplazar</p>
    </div>
  );
}

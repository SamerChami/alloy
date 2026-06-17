"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { buildCabinetBoxes, buildBoxesFromRawPanels } from "@/lib/cabinet3d";
import { useLang } from "@/components/lang-provider";
import type { PartRole, RawPanel3D } from "@/lib/cabinet3d";
import type { BomLineState } from "@/app/(app)/products/bom_types";

type Props = {
  cabinetWidth: number;
  cabinetHeight: number;
  cabinetDepth: number;
  parts: BomLineState[];
  rawPanels?: RawPanel3D[];
};

type ViewMode = "shaded" | "wireframe";

const ROLE_COLOR: Record<PartRole, number> = {
  side_left:     0xCECBC5,
  side_right:    0xCECBC5,
  top:           0xD4D0CA,
  bottom:        0xD4D0CA,
  back:          0xC0BDB7,
  shelf:         0xDAD7D1,
  divider_v:     0xDAD7D1,
  door:          0xE4E0DA,
  drawer_front:  0xE4E0DA,
  other:         0xA8BCC4,
};

export function Cabinet3D({
  cabinetWidth,
  cabinetHeight,
  cabinetDepth,
  parts,
  rawPanels,
}: Props) {
  const { t } = useLang();
  const containerRef = useRef<HTMLDivElement>(null);

  // THREE refs — never trigger re-renders
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef    = useRef<THREE.Scene | null>(null);
  const cameraRef   = useRef<THREE.PerspectiveCamera | null>(null);
  const groupRef    = useRef<THREE.Group | null>(null);
  const rafRef      = useRef<number>(0);

  // Orbit/pan state lives entirely in a ref — no re-render on camera movement
  const orbitRef = useRef({
    theta:  Math.PI * 0.75,
    phi:    Math.PI / 3,
    radius: 2,
    cx: 0, cy: 0, cz: 0,
  });

  // Active pointer drag state
  const dragRef = useRef({
    active: false,
    button: -1,   // 0=left(pan), 1=middle/2=right(rotate)
    lastX:  0,
    lastY:  0,
  });

  const [showDoors, setShowDoors] = useState(true);
  const [explode,   setExplode]   = useState(false);
  const [viewMode,  setViewMode]  = useState<ViewMode>("shaded");

  // Stable camera update — reads from refs only
  const updateCamera = useCallback(() => {
    const cam = cameraRef.current;
    if (!cam) return;
    const { theta, phi, radius, cx, cy, cz } = orbitRef.current;
    cam.position.set(
      cx + radius * Math.sin(phi) * Math.sin(theta),
      cy + radius * Math.cos(phi),
      cz + radius * Math.sin(phi) * Math.cos(theta),
    );
    cam.lookAt(cx, cy, cz);
  }, []);

  // ── mount: scene, renderer, lights, animation loop, native listeners ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const W = container.clientWidth  || 600;
    const H = container.clientHeight || 400;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xF5F3F0);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(38, W / H, 0.001, 100);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const hemi = new THREE.HemisphereLight(0xfff4e8, 0xd4c8b8, 0.6);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(2, 4, 3);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0xffffff, 0.25);
    fill.position.set(-2, 1, -2);
    scene.add(fill);

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    function animate() {
      rafRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }
    animate();

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w && h) {
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
    });
    ro.observe(container);

    // Non-passive wheel listener so preventDefault() works (React makes onWheel passive)
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      e.stopPropagation();
      const o = orbitRef.current;
      o.radius = Math.max(0.1, Math.min(20, o.radius + e.deltaY * 0.0008));
      updateCamera();
    }
    container.addEventListener("wheel", onWheel, { passive: false });

    // Suppress browser context menu so right-drag can rotate without interruption
    function onContextMenu(e: Event) { e.preventDefault(); }
    container.addEventListener("contextmenu", onContextMenu);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("contextmenu", onContextMenu);
      disposeGroup(group);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      sceneRef.current    = null;
      cameraRef.current   = null;
      groupRef.current    = null;
    };
  }, [updateCamera]);

  // ── rebuild meshes on geometry / option / view-mode changes ──────────
  useEffect(() => {
    const tid = setTimeout(() => {
      const group = groupRef.current;
      if (!group) return;

      disposeGroup(group);
      while (group.children.length) group.remove(group.children[0]);

      const cW = cabinetWidth  > 0 ? cabinetWidth  : 800;
      const cH = cabinetHeight > 0 ? cabinetHeight : 720;
      const cD = cabinetDepth  > 0 ? cabinetDepth  : 580;

      const boxes = rawPanels && rawPanels.length > 0
        ? buildBoxesFromRawPanels(rawPanels, showDoors, explode)
        : buildCabinetBoxes(
            cW, cH, cD,
            parts
              .filter(l => l.line_type === "panel")
              .slice(0, 60)
              .map(l => ({
                role: (l.part_role || null) as PartRole | null,
                part_name: l.part_name,
                width_mm:      parseFloat(l.width_mm)      || 0,
                height_mm:     parseFloat(l.height_mm)     || 0,
                depth_mm:      l.depth_mm      !== "" ? parseFloat(l.depth_mm)      : null,
                pos_offset_mm: l.pos_offset_mm !== "" ? parseFloat(l.pos_offset_mm) : null,
                qty: parseFloat(l.qty) || 1,
              })),
            showDoors,
            explode,
          );

      const isWireframe = viewMode === "wireframe";

      for (const box of boxes) {
        const geo = new THREE.BoxGeometry(box.w, box.h, box.d);
        const isDoor = box.role === "door" || box.role === "drawer_front";

        if (isWireframe) {
          // Wireframe: only edge outlines, coloured by role for readability
          const edgesGeo = new THREE.EdgesGeometry(geo);
          const edgesMat = new THREE.LineBasicMaterial({
            color: ROLE_COLOR[box.role] ?? 0x888880,
          });
          const lines = new THREE.LineSegments(edgesGeo, edgesMat);
          lines.position.set(box.x, box.y, box.z);
          group.add(lines);
          geo.dispose(); // BoxGeometry no longer needed after edges are built
        } else {
          // Shaded: solid panel + dark edge outlines
          const mat = new THREE.MeshStandardMaterial({
            color:       ROLE_COLOR[box.role] ?? 0xD9D5CE,
            roughness:   0.8,
            metalness:   0.02,
            transparent: isDoor,
            opacity:     isDoor ? 0.88 : 1.0,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(box.x, box.y, box.z);
          mesh.castShadow    = true;
          mesh.receiveShadow = true;
          group.add(mesh);

          const edgesGeo = new THREE.EdgesGeometry(geo);
          const edgesMat = new THREE.LineBasicMaterial({ color: 0x5a5a52 });
          mesh.add(new THREE.LineSegments(edgesGeo, edgesMat));
        }
      }

      // Re-centre orbit on cabinet bounding box
      const orbit   = orbitRef.current;
      orbit.cx      = cW / 1000 / 2;
      orbit.cy      = cH / 1000 / 2;
      orbit.cz      = cD / 1000 / 2;
      orbit.phi     = Math.PI * 0.4;
      orbit.radius  = Math.max(cW, cH, cD) / 1000 * 2.0;
      updateCamera();
    }, 150);

    return () => clearTimeout(tid);
  }, [cabinetWidth, cabinetHeight, cabinetDepth, parts, rawPanels, showDoors, explode, viewMode, updateCamera]);

  // ── pointer handlers ─────────────────────────────────────────────────
  // Left (button 0) → PAN   |   Middle (1) / Right (2) → ROTATE

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { active: true, button: e.button, lastX: e.clientX, lastY: e.clientY };
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag.active) return;

    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;

    if (drag.button === 0) {
      // Left drag → PAN along camera's right / up axes
      const cam = cameraRef.current;
      const o   = orbitRef.current;
      if (!cam) return;
      cam.updateMatrixWorld();
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      const up    = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      const speed = o.radius * 0.0015;
      o.cx += (-right.x * dx + up.x * dy) * speed;
      o.cy += (-right.y * dx + up.y * dy) * speed;
      o.cz += (-right.z * dx + up.z * dy) * speed;
    } else {
      // Middle or right drag → ORBIT
      const o = orbitRef.current;
      o.theta -= dx * 0.008;
      o.phi    = Math.max(0.08, Math.min(Math.PI - 0.08, o.phi + dy * 0.008));
    }

    updateCamera();
  }

  function onPointerUp(e: React.PointerEvent) {
    (e.target as Element).releasePointerCapture(e.pointerId);
    dragRef.current.active = false;
  }

  function resetView() {
    const o  = orbitRef.current;
    const cW = cabinetWidth  > 0 ? cabinetWidth  : 800;
    const cH = cabinetHeight > 0 ? cabinetHeight : 720;
    const cD = cabinetDepth  > 0 ? cabinetDepth  : 580;
    o.cx     = cW / 1000 / 2;
    o.cy     = cH / 1000 / 2;
    o.cz     = cD / 1000 / 2;
    o.theta  = Math.PI * 0.75;
    o.phi    = Math.PI * 0.4;
    o.radius = Math.max(cW, cH, cD) / 1000 * 2.0;
    updateCamera();
  }

  return (
    <div className="border border-line rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="bg-mist px-4 py-2 flex items-center gap-2 border-b border-line flex-wrap">
        <span className="text-sm font-semibold flex-1">{t("preview3d")}</span>
        <button
          type="button"
          className="btn-ghost text-xs py-1 px-2"
          onClick={resetView}
        >
          {t("resetView")}
        </button>
        <button
          type="button"
          className={`btn-ghost text-xs py-1 px-2${explode ? " text-brass font-semibold" : ""}`}
          onClick={() => setExplode(v => !v)}
        >
          {t("explode")}
        </button>
        <button
          type="button"
          className={`btn-ghost text-xs py-1 px-2${!showDoors ? " text-slate" : ""}`}
          onClick={() => setShowDoors(v => !v)}
        >
          {t("showDoors")}
        </button>
        <span className="w-px h-4 bg-line mx-1" />
        <button
          type="button"
          className={`btn-ghost text-xs py-1 px-2${viewMode === "shaded" ? " text-brass font-semibold" : ""}`}
          onClick={() => setViewMode("shaded")}
        >
          {t("viewShaded")}
        </button>
        <button
          type="button"
          className={`btn-ghost text-xs py-1 px-2${viewMode === "wireframe" ? " text-brass font-semibold" : ""}`}
          onClick={() => setViewMode("wireframe")}
        >
          {t("viewWireframe")}
        </button>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        style={{ height: 400 }}
        className="w-full select-none cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────

function disposeGroup(group: THREE.Group) {
  group.traverse(obj => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
      obj.geometry?.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) mat.forEach(m => m.dispose());
      else (mat as THREE.Material)?.dispose();
    }
  });
}

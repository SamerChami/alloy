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
  // When provided, use real assembled positions instead of role synthesis.
  rawPanels?: RawPanel3D[];
};

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
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef     = useRef<THREE.Scene | null>(null);
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null);
  const groupRef     = useRef<THREE.Group | null>(null);
  const rafRef       = useRef<number>(0);

  // Orbit state
  const orbitRef = useRef({
    dragging: false,
    lastX: 0,
    lastY: 0,
    theta: Math.PI * 0.75,
    phi: Math.PI / 3,
    radius: 2,
    cx: 0,
    cy: 0,
    cz: 0,
  });

  const [showDoors, setShowDoors] = useState(true);
  const [explode,   setExplode]   = useState(false);

  // Stable camera update (reads from refs only)
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

  // ── mount: create scene, renderer, lights, animation loop ──────────
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
    renderer.shadowMap.type = THREE.PCFShadowMap;   // PCFSoft is deprecated in r168+
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Soft ambient base so all faces are visible
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);

    // Hemisphere gives warm-top / cool-bottom gradient that reads depth on flat panels
    const hemi = new THREE.HemisphereLight(0xfff4e8, 0xd4c8b8, 0.6);
    scene.add(hemi);

    // Key light from front-top-right
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(2, 4, 3);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    scene.add(dir);

    // Subtle fill from back-left so rear/side faces aren't pitch black
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

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
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
  }, []); // mount only

  // ── update meshes whenever parts / dims / options change (debounced) ─
  useEffect(() => {
    const tid = setTimeout(() => {
      const group = groupRef.current;
      if (!group) return;

      disposeGroup(group);
      while (group.children.length) group.remove(group.children[0]);

      const cW = cabinetWidth  > 0 ? cabinetWidth  : 800;
      const cH = cabinetHeight > 0 ? cabinetHeight : 720;
      const cD = cabinetDepth  > 0 ? cabinetDepth  : 580;

      // Use real assembled positions when available (e.g. from .3ds import);
      // fall back to role-synthesis when rawPanels is absent (BOM editor path).
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

      for (const box of boxes) {
        const geo = new THREE.BoxGeometry(box.w, box.h, box.d);
        const isDoor = box.role === "door" || box.role === "drawer_front";
        const mat = new THREE.MeshStandardMaterial({
          color:       ROLE_COLOR[box.role] ?? 0xD9D5CE,
          roughness:   0.8,
          metalness:   0.02,
          // Doors are semi-transparent so interior shelves show through
          transparent: isDoor,
          opacity:     isDoor ? 0.88 : 1.0,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(box.x, box.y, box.z);
        mesh.castShadow    = true;
        mesh.receiveShadow = true;
        group.add(mesh);

        // Edge outlines ensure thin panels (backs, trays, doors) read as solid boards
        const edgesGeo = new THREE.EdgesGeometry(geo);
        const edgesMat = new THREE.LineBasicMaterial({ color: 0x5a5a52 });
        mesh.add(new THREE.LineSegments(edgesGeo, edgesMat));
      }

      // Re-center orbit on cabinet bounding box
      const orbit = orbitRef.current;
      orbit.cx     = cW / 1000 / 2;
      orbit.cy     = cH / 1000 / 2;
      orbit.cz     = cD / 1000 / 2;
      // phi=0.4π ≈ 72° from top — more front-facing angle for tall cabinets
      orbit.phi    = Math.PI * 0.4;
      orbit.radius = Math.max(cW, cH, cD) / 1000 * 2.0;
      updateCamera();
    }, 150);

    return () => clearTimeout(tid);
  }, [cabinetWidth, cabinetHeight, cabinetDepth, parts, rawPanels, showDoors, explode, updateCamera]);

  // ── mouse orbit ────────────────────────────────────────────────────
  function onMouseDown(e: React.MouseEvent) {
    orbitRef.current.dragging = true;
    orbitRef.current.lastX = e.clientX;
    orbitRef.current.lastY = e.clientY;
  }

  function onMouseMove(e: React.MouseEvent) {
    const o = orbitRef.current;
    if (!o.dragging) return;
    const dx = e.clientX - o.lastX;
    const dy = e.clientY - o.lastY;
    o.lastX = e.clientX;
    o.lastY = e.clientY;
    o.theta -= dx * 0.008;
    o.phi    = Math.max(0.08, Math.min(Math.PI - 0.08, o.phi + dy * 0.008));
    updateCamera();
  }

  function onMouseUp() {
    orbitRef.current.dragging = false;
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const o = orbitRef.current;
    o.radius = Math.max(0.15, o.radius + e.deltaY * 0.0008);
    updateCamera();
  }

  function resetView() {
    const o = orbitRef.current;
    const cW = cabinetWidth  > 0 ? cabinetWidth  : 800;
    const cH = cabinetHeight > 0 ? cabinetHeight : 720;
    const cD = cabinetDepth  > 0 ? cabinetDepth  : 580;
    o.theta  = Math.PI * 0.75;     // 3/4 front-left angle
    o.phi    = Math.PI * 0.4;      // 72° from top — upright tall-cabinet view
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
      </div>

      {/* Canvas container */}
      <div
        ref={containerRef}
        style={{ height: 400 }}
        className="w-full select-none cursor-grab active:cursor-grabbing"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
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

"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { Maximize2, X } from "lucide-react";
import { buildCabinetBoxes, buildBoxesFromRawPanels, buildBoxesFromSkuPanels } from "@/lib/cabinet3d";
import { useLang } from "@/components/lang-provider";
import type { PartRole, RawPanel3D, SkuPanel3D } from "@/lib/cabinet3d";
import type { BomLineState } from "@/app/(app)/products/bom_types";
import type { Cut } from "@/lib/sketchup/types";

type Props = {
  cabinetWidth: number;
  cabinetHeight: number;
  cabinetDepth: number;
  parts: BomLineState[];
  /** SketchUp import: raw per-axis extents + world positions (preferred over rawPanels). */
  skuPanels?: SkuPanel3D[];
  /** .3ds import: sorted T/W/H extents + remapped positions. */
  rawPanels?: RawPanel3D[];
  /** True when this instance is already rendered inside the modal — hides expand, shows X. */
  inModal?: boolean;
  /** When provided, renders an X close button in the toolbar. */
  onClose?: () => void;
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
  skuPanels,
  rawPanels,
  inModal = false,
  onClose,
}: Props) {
  const { t } = useLang();
  const containerRef = useRef<HTMLDivElement>(null);

  // THREE refs — never trigger re-renders
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef    = useRef<THREE.Scene | null>(null);
  const cameraRef   = useRef<THREE.PerspectiveCamera | null>(null);
  const groupRef    = useRef<THREE.Group | null>(null);
  const rafRef      = useRef<number>(0);

  // Orbit/pan state — all in a ref so camera moves never cause re-renders
  const orbitRef = useRef({
    theta:  Math.PI * 1.75,
    phi:    Math.PI * 0.4,
    radius: 2,
    cx: 0, cy: 0, cz: 0,
  });

  // Active pointer drag
  const dragRef = useRef({ active: false, button: -1, lastX: 0, lastY: 0 });

  const [showDoors, setShowDoors] = useState(true);
  const [showCuts,  setShowCuts]  = useState(true);
  const [explode,   setExplode]   = useState(false);
  const [viewMode,  setViewMode]  = useState<ViewMode>("shaded");
  const [modalOpen, setModalOpen] = useState(false);

  // Esc key + body-scroll lock while modal is open
  useEffect(() => {
    if (!modalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setModalOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [modalOpen]);

  // Stable camera update — reads refs only, no closures over props
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

    // Non-passive wheel so preventDefault() actually fires (React makes onWheel passive)
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      e.stopPropagation();
      const o = orbitRef.current;
      o.radius = Math.max(0.1, Math.min(20, o.radius + e.deltaY * 0.0008));
      updateCamera();
    }
    container.addEventListener("wheel", onWheel, { passive: false });

    // Suppress context menu so right-drag rotates without the browser popup
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

  // ── rebuild meshes whenever geometry / options / view-mode change ─────
  useEffect(() => {
    const tid = setTimeout(() => {
      const group = groupRef.current;
      if (!group) return;

      disposeGroup(group);
      while (group.children.length) group.remove(group.children[0]);

      const cW = cabinetWidth  > 0 ? cabinetWidth  : 800;
      const cH = cabinetHeight > 0 ? cabinetHeight : 720;
      const cD = cabinetDepth  > 0 ? cabinetDepth  : 580;

      const boxes = skuPanels && skuPanels.length > 0
        ? buildBoxesFromSkuPanels(skuPanels, showDoors, explode)
        : rawPanels && rawPanels.length > 0
        ? buildBoxesFromRawPanels(rawPanels, showDoors, explode)
        : buildCabinetBoxes(
            cW, cH, cD,
            parts
              .filter(l => l.line_type === "panel")
              .slice(0, 60)
              .map(l => ({
                role:          (l.part_role || null) as PartRole | null,
                part_name:     l.part_name,
                width_mm:      parseFloat(l.width_mm)      || 0,
                height_mm:     parseFloat(l.height_mm)     || 0,
                depth_mm:      l.depth_mm      !== "" ? parseFloat(l.depth_mm)      : null,
                pos_offset_mm: l.pos_offset_mm !== "" ? parseFloat(l.pos_offset_mm) : null,
                qty:           parseFloat(l.qty) || 1,
              })),
            showDoors,
            explode,
          );

      const isWireframe = viewMode === "wireframe";

      for (const box of boxes) {
        const isDoor = box.role === "door" || box.role === "drawer_front";
        const name   = box.part_name ?? "";

        // Use smart fitting shape when the part name identifies a known fitting type
        if (fittingColor(name) !== null) {
          const obj = buildFittingObject(name, box.w, box.h, box.d, isWireframe);
          if (box.orient && !box.uprightCylinder) {
            const m = new THREE.Matrix4();
            m.set(
              box.orient[0], box.orient[3], box.orient[6], 0,
              box.orient[1], box.orient[4], box.orient[7], 0,
              box.orient[2], box.orient[5], box.orient[8], 0,
              0, 0, 0, 1,
            );
            obj.quaternion.setFromRotationMatrix(m);
          }
          obj.position.set(box.x, box.y, box.z);
          group.add(obj);
          continue;
        }

        const geo = new THREE.BoxGeometry(box.w, box.h, box.d);

        if (isWireframe) {
          const edgesGeo = new THREE.EdgesGeometry(geo);
          const edgesMat = new THREE.LineBasicMaterial({ color: ROLE_COLOR[box.role] ?? 0x888880 });
          const lines    = new THREE.LineSegments(edgesGeo, edgesMat);
          if (box.orient) {
            const om = new THREE.Matrix4();
            om.set(
              box.orient[0], box.orient[3], box.orient[6], 0,
              box.orient[1], box.orient[4], box.orient[7], 0,
              box.orient[2], box.orient[5], box.orient[8], 0,
              0, 0, 0, 1,
            );
            lines.quaternion.setFromRotationMatrix(om);
            lines.updateMatrix();
          }
          lines.position.set(box.x, box.y, box.z);
          group.add(lines);
          geo.dispose();
          if (showCuts && box.cuts && box.cuts.length > 0) {
            addCutMeshes(lines, box.cuts, box.w, box.h, box.d, true,
              { x: box.x, y: box.y, z: box.z },
              { x: cW / 1000 / 2, y: cH / 1000 / 2, z: cD / 1000 / 2 });
          }
        } else {
          const mat = new THREE.MeshStandardMaterial({
            color:       ROLE_COLOR[box.role] ?? 0xD9D5CE,
            roughness:   0.8,
            metalness:   0.02,
            transparent: isDoor,
            opacity:     isDoor ? 0.88 : 1.0,
          });
          const mesh = new THREE.Mesh(geo, mat);
          if (box.orient) {
            const om = new THREE.Matrix4();
            om.set(
              box.orient[0], box.orient[3], box.orient[6], 0,
              box.orient[1], box.orient[4], box.orient[7], 0,
              box.orient[2], box.orient[5], box.orient[8], 0,
              0, 0, 0, 1,
            );
            mesh.quaternion.setFromRotationMatrix(om);
            mesh.updateMatrix();
          }
          mesh.position.set(box.x, box.y, box.z);
          mesh.castShadow    = true;
          mesh.receiveShadow = true;
          group.add(mesh);
          const edgesGeo = new THREE.EdgesGeometry(geo);
          mesh.add(new THREE.LineSegments(edgesGeo, new THREE.LineBasicMaterial({ color: 0x5a5a52 })));
          if (showCuts && box.cuts && box.cuts.length > 0) {
            addCutMeshes(mesh, box.cuts, box.w, box.h, box.d, false,
              { x: box.x, y: box.y, z: box.z },
              { x: cW / 1000 / 2, y: cH / 1000 / 2, z: cD / 1000 / 2 });
          }
        }
      }

      const o    = orbitRef.current;
      o.cx       = cW / 1000 / 2;
      o.cy       = cH / 1000 / 2;
      o.cz       = cD / 1000 / 2;
      o.phi      = Math.PI * 0.4;
      o.radius   = Math.max(cW, cH, cD) / 1000 * 2.0;
      updateCamera();
    }, 150);

    return () => clearTimeout(tid);
  }, [cabinetWidth, cabinetHeight, cabinetDepth, parts, skuPanels, rawPanels, showDoors, showCuts, explode, viewMode, updateCamera]);

  // ── pointer handlers ──────────────────────────────────────────────────
  // Left (0) → PAN    Middle (1) / Right (2) → ORBIT

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
      // Left drag → PAN along camera right/up
      const cam = cameraRef.current;
      const o   = orbitRef.current;
      if (!cam) return;
      cam.updateMatrixWorld();
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      const up    = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      const spd   = o.radius * 0.0015;
      o.cx += (-right.x * dx + up.x * dy) * spd;
      o.cy += (-right.y * dx + up.y * dy) * spd;
      o.cz += (-right.z * dx + up.z * dy) * spd;
    } else {
      // Middle / right drag → ORBIT
      const o = orbitRef.current;
      o.theta -= dx * 0.008;
      // -dy: dragging UP decreases phi → camera moves higher → looks more from above (natural)
      o.phi = Math.max(0.08, Math.min(Math.PI - 0.08, o.phi - dy * 0.008));
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

  // ── shared toolbar JSX ────────────────────────────────────────────────
  const toolbar = (
    <div className="bg-mist px-4 py-2 flex items-center gap-2 border-b border-line flex-wrap shrink-0">
      <span className="text-sm font-semibold flex-1">{t("preview3d")}</span>
      <button type="button" className="btn-ghost text-xs py-1 px-2" onClick={resetView}>
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
      <button
        type="button"
        className={`btn-ghost text-xs py-1 px-2${!showCuts ? " text-slate" : ""}`}
        onClick={() => setShowCuts(v => !v)}
      >
        {t("showCuts")}
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
      <span className="w-px h-4 bg-line mx-1" />
      {/* Expand button: only on the non-modal instance */}
      {!inModal && (
        <button
          type="button"
          className="btn-ghost py-1 px-2"
          onClick={() => setModalOpen(true)}
        >
          <Maximize2 size={14} />
        </button>
      )}
      {/* X close button: shown when a close callback is provided (modal instance) */}
      {onClose && (
        <button type="button" className="btn-ghost py-1 px-2" onClick={onClose}>
          <X size={16} />
        </button>
      )}
    </div>
  );

  // Canvas div: fixed height inline, flex-fill when inside the modal
  const canvas = (
    <div
      ref={containerRef}
      style={inModal ? undefined : { height: 400 }}
      className={`w-full select-none cursor-grab active:cursor-grabbing${inModal ? " flex-1 min-h-0" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  );

  return (
    <>
      {/* Inline viewer */}
      <div className={`border border-line rounded-lg overflow-hidden${inModal ? " flex flex-col h-full" : ""}`}>
        {toolbar}
        {canvas}
      </div>

      {/* Modal overlay — only the outer instance can open it */}
      {!inModal && modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="relative flex flex-col rounded-xl overflow-hidden shadow-2xl"
            style={{ width: "90vw", height: "85vh" }}
            onClick={e => e.stopPropagation()}
          >
            <Cabinet3D
              cabinetWidth={cabinetWidth}
              cabinetHeight={cabinetHeight}
              cabinetDepth={cabinetDepth}
              parts={parts}
              skuPanels={skuPanels}
              rawPanels={rawPanels}
              inModal
              onClose={() => setModalOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}

// ── helpers ───────────────────────────────────────────────────────────

// Adds dark inset recess boxes to a panel mesh for each cut.
// Box3D axes: w=THREE X=su_width_mm, h=THREE Y=su_depth_mm, d=THREE Z=su_height_mm.
// u/v assignment determined by which SketchUp source axis is thickness (smallest):
//   thickness=su_width(X):  u→su_height=Z(d), v→su_depth=Y(h)
//   thickness=su_depth(Y):  u→su_width=X(w),  v→su_height=Z(d)
//   thickness=su_height(Z): u→su_width=X(w),  v→su_depth=Y(h)
// Verified: Left_Side w=18(thk)→u=Z,v=Y → groove at u[518,527] reads VERTICAL. ✓
function addCutMeshes(
  parent: THREE.Object3D,
  cuts: Cut[],
  bw: number, bh: number, bd: number,
  wireframe: boolean,
  panelCenter: { x: number; y: number; z: number },
  cabinetCenter: { x: number; y: number; z: number },
) {
  type Axis3 = "x" | "y" | "z";
  let tAxis: Axis3, uAxis: Axis3, vAxis: Axis3;
  if (bw <= bh && bw <= bd)      { tAxis = "x"; uAxis = "z"; vAxis = "y"; }
  else if (bh <= bw && bh <= bd) { tAxis = "y"; uAxis = "x"; vAxis = "z"; }
  else                            { tAxis = "z"; uAxis = "x"; vAxis = "y"; }

  const axisVal = (a: Axis3) => a === "x" ? bw : a === "y" ? bh : bd;
  const thickness = axisVal(tAxis);
  const uExtent   = axisVal(uAxis);
  const vExtent   = axisVal(vAxis);

  for (const cut of cuts) {
    const uCtr  = (cut.u_min_mm + cut.u_max_mm) / 2 / 1000;
    const vCtr  = (cut.v_min_mm + cut.v_max_mm) / 2 / 1000;
    const uSize = (cut.u_max_mm - cut.u_min_mm) / 1000;
    const vSize = (cut.v_max_mm - cut.v_min_mm) / 1000;
    const depth = cut.depth_mm / 1000;

    const sz: Record<Axis3, number> = { x: 0, y: 0, z: 0 };
    sz[uAxis] = uSize;
    sz[vAxis] = vSize;
    sz[tAxis] = depth;

    function drawFace(side: "front" | "back") {
      const pos: Record<Axis3, number> = { x: 0, y: 0, z: 0 };
      // The Stage 8c mirror fix negated the depth axis (three.z = -su.y) for panel
      // positions, but the cut u/v footprint is still in the original frame. Flip
      // the placement for whichever face axis maps to three.z so the groove sits at
      // the correct depth position (e.g. back-seated grooves render at the back).
      pos[uAxis] = uAxis === "z" ? (uExtent / 2 - uCtr) : (uCtr - uExtent / 2);
      pos[vAxis] = vAxis === "z" ? (vExtent / 2 - vCtr) : (vCtr - vExtent / 2);
      // The groove/rabbet always sits on the panel face pointing toward the
      // cabinet interior. Derive that direction from panel-vs-cabinet center
      // along the thickness axis (independent of the front/back field).
      const panelT = tAxis === "x" ? panelCenter.x : tAxis === "y" ? panelCenter.y : panelCenter.z;
      const cabT   = tAxis === "x" ? cabinetCenter.x : tAxis === "y" ? cabinetCenter.y : cabinetCenter.z;
      const interiorSign = (cabT - panelT) >= 0 ? 1 : -1;
      pos[tAxis] = interiorSign * (thickness / 2 - depth / 2);

      const geo = new THREE.BoxGeometry(sz.x, sz.y, sz.z);
      if (wireframe) {
        const eg = new THREE.EdgesGeometry(geo);
        const ls = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x555555 }));
        ls.position.set(pos.x, pos.y, pos.z);
        parent.add(ls);
        geo.dispose();
      } else {
        const mat  = new THREE.MeshStandardMaterial({ color: 0x8A857C, roughness: 0.9, metalness: 0 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(pos.x, pos.y, pos.z);
        parent.add(mesh);
        const eg = new THREE.EdgesGeometry(geo);
        mesh.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x4A4A42 })));
      }
    }

    if (cut.face === "front" || cut.face === "both") drawFace("front");
    if (cut.face === "back"  || cut.face === "both") drawFace("back");
  }
}

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

// Returns a hex color for known fitting types, or null if not a recognised fitting.
function fittingColor(name: string): number | null {
  const n = name.toLowerCase();
  if (n.includes("leg"))       return 0x3a3a3a; // dark grey plastic
  if (n.includes("p2o"))       return 0x555555; // push-to-open plunger, dark grey
  if (n.includes("l_channel")) return 0x8A9BA8; // aluminium channel
  if (n.includes("u_channel")) return 0x8A9BA8; // aluminium channel
  // Other recognisable fitting names → subtle hardware colour, box shape
  if (n.includes("hinge") || n.includes("atira") || n.includes("basket") ||
      n.includes("fitting") || n.includes("handle") || n.includes("clip") ||
      n.includes("screw") || n.includes("cam") || n.includes("dowel")) {
    return 0xA0A8B0;
  }
  return null;
}

function longestAxis(w: number, h: number, d: number): "x" | "y" | "z" {
  if (w >= h && w >= d) return "x";
  if (h >= w && h >= d) return "y";
  return "z";
}

// Adds a geometry as a mesh+edges (shaded) or wireframe LineSegments into a group.
function addPartToGroup(
  g: THREE.Group,
  geo: THREE.BufferGeometry,
  color: number,
  wireframe: boolean,
  x = 0, y = 0, z = 0,
) {
  if (wireframe) {
    const eg  = new THREE.EdgesGeometry(geo);
    const seg = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color }));
    seg.position.set(x, y, z);
    g.add(seg);
    geo.dispose();
  } else {
    const mat  = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.25 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    const eg = new THREE.EdgesGeometry(geo);
    mesh.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x222222 })));
    g.add(mesh);
  }
}

// Returns a THREE.Group representing the custom fitting shape, centred at origin.
function buildFittingObject(
  name: string,
  w: number, h: number, d: number,
  wireframe: boolean,
): THREE.Group {
  const n     = name.toLowerCase();
  const color = fittingColor(name) ?? 0xA0A8B0;
  const g     = new THREE.Group();

  // ── Cylinder: legs and push-to-open plungers ────────────────────────
  if (n.includes("leg") || n.includes("p2o")) {
    const dims   = [w, h, d].sort((a, b) => a - b); // ascending
    const height = dims[2];                           // tallest extent = cylinder length
    const r      = dims[1] / 2;                      // mid extent → radius
    addPartToGroup(g, new THREE.CylinderGeometry(r, r, height, 20), color, wireframe);
    return g;
  }

  // ── L_Channel / U_Channel: profile extruded along longest axis ──────
  if (n.includes("l_channel") || n.includes("u_channel")) {
    const la = longestAxis(w, h, d);

    // The two cross-section dimensions (b = mid, c = short)
    let extrLen: number, b: number, c: number;
    if (la === "x") { extrLen = w; b = h; c = d; }
    else if (la === "y") { extrLen = h; b = w; c = d; }
    else { extrLen = d; b = w; c = h; }

    // Arm thickness: proportion of shortest cross-section dimension
    const t = Math.max(Math.min(b, c) * 0.28, 0.002);

    // Build boxes in the XZ, XY, or ZY cross-section plane depending on la.
    // We always build: web (full b, thin c extent) + bottom flange (thin b, full c extent)
    // and for U also top flange.
    if (la === "x") {
      // Extrude along X. Cross-section in YZ.
      // Web: full h in Y, thin (t) in Z, at back (Z = -d/2 + t/2)
      addPartToGroup(g, new THREE.BoxGeometry(extrLen, b, t),     color, wireframe, 0, 0,        -c / 2 + t / 2);
      // Bottom flange: thin (t) in Y, full d in Z, at bottom (Y = -h/2 + t/2)
      addPartToGroup(g, new THREE.BoxGeometry(extrLen, t, c),     color, wireframe, 0, -b/2+t/2, 0);
      if (n.includes("u_channel")) {
        // Top flange
        addPartToGroup(g, new THREE.BoxGeometry(extrLen, t, c),   color, wireframe, 0, b/2-t/2,  0);
      }
    } else if (la === "y") {
      // Extrude along Y. Cross-section in XZ.
      // Web: thin (t) in X, full d in Z, at left (X = -w/2 + t/2)
      addPartToGroup(g, new THREE.BoxGeometry(t, extrLen, c),     color, wireframe, -b/2+t/2, 0, 0);
      // Bottom flange: full w in X, thin (t) in Z, at back (Z = -d/2 + t/2)
      addPartToGroup(g, new THREE.BoxGeometry(b, extrLen, t),     color, wireframe, 0,        0, -c/2+t/2);
      if (n.includes("u_channel")) {
        addPartToGroup(g, new THREE.BoxGeometry(b, extrLen, t),   color, wireframe, 0,        0, c/2-t/2);
      }
    } else {
      // Extrude along Z. Cross-section in XY.
      // Web: thin (t) in X, full h in Y, at left (X = -w/2 + t/2)
      addPartToGroup(g, new THREE.BoxGeometry(t, b, extrLen),     color, wireframe, -c/2+t/2, 0,        0);
      // Bottom flange: full w in X, thin (t) in Y, at bottom (Y = -h/2 + t/2)
      addPartToGroup(g, new THREE.BoxGeometry(c, t, extrLen),     color, wireframe, 0,        -b/2+t/2, 0);
      if (n.includes("u_channel")) {
        addPartToGroup(g, new THREE.BoxGeometry(c, t, extrLen),   color, wireframe, 0,        b/2-t/2,  0);
      }
    }

    return g;
  }

  // ── Default: plain box with hardware colour ──────────────────────────
  addPartToGroup(g, new THREE.BoxGeometry(w, h, d), color, wireframe);
  return g;
}

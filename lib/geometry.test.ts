import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { inferRole } from "./cabinet3d";
import {
  contentAddress, leavesToSkuPanels, meshContentRef, meshesForLeaves, partsToLeaves, partsToSkuPanels,
} from "./geometry";
import { cabinetToParts, type V3Json } from "./sketchup/parseV3";

const json = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../tasks/test-exports/Accessories_Codes.json", import.meta.url)),
    "utf8",
  ),
) as V3Json;
const { panels, fittings } = cabinetToParts(json.roots[0]);
const parts = [...panels, ...fittings];

describe("saved geometry draws the same as the import preview", () => {
  it("keeps every leaf: panels and fittings", () => {
    expect(parts).toHaveLength(22);
    expect(partsToLeaves(parts)).toHaveLength(22);
  });

  it("gives Cabinet3D exactly what the import screens used to build by hand", () => {
    // The mapping the two import screens had inline before Stage 19a.
    const before = parts.map((part) => ({
      part_role: inferRole(part.name),
      part_name: part.name,
      su_width_mm: part.size.x,
      su_height_mm: part.size.y,
      su_depth_mm: part.size.z,
      pos: part.pos,
      cuts: part.cuts,
      axes: part.axes,
      outline_mm: part.outline_mm,
      profile_mm: part.profile_mm,
      mesh_ref: part.mesh_ref,
      tooling_mm: part.tooling,
    }));
    expect(partsToSkuPanels(parts)).toEqual(before);
  });

  it("survives the round trip through the database (JSON) unchanged", () => {
    const stored = JSON.parse(JSON.stringify(partsToLeaves(parts)));
    expect(leavesToSkuPanels(stored)).toEqual(partsToSkuPanels(parts));
  });

  it("keeps positions as exported (SketchUp world, not re-centred or re-ordered)", () => {
    const leg = partsToLeaves(parts).find((l) => l.name.startsWith("03-09-04-0007__Leg_12cm#480"))!;
    expect(leg.pos_mm).toEqual({ x: 11737.5, y: 643, z: 55 });
    expect(leg.size_mm).toEqual({ x: 60, y: 60, z: 110 });
    expect(leg.mesh_ref).toMatch(/^mesh_[0-9a-f]+$/);
  });
});

describe("meshesForLeaves", () => {
  it("returns exactly the meshes the leaves refer to", () => {
    const leaves = partsToLeaves(parts);
    const refs = new Set(leaves.map((l) => l.mesh_ref).filter(Boolean));
    const picked = meshesForLeaves(leaves, json.meshes);
    expect(new Set(Object.keys(picked))).toEqual(refs);
    expect(Object.keys(picked).length).toBeGreaterThan(0);
  });
  it("drops meshes no leaf uses, and copes with a file that has none", () => {
    const leaves = partsToLeaves(parts).filter((l) => !l.mesh_ref);
    expect(meshesForLeaves(leaves, json.meshes)).toEqual({});
    expect(meshesForLeaves(partsToLeaves(parts), undefined)).toEqual({});
  });
});

describe("content keys for stored meshes", () => {
  const tri = { vertices: [[0, 0, 0], [10, 0, 0], [0, 10, 0]] as [number, number, number][],
                triangles: [[0, 1, 2]] as [number, number, number][] };

  it("is the same for the same data and looks like a mesh key", async () => {
    const a = await meshContentRef(tri);
    const b = await meshContentRef(JSON.parse(JSON.stringify(tri)));
    expect(a).toBe(b);
    expect(a).toMatch(/^mesh_[0-9a-f]{32}$/);
  });

  it("differs when a triangle faces the other way (the export's own hash does not)", async () => {
    const flipped = { vertices: tri.vertices, triangles: [[0, 2, 1]] as [number, number, number][] };
    expect(await meshContentRef(flipped)).not.toBe(await meshContentRef(tri));
  });

  it("differs when a vertex moves", async () => {
    const moved = { vertices: [[0, 0, 0], [10, 0, 0], [0, 10.5, 0]] as [number, number, number][],
                    triangles: tri.triangles };
    expect(await meshContentRef(moved)).not.toBe(await meshContentRef(tri));
  });

  it("re-keys the real export: every leaf still finds its own mesh data", async () => {
    const before = partsToLeaves(parts);
    const { leaves, meshes } = await contentAddress(before, json.meshes);
    expect(leaves).toHaveLength(before.length);
    for (let i = 0; i < before.length; i++) {
      const oldRef = before[i].mesh_ref;
      if (!oldRef) { expect(leaves[i].mesh_ref).toBeUndefined(); continue; }
      expect(leaves[i].mesh_ref).toMatch(/^mesh_[0-9a-f]{32}$/);
      expect(meshes[leaves[i].mesh_ref!]).toBe(json.meshes![oldRef]);
      // nothing but the key changed
      expect({ ...leaves[i], mesh_ref: oldRef }).toEqual(before[i]);
    }
    // only referenced meshes are kept
    expect(Object.keys(meshes).length).toBeLessThanOrEqual(Object.keys(json.meshes!).length);
  });

  it("identical mesh data under two export refs ends up as ONE stored mesh", async () => {
    const leaves = [
      { name: "A", size_mm: { x: 1, y: 1, z: 1 }, pos_mm: { x: 0, y: 0, z: 0 }, mesh_ref: "mesh_aaa" },
      { name: "B", size_mm: { x: 1, y: 1, z: 1 }, pos_mm: { x: 5, y: 0, z: 0 }, mesh_ref: "mesh_bbb" },
    ];
    const out = await contentAddress(leaves, { mesh_aaa: tri, mesh_bbb: JSON.parse(JSON.stringify(tri)) });
    expect(Object.keys(out.meshes)).toHaveLength(1);
    expect(out.leaves[0].mesh_ref).toBe(out.leaves[1].mesh_ref);
  });

  it("leaves a ref alone when its mesh is missing, so the database refuses the save", async () => {
    const leaves = [{ name: "A", size_mm: { x: 1, y: 1, z: 1 }, pos_mm: { x: 0, y: 0, z: 0 }, mesh_ref: "mesh_gone" }];
    const out = await contentAddress(leaves, {});
    expect(out.leaves[0].mesh_ref).toBe("mesh_gone");
    expect(out.meshes).toEqual({});
  });
});

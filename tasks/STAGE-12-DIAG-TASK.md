# STAGE 12-DIAG — Why do rotated cabinets scatter? (diagnostic, log-only)

**Type:** Diagnostic only. Do NOT change placement, parsing, or build
logic. Add temporary, clearly-marked logging, then report. No fix here.

**Files:** `lib/cabinet3d.ts`, `components/Cabinet3D.tsx`
(and `lib/sketchup/parseV3.ts` only to read, not edit).

---

## Confirmed facts (from JSON, do not re-litigate)

- Export schema is v6.x / 0.6.8. Both test cabinets have **20/20 leaves
  carrying `axes`** — the "every panel has axes" gate in
  `buildBoxesFromSkuPanels` SHOULD pass.
- Rotated cabinet: parts carry non-identity `axes`
  (`x:[0,-1,0], y:[1,0,0], z:[0,0,1]` — 90° about Z).
- Original cabinet: all `axes` identity.
- Symptom: original cabinet places parts correctly; rotated cabinet
  scatters parts (panels splayed, Back/doors/drawer-box off).
- The Stage 9b oriented-box path was built to handle exactly this.

The question: is the 9b oriented path actually RUNNING on these imports,
and if so, what transform is each scattered part receiving?

## Step 1 — Is the oriented path engaging?

In `lib/cabinet3d.ts`, find the branch that chooses between the oriented
build (`buildBoxesFromOrientedPanels`) and the legacy axis-aligned build.
Add a one-time log at that decision point:

    // TEMP-12DIAG — remove after diagnosis
    console.log('[12DIAG] path decision', {
      total_panels,
      panels_with_axes,           // how many have .axes
      every_has_axes,             // the gate boolean actually evaluated
      chosen_path,                // 'oriented' | 'legacy'
    });

Critically: log the SAME `axes`-presence check the gate uses, computed on
the SkuPanel3D objects AFTER parsing — not on the raw JSON. The suspicion
is that `axes` survives in JSON but is dropped or renamed during parsing
(parseV3 / the importer mapping), so the gate sees `undefined` and falls
back to legacy. This log proves or kills that theory.

## Step 2 — If oriented path runs: log the per-part transform

For 3 rotated parts (`Back#197`, `Bottom#149`, and one door if present),
in the oriented build, log:

    // TEMP-12DIAG
    console.log('[12DIAG] oriented part', part_name, {
      axes_in,            // axes as received on the panel
      localSize,          // (su_width,su_height,su_depth) used as box size
      pos_in,             // pos_mm received
      orient9,            // the 9-number C·Rworld basis emitted
      center_three,       // final recentred center x/y/z
    });

## Step 3 — At the renderer, log what actually hits the mesh

In `components/Cabinet3D.tsx`, where `box.orient` is applied to the mesh,
for those same parts log:

    // TEMP-12DIAG
    if (box.orient) console.log('[12DIAG] mesh', box.part_name, {
      orient9: box.orient,
      quaternion: mesh.quaternion.toArray(),
      position: [box.x, box.y, box.z],
    });
    else console.log('[12DIAG] mesh NO ORIENT', box.part_name);

The `else` branch matters: if these rotated parts log "NO ORIENT", the
orientation never reached the renderer — that localises the break to the
build/parse layer, not the renderer.

## Step 4 — Run and report

Clean restart (kill dev server, `Remove-Item -Recurse -Force .next`,
`npm run dev`, `Ctrl+Shift+R`). Import the **rotated** cabinet. Capture
all `[12DIAG]` output and report it verbatim.

Then state which of these is true, with the log lines that prove it:
- (A) Gate sees `every_has_axes=false` → falls back to legacy (parse drops `axes`)
- (B) Oriented path runs but `orient9` / `center_three` are wrong
- (C) Oriented path runs, orient is correct, but renderer drops it
- (D) Something else — describe

Do NOT attempt a fix. Leave the TEMP-12DIAG logs in place for now.

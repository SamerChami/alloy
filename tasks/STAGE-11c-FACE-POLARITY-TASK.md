# Stage 11c — Fix `face` polarity on cuts & tooling (cabinet-relative, not local midpoint)

Full-cabinet export (`BDR.K3.85`, v0.6.4) shows geometry detection is solid but the
`face` label (front/back) is unreliable: mirrored side panels get opposite faces, and the
shelf pocket opens on the wrong face. Extension-side (`alloy_export/main.rb`), surgical.
Bump VERSION `0.6.5`; SCHEMA stays `alloy.sketchup.v6.3`.

## Evidence (verified in JSON + Samer's annotated SketchUp images)
| part | detected face | truth (SketchUp) | verdict |
|------|---------------|------------------|---------|
| Left_Side#156 groove  | front | inner groove | ✗ |
| Right_Side#156 groove | back  | inner groove | ✗ (opposite label to Left — same physical side) |
| Mobile_Shelve#89 pocket | front | "depth 9mm **from top**" (back/+t side) | ✗ |
| W_BDR_B / RS / LS rabbets | front | inner | ✓ |
| Top_Back#110 rabbet | front | inner groove | ✓ |
| Bottom#149 rabbet | front | — | ✓ |
| Drawer_Front#161 groove | front | inner groove | ✓ |
| Door#553 bore through | both | through hole | ✓ (through = both, fine) |

Both side panels have IDENTICAL axes (plain identity — no mirror in the axes) yet got
opposite `face`. So this is NOT a handedness bug. The groove physically sits on the
cabinet-INTERIOR side of each side panel, which is +X local on one and −X local on the
other; the current `face = (t < th/2) ? "front" : "back"` test faithfully reports a LOCAL
position that does not correspond to a stable physical face.

## Root cause
`face` is derived from the feature's position along the panel's LOCAL thickness axis
(`t < th/2`). "front/back" in local space does not track "which physical side the feature
opens on" once panels are placed/rotated/mirrored in the cabinet. The label must be
anchored to WORLD / cabinet geometry.

## Fix — assign `face` by cabinet-relative direction (same principle as the cut-recess
## interiorSign fix)

For each feature (groove/rabbet/pocket — anything blind, i.e. NOT through):
1. Compute the feature's offset side along the panel thickness axis in LOCAL space as
   today (which of the two big faces it sits nearer — call it the "open side" unit normal
   `n_local` = +t or −t, pointing OUT of the panel on the side the feature opens).
   - A groove/pocket opens on the face it's cut INTO; its open normal points from the
     floor-face toward the nearer big face.
2. Transform `n_local` to WORLD using the part's transformation (the same transform used
   elsewhere; rotation only, normalize). → `n_world`.
3. Get the panel center in world (`pc_world`) and the CABINET/root center in world
   (`cab_world`) — the bbox center of the whole exported assembly (root node), computed
   once.
4. `interior = cab_world - pc_world` (direction from panel toward cabinet interior).
5. **If `n_world · interior > 0`** the feature opens toward the cabinet interior →
   emit `face: "inner"`. Else `face: "outer"`.

→ CHANGE the vocabulary from `front`/`back` to **`inner`/`outer`**, which is physically
meaningful and mirror-stable. Through features stay `face: "both"`.

(If you prefer to keep `front`/`back` strings to avoid a viewer change, then at minimum
make the determination use `n_world · interior` so BOTH side panels resolve to the SAME
label and the shelf pocket resolves to the interior/top side. But `inner`/`outer` is the
correct fix — see viewer note below.)

### Why this fixes each case
- Left & Right side grooves: both open toward cabinet interior → both `inner`. (Today
  they split front/back.)
- Shelf pocket: opens upward toward the cabinet interior (the "from top" side) →
  `inner`, matching "depth 9mm from top".
- Rabbets/Top_Back/Drawer groove: already interior-facing → stay `inner` (no visible
  change).

## Door bore diameter (flag, not necessarily a fix)
`Door#553` bore detected dia **170.7mm** — large for a finger-pull. Samer to confirm
against the real hole. If SketchUp shows a smaller Ø, the circle-fit may be picking up an
outer loop or a chamfer ring; if so, log the inner-loop point count + fitted radius for
that part so we can see what it's fitting. Do NOT change fit logic blindly — diagnose with
a log first (per project discipline: runtime logs over guessing).

## Version
`VERSION = "0.6.5"`; SCHEMA stays `alloy.sketchup.v6.3`. Header note: "v0.6.5 = 11c:
face polarity now cabinet-relative (inner/outer), fixes mirrored side panels + shelf
pocket face".

## Viewer follow-up (only if switching to inner/outer)
`components/Cabinet3D.tsx` currently reads `face === "front"/"back"` to choose the
thickness-offset sign for groove/pocket placement. If we switch to `inner`/`outer`, update
that read: resolve the offset sign from `inner`/`outer` against the panel's
cabinet-interior direction (the viewer already has panel position + cabinet center for the
existing interiorSign cut logic — reuse it). Keep `both` = through. This is a SMALL
companion change; do it in the SAME stage so the viewer doesn't break on the renamed value.
If you keep front/back strings instead, no viewer change — but you lose physical meaning.

## Verify (JSON + viewer)
Re-export `BDR.K3.85`:
- Left_Side and Right_Side grooves BOTH `inner` (same label).
- Mobile_Shelve pocket `inner` (opens on the "from top" side).
- Rabbets/drawer groove unchanged (still interior).
- Door bore still `both`; report its fitted diameter + inner-loop point count.
Then in the viewer (clean restart): every groove/rabbet sits on the correct physical face
(cross-check against Samer's annotated images 5–11); shelf pocket on the top face; no
groove on an outer/visible face. Bore still see-through, leg meshes intact.

## Clean restart
Kill Next.js, `Remove-Item -Recurse -Force .next`, `npm run dev` fresh, Ctrl+Shift+R.

## Commit
"Stage 11c: cabinet-relative face polarity (inner/outer) for cuts & tooling; fixes mirrored
side panels and shelf pocket face (v0.6.5)"

## Report
Per-part face labels after re-export (table), confirmation both side grooves match, shelf
pocket on top, and the Door bore fitted diameter + point count for the 170mm check.

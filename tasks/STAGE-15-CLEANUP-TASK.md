# Stage 15 Working-Tree Cleanup

## Goal
Triage the dirty working tree left after Stage 15. Remove Stage 14 diagnostic
scaffolding, drop stale zip artefacts, keep legitimate changes. Result: a clean
tree committed, with `Cabinet3D.tsx` back to its self-deriving baseline (no 15c
work started).

## Scope — exactly these changes, nothing else

### 1. Delete three `[14DIAG]` console.log blocks (no behavioural effect)

**components/Cabinet3D.tsx** — delete BOTH blocks:

- The block starting with the comment
  `// [14DIAG] orient log — non-identity and Top_Back (outline path)`.
  It is a `{ ... }` block in the outline render path, sitting immediately after
  the `new THREE.Matrix4()` / `rm.set(...)` construction and ending just before
  `if (isWireframe) {`. Delete the comment line and the entire `{ ... }` block.

- The block starting with the comment
  `// [14DIAG] orient log — non-identity and Top_Back (box path)`.
  It is an `if (box.orient) { ... }` block sitting between
  `const geo = new THREE.BoxGeometry(box.w, box.h, box.d);` and the next
  `if (isWireframe) {`. Delete the comment line and the entire `if (...) { ... }`
  block.

**lib/cabinet3d.ts** — delete ONE block:

- The block starting with the comment
  `// [14DIAG] raw-axes log — non-identity parts + Top_Back control`.
  It is a `{ ... }` block sitting between the `col2[...]` array-literal close `];`
  and the `// World-space center in three coords` comment. Delete the comment line
  and the entire `{ ... }` block.

> DO NOT touch the `[12FIX]` `console.warn` lines in `lib/cabinet3d.ts` — those are
> legitimate fallback guards and must stay.

### 2. Stage the stale zip deletions (already deleted on disk)
- `Project Knowledge/files.zip`
- `Project Knowledge/files2.zip`
- `files.zip`

### 3. Leave untouched (these are correct as-is)
- `lib/i18n.ts` — benign label edit, keep
- `lib/sketchup/parseV3.ts` — clean, keep

## Verification (must pass before commit)
1. `git diff | grep -n "14DIAG\|DIAG axes"` returns NOTHING.
2. `npx tsc --noEmit` passes (no type errors introduced by the deletions).
3. The three deletions removed only `console.log` scaffolding — no shared
   variables referenced elsewhere, no surrounding logic changed.

## Commit
Stage everything, then:

```
git commit -m "chore: remove Stage 14 diag scaffolding; drop stale zip artefacts"
```

Do NOT push. Report the final `git status` and `git diff --stat` so I can review.

## After commit
Restart the dev server clean: stop any running `npm run dev`, start fresh, and
remind me to hard-refresh the browser (Ctrl+Shift+R).

# Stage 17b — App Sweep: debug logs, orphan importer, tree hygiene

**Model:** Sonnet.
**Phase:** 0 (Lockdown). Independent of 17a; can run any time.

## Goal
Remove leftover debug output from the web app, delete the orphaned SketchUp
v2 bulk importer, and leave a clean working tree. No behaviour change.

## Scope — exactly these changes, nothing else

### 1. `components/Cabinet3D.tsx` — delete TWO lines
Delete the two `console.log` lines that start with `console.log("[11D-CHK]"`.
- One is in the wireframe path, immediately before
  `addCutMeshes(lines, box.cuts, ...`.
- One is in the solid path, immediately before
  `addCutMeshes(mesh, box.cuts, ...`.
Delete only the `console.log(...)` line in each place. The surrounding
`if (showCuts && box.cuts && box.cuts.length > 0) {` and the `addCutMeshes`
call stay exactly as they are.

### 2. `app/(app)/products/ProductForm.tsx` — delete ONE block
Inside the `.then(({ data }) => { ... })` that loads `bom_lines`, delete from
the comment line
`// debug: report how many cuts were loaded (remove after 8b ships)`
through the closing `}` of the `if (cutsTotal > 0) { ... }` block. That is
the comment, the `cutsTotal` const, the `panelsWithCuts` const, and the `if`
block. `setBomLines(lines);` and `setLoadingBom(false);` stay.

### 3. Delete the orphaned v2 importer
First run a search for references:

    git grep -n "import-sketchup" -- app lib components

Every hit must be either inside `app/(app)/products/import-sketchup/` itself,
or contain `import-sketchup-single` or `import-sketchup-project`. If there is
ANY other hit, STOP and report it; do not delete anything.

If clean, delete the whole folder `app/(app)/products/import-sketchup/`
(`page.tsx` and `SketchupImportShell.tsx`).

Leave `lib/i18n.ts` alone, even if some keys are now unused.

### 4. `.gitignore` — append if missing
```
extension/*_diag.rbz
.claude/settings.local.json
```

### 5. Modified task files
`git status` shows `tasks/STAGE-15-CLEANUP-TASK.md`,
`tasks/STAGE-16-DIAG-GEOMETRY.md`, `tasks/STAGE-16-MESH-EMIT-TASK.md` as
modified. Run `git diff --stat -- tasks/` and
`git diff --ignore-all-space --ignore-cr-at-eol --stat -- tasks/`.
- If the second command shows no changes (line endings only):
  `git checkout -- tasks/STAGE-15-CLEANUP-TASK.md tasks/STAGE-16-DIAG-GEOMETRY.md tasks/STAGE-16-MESH-EMIT-TASK.md`
- If there are real text changes: leave them, and list them in the report.

### 6. Delete the stray empty folder
There is an empty folder under `app/` whose name starts with `{login,dashboard,`
(a `mkdir` brace expansion that went wrong). Confirm it is empty:

    Get-ChildItem -LiteralPath app -Directory | Where-Object Name -like '{*'
    Get-ChildItem -LiteralPath (Get-ChildItem -LiteralPath app -Directory | Where-Object Name -like '{*').FullName

If the second command lists nothing, delete that one folder with
`Remove-Item -LiteralPath <its full path>`. If it contains anything, STOP and
report. Do not touch `app/(app)` or `app/login`.

## DO NOT
- Do NOT touch the `[12FIX]` `console.warn` lines in `lib/cabinet3d.ts`;
  they are fallback guards.
- Do NOT touch `extension/` (the `ALLOY_DIAG` block and `_loop_pts` field are
  removed in Phase 2 with a proper version bump and `.rbz` rebuild).
- Do NOT touch `lib/3ds/` or `lib/dxf/`.
- Do NOT reformat or reorder anything.

## Verification (must pass before commit)
1. `git grep -n "11D-CHK"` returns nothing.
2. `git grep -n "remove after 8b"` returns nothing.
3. `Test-Path "app/(app)/products/import-sketchup"` returns `False`.
4. `npx tsc --noEmit` passes.
5. `npm run build` passes, and the route list no longer contains
   `/products/import-sketchup` (the `-single` and `-project` routes remain).
6. Clean restart, open a SketchUp-imported product: 3D preview and cuts
   still display; browser console shows no `[11D-CHK]` lines.

## Commit
```
git add -A
git commit -m "chore: Stage 17b — remove debug logs, retire v2 SketchUp importer"
git push
```

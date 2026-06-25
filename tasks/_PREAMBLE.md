## Execution Preamble (read first, every run)

**Before editing — read in this order:**
1. `CLAUDE.MD` (stack facts, mm rule, Z-up→Y-up mapping, `code` join key)
2. The relevant schema/spec file for this layer:
   - Ruby export → `03-sketchup-export-schema.md` + `04-ruby-extension-spec.md`
   - Parser/viewer → current schema is v0.6.7; honour the documented JSON contract
3. This task file in full, before touching any code.

**Ground rules:**
- Dimensions are in **millimeters**. Never introduce inches or unit guesses.
- Basis swap is **exact and consistent**: `three.x = su.x`, `three.y = su.z`, `three.z = −su.y`. The `−su.y` negation applies to **every** axis-derived value, including single-component reads on thickness-on-Y panels — do not drop it.
- **Surgical diffs only.** Edit the named function/region with targeted replacements. Do **not** rewrite whole files — especially large ones like `Cabinet3D.tsx`. If a change seems to need a full rewrite, stop and report why instead.
- Touch only what this task names. Leave unrelated code, formatting, and imports alone.
- Schema changes are **additive** where possible; bump the `alloy.sketchup.vX` version if the contract changes.

**Verification (required — do not skip):**
- State, before editing, how success will be confirmed: which JSON field / loop-point count / geometry hash / face label / console log proves it.
- Add the diagnostic logging the task needs proactively; prefer **runtime logs over static reasoning**.
- For export changes: confirm field presence and values in the JSON **before** any viewer work.
- Report what you changed as a short diff summary, then the verification result.

**Clean restart after changes (do not rely on hot-reload):**
1. Kill the Next.js dev server.
2. `Remove-Item -Recurse -Force .next`
3. `npm run dev` (fresh)
4. Browser hard-refresh: `Ctrl+Shift+R`

**If blocked or uncertain:** stop and report findings rather than guessing or making a sweeping edit.

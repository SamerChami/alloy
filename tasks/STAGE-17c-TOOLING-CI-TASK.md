# Stage 17c — Lint, Tests, Type-check, CI

**Model:** Sonnet.
**Phase:** 0 (Lockdown). Run after 17b (so lint does not report on deleted
files). Independent of 17a.

## Goal
Give the project a safety net before the money and security work starts:
a working linter, a test runner with the first pricing tests, and a GitHub
Actions workflow that runs lint, type-check, tests and build on every push.

No app behaviour changes in this stage.

## Scope

### 1. ESLint
- `package.json` has `"lint": "next lint"` but no ESLint installed. Install
  `eslint` and the `eslint-config-next` version matching the installed
  `next` (15.5.x) as devDependencies.
- Create the config the way the official Next.js docs describe for this
  Next version (flat config `eslint.config.mjs`, extending
  `next/core-web-vitals` and `next/typescript`). Ignore `.next/`,
  `node_modules/`, `extension/`, `supabase/`.
- If `next lint` prints a deprecation notice on this version, change the
  script to `"lint": "eslint ."`.
- Run it. Policy for what it finds:
  - Fix ONLY trivial findings: unused imports, unused local variables that
    are plainly dead.
  - Do NOT refactor, do not change hook dependency arrays, do not touch
    `components/Cabinet3D.tsx` or `lib/cabinet3d.ts` logic. For rules that
    fire there or need real changes (`react-hooks/exhaustive-deps`,
    `no-explicit-any`, etc.), set the rule to `"warn"` in the config.
  - Goal: `npm run lint` exits 0. Report the remaining warning count per rule.

### 2. Type-check script
Add to `package.json` scripts: `"typecheck": "tsc --noEmit"`.

### 3. Vitest + first tests
- Install `vitest` as a devDependency. Add script `"test": "vitest run"`.
- Create `vitest.config.ts` with the `@` alias pointing at the repo root
  (same as `tsconfig.json` `paths`), environment `node`.
- Create `lib/pricing.test.ts`. These tests PIN CURRENT BEHAVIOUR. Do not
  change `lib/pricing.ts` in this stage.

  | Call | Expected |
  |---|---|
  | `panelPricePerM2(2440, 1220, 22.5)` | `7.558` |
  | `panelPricePerM2(0, 1220, 22.5)` | `0` |
  | `panelPartCost({ widthMm: 720, heightMm: 580, qty: 2, pricePerM2: 7.558, bandedLenM: 1.44, bandingRate: 0.35 })` | `{ material: 6.312, banding: 1.008 }` |
  | `componentPartCost(1.75, 2)` | `3.5` |
  | `rollup([{ material: 6.312, banding: 1.008 }], [3.5], { laborJod: 5, marginPct: 30 })` | `{ materials: 7.32, components: 3.5, base: 10.82, calcPrice: 20.566 }` |

  Use `toBeCloseTo(x, 3)` for the numbers. If any actual value differs from
  this table, STOP and report the actual value; do not edit the table or the
  code to make it pass.

  Note: the comment block at the bottom of `lib/pricing.ts` says 7.559 and
  20.567. The code gives 7.558 and 20.566 because the price per m² is
  rounded before it is multiplied. That is a known issue scheduled for
  Phase 1. Leave the comment and the code alone; add one line above the
  test table: `// Pins current behaviour. Rounding fix is tracked for Phase 1.`

### 4. CI workflow
Create `.github/workflows/ci.yml`:
- Triggers: `push` and `pull_request`.
- One job on `ubuntu-latest`, Node 22, `npm ci`, then in order:
  `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- For the build step set placeholder env values so no secret is needed:
  `NEXT_PUBLIC_SUPABASE_URL: https://placeholder.supabase.co` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY: placeholder`.
- If the build cannot pass with placeholders (a page needs the database at
  build time), STOP and report which page; do not add real keys.

### 5. `CLAUDE.md` — one edit
In the `## Verifying work` section, replace the line
`- \`npm run build\` MUST pass before any change is considered done.`
with
`- \`npm run lint\`, \`npm run typecheck\`, \`npm test\` and \`npm run build\` MUST all pass before any change is considered done.`

## DO NOT
- Do not change any runtime logic.
- Do not add Prettier or reformat files.
- Do not add real Supabase keys anywhere.

## Verification (must pass before commit)
1. `npm run lint` exits 0.
2. `npm run typecheck` exits 0.
3. `npm test` shows 5 passing tests.
4. `npm run build` passes.
5. After `git push`, the Actions tab on GitHub shows the CI run green.
   If it is red, fix the workflow (not the app) and push again.

## Commit
```
git add -A
git commit -m "chore: Stage 17c — ESLint, Vitest pricing tests, typecheck, CI"
git push
```

## Report back
Lint warning counts per rule, test output, and the CI run result.

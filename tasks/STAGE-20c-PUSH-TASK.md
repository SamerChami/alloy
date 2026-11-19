# Stage 20c — push to GitHub

Stage 20c (SketchUp project import into a draft quotation) is built and tested:
database checks I0–I11 as wanted on the live database, tester run A–K all pass
on `04e0140`. This task only pushes. No code changes.

## Before pushing — check, do not fix
1. `git status -sb` — branch `main`. The only allowed uncommitted change is this
   task file (`tasks/STAGE-20c-PUSH-TASK.md`, untracked). An empty `public/`
   folder may exist (git does not list it): leave it. Anything else: STOP and
   report.
2. `git fetch origin`, then `git log --oneline origin/main..main` must list exactly
   these two, in this order (newest first):
   - `04e0140` Stage 20c-2
   - `4339bad` Stage 20c-1
3. `git log --oneline main..origin/main` must be empty. If the remote has commits
   that are not local: STOP and report. Do not pull, merge or rebase.
4. Stop the dev server if it is running. Run `npm run lint`, `npm run typecheck`,
   `npm test` and `npm run build`. All must pass (5 existing lint warnings
   allowed; the known "Compiled with warnings" about `process.version` in
   `@supabase/supabase-js` is allowed — quote any OTHER warning). If anything
   fails: STOP and report.

## Push
5. Commit this task file alone:
   `chore(tasks): Stage 20c push task`
6. `git push origin main`. A plain push only: no `--force`, no tags, no other
   branches.

## Acceptance
- `git status -sb` shows `## main...origin/main` with nothing ahead or behind and a
  clean tree.
- Report: the three pushed commit hashes (two above plus the task-file commit)
  and the output line of the push.

## Do not
- Change any code, migration, or config.
- Run anything against Supabase (the migration is already applied).
- Force-push, pull, merge or rebase.

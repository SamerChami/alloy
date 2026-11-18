# Stage 20b — push to GitHub

Stage 20b is closed: seven tester runs, all pass on `ceb8744`. This task only pushes.
No code changes.

## Before pushing — check, do not fix
1. `git status -sb` — branch `main`. The only allowed uncommitted change is this
   task file (`tasks/STAGE-20b-PUSH-TASK.md`, untracked). Anything else: STOP and
   report.
2. `git fetch origin`, then `git log --oneline origin/main..main` must list exactly
   these seven, in this order (newest first):
   - `ceb8744` Stage 20b-FIX6
   - `069cf2c` Stage 20b-FIX5
   - `f268981` Stage 20b-FIX4
   - `071b4fc` Stage 20b-FIX3
   - `5e8ceec` Stage 20b-FIX2
   - `4e0be63` Stage 20b-FIX
   - `1106a93` Stage 20b
3. `git log --oneline main..origin/main` must be empty. If the remote has commits
   that are not local: STOP and report. Do not pull, merge or rebase.
4. Run `npm run lint`, typecheck, tests and `npm run build`. All must pass (5
   existing lint warnings allowed). If the build prints "Compiled with warnings",
   quote the warning text in the report. If anything fails: STOP and report.

## Push
5. Commit this task file alone:
   `chore(tasks): Stage 20b push task`
6. `git push origin main`. A plain push only: no `--force`, no tags, no other
   branches.

## Acceptance
- `git status -sb` shows `## main...origin/main` with nothing ahead or behind and a
  clean tree.
- Report: the eight pushed commit hashes (seven above plus the task-file commit),
  the output line of the push, and the build warning text if there was one.

## Do not
- Change any code, migration, or config.
- Run anything against Supabase.
- Force-push, pull, merge or rebase.

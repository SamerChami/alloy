# Claude Code — Launch Prompt

Copy this into Claude Code at the start of each task run. Replace
`<THIS-TASK>` with the actual task filename.

---

Read CLAUDE.MD, then tasks/_PREAMBLE.md, then tasks/<THIS-TASK>.md.
Execute the task exactly as written. Follow the preamble's read-order,
surgical-diff, verification, and clean-restart rules. Report the diff
summary and verification result when done.

---

## Before you run (PowerShell, every new session)

    $env:CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000

Then launch Claude Code in VS Code and paste the prompt above.

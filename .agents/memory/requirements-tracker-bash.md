---
name: Requirements tracker bash workaround
description: The requirements-tracker skill must be run via bash, not code_execution, due to ESM/CJS conflict in this workspace
---

The workspace has `"type": "module"` in package.json, which breaks `require()` / `module.exports` in the code_execution sandbox.

**Rule:** Always use `bash` with `node --input-type=commonjs` to run the requirements tracker.

**Why:** `update-excel.js` uses `module.exports` (CJS). The code_execution sandbox inherits the ESM module scope from package.json, so `require` is not defined there.

**How to apply:** Copy the inline bash heredoc pattern from the SKILL.md Step 3 — replace only the `rows` array content.

---
name: setup-pre-commit
description: "Configure Husky and lint-staged when commit-time checks are requested."
---

# Setup Pre-Commit Hooks

Configure Husky with lint-staged and the project's existing formatting, typecheck, and test commands. Read the package manifest, lockfile, hook files, and formatter configuration; preserve existing commands and use the selected package manager.

Reuse installed tools. Add `husky`, `lint-staged`, and `prettier` as devDependencies only when required by the requested setup. In an unconfigured project, the initializer is `npx husky init` (adapt to the package manager); do not rerun it over customized hooks or replace an existing `prepare` script blindly.

A Husky v9+ pre-commit hook needs no shebang. A typical npm hook is:

```sh
npx lint-staged
npm run typecheck
npm run test
```

Include typecheck and test only if those scripts exist and their cost fits the requested hook policy. Do not create a test framework to fill a missing script.

A minimal lint-staged Prettier rule is:

```json
{
  "*": "prettier --ignore-unknown --write"
}
```

Merge with existing lint-staged rules, preserving unrelated tasks. Reuse the existing Prettier configuration; add preferences only when needed or requested.

Done when the hook is executable, package scripts preserve prior behavior, and the configured commands work on an appropriate sample. `lint-staged` can modify staged files: verify with task-owned changes or an isolated sample and report no-input skips as skips. Do not create a commit just to smoke-test the hook; commit only when requested.

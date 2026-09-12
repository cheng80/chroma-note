---
name: implement-spec
description: "Implement a specification in code."
disable-model-invocation: true
---

Implement the supplied specification through its acceptance criteria. If tickets exist, respect their blocking relationships; a separate ticket graph is not required to implement a clear spec.

Parallelize independent work when delegation is available and useful. Give each subagent its scope, relevant spec and code references, and completion criteria; avoid overlapping edits. Use isolated worktrees when needed for concurrent changes, not by default for every ticket. Review and integrate results before final verification.

Continue until all in-scope behavior is implemented, relevant checks pass, and the integrated diff has been reviewed. Resolve failures introduced by the change; report any acceptance criterion that remains blocked or unverified.

Create commits, push, or create a PR only when requested. If a PR is requested, prepare it after verification; use a draft only for intentionally incomplete work. Clean up only task-owned worktrees within the authorized scope after checking for uncommitted or unmerged work.

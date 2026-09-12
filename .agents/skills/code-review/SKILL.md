---
name: code-review
description: "Review a branch, PR, or working diff against repository standards and requested behavior."
---

# Code Review

Review the requested diff along two axes: **Standards** (applicable repository rules) and **Spec** (requested behavior and scope). Keep findings attributable to each axis.

## Scope and evidence

Use the user's base or PR base when available. Resolve refs before reviewing. For a branch review, `git diff <base>...HEAD` compares against the merge-base; `git log <base>..HEAD --oneline` provides intent. For work in progress, include the requested staged, unstaged, and untracked files; a `HEAD` diff alone omits them. Ask for a base only when it cannot be inferred and changes the review.

Use an explicit spec path first, then relevant issue references or existing local specs. Read `docs/agents/issue-tracker.md` only to resolve tracker references. Missing tracker configuration or a missing spec does not block a code review: state the limitation and use the user's request where available.

Read applicable standards and enough surrounding code and callers to establish concrete consequences. Consider duplication, confusing names, misplaced responsibilities, and speculative abstractions as heuristics, not automatic violations. Repository rules override generic preferences; do not invent mandatory types, interfaces, or refactors to satisfy a smell list.

Independent reviews can be delegated when supported and worthwhile; direct review is sufficient for small diffs. Verify subagent findings against the code before reporting them.

## Result

Report actionable findings with severity, affected location, triggering scenario, and evidence. Distinguish documented-rule violations from judgment calls and missing requirements. Deduplicate overlapping findings while retaining their Standards/Spec attribution.

Done when the entire requested diff has been assessed, findings are grounded, and checks or unavailable evidence are stated. If no actionable findings exist, say so; review alone does not authorize edits or commits.

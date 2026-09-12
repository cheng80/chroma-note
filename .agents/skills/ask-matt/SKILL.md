---
name: ask-matt
description: Ask which skill or flow fits your situation. A router over the skills in this repo.
disable-model-invocation: true
---

# Ask Matt

Recommend the skill that fits the user's requested outcome. These are choices, not a required pipeline; ordinary work can proceed without a skill.

| Need | Skill |
| --- | --- |
| Stress-test a plan | `grilling` or `grill-me`; `grill-with-docs` when recording domain terms and decisions is wanted |
| Resolve uncertainty with a runnable artifact | `prototype` |
| Investigate primary sources | `research` |
| Diagnose an unclear bug or regression | `diagnosing-bugs` |
| Write a spec from an existing discussion | `to-spec` |
| Split work into independently verifiable tickets | `to-tickets` |
| Implement a ticket or a whole spec | `implement` or `implement-spec` |
| Build behavior test-first | `tdd` |
| Review a diff | `code-review` |
| Triage incoming issues | `triage` |
| Map a large effort with unresolved decisions | `wayfinder` |
| Revise domain terms or decisions | `domain-modeling` |
| Design a module interface | `codebase-design` |
| Survey architectural friction | `improve-codebase-architecture` |
| Resolve an active merge or rebase conflict | `resolving-merge-conflicts` |
| Prepare questions for someone else | `to-questionnaire` |
| Script steps only a human can perform | `wizard` |
| Transfer work to another agent | `handoff`; `claude-handoff` for a requested Claude background job |
| Explain the last response more clearly | `wait-what` |
| Teach across sessions | `teach` |
| Collect or shape writing | `writing-fragments`, `writing-beats`, or `writing-shape` |
| Specify recurring workflows | `loop-me` |
| Improve agent instructions from session evidence | `retro` or `writing-for-agents` |
| Configure tracker or domain conventions | `setup-matt-pocock-skills`, only when those conventions are needed |

For an actual context transfer, consult [PHASE-BOUNDARIES.md](PHASE-BOUNDARIES.md). Do not prescribe context resets, ticket creation, or setup merely because a repository exists.

Done when the recommendation explains why it fits and the next action is clear. If implementation is already requested, continue that work within its existing scope.

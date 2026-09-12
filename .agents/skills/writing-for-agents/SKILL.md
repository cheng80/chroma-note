---
name: writing-for-agents
description: "Create or revise agent-facing instructions, skills, or reference documents."
---

# Writing for Agents

Write instructions that change an agent's decisions: local contracts, non-obvious tool knowledge, scope boundaries, and observable completion criteria. Remove repeated generic advice and instructions already enforced by the environment.

- Keep always-loaded instructions and skill descriptions short. A pointer should name its subject and when to read it.
- Read and preserve existing users, callers, and referenced contracts before changing or deleting guidance.
- Specify the outcome and important constraints. Use a fixed sequence only when order prevents a concrete failure.
- Put substantial conditional detail in existing references and link it at the relevant branch. A short self-contained skill needs no extra router or reference file.
- Keep one source for each contract; prefer environment discovery over copying file maps, model limits, or CLI catalogs that become stale.
- Preserve user scope and existing authorization. Do not turn a local fix into a mandatory interview, issue pipeline, review stop, or remote action.

For skill frontmatter and invocation settings, read [SKILL-MECHANICS.md](SKILL-MECHANICS.md); use `skill-creator` when creating or updating a Codex skill.

Done when triggers distinguish the intended task, required references resolve, concrete contracts remain, and the instructions define an observable finish without unrelated work. Validate changed formats and scripts as appropriate; wording checks alone do not demonstrate agent behavior.

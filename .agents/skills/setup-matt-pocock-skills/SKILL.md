---
name: setup-matt-pocock-skills
description: "Configure a repository’s issue tracker, triage, or domain documentation conventions."
disable-model-invocation: true
---

# Configure skill conventions

Configure only the tracker, triage, or domain conventions requested or needed by the selected workflow. This setup is not a prerequisite for ordinary engineering work.

Inspect existing agent instructions and `docs/agents/` before writing. Reuse the current tracker and layout. If a destination is unknown, prepare the content and ask only for the choice that matters; do not infer authorization to publish from the presence of a remote.

## References by configuration

- Local Markdown tracker: [issue-tracker-local.md](issue-tracker-local.md).
- GitHub tracker: [issue-tracker-github.md](issue-tracker-github.md).
- GitLab tracker: [issue-tracker-gitlab.md](issue-tracker-gitlab.md).
- Triage labels, when triage is in use: [triage-labels.md](triage-labels.md). Retain existing names; use the canonical defaults when no override is needed.
- Domain documents, when documenting terms or decisions: [domain.md](domain.md). Preserve the current single- or multi-context structure; a monorepo alone does not require multiple domains.

For another tracker, record the user's actual workflow rather than installing a replacement. Read only the selected templates. Keep external PR/MR triage off unless requested.

Update the requested instruction file, otherwise the existing `AGENTS.md` or `CLAUDE.md`, without duplicating its Agent skills section or overwriting surrounding content. Add conditional pointers to the configuration docs that are actually needed. Do not create empty glossaries, ADRs, or issues during setup.

Done when the selected conventions are documented, their pointers resolve, and existing customizations are preserved. Report changed files and any destination still awaiting clarification.

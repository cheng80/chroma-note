# Domain documents

Read domain documentation when terminology or a design decision affects the task:

- `CONTEXT.md` defines the relevant project's terms. If a `CONTEXT-MAP.md` exists, follow it to the relevant context only.
- `docs/adr/` records decisions; in a multi-context layout, also consider ADRs belonging to the affected context.

Use established terms and surface conflicts with relevant ADRs. Missing documents do not block ordinary work and need no placeholders.

For domain-modeling work, create a glossary only when there are resolved project-specific terms. Record an ADR only for a hard-to-reverse, non-obvious decision with a real trade-off. Use the `domain-modeling` skill's existing formats when writing those documents.

---
name: domain-modeling
description: "Define project domain terms or record domain decisions in CONTEXT.md and ADRs."
---

# Domain Modeling

Clarify and document project-specific concepts and consequential design decisions. Reading an existing glossary is not itself a domain-modeling task.

Use the existing root `CONTEXT.md`, or follow `CONTEXT-MAP.md` to the relevant context. Read only the glossary and ADRs that bear on the topic. Challenge conflicting or overloaded terms with concrete scenarios, and compare claimed behavior with the code when available.

For resolved terms, use [CONTEXT-FORMAT.md](CONTEXT-FORMAT.md). Keep the glossary about domain terms and relationships, not implementation plans or session notes. Create it only when domain documentation is in scope and there is meaningful content to record.

For a decision that is hard to reverse, surprising without context, and the result of a real trade-off, use [ADR-FORMAT.md](ADR-FORMAT.md). Reuse existing decisions; expose conflicts rather than silently overriding them.

Done when the in-scope terminology or decisions are recorded consistently, their implications are clear, and unresolved conflicts are identified. Missing domain files do not require scaffolding for unrelated work.

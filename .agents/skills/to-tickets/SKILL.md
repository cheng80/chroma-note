---
name: to-tickets
description: "Split a plan into verifiable tickets with explicit blocking relationships."
disable-model-invocation: true
---

# To Tickets

Turn the supplied plan, spec, or conversation into independently verifiable tickets with explicit blocking relationships. Read relevant code and contracts only where they affect the breakdown.

Prefer narrow vertical slices that each deliver complete behavior. Use only the layers that the behavior actually needs. Add preparatory refactoring only when required by the implementation, not as a default first ticket.

For a wide mechanical migration that cannot land in independent vertical slices, use expand–migrate–contract: introduce compatibility, migrate callers in coherent batches, then remove the old form after every caller moves. If intermediate batches cannot pass independently, state the shared integration branch and final verification gate.

Use the requested or configured tracker; read `docs/agents/issue-tracker.md` for storage and `docs/agents/triage-labels.md` for statuses. Missing configuration does not require a setup workflow. Resolve consequential ambiguity while preparing the breakdown; do not require another approval for already-requested local ticket creation. Remote publication requires authorization.

## Local ticket contract

Write one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` with blockers first. Preserve existing files and numbering when extending a feature.

```markdown
# NN: Ticket title

Status: ready-for-agent
Blocked by: None

## What to build

The observable behavior this ticket delivers.

## Acceptance criteria

- [ ] An independently verifiable outcome.
```

`Blocked by:` lists the blocking ticket numbers, or `None`. Use the tracker convention for remote dependency links. Include a parent reference when one exists; do not close or modify the parent merely by creating tickets.

Done when all requested behavior is covered, each ticket can be verified, blocking references resolve without cycles, and the saved or published destinations are reported. Leave unresolved requirements visible rather than labelling incomplete tickets agent-ready.

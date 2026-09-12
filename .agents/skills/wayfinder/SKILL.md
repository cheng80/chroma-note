---
name: wayfinder
description: "Map and resolve the open decisions in a large, uncertain effort."
disable-model-invocation: true
---

# Wayfinder

Plan a large effort whose important decisions do not yet fit in a clear implementation plan. Define its destination and scope from the user's request. If the path is already clear, provide the plan without creating a decision map.

Planning is the default: tickets resolve questions. Execute work only when the user has included it in scope. Continue through the requested planning scope rather than stopping after a fixed number of tickets or an arbitrary session boundary.

## Map and ticket contracts

Use `docs/agents/issue-tracker.md`, especially its Wayfinding operations, for map storage, child tickets, blocking, claims, and resolution. If no tracker is configured, use the existing local convention or the bundled local tracker reference; setup is not a prerequisite. Remote writes require authorization.

The map is an index with these sections:

- **Destination**: the observable decision, plan, or outcome that ends the effort.
- **Notes**: standing constraints and relevant source pointers.
- **Decisions so far**: a one-line gist and named link to each resolved ticket; detail lives in that ticket.
- **Not yet specified**: in-scope uncertainty that cannot yet be stated as a precise question.
- **Out of scope**: excluded work and reasons; it does not become future tickets unless the scope changes.

Each child holds a precise question and a type: `research`, `prototype`, `grilling`, or `task`. Tickets with all blockers resolved and no claim form the frontier. Claim before work using the tracker's convention and check for concurrent changes before updating shared files.

## Resolve decisions

Take the user-named ticket, otherwise the first available frontier ticket. Load related ticket details only as needed.

- **Research**: primary-source evidence; use `research` and delegate when useful.
- **Prototype**: a concrete artifact to resolve uncertainty; use `prototype` when runnable UI or logic is needed. Human judgments wait for the actual user.
- **Grilling**: unresolved human decisions; use `grilling`. Use `domain-modeling` only when domain terminology or ADRs are being changed.
- **Task**: work required to unblock a decision, within authorization; record the outcome and source pointers, never secret values.

Record the answer and resolve the ticket, then add a named pointer to Decisions so far. Create newly specifiable tickets and link their blockers once identifiers exist. Reclassify out-of-scope tickets explicitly; preserve their history and other sessions' work.

Done when the destination's material decisions are settled and the remaining implementation scope is clear, or a specific required human decision or external condition blocks further progress. Report unresolved questions without answering on the user's behalf. No automatic research branches, commits, or forced spec-to-ticket pipeline.

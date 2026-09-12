---
name: to-spec
description: "Synthesize an existing discussion into a specification with acceptance criteria."
disable-model-invocation: true
---

Synthesize the current discussion or supplied material into a buildable specification. Use known decisions and relevant code; do not restart an interview or require a test-boundary approval already settled by the request.

Include the problem, desired behavior, concrete acceptance criteria, important interfaces or data contracts, relevant verification, and explicit scope limits. Use user stories or further notes only where useful. Distinguish unresolved decisions from requirements; do not mark a spec agent-ready while a blocking product decision remains.

Keep useful stable identifiers and source pointers. A short prototype snippet can express a state machine or schema more precisely than prose; include only the decision-bearing part.

For tracker storage, read `docs/agents/issue-tracker.md` and the applicable triage mapping. A missing tracker is not a reason to require setup: use the requested local destination or deliver the spec for review. Publish remotely only when authorized.

Done when the spec covers the discussed scope and gives an implementer observable completion criteria. Apply `ready-for-agent` only when it meets that bar and status changes are in scope.

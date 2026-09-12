---
name: retro
description: "Conduct a retrospective on a coding session."
disable-model-invocation: true
---

Review the requested coding session for evidence of improvements to the agent environment. Default to the current conversation; read other session material only as needed and avoid secret-bearing logs.

Look for repeated navigation failures, tool friction, missed checks, stale instructions, and unnecessary context loading. Connect each proposed change to an observed problem. Prefer removing or correcting an existing instruction over adding a universal rule from one anecdote.

Use `writing-for-agents` when editing guidance. Repository standards apply during implementation and review; reviewers still need surrounding context to assess a diff.

Done when recommendations are prioritized with evidence and scope. A retrospective request alone is a report; when edits are also requested, complete and validate those edits within the authorized paths.

---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the behavior described in the supplied spec or tickets, including their acceptance criteria and scope boundaries. Tickets and a particular testing method are not prerequisites for a clear implementation request.

Use existing project checks and test conventions. Use `tdd` when test-first work is requested, and specialized diagnosis or review only when it helps the task.

Continue through implementation, relevant verification, and fixes caused by the change. Done when the acceptance criteria are satisfied and the final diff has been checked; report unresolved blockers or unverified criteria precisely.

Commit, push, or open a PR only within the user's explicit authorization. An implementation request alone does not authorize them.

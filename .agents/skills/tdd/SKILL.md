---
name: tdd
description: "Implement behavior test-first when TDD or red-green-refactor is requested."
---

# Test-Driven Development

Use red → green → refactor when test-first development is requested. Choose an existing public interface that exposes the behavior; agree a new interface only when the choice affects requirements or scope.

Write one behavior test, observe the intended failure, implement enough to pass, then refactor as useful while keeping it green. Repeat for the requested behavior, rather than writing a speculative suite up front.

Expected results come from the specification, worked examples, or independent known values. Exercise observable behavior instead of private methods or mocks of internal collaborators. See [tests.md](tests.md) for examples; consult [mocking.md](mocking.md) when selecting a test double. Use `codebase-design` only if interface design itself needs attention.

Done when the requested behavior is covered by meaningful passing checks and relevant project checks pass. Report actual results and unresolved failures; a separate review skill or repeated seam approval is not a prerequisite.

---
name: diagnosing-bugs
description: "Diagnose unclear bugs, intermittent failures, or performance regressions."
---

# Diagnosing Bugs

Use for bugs whose cause is unclear, intermittent failures, and performance regressions. Establish evidence that distinguishes the reported symptom from nearby failures; code and caller inspection can help construct that evidence.

Prefer an existing failing test, focused command, request replay, or browser scenario. Reduce it when that makes diagnosis easier. For intermittent bugs, record frequency and conditions; for performance, measure a comparable baseline before changing behavior. Do not require a particular tool order, runtime, number of attempts, or hypothesis count.

If only a human can reproduce the symptom, use [scripts/hitl-loop.template.sh](scripts/hitl-loop.template.sh) when a repeatable guided loop helps. Missing reproduction access limits confidence but does not prevent useful read-only investigation. Request the specific missing access or redacted artifact only when needed; do not claim an unobserved reproduction.

Trace the affected function and its callers. Test plausible explanations with probes that distinguish them, changing one relevant variable at a time. Keep temporary instrumentation identifiable. Avoid collecting secrets; use environment variables for credentials and redact sensitive fields from outputs and captured artifacts.

Fix the shared cause within scope. Keep a regression check at a boundary that exercises the actual failure pattern, using the repro when suitable. A test that misses the relevant callers or interaction is not evidence of a fix; explain an untestable gap instead of expanding the architecture automatically.

Done when the original symptom is resolved in the available reproduction, relevant regression checks pass, and temporary instrumentation is removed. Report the cause, evidence, and any remaining verification limit. Without reproducible evidence, explicitly distinguish a supported diagnosis or partial fix from a verified resolution.

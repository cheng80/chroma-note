---
name: improve-codebase-architecture
description: Scan a codebase for deepening opportunities, present them as a visual HTML report, then grill through whichever one you pick.
disable-model-invocation: true
---

# Improve Codebase Architecture

Survey the requested area for concrete architectural friction. If no area is given, use recent changes and recurring maintenance pain to focus the review. Read relevant domain vocabulary and ADRs when they constrain the design.

Use `codebase-design` for the deep-module vocabulary: behavior behind a small interface, leverage for callers, and locality for maintenance. Look for complexity spread across callers, interfaces nearly as complex as their implementation, and tests that cannot reach real failure patterns. Do not manufacture candidates to fill a report.

Present each supported candidate with affected files, the concrete problem, a proposed direction, expected benefit, relevant ADR conflicts, and recommendation strength. Delegate independent exploration when available and worthwhile.

For a visual HTML report, consult [HTML-REPORT.md](HTML-REPORT.md); save it to the OS temporary directory as `architecture-review-<timestamp>.html` and expose its absolute path. Use the user's requested format otherwise. The report should make the candidates and their before/after relationships understandable.

Done when the survey gives an evidence-backed recommendation, or explains that no worthwhile change was found. If further design is requested, use `grilling` only for unresolved user decisions and `codebase-design`'s alternative-interface reference when comparison helps. Create glossary entries or ADRs only when domain documentation is in scope; a survey does not automatically start an interview or implementation.

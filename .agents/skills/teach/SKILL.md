---
name: teach
description: "Teach a concept through focused lessons, with optional persistent learning records."
disable-model-invocation: true
argument-hint: "What would you like to learn about?"
---

# Teach

Teach the requested concept through a focused lesson tied to the learner's goal and demonstrated knowledge. Use the current directory as a persistent teaching workspace only when that is the requested learning mode; a single explanation needs no scaffold.

## Persistent workspace

Reuse existing material and create files only when they hold useful content:

- `MISSION.md`: learning goal and observable success; read [MISSION-FORMAT.md](MISSION-FORMAT.md) when writing it.
- `RESOURCES.md`: annotated trusted sources and optional communities; use [RESOURCES-FORMAT.md](RESOURCES-FORMAT.md).
- `learning-records/0001-slug.md`: demonstrated learning, corrected misconceptions, or stated prior knowledge; use [LEARNING-RECORD-FORMAT.md](LEARNING-RECORD-FORMAT.md). Coverage alone is not learning.
- `GLOSSARY.md`: concepts the learner can use correctly; use [GLOSSARY-FORMAT.md](GLOSSARY-FORMAT.md).
- `lessons/0001-slug.html`: a short interactive lesson with one tangible outcome.
- `reference/`: reusable, printable reference material when it helps future practice.
- `assets/`: reuse existing styles and widgets; extract shared assets when actual reuse warrants it.
- `NOTES.md`: preferences that affect future teaching.

Read only the records relevant to choosing the next lesson. Preserve the learner's stated mission; clarify only missing goals that affect the lesson.

## Lesson quality

Match the difficulty to the learner. Teach the knowledge needed for the next skill, then provide practice and useful feedback. Retrieval, spacing, and interleaving can support retention; select them for the topic rather than imposing a fixed curriculum.

Use trusted sources for factual claims that need verification and link the relevant material. Keep quiz choices free of formatting clues without forcing equal word counts. Use accessible, readable layouts and existing components. Recommend communities only when real-world practice is relevant and welcome.

Done when the requested lesson or explanation is usable, its interactions have been checked where applicable, and meaningful learning evidence is recorded if the persistent mode is in scope. Do not record mastery merely because the lesson was delivered.

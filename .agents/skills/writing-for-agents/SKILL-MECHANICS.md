# Skill mechanics

`SKILL.md` starts with YAML `name` and `description`. Keep the description short and specific to the requested capability; detailed procedures belong in the body or relevant references. Preserve supported optional metadata.

Codex invocation policy lives in `agents/openai.yaml`. Automatic discovery is the default. Preserve an existing `policy.allow_implicit_invocation: false`; change to explicit-only invocation only at the user's request. Do not use another harness's `disable-model-invocation` field as a substitute for Codex policy.

Read only the references needed for the selected task. A router is useful for genuinely different workflows, not as a mandatory chain of skills. Use the host's available skill-loading mechanism or read the referenced skill file; do not assume a tool named `Skill` exists.

Use `skill-creator` for the current Codex schema and validation tools.

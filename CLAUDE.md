# Project Rules

## Prompt Logging (HIGHEST PRIORITY)

Every development-related prompt must be recorded in `prompts.jsonl` at the project root.

### Requirements

- After responding to any development-related prompt, append a new entry to `prompts.jsonl`.
- Use JSON Lines format (one JSON object per line, no trailing newline between entries).
- Never overwrite existing entries — always append.

### Entry Schema

```json
{
  "timestamp": "<ISO 8601 UTC>",
  "tool/model": "Claude",
  "purpose": "<category: Feature implementation | Architecture design | Refactoring | Bug fix | Design | etc.>",
  "prompt": "<full user prompt text>",
  "notes": "<brief summary of what was done or decided>"
}
```

### Trigger Conditions

Log an entry whenever the prompt involves:
- Architecture or system design
- Feature implementation
- Refactoring or code changes
- UI/UX design decisions
- Debugging or bug fixes
- Any other development-related task

### Behavior

1. Respond to the user's request normally.
2. Append the corresponding `prompts.jsonl` entry using the Bash tool (`echo '...' >> prompts.jsonl` or equivalent append operation).
3. Confirm the entry was logged.

---
name: loupe
description: Open an HTML artifact in the user's browser with an interactive annotation layer so they can click elements, select text, and send targeted feedback back to the agent. Triggers when the agent has produced or is about to produce an HTML artifact the user should review interactively: plans, designs, dashboards, reports, or mockups. Also triggers on explicit requests like "review this in loupe" or "open this interactively".
allowed-tools: Bash, Read
---

# Loupe

Interactive HTML review loop. The user clicks elements, selects text, and types feedback in the browser. That feedback comes back to you as JSON.

## Protocol

### 1. Open the artifact

```
node <SKILL_DIR>/assets/cli.js open /absolute/path/to/file.html
```

Prints `{"key":"...","url":"..."}`. The browser opens automatically.

### 2. Block and wait for annotations

```
node <SKILL_DIR>/assets/cli.js poll /absolute/path/to/file.html
```

This **blocks** until the user hits Send in the browser. It prints JSON:

```json
{
  "session": { "key": "...", "filePath": "..." },
  "prompts": [
    {
      "uid": "...",
      "prompt": "The heading is too large",
      "selector": "h1",
      "tag": "note",
      "text": "selected text if any",
      "target": null
    }
  ],
  "next_step": "Address the annotations, then run poll again (optionally with --reply) to continue."
}
```

### 3. Address feedback, then optionally reply and wait again

```
node <SKILL_DIR>/assets/cli.js poll /absolute/path/to/file.html --reply "Done, reduced the heading size."
```

`--reply` sends a message to the browser's conversation log before blocking for the next round.

### Optional: timeout

```
node <SKILL_DIR>/assets/cli.js poll /absolute/path/to/file.html --timeout 60
```

Returns after 60 seconds even if no feedback was submitted (prompts array will be empty).

## Notes

- `open` and `poll` both work by hashing the absolute file path to find the session. Use the same path consistently.
- The server runs detached on port 7429 (override with `LOUPE_PORT`). It auto-starts if not running.
- If you update the HTML file on disk the browser reloads automatically.
- `<SKILL_DIR>` = the directory containing this SKILL.md file.

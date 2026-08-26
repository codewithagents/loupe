---
name: loupe
description: Open an HTML artifact in the user's browser with an interactive annotation layer so they can click elements, select text, and send targeted feedback back to the agent. Triggers when the agent has produced or is about to produce an HTML artifact the user should review interactively: plans, designs, dashboards, reports, or mockups. Also triggers on explicit requests like "review this in loupe" or "open this interactively".
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/cli.js *), Read
---

# Loupe

Interactive HTML review loop. The user clicks elements or selects text in the browser and the feedback comes back to you as JSON. Each annotated element has its own thread; the user can annotate several elements, then send the whole batch at once.

> Note: `${CLAUDE_SKILL_DIR}` is provided by Claude Code and resolves to this skill's directory.

## Protocol

### 1. Open the artifact

```
node ${CLAUDE_SKILL_DIR}/scripts/cli.js open /absolute/path/to/file.html
```

Prints `{"key":"...","url":"..."}`. The browser opens automatically.

### 2. Block and wait for annotations

```
node ${CLAUDE_SKILL_DIR}/scripts/cli.js poll /absolute/path/to/file.html
```

Blocks until the user clicks **Send** in the browser. Returns JSON:

```json
{
  "session": { "key": "...", "filePath": "..." },
  "prompts": [
    {
      "uid": "abc123",
      "threadId": "abc123",
      "prompt": "The heading is too large",
      "selector": "h1",
      "tag": "note",
      "text": "selected text if any",
      "target": null
    },
    {
      "uid": "def456",
      "threadId": "def456",
      "prompt": "This button colour clashes",
      "selector": ".cta-btn",
      "tag": "note",
      "text": null,
      "target": null
    }
  ],
  "next_step": "Address the annotations, then run poll again (optionally with --reply-to <uid> \"text\") to continue."
}
```

Each prompt carries a stable `uid` and a `threadId` (the thread it belongs to). A follow-up note from the user on an existing thread has a new `uid` but the same `threadId` as the original annotation.

### 3. Reply to specific threads and wait again

Use `--reply-to <uid> "text"` to send a reply that appears inside the correct annotation thread in the browser. Repeat the flag to reply to multiple threads in one invocation:

```
node ${CLAUDE_SKILL_DIR}/scripts/cli.js poll /absolute/path/to/file.html \
  --reply-to abc123 "Done, reduced the heading size." \
  --reply-to def456 "Changed the button to blue."
```

This sends the replies first, then blocks for the next round of annotations.

Legacy broadcast (no thread targeting):

```
node ${CLAUDE_SKILL_DIR}/scripts/cli.js poll /absolute/path/to/file.html --reply "All changes applied."
```

### Optional: timeout

```
node ${CLAUDE_SKILL_DIR}/scripts/cli.js poll /absolute/path/to/file.html --timeout 60
```

Returns after 60 seconds even if no feedback was submitted (prompts array will be empty).

## Notes

- `open` and `poll` both work by hashing the absolute file path to find the session. Use the same path consistently.
- The server runs detached on port 7429 (override with `LOUPE_PORT`). It auto-starts if not running.
- If you update the HTML file on disk the browser reloads automatically (only the artifact iframe reloads; the annotation state in the sidebar is preserved).
- Annotation state (sent threads and agent replies) survives a manual full-page refresh. Unsent drafts survive via localStorage.
- The user's browser shows a comment marker on each annotated element. Pending (unsent) markers are amber; sent markers are blue. Clicking a marker opens that thread in the right drawer.

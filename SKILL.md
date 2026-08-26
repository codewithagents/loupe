---
name: loupe
description: Open an HTML artifact in the user's browser with an interactive annotation layer so they can click elements, select text, and send targeted feedback back to the agent. Triggers when the agent has produced or is about to produce an HTML artifact the user should review interactively: plans, designs, dashboards, reports, or mockups. Also triggers on explicit requests like "review this in loupe" or "open this interactively".
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/dist/cli.js *), Read
---

# Loupe

Interactive HTML review loop. The user clicks elements or selects text in the browser and the feedback comes back to you as JSON. Each annotated element has its own thread; the user can annotate several elements, then send the whole batch at once.

> Note: `${CLAUDE_SKILL_DIR}` is provided by Claude Code and resolves to this skill's directory.

## Protocol

### 1. Open the artifact

```
node ${CLAUDE_SKILL_DIR}/dist/cli.js open /absolute/path/to/file.html
```

Prints `{"key":"...","url":"..."}`. The browser opens automatically.

### 2. Block and wait for annotations

```
node ${CLAUDE_SKILL_DIR}/dist/cli.js poll /absolute/path/to/file.html
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

Use `--reply-to <threadId> "text"` to send a reply that appears inside the correct annotation thread in the browser. The `threadId` is the value from the poll response (for a new thread it equals the `uid` of the first prompt). Repeat the flag to reply to multiple threads in one invocation:

```
node ${CLAUDE_SKILL_DIR}/dist/cli.js poll /absolute/path/to/file.html \
  --reply-to abc123 "Done, reduced the heading size." \
  --reply-to def456 "Changed the button to blue."
```

This sends the replies first, then blocks for the next round of annotations.

Legacy broadcast (no thread targeting):

```
node ${CLAUDE_SKILL_DIR}/dist/cli.js poll /absolute/path/to/file.html --reply "All changes applied."
```

### Optional: timeout

```
node ${CLAUDE_SKILL_DIR}/dist/cli.js poll /absolute/path/to/file.html --timeout 60
```

Returns after 60 seconds even if no feedback was submitted (prompts array will be empty).

## Agent loop

Keep polling until the user explicitly says the review is done. Stopping early turns the browser light grey and makes it impossible for the user to send further feedback.

### Run poll in the background

Start `poll` in the background so your turn is not blocked for the full wait. In Claude Code use `run_in_background: true` in your Bash tool call. You will be notified when feedback arrives and can then process the output.

### Multiple threads may arrive together

In Instant mode the user can send several annotations while you are working; they queue on the server and arrive together in the next poll response. The `prompts` array may contain entries for more than one `threadId`. Handle all of them:

1. For each `threadId`, read the prompt and apply the requested change to the HTML file.
2. Send all replies and re-poll in a single invocation:

```
node ${CLAUDE_SKILL_DIR}/dist/cli.js poll /path/to/file.html \
  --reply-to <threadId1> "Done, reduced the heading size." \
  --reply-to <threadId2> "Done, changed the button colour."
```

This sends the replies first, then waits for the next round.

### Re-poll immediately after every round

After applying changes and replying, re-poll right away (background again). Never break the loop voluntarily. A typical round looks like:

1. Background poll returns with one or more threads.
2. Edit the HTML file for each thread.
3. Re-poll with `--reply-to` for each thread (the file save triggers a browser reload automatically).
4. Go to step 1.

### Acknowledge before long work

When you pick up a thread whose work will take more than a moment, post a quick interim ack FIRST so the user sees a response immediately. The interim appears in the thread and is automatically replaced when your real reply arrives.

```
node ${CLAUDE_SKILL_DIR}/dist/cli.js ack /path/to/file.html <threadId> "On it, refactoring the layout now..."
```

Then do the work, then reply for real:

```
node ${CLAUDE_SKILL_DIR}/dist/cli.js poll /path/to/file.html \
  --reply-to <threadId> "Done - moved the nav to a sticky sidebar."
```

The poll call replaces the interim with the real answer. Only ack when there will be a real wait (multi-step edits, analysis). Skip it for trivial or instant replies.

### What the user sees (status light in the top bar)

| Colour | Meaning |
|---|---|
| Green | A poll is open - you are listening; feedback arrives immediately. |
| Amber | You picked up the last batch and are working on it. |
| Grey | No poll open - you have stopped or are between polls. |

The light turns amber the moment poll delivers feedback, and green again as soon as you re-poll. Keep that gap short. If amber persists for more than ~2 minutes with no file edits or replies, the server assumes you stopped and turns the light grey automatically.

## Notes

- `open` and `poll` both work by hashing the absolute file path to find the session. Use the same path consistently.
- The server runs detached on port 7429 (override with `LOUPE_PORT`). It auto-starts if not running.
- If you update the HTML file on disk the browser reloads automatically (only the artifact iframe reloads; the annotation state in the sidebar is preserved).
- Annotation state (sent threads and agent replies) survives a manual full-page refresh. Unsent drafts survive via localStorage.
- The user's browser shows a comment marker on each annotated element. Pending (unsent) markers are amber; sent markers are blue. Clicking a marker opens that thread in the right drawer.

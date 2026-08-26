# Loupe

Interactive HTML feedback loop for Claude Code agents. The agent opens an HTML file in your browser with an injected annotation layer. You click elements, select text, type a note, and hit Send. The agent gets your annotations back as JSON and iterates.

## How it works

1. The agent calls `node scripts/cli.js open <file>`. A local HTTP server starts (port 7429 by default, bound to 127.0.0.1). Your browser opens a review shell with the HTML in an iframe.
2. In the browser: hover to highlight elements, click to select one, select text to capture a quote. Type your feedback in the compose box and hit Send (or Cmd/Ctrl+Enter).
3. The agent is blocked on `node scripts/cli.js poll <file>`. When you send, the poll returns JSON with your annotations.
4. The agent edits the HTML, saves it, the browser reloads automatically, and the loop continues.

## Install

**Recommended (marketplace):**

```
/plugin marketplace add codewithagents/loupe
/plugin install loupe@codewithagents
```

**Local development:**

Option A: point Claude Code at the repo directly:
```bash
claude --plugin-dir path/to/loupe
```

Option B: symlink into your skills directory:
```bash
bash install.sh
```

`install.sh` creates a symlink at `~/.claude/skills/loupe` so Claude Code picks it up as a skill.

## Manual usage (two terminals)

Terminal 1 (agent or you):
```bash
node scripts/cli.js open /path/to/your/file.html
```

Terminal 2 (agent or you):
```bash
node scripts/cli.js poll /path/to/your/file.html
```

When you hit Send in the browser, terminal 2 prints the JSON and exits.

To send a reply to the browser before polling again:
```bash
node scripts/cli.js poll /path/to/your/file.html --reply "I've updated the layout."
```

## Configuration

- `LOUPE_PORT` env var: override the default port (7429).
- `--timeout <sec>`: make poll return after N seconds even with no feedback.

## Requirements

- Node.js 18 or newer.
- Zero runtime npm dependencies.

## License

MIT. See LICENSE.

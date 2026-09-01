# Loupe

Interactive HTML feedback loop for Claude Code agents. The agent opens an HTML file in your browser with an injected annotation layer. You click elements, select text, type a note, and hit Send. The agent gets your annotations back as JSON and iterates.

## How it works

1. The agent calls `node dist/cli.js open <file>`. A local HTTP server starts (port 7429 by default, bound to 127.0.0.1). Your browser opens a review shell with the HTML in an iframe.
2. In the browser: hover to highlight elements, click to select one, select text to capture a quote. Type your feedback in the compose box and hit Send (or Cmd/Ctrl+Enter).
3. The agent is blocked on `node dist/cli.js poll <file>`. When you send, the poll returns JSON with your annotations.
4. The agent edits the HTML, saves it, the browser reloads automatically, and the loop continues.

## Installation

1. `/plugin marketplace add codewithagents/loupe`
2. `/plugin install loupe@codewithagents`
3. If prompted, run `/reload-plugins` to activate.

The skill is invoked as `/loupe:loupe`. Requires Node.js 22+ and has zero runtime dependencies.

## Development

For local development, launch Claude Code pointed at the repo directly:

```bash
claude --plugin-dir ./
```

## Manual usage (two terminals)

Terminal 1 (agent or you):
```bash
node dist/cli.js open /path/to/your/file.html
```

Terminal 2 (agent or you):
```bash
node dist/cli.js poll /path/to/your/file.html
```

When you hit Send in the browser, terminal 2 prints the JSON and exits.

To send a reply to the browser before polling again:
```bash
node dist/cli.js poll /path/to/your/file.html --reply "I've updated the layout."
```

## Configuration

- `LOUPE_PORT` env var: override the default port (7429).
- `--timeout <sec>`: make poll return after N seconds even with no feedback.

## Requirements

- Node.js 22 or newer.
- Zero runtime npm dependencies.

## License

MIT. See LICENSE.

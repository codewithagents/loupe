function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function inline(text) {
    const stored = [];
    // Protect inline code spans before any other transforms.
    text = text.replace(/`([^`]+)`/g, (_, code) => {
        const idx = stored.length;
        stored.push(`<code>${code}</code>`);
        return `\x00${idx}\x00`;
    });
    // Images before links so ![](…) isn't mis-parsed as a link.
    text = text.replace(/!\[([^\]]*)\]\(([^)]*)\)/g, (_, alt, src) => `<img src="${src}" alt="${alt}" style="max-width:100%">`);
    // Links
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => `<a href="${href}">${label}</a>`);
    // Bold ** then __
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    // Italic * then _
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/_([^_]+)_/g, '<em>$1</em>');
    // Restore code placeholders.
    return text.replace(/\x00(\d+)\x00/g, (_, i) => stored[parseInt(i, 10)]);
}
export function renderMarkdown(md) {
    const lines = md.split('\n');
    const out = [];
    let i = 0;
    let inFence = false;
    const fenceLines = [];
    while (i < lines.length) {
        const line = lines[i];
        // Fenced code block toggle.
        if (line.trimStart().startsWith('```')) {
            if (!inFence) {
                inFence = true;
                fenceLines.length = 0;
                i++;
                continue;
            }
            else {
                inFence = false;
                out.push(`<pre><code>${fenceLines.map(esc).join('\n')}</code></pre>`);
                fenceLines.length = 0;
                i++;
                continue;
            }
        }
        if (inFence) {
            fenceLines.push(line);
            i++;
            continue;
        }
        // Blank line: skip (paragraph breaks are implicit).
        if (line.trim() === '') {
            i++;
            continue;
        }
        // ATX heading (1-6 hashes then a space).
        const hm = line.match(/^(#{1,6}) (.*)/);
        if (hm) {
            const level = hm[1].length;
            out.push(`<h${level}>${inline(esc(hm[2]))}</h${level}>`);
            i++;
            continue;
        }
        // Unordered list: consecutive lines starting with "- " or "* ".
        if (/^[*-] /.test(line)) {
            out.push('<ul>');
            while (i < lines.length && /^[*-] /.test(lines[i])) {
                out.push(`<li>${inline(esc(lines[i].slice(2)))}</li>`);
                i++;
            }
            out.push('</ul>');
            continue;
        }
        // Ordered list: consecutive lines starting with "N. ".
        if (/^\d+\. /.test(line)) {
            out.push('<ol>');
            while (i < lines.length && /^\d+\. /.test(lines[i])) {
                out.push(`<li>${inline(esc(lines[i].replace(/^\d+\. /, '')))}</li>`);
                i++;
            }
            out.push('</ol>');
            continue;
        }
        // Paragraph: collect until blank line or block-level start.
        const para = [];
        while (i < lines.length) {
            const pl = lines[i];
            if (pl.trim() === '' ||
                /^#{1,6} /.test(pl) ||
                /^[*-] /.test(pl) ||
                /^\d+\. /.test(pl) ||
                pl.trimStart().startsWith('```'))
                break;
            para.push(pl);
            i++;
        }
        if (para.length > 0)
            out.push(`<p>${inline(esc(para.join(' ')))}</p>`);
    }
    // Flush unclosed fence.
    if (inFence && fenceLines.length > 0) {
        out.push(`<pre><code>${fenceLines.map(esc).join('\n')}</code></pre>`);
    }
    return out.join('\n');
}
export function wrapMarkdown(body, title) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; max-width: 780px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #1a1a1a; background: #fff; }
  h1,h2,h3,h4,h5,h6 { font-weight: 700; line-height: 1.3; margin: 1.5em 0 0.5em; }
  h1 { font-size: 2em; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.3em; }
  h2 { font-size: 1.5em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.2em; }
  p { margin: 0 0 1em; }
  ul,ol { margin: 0 0 1em; padding-left: 2em; }
  li { margin: 0.25em 0; }
  a { color: #2563eb; text-decoration: none; }
  a:hover { text-decoration: underline; }
  img { max-width: 100%; height: auto; display: block; }
  code { font-family: ui-monospace, Menlo, monospace; font-size: 0.9em; background: #f3f4f6; padding: 0.1em 0.35em; border-radius: 3px; }
  pre { background: #f3f4f6; padding: 1em; border-radius: 6px; overflow-x: auto; margin: 0 0 1em; }
  pre code { background: none; padding: 0; font-size: 0.875em; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

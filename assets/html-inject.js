export function injectScript(html, scriptTag) {
  const bodyClose = html.lastIndexOf('</body>');
  if (bodyClose !== -1) {
    return html.slice(0, bodyClose) + scriptTag + '\n' + html.slice(bodyClose);
  }
  return html + '\n' + scriptTag;
}

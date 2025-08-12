async function loadRemoteSite(baseUrl) {
  try {
    // 1. Fetch remote index.html
    const indexUrl = `${baseUrl.replace(/\/$/, '')}/index.html`;
    const res = await fetch(indexUrl);
    if (!res.ok) throw new Error(`Failed to fetch index.html: ${res.status}`);
    let html = await res.text();

    // 2. Rewrite all relative href/src paths (including scripts) to absolute URLs
    html = rewritePaths(html, baseUrl);

    // 3. Parse HTML into a container
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // 4. Extract all <script> tags, remove from HTML to avoid duplicate execution
    const scripts = [...temp.querySelectorAll('script')];
    scripts.forEach(s => s.remove());

    // 5. Inject remaining HTML into document body
    document.body.innerHTML = temp.innerHTML;

    // 6. Load and execute scripts one by one
    for (const oldScript of scripts) {
      if (oldScript.src) {
        // Fetch external JS as text to avoid MIME type issues
        const scriptRes = await fetch(oldScript.src);
        if (!scriptRes.ok) {
          console.error(`Failed to fetch script: ${oldScript.src}`, scriptRes.status);
          continue;
        }
        const scriptText = await scriptRes.text();

        const inlineScript = document.createElement('script');
        inlineScript.textContent = scriptText;
        document.body.appendChild(inlineScript);
      } else {
        // Inline script — just inject
        const inlineScript = document.createElement('script');
        inlineScript.textContent = oldScript.textContent;
        document.body.appendChild(inlineScript);
      }
    }
  } catch (err) {
    document.body.innerHTML = `<p style="color:red;">Error: ${err.message}</p>`;
    console.error(err);
  }
}

// Rewrite all relative href/src URLs to absolute URLs based on baseUrl
function rewritePaths(html, baseUrl) {
  return html.replace(/(href|src)=["'](?!https?:\/\/|data:)([^"']+)["']/g, (match, attr, path) => {
    const trimmedBase = baseUrl.replace(/\/$/, '');
    const trimmedPath = path.replace(/^\//, '');
    return `${attr}="${trimmedBase}/${trimmedPath}"`;
  });
}

// Example usage — replace with your actual raw GitHub repo URL
loadRemoteSite('https://raw.githubusercontent.com/jorge-botana/test/master');

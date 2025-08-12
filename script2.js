const token = [
  'github_', // part 1
  'pat_',    // part 2
  '11AXOD6MY0089TelU37c7N_', // part 3
  'U6EA7j8UxniGxUsL5ljY74Rl37r8kZyxAWCMxzynFnaLH4YXO3KKXBZyHhN' // part 4
].join('');


// === CONFIGURATION ===
const username = 'jorge-botana';
const repo = 'test';
const branch = 'master';

async function loadRemoteSite() {
  try {
    // Step 1: Fetch and parse index.html
    const indexHtml = await fetchFromGitHub('index.html');
    const { html, externalScripts } = processHtml(indexHtml);

    // Step 2: Inject HTML content into the page
    document.body.innerHTML = html;

    // Step 3: Load and execute external scripts
    for (const path of externalScripts) {
      const code = await fetchFromGitHub(path);
      injectScript(code);
    }

  } catch (err) {
    document.body.innerHTML = `<p style="color:red;">Error: ${err.message}</p>`;
    console.error('Load error:', err);
  }
}

// === Fetch file via GitHub API ===
async function fetchFromGitHub(filePath) {
  const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/${filePath}?ref=${branch}`;
  const res = await fetch(apiUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3.raw',
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${filePath}: ${res.status}`);
  }

  return res.text();  // Already decoded
}

// === Rewrite paths in HTML (excluding <script>) ===
function processHtml(htmlText) {
  const container = document.createElement('div');
  container.innerHTML = htmlText;

  const scriptPaths = [];

  // Extract and remove <script src="..."> tags to fetch manually
  const scripts = container.querySelectorAll('script');
  scripts.forEach(script => {
    if (script.src) {
      scriptPaths.push(script.getAttribute('src'));
    } else {
      injectScript(script.textContent); // Inline script
    }
    script.remove();
  });

  // Rewrite other asset URLs (images, CSS)
  container.querySelectorAll('[src], [href]').forEach(el => {
    const attr = el.hasAttribute('src') ? 'src' : 'href';
    const val = el.getAttribute(attr);
    if (!val.startsWith('http') && !val.startsWith('data:')) {
      el.setAttribute(attr, githubRawUrl(val));
    }
  });

  return { html: container.innerHTML, externalScripts: scriptPaths };
}

// === Convert relative paths to GitHub API URLs for assets (images, CSS) ===
function githubRawUrl(path) {
  return `https://api.github.com/repos/${username}/${repo}/contents/${path}?ref=${branch}`;
}

// === Inject script into DOM ===
function injectScript(code) {
  const script = document.createElement('script');
  script.textContent = code;
  document.body.appendChild(script);
}

// === Start loading on page load ===
loadRemoteSite();

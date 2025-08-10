async function loadSite() {
  const params = new URLSearchParams(window.location.search);
  const passphrase = params.get('pass');

  if (!passphrase) {
    document.body.innerHTML = '<p>Error: No passphrase provided in URL (use ?pass=1234)</p>';
    return;
  }

  try {
    // 1. Load and decrypt token
    const targetRes = await fetch('target.json');
    const targetJson = await targetRes.json();

    const encUsername = targetJson.username;
    const encRepository = targetJson.repository;
    const encBranch = targetJson.branch;
    const encToken = targetJson.token;

    const decUsername = CryptoJS.AES.decrypt(encUsername, passphrase);
    const username = decUsername.toString(CryptoJS.enc.Utf8);
    console.log('Username:', username);

    const decRepository = CryptoJS.AES.decrypt(encRepository, passphrase);
    const repository = decRepository.toString(CryptoJS.enc.Utf8);
    console.log('Repository:', repository);

    const decBranch = CryptoJS.AES.decrypt(encBranch, passphrase);
    const branch = decBranch.toString(CryptoJS.enc.Utf8);
    console.log('Branch:', branch);

    const decToken = CryptoJS.AES.decrypt(encToken, passphrase);
    const token = decToken.toString(CryptoJS.enc.Utf8);
    console.log('Token:', token);

    const apiBase = `https://api.github.com/repos/${username}/${repository}/contents`;

    // Helper: Fetch and decode file as raw text
    async function fetchFile(path) {
        const url = `${apiBase}/${path}?ref=${branch}`;
        const res = await fetch(url, {
            headers: {
            Authorization: `token ${token}`,
            Accept: 'application/vnd.github.v3.raw'
            }
        });

        if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);

        const mime = detectMimeType(path);
        if (mime == 'image/png') {
            // For images and JS files, get as Blob
            return await res.blob();
        } else {
            // For text files (HTML, CSS, JSON, etc.)
            return await res.text();
        }
    }

    // 3. Load manifest (site.json)
    const manifestText = await fetchFile('site.json');
    const fileList = JSON.parse(manifestText);

    // 4. Fetch all files into memory
    const fileContents = {};
    for (const path of fileList) {
      fileContents[path] = await fetchFile(path);
    }

    // 5. Create blob URLs for each file
    const blobUrls = {};
    for (const [path, content] of Object.entries(fileContents)) {
        const mime = detectMimeType(path);

        let blob;
        if (content instanceof Blob) {
            // Already a blob, just reuse
            blob = content;
        } else {
            // Content is string, make blob
            blob = new Blob([content], { type: mime });
        }

        blobUrls[path] = URL.createObjectURL(blob);
    }

    // 6. Rewrite HTML paths to blob URLs
    let mainHtml = fileContents['index.html'];
    mainHtml = rewritePaths(mainHtml, blobUrls);

    // 7. Render the page
 //   document.open();
 //   document.write(mainHtml);
 //   document.close();

const originalTitle = document.title;
document.documentElement.innerHTML = mainHtml;
document.title = originalTitle;

  } catch (err) {
    document.body.innerHTML = `<p>Error loading site: ${err.message}</p>`;
  }
}

// Utility: basic MIME type guessing
function detectMimeType(path) {
  if (path.endsWith('.css')) return 'text/css';
  if (path.endsWith('.js')) return 'application/javascript';
  if (path.endsWith('.html')) return 'text/html';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  return 'text/plain';
}

// Utility: replace relative paths in HTML with blob URLs
function rewritePaths(html, blobUrls) {
  for (const [path, blobUrl] of Object.entries(blobUrls)) {
    const safePath = path.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`(["'])${safePath}\\1`, 'g');
    html = html.replace(regex, `"${blobUrl}"`);
  }
  return html;
}

const cdnBase = "https://cdnjs.cloudflare.com/ajax/libs/";
const libPath = "crypto-js/4.2.0/crypto-js.min.js";
const fullSrc = cdnBase + libPath;

const script = document.createElement('script');
script.src = fullSrc;
document.head.appendChild(script);

window.onload = loadSite;

// loader.js

async function loadRemoteSite() {
    const params = new URLSearchParams(window.location.search);
    const passphrase = params.get('pass');

    if (!passphrase) {
        document.body.innerHTML =
            '<p>Error: No passphrase provided in URL (use ?pass=1234)</p>';
        return;
    }

    try {
        const targetRes = await fetch('target.json');
        const targetJson = await targetRes.json();

        const username = decrypt(targetJson.username, passphrase);
        const repository = decrypt(targetJson.repository, passphrase);
        const branch = decrypt(targetJson.branch, passphrase);
        const token = decrypt(targetJson.token, passphrase);

        if (!username || !repository || !branch || !token) {
            throw new Error('Decryption failed. Check your passphrase.');
        }

        const context = { username, repository, branch, token };

        const indexHtml = await fetchFromGitHub('index.html', context);
        const { html, externalScripts } = await processHtml(indexHtml, context);

        document.body.innerHTML = html;

        for (const path of externalScripts) {
            const code = await fetchFromGitHub(path, context);
            injectScript(code);
        }

    } catch (err) {
        document.body.innerHTML = `<p style="color:red;">Error: ${err.message}</p>`;
        console.error('Load error:', err);
    }
}

function decrypt(encrypted, passphrase) {
    const bytes = CryptoJS.AES.decrypt(encrypted, passphrase);
    return bytes.toString(CryptoJS.enc.Utf8);
}

async function fetchFromGitHub(filePath, { username, repository, branch, token }) {
    const apiUrl = `https://api.github.com/repos/${username}/${repository}/contents/${filePath}?ref=${branch}`;
    const res = await fetch(apiUrl, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3.raw',
        }
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch ${filePath}: ${res.status}`);
    }

    return res.text();
}

// Fetch metadata JSON for image to get temporary download_url
async function fetchImageDownloadUrl(path, { username, repository, branch, token }) {
    const apiUrl = `https://api.github.com/repos/${username}/${repository}/contents/${path}?ref=${branch}`;
    const res = await fetch(apiUrl, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json' // Request JSON metadata
        }
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch image metadata ${path}: ${res.status}`);
    }

    const json = await res.json();
    if (!json.download_url) {
        throw new Error(`No download_url found for image ${path}`);
    }
    return json.download_url;
}

async function processHtml(htmlText, context) {
    // Use DOMParser instead of innerHTML to prevent auto-loading resources
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');

    const scriptPaths = [];

    // Process and remove all <script> tags
    const scripts = doc.querySelectorAll('script');
    scripts.forEach(script => {
        if (script.src) {
            scriptPaths.push(script.getAttribute('src'));
        } else {
            injectScript(script.textContent);
        }
        script.remove(); // prevent execution until ready
    });

    // Rewrite all src/href attributes that are not absolute URLs
    const elements = doc.querySelectorAll('[src], [href]');
    await Promise.all(Array.from(elements).map(async (el) => {
        const attr = el.hasAttribute('src') ? 'src' : 'href';
        const val = el.getAttribute(attr);
        if (!val || val.startsWith('http') || val.startsWith('data:')) return;

        const normalizedPath = val.startsWith('/') ? val.slice(1) : val;

        if (el.tagName.toLowerCase() === 'img') {
            try {
                const tempUrl = await fetchImageDownloadUrl(normalizedPath, context);
                el.setAttribute('src', tempUrl);
            } catch (e) {
                console.warn(`Failed to load image ${normalizedPath}: ${e.message}`);
                el.setAttribute(attr, githubRawAssetUrl(normalizedPath, context));
            }
        } else {
            el.setAttribute(attr, githubRawAssetUrl(normalizedPath, context));
        }
    }));

    // Serialize updated HTML back to a string
    return {
        html: doc.body.innerHTML,
        externalScripts: scriptPaths
    };
}


function githubRawAssetUrl(path, { username, repository, branch }) {
    return `https://raw.githubusercontent.com/${username}/${repository}/${branch}/${path}`;
}

function injectScript(code) {
    const script = document.createElement('script');
    script.textContent = code;
    document.body.appendChild(script);
}

// Run on page load
loadRemoteSite();

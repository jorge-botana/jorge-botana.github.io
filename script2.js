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

        // Fetch index.html content text
        const indexHtml = await fetchGitHubFile('index.html', context);
        const { html, externalScripts } = await processHtml(indexHtml, context);

        document.body.innerHTML = html;

        // Re-inject external scripts at original positions
        for (const { elementId, code } of externalScripts) {
            const placeholder = document.getElementById(elementId);
            if (placeholder) {
                const script = document.createElement('script');
                script.textContent = code;
                placeholder.replaceWith(script);
            }
        }

        // Re-inject inline scripts
        document.querySelectorAll('.delayed-inline-script').forEach(el => {
            const script = document.createElement('script');
            script.textContent = el.textContent;
            el.replaceWith(script);
        });

    } catch (err) {
        document.body.innerHTML = `<p style="color:red;">Error: ${err.message}</p>`;
        console.error('Load error:', err);
    }
}

function decrypt(encrypted, passphrase) {
    const bytes = CryptoJS.AES.decrypt(encrypted, passphrase);
    return bytes.toString(CryptoJS.enc.Utf8);
}

/**
 * fetchGitHubFile: Fetches the file from GitHub repo via
 * 1) API metadata JSON (to get download_url)
 * 2) Then fetches content from download_url
 *
 * options: { returnDownloadUrl: boolean }
 *   - If true, returns the download_url string instead of file content
 */
async function fetchGitHubFile(filePath, { username, repository, branch, token }, options = {}) {
    const { returnDownloadUrl = false } = options;

    const apiUrl = `https://api.github.com/repos/${username}/${repository}/contents/${filePath}?ref=${branch}`;

    // Fetch metadata JSON
    const metadataRes = await fetch(apiUrl, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json'
        }
    });

    if (!metadataRes.ok) {
        throw new Error(`Failed to fetch metadata for ${filePath}: ${metadataRes.status}`);
    }

    const metadata = await metadataRes.json();

    if (!metadata.download_url) {
        throw new Error(`No download_url found for ${filePath}`);
    }

    if (returnDownloadUrl) {
        return metadata.download_url;
    }

    // Fetch file content from download_url
    const contentRes = await fetch(metadata.download_url);
    if (!contentRes.ok) {
        throw new Error(`Failed to fetch content of ${filePath}: ${contentRes.status}`);
    }

    return contentRes.text();
}

async function processHtml(htmlText, context) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');

    const externalScripts = [];
    let scriptCounter = 0;

    // Handle <script> tags
    const scripts = doc.querySelectorAll('script');
    for (const script of scripts) {
        const placeholderId = `script-placeholder-${++scriptCounter}`;
        const placeholder = document.createElement('div');
        placeholder.id = placeholderId;

        if (script.src) {
            const originalSrc = script.getAttribute('src');
            const normalizedPath = originalSrc.startsWith('/') ? originalSrc.slice(1) : originalSrc;
            const code = await fetchGitHubFile(normalizedPath, context);
            externalScripts.push({ elementId: placeholderId, code });
            script.replaceWith(placeholder);
        } else {
            script.classList.add('delayed-inline-script');
            script.type = 'text/plain';
        }
    }

    // Update all src and href attributes
    const elements = doc.querySelectorAll('[src], [href]');
    await Promise.all(Array.from(elements).map(async el => {
        const attr = el.hasAttribute('src') ? 'src' : 'href';
        const val = el.getAttribute(attr);
        if (!val || val.startsWith('http') || val.startsWith('data:')) return;

        const normalizedPath = val.startsWith('/') ? val.slice(1) : val;

        try {
            // Get download_url only
            const downloadUrl = await fetchGitHubFile(normalizedPath, context, { returnDownloadUrl: true });
            el.setAttribute(attr, downloadUrl);
        } catch (e) {
            console.warn(`Failed to update ${attr} for ${normalizedPath}: ${e.message}`);
            // fallback to raw.githubusercontent URL (not authenticated)
            el.setAttribute(attr, githubRawAssetUrl(normalizedPath, context));
        }
    }));

    // Rewrite iframe.src inside inline scripts
    doc.querySelectorAll('.delayed-inline-script').forEach(script => {
        let scriptText = script.textContent;

        scriptText = scriptText.replace(
            /iframe\.src\s*=\s*['"`](.+?)['"`]/g,
            (match, file) => {
                return `
                (async () => {
                    try {
                        const downloadUrl = await fetchGitHubFile("${file}", ${JSON.stringify(context)}, { returnDownloadUrl: true });
                        iframe.src = downloadUrl;
                    } catch (err) {
                        alert("Download failed: " + err.message);
                    }
                })();`;
            }
        );

        script.textContent = scriptText;
    });

    return {
        html: doc.body.innerHTML,
        externalScripts
    };
}

function githubRawAssetUrl(path, { username, repository, branch }) {
    return `https://raw.githubusercontent.com/${username}/${repository}/${branch}/${path}`;
}

// Start loading
loadRemoteSite();

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

async function fetchGitHubFile(filePath, { username, repository, branch, token }, options = {}) {
    const { returnDownloadUrl = false } = options;

    const apiUrl = `https://api.github.com/repos/${username}/${repository}/contents/${filePath}?ref=${branch}`;

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

    // Process <script> tags (external and inline)
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
            // Inline script - prevent immediate execution
            script.classList.add('delayed-inline-script');
            script.type = 'text/plain';
        }
    }

    // Rewrite image src and other src/href attributes
    const elements = doc.querySelectorAll('[src], [href]');
    await Promise.all(Array.from(elements).map(async (el) => {
        const attr = el.hasAttribute('src') ? 'src' : 'href';
        const val = el.getAttribute(attr);
        if (!val || val.startsWith('http') || val.startsWith('data:')) return;

        const normalizedPath = val.startsWith('/') ? val.slice(1) : val;

        if (el.tagName.toLowerCase() === 'img') {
            try {
                const tempUrl = await fetchGitHubFile(normalizedPath, context, { returnDownloadUrl: true });
                el.setAttribute('src', tempUrl);
            } catch (e) {
                console.warn(`Failed to load image ${normalizedPath}: ${e.message}`);
                el.setAttribute(attr, githubRawAssetUrl(normalizedPath, context));
            }
        } else {
            el.setAttribute(attr, githubRawAssetUrl(normalizedPath, context));
        }
    }));

    // Inject custom function f to override file downloads
    doc.querySelectorAll('.delayed-inline-script').forEach(script => {
        let scriptText = script.textContent;

        // Rewrite iframe.src = "file" with GitHub download link logic
        if (/iframe\.src\s*=\s*['"`](.+?)['"`]/.test(scriptText)) {
            scriptText = scriptText.replace(
                /iframe\.src\s*=\s*['"`](.+?)['"`]/g,
                (match, file) => {
                    return `
                    (async () => {
                        try {
                            const apiUrl = "https://api.github.com/repos/${context.username}/${context.repository}/contents/${file}?ref=${context.branch}";
                            const res = await fetch(apiUrl, {
                                headers: {
                                    Authorization: "Bearer ${context.token}",
                                    Accept: "application/vnd.github.v3+json"
                                }
                            });
                            if (!res.ok) throw new Error("Failed to fetch file metadata: " + res.status);
                            const json = await res.json();
                            if (!json.download_url) throw new Error("No download_url found for ${file}");
                            iframe.src = json.download_url;
                        } catch (err) {
                            alert("Download failed: " + err.message);
                        }
                    })();`;
                }
            );
        }

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

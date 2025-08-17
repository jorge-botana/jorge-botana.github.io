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

        const username = targetJson.username;
        const repository = targetJson.repository;
        const branch = targetJson.branch;
        const token = await decrypt(targetJson.token, passphrase);

        console.log('Token:', token);

        if (!token) {
            throw new Error('Decryption failed. Check your passphrase.');
        }

        const context = { username, repository, branch, token };

        // Get download_url for index.html
        const indexHtmlUrl = await fetchGitHubFile('index.html', context);
        // Fetch actual content of index.html from that url
        const indexHtml = await fetch(indexHtmlUrl).then(res => {
            if (!res.ok) throw new Error(`Failed to fetch index.html content: ${res.status}`);
            return res.text();
        });

        const { html, externalScripts } = await processHtml(indexHtml, context);

        document.body.innerHTML = html;

        // Re-inject external scripts at original positions
        for (const { elementId, codeUrl } of externalScripts) {
            const placeholder = document.getElementById(elementId);
            if (placeholder) {
                // Fetch script content using download_url
                const code = await fetch(codeUrl).then(res => {
                    if (!res.ok) throw new Error(`Failed to fetch script content: ${res.status}`);
                    return res.text();
                });
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

function fromBase64(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

async function decrypt(token, passphrase) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    try {
        // Decode base64 strings to Uint8Array
        const salt = fromBase64(token.salt);
        const iv = fromBase64(token.iv);
        const ciphertext = fromBase64(token.ciphertext);

        // Import key material from passphrase
        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            encoder.encode(passphrase),
            { name: "PBKDF2" },
            false,
            ["deriveKey"]
        );

        // Derive AES-CBC key with salt
        const key = await crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: salt,
                iterations: 100000,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-CBC", length: 256 },
            false,
            ["decrypt"]
        );

        // Decrypt ciphertext with IV
        const decrypted = await crypto.subtle.decrypt(
            {
                name: "AES-CBC",
                iv: iv
            },
            key,
            ciphertext
        );

        return decoder.decode(decrypted);

    } catch (err) {
        console.error("Decryption failed:", err);
        return null;
    }
}

/**
 * fetchGitHubFile always returns download_url string for the file
 */
async function fetchGitHubFile(filePath, { username, repository, branch, token }) {
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

    return metadata.download_url;
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
            // get download_url of script file
            const codeUrl = await fetchGitHubFile(normalizedPath, context);
            externalScripts.push({ elementId: placeholderId, codeUrl });
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
            // get download_url
            const downloadUrl = await fetchGitHubFile(normalizedPath, context);
            el.setAttribute(attr, downloadUrl);
        } catch (e) {
            console.warn(`Failed to update ${attr} for ${normalizedPath}: ${e.message}`);
            // fallback to raw.githubusercontent URL (no token)
            el.setAttribute(attr, githubRawAssetUrl(normalizedPath, context));
        }
    }));

    // Patch inline onclick="downloadFile('filename')" to dynamic fetch + call
    const onclickElements = doc.querySelectorAll('[onclick]');
    onclickElements.forEach(el => {
        const onclick = el.getAttribute('onclick');
        if (!onclick) return;

        // Match downloadFile('somefile.ext') call, extract filename inside quotes
        const match = onclick.match(/downloadFile\(['"](.+?)['"]\)/);
        if (match) {
            const filename = match[1];
            // Replace onclick content with async IIFE to fetch dynamic URL
            el.setAttribute('onclick', `
                (async () => {
                    try {
                        const url = await fetchGitHubFile('${filename}', ${JSON.stringify(context)});
                        downloadFile(url);
                    } catch (err) {
                        alert('Download failed: ' + err.message);
                    }
                })();
                return false;
            `);
        }
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

const toggleBtn = document.getElementById("toggleBtn");
const input = document.getElementById("userInput");
const submitMsg = document.getElementById("submitMsg");

let targetJson;
let token;

document.addEventListener("DOMContentLoaded", async function() {
    // Inline getParameterByName functionality
    const urlParams = new URLSearchParams(window.location.search);
    const passValue = urlParams.get("pass");
    if (passValue !== null) {
        document.getElementById("userInput").value = passValue;
    }

    // Fetch target.json
    const targetRes = await fetch("target.json");
    targetJson = await targetRes.json();
    console.log("targetJson loaded:", targetJson);
});

toggleBtn.addEventListener("click", function () {
    input.type = input.type === "password" ? "text" : "password";
    this.textContent = input.type === "password" ? "Show" : "Hide";
});

async function submitInput(event) {
    // Do not reload page on submit.
    event.preventDefault();

    // Try decrypting the token.
    token = await decrypt(targetJson.token, input.value);

    // Load the page if the token was decrypted (if the access code is correct).
    document.querySelector(".submit-btn").disabled = true;
    if (token == null) {
        document.getElementById("submitMsg").textContent =
                "Wrong access code. Please try again.";
        document.getElementById("userInput").value = "";
        document.getElementById("submitMsg").style.color = "red";
        input.classList.add("error");
        input.classList.remove("okay");
        document.querySelector(".submit-btn").disabled = false;
    } else {
        document.getElementById("submitMsg").textContent =
                "Correct access code. Now loading...";
        document.getElementById("userInput").disabled = true;
        document.getElementById("submitMsg").style.color = "green";
        input.classList.remove("error");
        input.classList.add("okay");
        loadRemoteSite();
    }
    submitMsg.classList.add("active");
}

async function decrypt(token, password) {
    try {
        const salt = Uint8Array.from(atob(token.salt),
                c => c.charCodeAt(0));
        const iv = Uint8Array.from(atob(token.iv),
                c => c.charCodeAt(0));
        const ciphertext = Uint8Array.from(atob(token.ciphertext),
                c => c.charCodeAt(0));

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        const baseKey = await crypto.subtle.importKey(
            "raw",
            encoder.encode(password),
            "PBKDF2",
            false,
            ["deriveKey"]
        );

        const key = await crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                hash: "SHA-256",
                salt: salt,
                iterations: 100000
            },
            baseKey,
            {
                name: "AES-CBC",
                length: 256
            },
            false,
            ["decrypt"]
        );

        const plaintextBuffer = await crypto.subtle.decrypt(
            {
                name: "AES-CBC",
                iv: iv
            },
            key,
            ciphertext
        );

        const plaintext = decoder.decode(plaintextBuffer);

        return plaintext;
    } catch (err) {
        console.error("Decryption failed:", err);
        return null;
    }
}

// -----------------------------------------------------------------------------

async function loadRemoteSite() {
    try {
        const username = targetJson.username;
        const repository = targetJson.repository;
        const branch = targetJson.branch;

        const context = { username, repository, branch, token };

        // Get download_url for index.html
        const indexHtmlUrl = await fetchGitHubFileURL('index.html', context);

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

/**
 *  always returns download_url string for the file
 */
async function fetchGitHubFileURL(filePath, { username, repository, branch, token }) {
    const apiUrl = `https://api.github.com/repos/${username}/${repository}/contents/${filePath}?ref=${branch}`;

    const metadataRes = await fetch(apiUrl, {
        cache: "no-store",
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json"
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
            const codeUrl = await fetchGitHubFileURL(normalizedPath, context);
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
            const downloadUrl = await fetchGitHubFileURL(normalizedPath, context);
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
                        const url = await fetchGitHubFileURL('${filename}', ${JSON.stringify(context)});
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

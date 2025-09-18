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
        input.value = passValue;
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
        const { username, repository, branch } = targetJson;

        const context = { username, repository, branch, token };

        // Get download_url for index.html
        const indexHtmlUrl = await fetchGitHubFileURL("index.html", context);

        // Fetch the index.html content
        const indexHtml = await fetch(indexHtmlUrl).then(res => {
            if (!res.ok) throw new Error(`Failed to fetch index.html content: ${res.status}`);
            return res.text();
        });

        // Patch the HTML: fix script src, images, onclicks, etc.
        const html = await processHtml(indexHtml, context);

        // Replace the body with the patched html
        document.documentElement.innerHTML = html;

        // Find all scripts inside the new body (both inline and external)
        const scripts = Array.from(document.body.querySelectorAll('script'));

        for (const oldScript of scripts) {
            const newScript = document.createElement('script');

            // copy non-src attributes (like type)
            for (const attr of oldScript.attributes) {
                if (attr.name !== 'src') {
                    newScript.setAttribute(attr.name, attr.value);
                }
            }

            if (oldScript.src) {
                // Fetch script content manually, then inject as inline script
                try {
                    const response = await fetch(oldScript.src);
                    if (!response.ok) throw new Error(`Failed to fetch script: ${response.status}`);
                    const scriptText = await response.text();
                    newScript.textContent = scriptText;
                } catch (e) {
                    console.error('Error loading script:', e);
                    continue; // skip this script
                }
            } else {
                newScript.textContent = oldScript.textContent;
            }

            oldScript.replaceWith(newScript);
        }
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

    // Patch 'href' attributes (e.g., link[href], a[href], etc.)
    await patchAttributeCSS(doc, context);

    // Patch 'src' attributes (e.g., script[src], img[src], iframe[src], etc.)
    await patchAttributeLinks(doc, context);

    // Patch inline onclick="downloadFile('filename')" to dynamic fetch + call
    patchOnclickDownloadFile(doc, context);

    console.log(doc.documentElement.outerHTML);

    return doc.documentElement.outerHTML;
}

async function patchAttributeCSS(doc, context) {
    const elements = [...doc.querySelectorAll('[href]')];

    for (const el of elements) {
        const hrefValue = el.getAttribute('href');

        try {
            const updatedUrl = await fetchGitHubFileURL(hrefValue, context);
            // Fetch CSS content and replace <link> with <style>
            const cssText = await fetch(updatedUrl).then(r => r.text());
            const styleEl = doc.createElement('style');
            styleEl.textContent = cssText;
            el.replaceWith(styleEl);
        } catch (err) {
            console.warn(`Failed to update ${el.tagName.toLowerCase()} href '${hrefValue}': ${err.message}`);
        }
    }
}

async function patchAttributeLinks(doc, context) {
    const elements = [...doc.querySelectorAll('[src]')];

    for (const el of elements) {
        const srcValue = el.getAttribute('src');

        try {
            const updatedUrl = await fetchGitHubFileURL(srcValue, context);
            el.setAttribute('src', updatedUrl);
        } catch (err) {
            console.warn(`Failed to update ${el.tagName.toLowerCase()} src '${srcValue}': ${err.message}`);
        }
    }
}

function patchOnclickDownloadFile(doc, context) {
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
}

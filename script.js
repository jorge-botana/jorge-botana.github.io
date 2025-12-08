const toggleBtn = document.getElementById("toggleBtn");
const input = document.getElementById("userInput");
const submitMsg = document.getElementById("submitMsg");

let targetJson;

// Executed when page is loaded
async function main() {
    // Autocomplete the password if passed through URL
    const passValue = new URL(location).searchParams.get("pass");
    if (passValue !== null) {
        input.value = passValue;
    }

    // Fetch target.json
    const targetJsonPath = getAssetPath("target");
    const res = await fetch(targetJsonPath);
    let text = await res.text();

    // Apply magic regex to strip // and /* */ C-like comments.
    text = text.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "");

    targetJson = JSON.parse(text);
//    console.log("targetJson loaded:", targetJson);
}

// Executed when toggled Hide/Show
toggleBtn.addEventListener("click", function () {
    // Switch the input field type between password and text
    input.type = input.type === "password" ? "text" : "password";

    // Update the button label accordingly
    this.textContent = input.type === "password" ? "Show" : "Hide";
});

// Executed when Submit is clicked
async function submitInput(event) {
    // Do not reload page on submit.
    event.preventDefault();

    // Try decrypting the token.
    targetJson.auth = await decrypt(targetJson.token, input.value);

    // Load the page if the token was decrypted (if the access code is correct).
    document.querySelector(".submitBtn").disabled = true;
    if (targetJson.auth == null) {
        document.getElementById("submitMsg").textContent =
                "Wrong access code. Please try again.";
        document.getElementById("userInput").value = "";
        document.getElementById("submitMsg").style.color = "red";
        input.classList.add("error");
        input.classList.remove("okay");
        document.querySelector(".submitBtn").disabled = false;
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

async function decrypt(auth, pass) {
    try {
        const salt = Uint8Array.from(atob(auth.salt),
                c => c.charCodeAt(0));
        const iv = Uint8Array.from(atob(auth.iv),
                c => c.charCodeAt(0));
        const ciphertext = Uint8Array.from(atob(auth.ciphertext),
                c => c.charCodeAt(0));

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        const baseKey = await crypto.subtle.importKey(
            "raw",
            encoder.encode(pass),
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
        // Get download_url for index.html
        const indexHtmlUrl = await githubFetch("index.html");

        // Fetch the index.html content
        const indexHtml = await fetch(indexHtmlUrl).then(res => {
            if (!res.ok) throw new
                    Error(`Failed to fetch index.html content: ${res.status}`);
            return res.text();
        });

        // Take the favicon from remote
        await injectRemoteFavicon();

        // Patch the HTML: fix script src, images, onclicks, etc.
        const html = await processHtml(indexHtml);

        // Replace the body with the patched html
        document.documentElement.innerHTML = html;

        // Inject remote scripts.
        await injectRemoteScripts();
    } catch (err) {
        document.body.innerHTML =
                `<p style="color:red;">Error: ${err.message}</p>`;
        console.error("Load error:", err);
    }
}

/**
 *  always returns download_url string for the file
 */
async function githubFetch(path) {
    const user = targetJson.user;
    const repo = targetJson.repo;
    const hash = targetJson.hash;
    const auth = targetJson.auth;

    path = "/" + path;
    let url = `https://api.github.com/repos/${user}/${repo}/contents${path}`;
    if (hash) {
        url += `?ref=${hash}`;
    }

    const metadataRes = await fetch(url, {
        cache: "no-store",
        headers: {
            Authorization: `Bearer ${auth}`,
            Accept: "application/vnd.github.v3+json"
        }
    });

    if (!metadataRes.ok) {
        throw new Error(`Failed to fetch metadata for ${path}:
                ${metadataRes.status}`);
    }

    const metadata = await metadataRes.json();

    if (!metadata.download_url) {
        throw new Error(`No download_url found for ${path}`);
    }

    return metadata.download_url;
}

async function processHtml(htmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, "text/html");

    // Patch 'href' attributes (e.g., link[href], a[href], etc.)
    await patchAttributeCSS(doc);

    // Patch 'src' attributes (e.g., script[src], img[src], iframe[src], etc.)
    await patchAttributeLinks(doc);

    await patchMetaContent(doc); // <-- new line

    // Patch inline onclick="downloadFile('filename')" to dynamic fetch + call
    patchOnclickDownloadFile(doc);

//    console.log(doc.documentElement.outerHTML);

    return doc.documentElement.outerHTML;
}

async function patchAttributeCSS(doc) {
    const elements = [...doc.querySelectorAll("[href]")];

    for (const el of elements) {
        const hrefValue = el.getAttribute("href");

        try {
            const updatedUrl = await githubFetch(hrefValue);
            // Fetch CSS content and replace <link> with <style>
            const cssText = await fetch(updatedUrl).then(r => r.text());
            const styleEl = doc.createElement("style");
            styleEl.textContent = cssText;
            styleEl.setAttribute("data-href", hrefValue); // <-- add this PARA marcar lines a quitar del CSS
            el.replaceWith(styleEl);
        } catch (err) {
            console.warn(`Failed to update ${el.tagName.toLowerCase()} href
                    "${hrefValue}": ${err.message}`);
        }
    }
}

async function patchAttributeLinks(doc) {
    const elements = [...doc.querySelectorAll("[src]")];

    for (const el of elements) {
        const srcValue = el.getAttribute("src");

        try {
            const updatedUrl = await githubFetch(srcValue);
            el.setAttribute("src", updatedUrl);
        } catch (err) {
            console.warn(`Failed to update ${el.tagName.toLowerCase()} src
                    "${srcValue}": ${err.message}`);
        }
    }
}

function patchOnclickDownloadFile(doc) {
    const onclickElements = doc.querySelectorAll("[onclick]");
    onclickElements.forEach(el => {
        const onclick = el.getAttribute("onclick");
        if (!onclick) return;

        // Match downloadFile('somefile.ext') call, extract filename inside ""
        const match = onclick.match(/downloadFile\(['"](.+?)['"]\)/);
        if (match) {
            const filename = match[1];

            // Replace onclick content with async IIFE to fetch dynamic URL
            el.setAttribute("onclick", `
                (async () => {
                    try {
                        const url = await githubFetch("${filename}");
                        downloadFile(url);
                    } catch (err) {
                        alert("Download failed: " + err.message);
                    }
                })();
                return false;
            `);
        }
    });
}

async function injectRemoteFavicon(htmlText) {
    try {
        // Parse HTML string into a Document
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, "text/html");

        // Look for <link rel="icon"> or <link rel="shortcut icon">
        const linkEl = doc.querySelector("link[rel~='icon']");
        if (!linkEl) return;

        const faviconPath = linkEl.getAttribute("href");
        if (!faviconPath) return;

        // Get GitHub download_url
        const faviconUrl = await githubFetch(faviconPath);

        const newLink = document.createElement("link");
        newLink.rel = "icon";
        newLink.type = "image/x-icon";
        newLink.href = faviconUrl;

        // Remove existing favicons
        document.querySelectorAll("link[rel~='icon']").forEach(el => el.remove());

        document.head.appendChild(newLink);
    } catch (err) {
        console.warn("Failed to inject remote favicon:", err.message);
    }
}

async function injectRemoteScripts() {
    // Find all scripts inside the document (both inline and external)
    const scripts = Array.from(document.documentElement.querySelectorAll("script"));

    for (const oldScript of scripts) {
        const newScript = document.createElement("script");

        if (oldScript.src) {
            // Fetch script content manually, then inject as inline script
            try {
                const response = await fetch(oldScript.src);
                if (!response.ok) {
                    throw new Error(`Failed to fetch script:
                            ${response.status}`);
                }
                const scriptText = await response.text();
                newScript.textContent = scriptText;

                // Preserve original src for mainLoop removal
                newScript.setAttribute("data-src", oldScript.src);
            } catch (e) {
                console.error("Error loading script:", e);
                continue; // Skip this script
            }
        } else {
            // Inline script: copy its content directly
            newScript.textContent = oldScript.textContent;
        }

        oldScript.replaceWith(newScript);
    }
}

async function patchMetaContent(doc) {
    const metaElements = [...doc.querySelectorAll("meta[content]")];

    for (const el of metaElements) {
        const nameAttr = el.getAttribute("name");
        const contentValue = el.getAttribute("content");

        // Skip if no content, starts with http, or is a meta we don't want to patch
        if (
            !contentValue ||
            contentValue.startsWith("http") ||
            nameAttr === "viewport"
        ) continue;

        try {
            const updatedUrl = await githubFetch(contentValue);
            el.setAttribute("content", updatedUrl);
        } catch (err) {
            console.warn(`Failed to update meta content "${contentValue}": ${err.message}`);
        }
    }
}

// Helper to retrieve asset path from <meta> tags
function getAssetPath(name) {
    return document.querySelector(`meta[name="${name}"]`)?.content || "";
}

// Start the app
main();

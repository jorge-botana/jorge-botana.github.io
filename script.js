async function loadSite() {
    const params = new URLSearchParams(window.location.search);
    const passphrase = params.get('pass');

    if (!passphrase) {
        document.body.innerHTML =
                '<p>Error: No passphrase provided in URL (use ?pass=1234)</p>';
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

        // GitHub API base URL for accessing private repository contents
        const apiBase =
                `https://api.github.com/repos/${username}/${repository}/contents`;

        // Helper: Fetch file metadata from GitHub API
        async function fetchFileMetadata(path) {
            const url = `${apiBase}/${path}?ref=${branch}`;
            const res = await fetch(url, {
                headers: {
                    Authorization: `token ${token}`,
                    Accept: 'application/vnd.github.v3+json'
                }
            });

            if (!res.ok) {
                throw new Error(`Failed to fetch file metadata for ${path}: ${res.status}`);
            }

            return res.json(); // Return the metadata of the file
        }

        // Helper: Fetch raw content from GitHub API
        async function fetchFile(path) {
            const metadata = await fetchFileMetadata(path);

            // If it's a file (not a directory), get the raw URL
            if (metadata.type === 'file') {
                return metadata.download_url;
            }

            throw new Error(`Expected file, but got a directory: ${path}`);
        }

        // 3. Load manifest (site.json)
        const manifestUrl = await fetchFile('site.json');
        const manifestRes = await fetch(manifestUrl);
        if (!manifestRes.ok) {
            console.error('Error fetching site.json:', manifestRes.status, manifestRes.statusText);
            throw new Error('Failed to fetch site.json');
        }
        const manifestText = await manifestRes.text();
        console.log('site.json content:', manifestText);

        const fileList = JSON.parse(manifestText); // This will now throw an error if the content is invalid JSON

        // 4. Fetch all file URLs into memory
        const fileUrls = {};
        for (const path of fileList) {
            const url = await fetchFile(path);
            fileUrls[path] = url;
        }

        // 5. Rewrite HTML paths to real GitHub URLs
        let mainHtml = await fetchFile('index.html');
        mainHtml = await fetch(mainHtml).then(res => res.text());
        mainHtml = rewritePaths(mainHtml, fileUrls);

        // 6. Render the page (inject HTML and execute scripts)
        const originalTitle = document.title;
        document.documentElement.innerHTML = mainHtml;
        document.title = originalTitle;

        // 7. Execute scripts in the page
        executeScripts(mainHtml);

        const myButton = document.getElementById('downloadBtn');
        if (myButton) {
            myButton.addEventListener('click', function() {
                console.log('Download button was fired!');
            });
        }
    } catch (err) {
        document.body.innerHTML = `<p>Error loading site: ${err.message}</p>`;
    }
}

// Utility: replace relative paths in HTML with GitHub raw URLs
function rewritePaths(html, rawUrls) {
    for (const [path, rawUrl] of Object.entries(rawUrls)) {
        const safePath = path.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(["'])${safePath}\\1`, 'g');
        html = html.replace(regex, `"${rawUrl}"`);
    }
    return html;
}

// Function to execute <script> tags in HTML after the page is loaded
function executeScripts(html) {
    const scriptTags = html.match(/<script[^>]*>([\s\S]*?)<\/script>/g);

    if (scriptTags) {
        scriptTags.forEach(tag => {
            const scriptContent = tag.replace(/<script[^>]*>|<\/script>/g, '').trim();
            const scriptElement = document.createElement('script');
            scriptElement.textContent = scriptContent;
            document.body.appendChild(scriptElement);
        });
    }
}

const cdnBase = "https://cdnjs.cloudflare.com/ajax/libs/";
const libPath = "crypto-js/4.2.0/crypto-js.min.js";
const fullSrc = cdnBase + libPath;

const script = document.createElement('script');
script.src = fullSrc;
document.head.appendChild(script);

window.onload = loadSite;

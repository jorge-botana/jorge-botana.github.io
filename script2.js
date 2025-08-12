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
        // Load and decrypt token
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

        // Step 1: Fetch and parse index.html
        const indexHtml = await fetchFromGitHub('index.html', context);
        const { html, externalScripts } = processHtml(indexHtml, context);

        // Step 2: Inject HTML content into the page
        document.body.innerHTML = html;

        // Step 3: Load and execute external scripts
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

function processHtml(htmlText, { username, repository, branch }) {
    const container = document.createElement('div');
    container.innerHTML = htmlText;

    const scriptPaths = [];

    const scripts = container.querySelectorAll('script');
    scripts.forEach(script => {
        if (script.src) {
            scriptPaths.push(script.getAttribute('src'));
        } else {
            injectScript(script.textContent);
        }
        script.remove();
    });

    container.querySelectorAll('[src], [href]').forEach(el => {
        const attr = el.hasAttribute('src') ? 'src' : 'href';
        const val = el.getAttribute(attr);
        if (!val.startsWith('http') && !val.startsWith('data:')) {
            el.setAttribute(attr, githubRawAssetUrl(val, { username, repository, branch }));
        }
    });

    return { html: container.innerHTML, externalScripts: scriptPaths };
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

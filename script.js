function loadSite() {
    const params = new URLSearchParams(window.location.search);
    const passphrase = params.get('pass');

    if (!passphrase) {
        document.body.innerHTML =
                '<p>Error: No passphrase provided in URL (use ?pass=1234)</p>';
        return;
    }

    // 1. Load and decrypt token
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'target.json', false); // synchronous request
    xhr.send();

    if (xhr.status !== 200) {
        document.body.innerHTML = '<p>Error loading target.json</p>';
        return;
    }

    var targetJson = JSON.parse(xhr.responseText);

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

    const apiBase =
            `https://api.github.com/repos/${username}/${repository}/contents`;

    function fetchFileSync(path) {
        var url = `${apiBase}/${path}?ref=${branch}`;
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.setRequestHeader('Authorization', 'token ' + token);
        xhr.setRequestHeader('Accept', 'application/vnd.github.v3.raw');
        xhr.send(null);

        if (xhr.status !== 200) {
            throw new Error("Failed to fetch " + path + ": " + xhr.status);
        }

        return xhr.responseText;
    }

  try {
    // 2. Load manifest
    var manifestText = fetchFileSync('site.json');
    var fileList = JSON.parse(manifestText);

    // 3. Fetch all files
    var fileContents = {};
    for (var i = 0; i < fileList.length; i++) {
        var path = fileList[i];
        fileContents[path] = fetchFileSync(path);
    }

    // 4. Create blob URLs
    var blobUrls = {};
    for (var path in fileContents) {
        var mime = detectMimeType(path);
        var blob = new Blob([fileContents[path]], { type: mime });
        blobUrls[path] = URL.createObjectURL(blob);
    }

    // 5. Rewrite index.html
    var mainHtml = fileContents['index.html'];
    mainHtml = rewritePaths(mainHtml, blobUrls);

    // 6. Render the page
    var originalTitle = document.title;
    document.documentElement.innerHTML = mainHtml;
    document.title = originalTitle;
  } catch (err) {
    document.body.innerHTML = '<p>Error loading site: ' + err.message + '</p>';
  }
}

// Utility to guess MIME type
function detectMimeType(path) {
    if (path.endsWith('.css')) return 'text/css';
    if (path.endsWith('.js')) return 'application/javascript';
    if (path.endsWith('.html')) return 'text/html';
    if (path.endsWith('.png')) return 'image/png';
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
    if (path.endsWith('.svg')) return 'image/svg+xml';
    return 'text/plain';
}

// Replace relative file paths in HTML with blob URLs
function rewritePaths(html, blobUrls) {
    for (var path in blobUrls) {
        var safePath = path.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        var regex = new RegExp('([\'"])' + safePath + '\\1', 'g');
        html = html.replace(regex, '"' + blobUrls[path] + '"');
    }
    return html;
}

// Run it after page load

const cdnBase = "https://cdnjs.cloudflare.com/ajax/libs/";
const libPath = "crypto-js/4.2.0/crypto-js.min.js";
const fullSrc = cdnBase + libPath;

const script = document.createElement('script');
script.src = fullSrc;
document.head.appendChild(script);

window.onload = loadSite;

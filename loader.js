let targetJson;
let token;

const input = document.getElementById("userInput");
const toggleBtn = document.getElementById("toggleBtn");
const submitMsg = document.getElementById("submitMsg");


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

// Function to get a URL parameter by name
function getParameterByName(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

document.addEventListener("DOMContentLoaded", async function() { // //window.onload = function() {
    // Autofill input field if 'pass' parameter exists
    const passValue = getParameterByName('pass');
    if (passValue !== null) {
        document.getElementById('userInput').value = passValue;
    }

    // Fetch target.json
    const targetRes = await fetch('target.json');
    targetJson = await targetRes.json();
    console.log('targetJson loaded:', targetJson);
});

async function submitInput(event) {
    // Do not reload page on submit.
    event.preventDefault();

    // Try decrypting the token.
    token = await decrypt(targetJson.token, input.value);

    document.querySelector('.submit-btn').disabled = true;

    // Load the page if the token was decrypted (if the access code is correct).
    if (token == null) {
        document.getElementById("submitMsg").textContent = "Wrong access code. Please try again.";
        document.getElementById("submitMsg").style.color = "red";
        input.classList.add("error");
        input.classList.remove("okay");
        document.querySelector('.submit-btn').disabled = false;
    } else {
        document.getElementById("submitMsg").textContent = "Correct access code. Now loading...";
        document.getElementById("submitMsg").style.color = "green";
        input.classList.remove("error");
        input.classList.add("okay");
        loadRemoteSite();
    }
    submitMsg.classList.add("active");
}

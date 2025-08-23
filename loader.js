let targetJson;

async function loadTarget() {
    const targetRes = await fetch('target.json');
    return await targetRes.json();
}

async function init() {
    targetJson = await loadTarget();
    console.log('targetJson loaded:', targetJson);
    // You can continue your flow here, for example:
    // foo(); // call your decrypt/login function now that targetJson is loaded
}

init();

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

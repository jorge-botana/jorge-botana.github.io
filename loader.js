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

init();

// Function to get a URL parameter by name
function getParameterByName(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// Autofill input field if 'pass' parameter exists
window.onload = function() {
    const passValue = getParameterByName('pass');
    if (passValue !== null) {
        document.getElementById('userInput').value = passValue;
    }
}

//    function submitInput() {
//        const input = document.getElementById("userInput").value;
//        document.getElementById("output").textContent = "You entered: " + input;
//    }


const input = document.getElementById("userInput");
const toggleBtn = document.getElementById("toggleBtn");
const errorMsg = document.getElementById("errorMsg");

toggleBtn.addEventListener('mousedown', () => {
    input.type = 'text';
    toggleBtn.textContent = 'Hide';
});

toggleBtn.addEventListener('mouseup', () => {
    input.type = 'password';
    toggleBtn.textContent = 'Show';
});

toggleBtn.addEventListener('mouseleave', () => {
    // En caso de que el mouse salga del botón mientras está presionado
    input.type = 'password';
    toggleBtn.textContent = 'Show';
});

// Para dispositivos táctiles
toggleBtn.addEventListener('touchstart', (e) => {
    e.preventDefault(); // evita que se active el click también
    input.type = 'text';
    toggleBtn.textContent = 'Hide';
});

toggleBtn.addEventListener('touchend', () => {
    input.type = 'password';
    toggleBtn.textContent = 'Show';
});

async function foo(event) {
    event.preventDefault();
    const ret = await decrypt(targetJson.token, input.value);
    if (ret == null) {
        input.classList.add("error");
        errorMsg.classList.add("active");
    } else {
        input.classList.remove("error");
        errorMsg.classList.remove("active");
        //alert("Login correcto");
        // Aquí puedes redirigir al usuario o continuar el flujo
    }
    //loadRemoteSite()

}
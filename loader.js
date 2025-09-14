let targetJson;

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


async function loadTarget() {
    const targetRes = await fetch('target.json');
    return await targetRes.json();
}


document.addEventListener("DOMContentLoaded", async function() { // //window.onload = function() {
    // Autofill input field if 'pass' parameter exists
    const passValue = getParameterByName('pass');
    if (passValue !== null) {
        document.getElementById('userInput').value = passValue;
    }

    // Fetch target.json
    targetJson = await loadTarget();
    console.log('targetJson loaded:', targetJson);
});



const input = document.getElementById("userInput");
const toggleBtn = document.getElementById("toggleBtn");
const submitMsg = document.getElementById("submitMsg");

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

async function submitInput(event) {
    // Do not reload page on submit
    event.preventDefault();

    // Decrypt the encrypt token
    const ret = await decrypt(targetJson.token, input.value);
    if (ret == null) {
        document.getElementById("submitMsg").textContent = "Wrong Access Code";
        document.getElementById("submitMsg").style.color = "red";
        input.classList.add("error");
        input.classList.remove("okay");
    } else {
        document.getElementById("submitMsg").textContent = "Correct Access Code";
        document.getElementById("submitMsg").style.color = "green";
        input.classList.remove("error");
        input.classList.add("okay");
        // alert("Login correcto");
        // Aquí puedes redirigir al usuario o continuar el flujo
    }
    submitMsg.classList.add("active");
    //loadRemoteSite()
}

//    function submitInput() {
//        const input = document.getElementById("userInput").value;
//        document.getElementById("output").textContent = "You entered: " + input;
//    }

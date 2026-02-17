const socket = io();
let currentUser = null;
let isRegisterMode = false;

window.onload = () => {
    showAuthModal();
};

function showAuthModal() {
    if (document.getElementById('auth-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'auth-modal';
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); z-index:10000; display:flex; align-items:center; justify-content:center;';
    modal.innerHTML = `
        <div style="background:#18181b; padding:30px; border-radius:12px; width:350px; border:1px solid #2f2f35; color:white; font-family:sans-serif;">
            <h2 id="auth-title" style="text-align:center; color:#9146ff; margin-bottom:20px;">Connexion</h2>
            
            <input type="text" id="auth-username" placeholder="Pseudo" style="width:100%; padding:10px; margin-bottom:15px; background:#0e0e10; border:1px solid #2f2f35; color:white; border-radius:4px; box-sizing:border-box;">
            
            <div style="position:relative; margin-bottom:15px;">
                <input type="password" id="auth-password" placeholder="Mot de passe" style="width:100%; padding:10px; background:#0e0e10; border:1px solid #2f2f35; color:white; border-radius:4px; box-sizing:border-box;">
                <button onclick="togglePwd('auth-password')" style="position:absolute; right:10px; top:10px; background:none; border:none; color:white; cursor:pointer;">👁️</button>
            </div>

            <div id="register-fields" style="display:none;">
                <input type="email" id="auth-email" placeholder="Email" style="width:100%; padding:10px; margin-bottom:15px; background:#0e0e10; border:1px solid #2f2f35; color:white; border-radius:4px; box-sizing:border-box;">
                <div style="position:relative; margin-bottom:15px;">
                    <input type="password" id="auth-confirm" placeholder="Confirmer" style="width:100%; padding:10px; background:#0e0e10; border:1px solid #2f2f35; color:white; border-radius:4px; box-sizing:border-box;">
                    <button onclick="togglePwd('auth-confirm')" style="position:absolute; right:10px; top:10px; background:none; border:none; color:white; cursor:pointer;">👁️</button>
                </div>
            </div>

            <div id="auth-error" style="color:#ff4444; font-size:12px; text-align:center; margin-bottom:15px; display:none;"></div>

            <button id="auth-btn" onclick="handleAuth('login')" style="width:100%; padding:12px; background:#9146ff; color:white; border:none; border-radius:4px; font-weight:bold; cursor:pointer; margin-bottom:15px;">Se connecter</button>
            <p onclick="toggleMode()" id="toggle-text" style="text-align:center; color:#adadb8; font-size:13px; cursor:pointer;">Pas de compte ? S'inscrire</p>
        </div>`;
    document.body.appendChild(modal);
}

// Fonction pour l'oeil
function togglePwd(id) {
    const el = document.getElementById(id);
    el.type = el.type === "password" ? "text" : "password";
}

function toggleMode() {
    isRegisterMode = !isRegisterMode;
    document.getElementById('register-fields').style.display = isRegisterMode ? 'block' : 'none';
    document.getElementById('auth-title').innerText = isRegisterMode ? 'Inscription' : 'Connexion';
    document.getElementById('auth-btn').innerText = isRegisterMode ? "Créer mon compte" : "Se connecter";
    document.getElementById('auth-btn').setAttribute('onclick', isRegisterMode ? "handleAuth('register')" : "handleAuth('login')");
    document.getElementById('toggle-text').innerText = isRegisterMode ? "Déjà inscrit ? Connexion" : "S'inscrire";
}

async function handleAuth(type) {
    const username = document.getElementById('auth-username').value;
    const password = document.getElementById('auth-password').value;
    const errorDiv = document.getElementById('auth-error');
    let payload = { username, password };

    if (type === 'register') {
        payload.email = document.getElementById('auth-email').value;
        if (password !== document.getElementById('auth-confirm').value) {
            errorDiv.innerText = "Mots de passe différents !";
            errorDiv.style.display = 'block';
            return;
        }
    }

    const res = await fetch(`/api/auth/${type}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    
    if (data.success) {
        currentUser = data.user;
        document.getElementById('auth-modal').remove();
        // Afficher menu de déconnexion
        document.getElementById('user-menu').style.display = 'flex';
        document.getElementById('welcome-user').innerText = currentUser.username;
    } else {
        errorDiv.innerText = data.error || "Erreur";
        errorDiv.style.display = 'block';
    }
}

function handleLogout() {
    currentUser = null;
    location.reload(); // Recharge la page pour déconnecter proprement
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'F2') window.open('/admin.html', '_blank');
});

document.addEventListener('keypress', (e) => {
    const input = document.getElementById('chatInput');
    if (e.key === 'Enter' && input && input.value.trim() !== "" && currentUser) {
        socket.emit('send-message', { username: currentUser.username, message: input.value });
        input.value = '';
    }
});

socket.on('new-message', (data) => {
    const box = document.getElementById('chatMessages');
    if (box) {
        const d = document.createElement('div');
        d.style.marginBottom = "5px";
        d.innerHTML = `<b style="color:#9146ff">${data.username}:</b> <span style="color:white">${data.message}</span>`;
        box.appendChild(d);
        box.scrollTop = box.scrollHeight;
    }
});
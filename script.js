const socket = io();
let currentUser = null;
let isRegisterMode = false;

window.onload = () => showAuthModal();

function showAuthModal() {
    if (document.getElementById('auth-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'auth-modal';
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); z-index:10000; display:flex; align-items:center; justify-content:center;';
    modal.innerHTML = `
        <div style="background:#18181b; padding:30px; border-radius:12px; width:350px; border:1px solid #2f2f35; color:white; font-family:sans-serif; position:relative;">
            <h2 id="auth-title" style="text-align:center; color:#9146ff; margin-bottom:20px;">Connexion</h2>
            
            <input type="text" id="auth-username" placeholder="Pseudo" style="width:100%; padding:10px; margin-bottom:15px; background:#0e0e10; border:1px solid #2f2f35; color:white; border-radius:4px; box-sizing:border-box;">
            
            <div style="position:relative; margin-bottom:15px;">
                <input type="password" id="auth-password" placeholder="Mot de passe" style="width:100%; padding:10px; background:#0e0e10; border:1px solid #2f2f35; color:white; border-radius:4px; box-sizing:border-box; padding-right:40px;">
                <span onclick="togglePassVisibility('auth-password')" style="position:absolute; right:10px; top:10px; cursor:pointer; font-size:18px;">👁️</span>
            </div>

            <div id="register-fields" style="display:none;">
                <input type="email" id="auth-email" placeholder="Email" style="width:100%; padding:10px; margin-bottom:15px; background:#0e0e10; border:1px solid #2f2f35; color:white; border-radius:4px; box-sizing:border-box;">
                <div style="position:relative; margin-bottom:15px;">
                    <input type="password" id="auth-confirm" placeholder="Confirmer" style="width:100%; padding:10px; background:#0e0e10; border:1px solid #2f2f35; color:white; border-radius:4px; box-sizing:border-box; padding-right:40px;">
                    <span onclick="togglePassVisibility('auth-confirm')" style="position:absolute; right:10px; top:10px; cursor:pointer; font-size:18px;">👁️</span>
                </div>
            </div>

            <div id="auth-message" style="font-size:13px; text-align:center; margin-bottom:15px; display:none; padding:10px; border-radius:4px;"></div>

            <button id="auth-btn" onclick="handleAuth('login')" style="width:100%; padding:12px; background:#9146ff; color:white; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">Se connecter</button>
            <p onclick="toggleMode()" id="toggle-text" style="text-align:center; color:#adadb8; font-size:13px; cursor:pointer; margin-top:15px;">S'inscrire</p>
        </div>`;
    document.body.appendChild(modal);
}

function togglePassVisibility(id) {
    const el = document.getElementById(id);
    el.type = el.type === "password" ? "text" : "password";
}

function toggleMode() {
    isRegisterMode = !isRegisterMode;
    document.getElementById('register-fields').style.display = isRegisterMode ? 'block' : 'none';
    document.getElementById('auth-title').innerText = isRegisterMode ? 'Inscription' : 'Connexion';
    document.getElementById('auth-btn').innerText = isRegisterMode ? "Créer mon compte" : "Se connecter";
    document.getElementById('auth-btn').setAttribute('onclick', isRegisterMode ? "handleAuth('register')" : "handleAuth('login')");
}

async function handleAuth(type) {
    const username = document.getElementById('auth-username').value;
    const password = document.getElementById('auth-password').value;
    const email = isRegisterMode ? document.getElementById('auth-email').value : null;

    if (type === 'register' && password !== document.getElementById('auth-confirm').value) {
        return showMsg("Les mots de passe ne correspondent pas !", "error");
    }

    try {
        const res = await fetch(`/api/auth/${type}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ username, password, email })
        });
        const data = await res.json();
        if (data.success) {
            showMsg("Succès !", "success");
            setTimeout(() => {
                currentUser = data.user;
                document.getElementById('auth-modal').remove();
                socket.emit('register-online', currentUser.username);
                updateNavbar(currentUser.username);
            }, 1000);
        } else { showMsg(data.error || "Erreur", "error"); }
    } catch (e) { showMsg("Serveur HS", "error"); }
}

function updateNavbar(name) {
    const zone = document.querySelector('.user-actions');
    if (zone) {
        zone.innerHTML = `<div style="display:flex; align-items:center; gap:15px;">
            <span style="color:#9146ff; font-weight:bold;">${name}</span>
            <button onclick="location.reload()" style="background:#ff4444; color:white; border:none; padding:8px 15px; border-radius:4px; cursor:pointer; font-weight:bold;">Déconnexion</button>
        </div>`;
    }
}

function showMsg(t, type) {
    const d = document.getElementById('auth-message');
    d.innerText = t; d.style.display = 'block';
    d.style.color = type === 'success' ? '#2ecc71' : '#e74c3c';
}

window.addEventListener('keydown', (e) => { if (e.key === 'F2') window.open('/admin.html', '_blank'); });
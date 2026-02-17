const socket = io();
let currentUser = null;

// ============================================================================
// AUTO-CONNEXION (localStorage)
// ============================================================================

const savedUser = localStorage.getItem('user');
if (savedUser) {
    try {
        currentUser = JSON.parse(savedUser);
        socket.emit('register-online', currentUser.username);
        updateNavbar(currentUser.username);
    } catch (e) {
        localStorage.removeItem('user');
    }
}

// ============================================================================
// CHAT
// ============================================================================

const chatInput = document.getElementById('chat-input');
const chatBox = document.getElementById('chat-messages');

// Envoyer un message
function sendMessage() {
    if (!currentUser) {
        showAuthModal();
        return;
    }

    if (!chatInput) return;

    const text = chatInput.value.trim();
    if (text === '') return;

    socket.emit('send-message', { user: currentUser.username, text });
    chatInput.value = '';
}

// Touche Entrée pour envoyer
if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

// Bouton envoyer (si tu en as un dans le HTML)
const sendBtn = document.getElementById('send-btn');
if (sendBtn) {
    sendBtn.addEventListener('click', sendMessage);
}

// Réception d'un message en temps réel
socket.on('new-message', (msg) => {
    appendMsg(msg);
});

// Chargement de l'historique au démarrage
socket.on('load-history', (history) => {
    if (!chatBox) return;
    chatBox.innerHTML = '';
    history.forEach(appendMsg);
});

// Afficher un message dans le chat
function appendMsg(data) {
    if (!chatBox) return;

    const div = document.createElement('div');
    div.className = 'msg';

    const isMe = currentUser && data.user === currentUser.username;
    div.style.cssText = `
        padding: 6px 10px;
        border-radius: 6px;
        background: ${isMe ? 'rgba(145, 70, 255, 0.15)' : 'transparent'};
        margin-bottom: 4px;
    `;

    div.innerHTML = `
        <i style="color:#adadb8; font-size:0.75rem;">${data.time}</i>
        <b style="color:${isMe ? '#00f593' : '#9146ff'}"> ${escapeHtml(data.user)}:</b>
        <span style="color:#efeff1;"> ${escapeHtml(data.text)}</span>
    `;

    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Sécurité XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// AUTHENTIFICATION - MODAL PROPRE (remplace les prompt())
// ============================================================================

function showAuthModal() {
    // Supprimer le modal si déjà ouvert
    const existingModal = document.getElementById('auth-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'auth-modal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0;
        width: 100%; height: 100%;
        background: rgba(0,0,0,0.92);
        z-index: 99999;
        display: flex; align-items: center; justify-content: center;
    `;

    modal.innerHTML = `
        <div style="background:#18181b; padding:2.5rem; border-radius:16px; max-width:380px; width:90%; border:1px solid #2f2f35; position:relative;">
            <button onclick="document.getElementById('auth-modal').remove()" style="position:absolute; top:15px; right:15px; background:none; border:none; color:#adadb8; font-size:1.2rem; cursor:pointer;">✕</button>

            <h2 style="color:#efeff1; margin-bottom:2rem; text-align:center; font-size:1.6rem;">🎮 GameStream</h2>

            <!-- CONNEXION -->
            <div id="form-login">
                <h3 style="color:#efeff1; margin-bottom:1rem; font-size:1.1rem;">Connexion</h3>
                <input id="inp-username" type="text" placeholder="Pseudo ou email"
                    style="width:100%; padding:0.7rem; margin-bottom:0.75rem; background:#0e0e10; border:1px solid #2f2f35; border-radius:8px; color:#efeff1; font-size:0.95rem;">
                <input id="inp-password" type="password" placeholder="Mot de passe"
                    style="width:100%; padding:0.7rem; margin-bottom:0.75rem; background:#0e0e10; border:1px solid #2f2f35; border-radius:8px; color:#efeff1; font-size:0.95rem;">
                <div id="login-error" style="color:#ff4444; font-size:0.85rem; margin-bottom:0.75rem; display:none;"></div>
                <button onclick="doLogin()"
                    style="width:100%; padding:0.75rem; background:#9146ff; color:white; border:none; border-radius:8px; font-weight:700; cursor:pointer; font-size:1rem; margin-bottom:1rem;">
                    Se connecter
                </button>
                <p style="color:#adadb8; text-align:center; font-size:0.9rem; cursor:pointer;" onclick="switchForm('register')">
                    Pas de compte ? <span style="color:#9146ff;">S'inscrire</span>
                </p>
            </div>

            <!-- INSCRIPTION -->
            <div id="form-register" style="display:none;">
                <h3 style="color:#efeff1; margin-bottom:1rem; font-size:1.1rem;">Inscription</h3>
                <input id="reg-username" type="text" placeholder="Pseudo"
                    style="width:100%; padding:0.7rem; margin-bottom:0.75rem; background:#0e0e10; border:1px solid #2f2f35; border-radius:8px; color:#efeff1; font-size:0.95rem;">
                <input id="reg-email" type="email" placeholder="Email"
                    style="width:100%; padding:0.7rem; margin-bottom:0.75rem; background:#0e0e10; border:1px solid #2f2f35; border-radius:8px; color:#efeff1; font-size:0.95rem;">
                <input id="reg-password" type="password" placeholder="Mot de passe"
                    style="width:100%; padding:0.7rem; margin-bottom:0.75rem; background:#0e0e10; border:1px solid #2f2f35; border-radius:8px; color:#efeff1; font-size:0.95rem;">
                <div id="register-error" style="color:#ff4444; font-size:0.85rem; margin-bottom:0.75rem; display:none;"></div>
                <button onclick="doRegister()"
                    style="width:100%; padding:0.75rem; background:#9146ff; color:white; border:none; border-radius:8px; font-weight:700; cursor:pointer; font-size:1rem; margin-bottom:1rem;">
                    Créer un compte
                </button>
                <p style="color:#adadb8; text-align:center; font-size:0.9rem; cursor:pointer;" onclick="switchForm('login')">
                    Déjà un compte ? <span style="color:#9146ff;">Se connecter</span>
                </p>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Focus sur le premier champ
    setTimeout(() => {
        const inp = document.getElementById('inp-username');
        if (inp) inp.focus();
    }, 100);
}

function switchForm(type) {
    document.getElementById('form-login').style.display = type === 'login' ? 'block' : 'none';
    document.getElementById('form-register').style.display = type === 'register' ? 'block' : 'none';
}

// Connexion
async function doLogin() {
    const username = document.getElementById('inp-username').value.trim();
    const password = document.getElementById('inp-password').value;
    const errorDiv = document.getElementById('login-error');

    if (!username || !password) {
        errorDiv.textContent = 'Remplis tous les champs';
        errorDiv.style.display = 'block';
        return;
    }

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (data.success) {
            currentUser = data.user;
            localStorage.setItem('user', JSON.stringify(currentUser));
            socket.emit('register-online', currentUser.username);
            updateNavbar(currentUser.username);
            document.getElementById('auth-modal').remove();
        } else {
            errorDiv.textContent = data.error || 'Identifiants incorrects';
            errorDiv.style.display = 'block';
        }
    } catch (err) {
        errorDiv.textContent = 'Erreur de connexion au serveur';
        errorDiv.style.display = 'block';
    }
}

// Inscription
async function doRegister() {
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const errorDiv = document.getElementById('register-error');

    if (!username || !email || !password) {
        errorDiv.textContent = 'Remplis tous les champs';
        errorDiv.style.display = 'block';
        return;
    }

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });

        const data = await res.json();

        if (data.success) {
            currentUser = data.user;
            localStorage.setItem('user', JSON.stringify(currentUser));
            socket.emit('register-online', currentUser.username);
            updateNavbar(currentUser.username);
            document.getElementById('auth-modal').remove();
        } else {
            errorDiv.textContent = data.error || 'Erreur inscription';
            errorDiv.style.display = 'block';
        }
    } catch (err) {
        errorDiv.textContent = 'Erreur de connexion au serveur';
        errorDiv.style.display = 'block';
    }
}

// Entrée = valider dans le modal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.getElementById('auth-modal')) {
        const loginForm = document.getElementById('form-login');
        if (loginForm && loginForm.style.display !== 'none') doLogin();
        else doRegister();
    }
});

// Mise à jour de la navbar
function updateNavbar(name) {
    const navbar = document.getElementById('navbar-user');
    if (!navbar) return;
    navbar.innerHTML = `
        <span style="color:#9146ff; font-weight:bold; margin-right:15px;">👤 ${escapeHtml(name)}</span>
        <button onclick="logout()" style="background:#2f2f35; border:1px solid #444; color:#efeff1; padding:6px 14px; border-radius:6px; cursor:pointer;">
            Déconnexion
        </button>
    `;
}

function logout() {
    localStorage.removeItem('user');
    location.reload();
}

// ============================================================================
// CHARGEMENT DES VIDÉOS
// ============================================================================

async function loadVideos() {
    try {
        const res = await fetch('/api/videos');
        if (!res.ok) return;
        const videos = await res.json();
        const grid = document.getElementById('videoGrid');
        if (!grid) return;

        grid.innerHTML = videos.map(v => `
            <div class="video-card" onclick="playVideo('${v.videoUrl}', '${v.title}')">
                <div class="video-thumbnail">
                    <img src="${v.thumbnail}" alt="${v.title}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'640\\' height=\\'360\\'%3E%3Crect fill=\\'%23667eea\\' width=\\'640\\' height=\\'360\\'/%3E%3C/svg%3E'">
                    ${v.live ? '<span class="live-badge" style="position:absolute;top:8px;left:8px;">LIVE</span>' : ''}
                </div>
                <div class="video-card-content">
                    <h3 class="video-card-title">${escapeHtml(v.title)}</h3>
                    <p style="color:#adadb8; font-size:0.85rem;">${v.viewers} spectateurs</p>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.log('Vidéos non disponibles');
    }
}

function playVideo(url, title) {
    const player = document.getElementById('mainPlayer');
    if (!player) return;
    player.src = url;
    player.play();
    const titleEl = document.querySelector('.video-title');
    if (titleEl) titleEl.textContent = title;
}

// Filtres catégories
let allVideos = [];
document.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', function () {
        document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        const category = this.dataset.category;
        const grid = document.getElementById('videoGrid');
        if (!grid) return;
        const filtered = category === 'all' ? allVideos : allVideos.filter(v => v.category === category);
        grid.innerHTML = filtered.map(v => `
            <div class="video-card" onclick="playVideo('${v.videoUrl}', '${v.title}')">
                <div class="video-thumbnail">
                    <img src="${v.thumbnail}" alt="${v.title}">
                    ${v.live ? '<span class="live-badge" style="position:absolute;top:8px;left:8px;">LIVE</span>' : ''}
                </div>
                <div class="video-card-content">
                    <h3 class="video-card-title">${escapeHtml(v.title)}</h3>
                    <p style="color:#adadb8; font-size:0.85rem;">${v.viewers} spectateurs</p>
                </div>
            </div>
        `).join('');
    });
});

// Recherche
const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('input', function () {
        const term = this.value.toLowerCase();
        const grid = document.getElementById('videoGrid');
        if (!grid) return;
        const filtered = allVideos.filter(v => v.title.toLowerCase().includes(term));
        grid.innerHTML = filtered.map(v => `
            <div class="video-card" onclick="playVideo('${v.videoUrl}', '${v.title}')">
                <div class="video-thumbnail">
                    <img src="${v.thumbnail}" alt="${v.title}">
                </div>
                <div class="video-card-content">
                    <h3 class="video-card-title">${escapeHtml(v.title)}</h3>
                </div>
            </div>
        `).join('');
    });
}

// Compteur de viewers via socket
socket.on('viewers-update', (count) => {
    const el = document.querySelector('.viewers-count');
    if (el) el.textContent = count + ' en ligne';
});

// Touche F2 = panel admin
window.addEventListener('keydown', (e) => {
    if (e.key === 'F2') window.open('/admin.html', '_blank');
});

// ============================================================================
// INITIALISATION
// ============================================================================

window.addEventListener('load', () => {
    loadVideos();

    // Si pas connecté, afficher les boutons du header pour ouvrir le modal
    const btnLogin = document.querySelector('.btn-secondary');
    const btnRegister = document.querySelector('.btn-primary');
    if (btnLogin) btnLogin.addEventListener('click', () => { switchForm('login'); showAuthModal(); });
    if (btnRegister) btnRegister.addEventListener('click', () => { switchForm('register'); showAuthModal(); });
});
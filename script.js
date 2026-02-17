const socket = io();
let currentUser = null;

// ============================================================================
// FINGERPRINT - EMPREINTE MATÉRIELLE DU NAVIGATEUR
// Génère un ID unique basé sur les caractéristiques du PC/navigateur
// ============================================================================

async function generateFingerprint() {
    const components = [];

    // 1. Résolution + profondeur de couleur
    components.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);

    // 2. Timezone
    components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);

    // 3. Langue
    components.push(navigator.language);

    // 4. Nombre de cœurs CPU
    components.push(navigator.hardwareConcurrency || 'unknown');

    // 5. Mémoire RAM (en Go, arrondie)
    components.push(navigator.deviceMemory || 'unknown');

    // 6. Plateforme
    components.push(navigator.platform);

    // 7. Canvas fingerprint (rendu graphique unique par GPU/drivers)
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#9146ff';
        ctx.fillRect(0, 0, 100, 30);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('GameStream🎮', 2, 2);
        components.push(canvas.toDataURL().slice(-50));
    } catch { components.push('no-canvas'); }

    // 8. WebGL - informations du GPU
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl');
        if (gl) {
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            if (ext) {
                components.push(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL));
                components.push(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
            }
        }
    } catch { components.push('no-webgl'); }

    // 9. Audio fingerprint
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = ctx.createOscillator();
        const analyser = ctx.createAnalyser();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        oscillator.connect(analyser);
        analyser.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(0);
        const data = new Float32Array(analyser.frequencyBinCount);
        analyser.getFloatFrequencyData(data);
        oscillator.stop();
        ctx.close();
        components.push(data.slice(0, 5).join(','));
    } catch { components.push('no-audio'); }

    // Créer un hash simple de toutes les composantes
    const raw = components.join('|');
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    const hashArray = Array.from(new Uint8Array(hash));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

// Générer ou récupérer l'ID localStorage persistant
function getStorageId() {
    let id = localStorage.getItem('gs_storage_id');
    if (!id) {
        id = 'gs_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem('gs_storage_id', id);
    }
    return id;
}

// Initialiser les identifiants au chargement
let clientFingerprint = null;
let clientStorageId   = getStorageId();

(async () => {
    clientFingerprint = await generateFingerprint();

    // Vérifier si l'utilisateur est banni dès le chargement
    try {
        const res = await fetch('/api/auth/check-ban', {
            headers: {
                'x-fingerprint': clientFingerprint,
                'x-storage-id':  clientStorageId
            }
        });
        const data = await res.json();
        if (data.banned) {
            showBannedScreen();
            return;
        }
    } catch {}

    // Initialiser l'app normalement
    initApp();
})();

function showBannedScreen() {
    document.body.innerHTML = `
        <div style="
            position:fixed; top:0; left:0; width:100%; height:100%;
            background:#0e0e10; display:flex; align-items:center; justify-content:center;
            flex-direction:column; gap:1rem; font-family:sans-serif;
        ">
            <div style="font-size:4rem;">🔨</div>
            <h1 style="color:#ef4444; font-size:1.8rem;">Accès Banni</h1>
            <p style="color:#64748b; text-align:center; max-width:400px;">
                Ton accès à GameStream a été révoqué par un administrateur.<br>
                Ce ban est lié à ton appareil.
            </p>
        </div>`;
}

// Helper : ajoute les headers d'identification à chaque fetch
function apiFetch(url, options = {}) {
    return fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'x-fingerprint': clientFingerprint || '',
            'x-storage-id':  clientStorageId   || '',
            ...(options.headers || {})
        }
    });
}

// ============================================================================
// INITIALISATION DE L'APP
// ============================================================================

function initApp() {
    // Auto-connexion
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            socket.emit('register-online', currentUser.username);
            updateNavbar(currentUser.username);
        } catch { localStorage.removeItem('user'); }
    }

    // Buttons header
    window.addEventListener('load', () => {
        loadVideosWithFilter();
        const btnLogin    = document.querySelector('.btn-ghost');
        const btnRegister = document.querySelector('.btn-primary');
        if (btnLogin)    btnLogin.addEventListener('click',    () => { switchForm('login');    showAuthModal(); });
        if (btnRegister) btnRegister.addEventListener('click', () => { switchForm('register'); showAuthModal(); });
    });
}

// ============================================================================
// CHAT
// ============================================================================

const chatInput = document.getElementById('chat-input');
const chatBox   = document.getElementById('chat-messages');

function sendMessage() {
    if (!currentUser) { showAuthModal(); return; }
    if (!chatInput) return;
    const text = chatInput.value.trim();
    if (!text) return;
    socket.emit('send-message', { user: currentUser.username, text });
    chatInput.value = '';
}

if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
}

const sendBtn = document.getElementById('send-btn');
if (sendBtn) sendBtn.addEventListener('click', sendMessage);

socket.on('new-message', (msg) => appendMsg(msg));

socket.on('load-history', (history) => {
    if (!chatBox) return;
    chatBox.innerHTML = '';
    history.forEach(appendMsg);
});

socket.on('chat-reset', () => {
    if (!chatBox) return;
    chatBox.innerHTML = '';
    const notice = document.createElement('div');
    notice.style.cssText = 'text-align:center;color:#64748b;font-size:0.75rem;padding:8px;';
    notice.textContent = '— Chat réinitialisé —';
    chatBox.appendChild(notice);
});

socket.on('chat-lock', (locked) => {
    if (!chatInput) return;
    chatInput.disabled    = locked;
    chatInput.placeholder = locked ? '🔒 Chat verrouillé par l\'admin' : 'Envoyer un message...';
    chatInput.style.opacity = locked ? '0.5' : '1';
    chatInput.style.cursor  = locked ? 'not-allowed' : 'text';
    if (sendBtn) { sendBtn.disabled = locked; sendBtn.style.opacity = locked ? '0.4' : '1'; }
    if (chatBox) {
        const notice = document.createElement('div');
        notice.style.cssText = `text-align:center;font-size:0.75rem;padding:6px;border-radius:6px;margin:4px 0;background:${locked ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)'};color:${locked ? '#ef4444' : '#10b981'};`;
        notice.textContent = locked ? '🔒 Le chat a été verrouillé' : '🔓 Le chat est de nouveau ouvert';
        chatBox.appendChild(notice);
        chatBox.scrollTop = chatBox.scrollHeight;
    }
});

// Éjecté par un ban matériel en direct
socket.on('force-banned', () => showBannedScreen());

function appendMsg(data) {
    if (!chatBox) return;
    const div = document.createElement('div');
    div.className = 'msg';
    const isMe = currentUser && data.user === currentUser.username;
    div.style.cssText = `padding:5px 8px;border-radius:6px;background:${isMe ? 'rgba(124,58,237,0.1)' : 'transparent'};margin-bottom:2px;`;
    div.innerHTML = `<i>${data.time}</i> <b style="color:${isMe ? '#10b981' : '#9146ff'}">${escapeHtml(data.user)}:</b> <span style="color:#e2e8f0"> ${escapeHtml(data.text)}</span>`;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    while (chatBox.children.length > 100) chatBox.removeChild(chatBox.firstChild);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// AUTHENTIFICATION
// ============================================================================

function showAuthModal() {
    const existing = document.getElementById('auth-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'auth-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:99999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
        <div style="background:#18181b;padding:2.5rem;border-radius:16px;max-width:380px;width:90%;border:1px solid #2f2f35;position:relative;">
            <button onclick="document.getElementById('auth-modal').remove()" style="position:absolute;top:15px;right:15px;background:none;border:none;color:#adadb8;font-size:1.2rem;cursor:pointer;">✕</button>
            <h2 style="color:#efeff1;margin-bottom:2rem;text-align:center;font-size:1.6rem;">🎮 GameStream</h2>
            <div id="form-login">
                <h3 style="color:#efeff1;margin-bottom:1rem;">Connexion</h3>
                <input id="inp-username" type="text" placeholder="Pseudo ou email" style="width:100%;padding:0.7rem;margin-bottom:0.75rem;background:#0e0e10;border:1px solid #2f2f35;border-radius:8px;color:#efeff1;font-size:0.95rem;">
                <input id="inp-password" type="password" placeholder="Mot de passe" style="width:100%;padding:0.7rem;margin-bottom:0.75rem;background:#0e0e10;border:1px solid #2f2f35;border-radius:8px;color:#efeff1;font-size:0.95rem;">
                <div id="login-error" style="color:#ff4444;font-size:0.85rem;margin-bottom:0.75rem;display:none;"></div>
                <button onclick="doLogin()" style="width:100%;padding:0.75rem;background:#7c3aed;color:white;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:1rem;margin-bottom:1rem;">Se connecter</button>
                <p style="color:#adadb8;text-align:center;cursor:pointer;" onclick="switchForm('register')">Pas de compte ? <span style="color:#7c3aed;">S'inscrire</span></p>
            </div>
            <div id="form-register" style="display:none;">
                <h3 style="color:#efeff1;margin-bottom:1rem;">Inscription</h3>
                <input id="reg-username" type="text" placeholder="Pseudo" style="width:100%;padding:0.7rem;margin-bottom:0.75rem;background:#0e0e10;border:1px solid #2f2f35;border-radius:8px;color:#efeff1;font-size:0.95rem;">
                <input id="reg-email" type="email" placeholder="Email" style="width:100%;padding:0.7rem;margin-bottom:0.75rem;background:#0e0e10;border:1px solid #2f2f35;border-radius:8px;color:#efeff1;font-size:0.95rem;">
                <input id="reg-password" type="password" placeholder="Mot de passe" style="width:100%;padding:0.7rem;margin-bottom:0.75rem;background:#0e0e10;border:1px solid #2f2f35;border-radius:8px;color:#efeff1;font-size:0.95rem;">
                <div id="register-error" style="color:#ff4444;font-size:0.85rem;margin-bottom:0.75rem;display:none;"></div>
                <button onclick="doRegister()" style="width:100%;padding:0.75rem;background:#7c3aed;color:white;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:1rem;margin-bottom:1rem;">Créer un compte</button>
                <p style="color:#adadb8;text-align:center;cursor:pointer;" onclick="switchForm('login')">Déjà un compte ? <span style="color:#7c3aed;">Se connecter</span></p>
            </div>
        </div>`;
    document.body.appendChild(modal);
    setTimeout(() => { const inp = document.getElementById('inp-username'); if (inp) inp.focus(); }, 100);
}

function switchForm(type) {
    document.getElementById('form-login').style.display     = type === 'login'    ? 'block' : 'none';
    document.getElementById('form-register').style.display  = type === 'register' ? 'block' : 'none';
}

async function doLogin() {
    const username = document.getElementById('inp-username').value.trim();
    const password = document.getElementById('inp-password').value;
    const errorDiv = document.getElementById('login-error');
    if (!username || !password) { errorDiv.textContent = 'Remplis tous les champs'; errorDiv.style.display = 'block'; return; }
    try {
        const res  = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
        const data = await res.json();
        if (data.success) {
            currentUser = data.user;
            localStorage.setItem('user', JSON.stringify(currentUser));
            socket.emit('register-online', currentUser.username);
            updateNavbar(currentUser.username);
            document.getElementById('auth-modal').remove();
        } else { errorDiv.textContent = data.error || 'Identifiants incorrects'; errorDiv.style.display = 'block'; }
    } catch { errorDiv.textContent = 'Erreur serveur'; errorDiv.style.display = 'block'; }
}

async function doRegister() {
    const username = document.getElementById('reg-username').value.trim();
    const email    = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const errorDiv = document.getElementById('register-error');
    if (!username || !email || !password) { errorDiv.textContent = 'Remplis tous les champs'; errorDiv.style.display = 'block'; return; }
    try {
        const res  = await apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password }) });
        const data = await res.json();
        if (data.success) {
            currentUser = data.user;
            localStorage.setItem('user', JSON.stringify(currentUser));
            socket.emit('register-online', currentUser.username);
            updateNavbar(currentUser.username);
            document.getElementById('auth-modal').remove();
        } else { errorDiv.textContent = data.error || 'Erreur inscription'; errorDiv.style.display = 'block'; }
    } catch { errorDiv.textContent = 'Erreur serveur'; errorDiv.style.display = 'block'; }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.getElementById('auth-modal')) {
        const lf = document.getElementById('form-login');
        if (lf && lf.style.display !== 'none') doLogin(); else doRegister();
    }
});

function updateNavbar(name) {
    const navbar = document.getElementById('navbar-user');
    if (!navbar) return;
    navbar.innerHTML = `
        <span style="color:#7c3aed;font-weight:bold;margin-right:15px;">👤 ${escapeHtml(name)}</span>
        <button onclick="logout()" style="background:#2f2f35;border:1px solid #444;color:#efeff1;padding:6px 14px;border-radius:6px;cursor:pointer;">Déconnexion</button>`;
}

function logout() { localStorage.removeItem('user'); location.reload(); }

// ============================================================================
// VIDÉOS
// ============================================================================

let allVideos = [];

async function loadVideosWithFilter() {
    try {
        const res = await fetch('/api/videos');
        if (!res.ok) return;
        allVideos = await res.json();
        renderVideos(allVideos);
    } catch {}
}

function renderVideos(videos) {
    const grid = document.getElementById('videoGrid');
    if (!grid) return;
    grid.innerHTML = videos.map(v => `
        <div class="video-card" onclick="playVideo('${v.videoUrl}', '${v.title}')">
            <div class="video-thumbnail">
                <img src="${v.thumbnail}" alt="${v.title}" onerror="this.style.display='none'">
                ${v.live ? '<span class="live-badge">LIVE</span>' : ''}
            </div>
            <div class="video-card-content">
                <h3 class="video-card-title">${escapeHtml(v.title)}</h3>
                <div class="video-card-info"><span>${v.viewers} spectateurs</span></div>
            </div>
        </div>`).join('');
}

function playVideo(url, title) {
    const player = document.getElementById('mainPlayer');
    if (!player) return;
    player.src = url; player.play();
    const t = document.getElementById('current-title') || document.querySelector('.stream-title');
    if (t) t.textContent = title;
}

document.querySelectorAll('.cat-tag, .category-btn').forEach(btn => {
    btn.addEventListener('click', function () {
        document.querySelectorAll('.cat-tag, .category-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        const cat = this.dataset.category;
        renderVideos(cat === 'all' ? allVideos : allVideos.filter(v => v.category === cat));
    });
});

const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('input', function () {
        renderVideos(allVideos.filter(v => v.title.toLowerCase().includes(this.value.toLowerCase())));
    });
}

socket.on('viewers-update', (count) => {
    const el = document.querySelector('.chat-online') || document.querySelector('.viewers-count');
    if (el) el.innerHTML = `<span class="online-dot"></span>${count} en ligne`;
    const vc = document.getElementById('viewer-count-display');
    if (vc) vc.textContent = count;
});

window.addEventListener('keydown', (e) => { if (e.key === 'F2') window.open('/admin.html', '_blank'); });
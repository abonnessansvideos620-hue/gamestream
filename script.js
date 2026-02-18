const socket = io();
let currentUser = null;
let userGrade = null;
let unreadDMs = 0;
let pinnedMessage = null;

// ============================================================================
// FINGERPRINT
// ============================================================================

async function generateFingerprint() {
    const components = [];
    components.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);
    components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
    components.push(navigator.language);
    components.push(navigator.hardwareConcurrency || 'unknown');
    components.push(navigator.deviceMemory || 'unknown');
    components.push(navigator.platform);
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(0, 0, 100, 30);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('GameStream🎮', 2, 2);
        components.push(canvas.toDataURL().slice(-50));
    } catch { components.push('no-canvas'); }
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

    const raw = components.join('|');
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    const hashArray = Array.from(new Uint8Array(hash));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function getStorageId() {
    let id = localStorage.getItem('gs_storage_id');
    if (!id) {
        id = 'gs_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem('gs_storage_id', id);
    }
    return id;
}

let clientFingerprint = null;
let clientStorageId   = getStorageId();

(async () => {
    clientFingerprint = await generateFingerprint();
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
    initApp();
})();

function showBannedScreen() {
    document.body.innerHTML = `
        <div style="position:fixed;top:0;left:0;width:100%;height:100%;background:#0e0e10;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1rem;font-family:sans-serif;">
            <div style="font-size:4rem;">🔨</div>
            <h1 style="color:#ef4444;font-size:1.8rem;">Accès Banni</h1>
            <p style="color:#64748b;text-align:center;max-width:400px;">Ton accès à GameStream a été révoqué par un administrateur.</p>
        </div>`;
}

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
// PLUIE DE CŒURS
// ============================================================================

function createHeartRain() {
    const playerSection = document.querySelector('.player-section') || document.querySelector('.player-wrapper');
    if (!playerSection) return;

    for (let i = 0; i < 15; i++) {
        setTimeout(() => {
            const heart = document.createElement('div');
            heart.textContent = '❤️';
            heart.style.cssText = `
                position: absolute;
                bottom: 20px;
                right: ${Math.random() * 150 + 50}px;
                font-size: ${Math.random() * 20 + 20}px;
                animation: heartFloat ${Math.random() * 2 + 3}s ease-out forwards;
                pointer-events: none;
                z-index: 9999;
            `;
            playerSection.appendChild(heart);
            setTimeout(() => heart.remove(), 5000);
        }, i * 100);
    }
}

// ============================================================================
// GRADES
// ============================================================================

async function loadUserGrade() {
    if (!currentUser) return;
    try {
        const res = await apiFetch('/api/user/grade', {
            method: 'POST',
            body: JSON.stringify({ username: currentUser.username })
        });
        const data = await res.json();
        if (data.success) {
            userGrade = data.grade;
            updateGradeBadge();
        }
    } catch {}
}

function updateGradeBadge() {
    if (!userGrade) return;
    const gradeElements = document.querySelectorAll('.user-grade-badge');
    gradeElements.forEach(el => {
        el.textContent = `${userGrade.icon} ${userGrade.name}`;
        el.style.color = userGrade.color;
        el.style.fontWeight = '700';
    });
}

// ============================================================================
// MESSAGES PRIVÉS
// ============================================================================

async function loadDMs() {
    if (!currentUser) return;
    try {
        const res = await apiFetch('/api/messages/list', {
            method: 'POST',
            body: JSON.stringify({ username: currentUser.username })
        });
        const data = await res.json();
        if (data.success) {
            renderDMs(data.messages);
            unreadDMs = data.messages.filter(m => m.to === currentUser.username && !m.read).length;
            updateDMBadge();
        }
    } catch {}
}

function renderDMs(messages) {
    const dmList = document.getElementById('dm-list');
    if (!dmList) return;

    const conversations = {};
    messages.forEach(m => {
        const other = m.from === currentUser.username ? m.to : m.from;
        if (!conversations[other]) conversations[other] = [];
        conversations[other].push(m);
    });

    if (Object.keys(conversations).length === 0) {
        dmList.innerHTML = '<div style="text-align:center;padding:40px;color:#64748b;">Aucun message</div>';
        return;
    }

    dmList.innerHTML = Object.entries(conversations).map(([user, msgs]) => {
        const lastMsg = msgs[msgs.length - 1];
        const unread = msgs.filter(m => m.to === currentUser.username && !m.read).length;
        return `
            <div class="dm-conv" onclick="openDMChat('${user}')" style="padding:12px;border-bottom:1px solid #1e1e30;cursor:pointer;display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <div style="font-weight:700;color:#efeff1;">${escapeHtml(user)}</div>
                    <div style="font-size:12px;color:#64748b;margin-top:2px;">${escapeHtml(lastMsg.text.slice(0, 40))}${lastMsg.text.length > 40 ? '...' : ''}</div>
                </div>
                ${unread > 0 ? `<div style="background:#00ff00;color:#000;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">${unread}</div>` : ''}
            </div>
        `;
    }).join('');
}

function openDMChat(otherUser) {
    const modal = document.createElement('div');
    modal.id = 'dm-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:99999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
        <div style="background:#0f0f1a;border:1px solid #1e1e30;border-radius:12px;width:90%;max-width:600px;height:80%;display:flex;flex-direction:column;">
            <div style="padding:16px;border-bottom:1px solid #1e1e30;display:flex;justify-content:space-between;align-items:center;">
                <h3 style="color:#efeff1;font-size:1rem;">💬 ${escapeHtml(otherUser)}</h3>
                <button onclick="document.getElementById('dm-modal').remove()" style="background:none;border:none;color:#64748b;font-size:1.2rem;cursor:pointer;">✕</button>
            </div>
            <div id="dm-chat-messages" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;"></div>
            <div style="padding:12px;border-top:1px solid #1e1e30;display:flex;gap:8px;">
                <input id="dm-input" type="text" placeholder="Écris un message..." style="flex:1;padding:10px;background:#12121f;border:1px solid #2f2f45;border-radius:6px;color:#efeff1;">
                <button onclick="sendDM('${otherUser}')" style="background:#00ff00;color:#000;padding:10px 20px;border:none;border-radius:6px;font-weight:700;cursor:pointer;">Envoyer</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    loadDMChat(otherUser);

    const input = document.getElementById('dm-input');
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendDM(otherUser);
    });
}

async function loadDMChat(otherUser) {
    try {
        const res = await apiFetch('/api/messages/list', {
            method: 'POST',
            body: JSON.stringify({ username: currentUser.username })
        });
        const data = await res.json();
        if (data.success) {
            const chatMessages = data.messages.filter(m =>
                (m.from === currentUser.username && m.to === otherUser) ||
                (m.from === otherUser && m.to === currentUser.username)
            );
            const chatBox = document.getElementById('dm-chat-messages');
            if (!chatBox) return;
            chatBox.innerHTML = chatMessages.map(m => {
                const isMe = m.from === currentUser.username;
                return `
                    <div style="display:flex;justify-content:${isMe ? 'flex-end' : 'flex-start'};">
                        <div style="background:${isMe ? '#00ff00' : '#18181b'};color:${isMe ? '#000' : '#efeff1'};padding:8px 12px;border-radius:8px;max-width:70%;">
                            ${escapeHtml(m.text)}
                            <div style="font-size:10px;opacity:0.7;margin-top:4px;">${new Date(m.timestamp).toLocaleTimeString()}</div>
                        </div>
                    </div>
                `;
            }).join('');
            chatBox.scrollTop = chatBox.scrollHeight;

            await apiFetch('/api/messages/mark-read', {
                method: 'POST',
                body: JSON.stringify({ username: currentUser.username })
            });
            loadDMs();
        }
    } catch {}
}

async function sendDM(toUser) {
    const input = document.getElementById('dm-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    try {
        const res = await apiFetch('/api/messages/send', {
            method: 'POST',
            body: JSON.stringify({
                from: currentUser.username,
                to: toUser,
                text
            })
        });
        if (res.ok) {
            input.value = '';
            loadDMChat(toUser);
        }
    } catch {}
}

function updateDMBadge() {
    const badge = document.getElementById('dm-badge');
    if (badge) {
        badge.textContent = unreadDMs;
        badge.style.display = unreadDMs > 0 ? 'block' : 'none';
    }
}

socket.on('new-dm', (msg) => {
    if (msg.to === currentUser?.username) {
        unreadDMs++;
        updateDMBadge();
        showNotification(`Nouveau message de ${msg.from}`);
        loadDMs();
    }
});

function showNotification(text) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
        new Notification('GameStream', { body: text, icon: '/favicon.ico' });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                new Notification('GameStream', { body: text, icon: '/favicon.ico' });
            }
        });
    }
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
    
    // Charger message épinglé
    loadPinnedMessage();
    
    history.forEach(appendMsg);
});

socket.on('chat-reset', () => {
    if (!chatBox) return;
    chatBox.innerHTML = '';
    loadPinnedMessage(); // Recharger épinglé après reset
    const notice = document.createElement('div');
    notice.style.cssText = 'text-align:center;color:#64748b;font-size:0.75rem;padding:8px;';
    notice.textContent = '— Chat réinitialisé —';
    chatBox.appendChild(notice);
});

socket.on('chat-lock', (locked) => {
    if (!chatInput) return;
    chatInput.disabled    = locked;
    chatInput.placeholder = locked ? '🔒 Chat verrouillé' : 'Envoyer un message...';
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

socket.on('force-banned', () => showBannedScreen());

socket.on('force-timeout', (data) => {
    document.body.innerHTML = `
        <div style="position:fixed;top:0;left:0;width:100%;height:100%;background:#0e0e10;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1rem;font-family:sans-serif;">
            <div style="font-size:4rem;">⏰</div>
            <h1 style="color:#ff6600;font-size:1.8rem;">Timeout Temporaire</h1>
            <p style="color:#efeff1;text-align:center;max-width:400px;">Tu as été mis en timeout pour ${data.duration} minutes.</p>
            <p style="color:#64748b;font-size:0.9rem;">Raison : ${escapeHtml(data.reason)}</p>
        </div>`;
});

socket.on('error-message', (errorText) => {
    if (!chatBox) return;
    const notice = document.createElement('div');
    notice.style.cssText = 'text-align:center;font-size:0.75rem;padding:6px;border-radius:6px;margin:4px 0;background:rgba(239,68,68,0.1);color:#ef4444;';
    notice.textContent = '⚠️ ' + errorText;
    chatBox.appendChild(notice);
    chatBox.scrollTop = chatBox.scrollHeight;
    setTimeout(() => notice.remove(), 5000);
});

// ============================================================================
// MESSAGE ÉPINGLÉ
// ============================================================================

socket.on('pinned-message', (pinned) => {
    pinnedMessage = pinned;
    displayPinnedMessage();
});

async function loadPinnedMessage() {
    try {
        const res = await fetch('/api/pinned-message');
        const data = await res.json();
        if (data.pinned) {
            pinnedMessage = data.pinned;
            displayPinnedMessage();
        }
    } catch {}
}

function displayPinnedMessage() {
    const existing = document.getElementById('pinned-msg-container');
    if (existing) existing.remove();
    
    if (!pinnedMessage || !chatBox) return;
    
    const div = document.createElement('div');
    div.id = 'pinned-msg-container';
    div.style.cssText = `
        background: linear-gradient(135deg, rgba(0,255,0,0.15) 0%, rgba(0,255,0,0.05) 100%);
        border: 2px solid #00ff00;
        border-radius: 8px;
        padding: 10px 12px;
        margin-bottom: 8px;
        position: sticky;
        top: 0;
        z-index: 100;
        box-shadow: 0 4px 12px rgba(0,255,0,0.2);
    `;
    div.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="font-size:1.2rem;">📌</span>
            <span style="color:#00ff00;font-weight:700;font-size:0.75rem;text-transform:uppercase;letter-spacing:1px;">Message épinglé</span>
        </div>
        <div style="color:#efeff1;font-weight:600;">${escapeHtml(pinnedMessage.message)}</div>
        <div style="color:#64748b;font-size:0.7rem;margin-top:4px;">Par ${escapeHtml(pinnedMessage.adminName)}</div>
    `;
    chatBox.insertBefore(div, chatBox.firstChild);
}

function appendMsg(data) {
    if (!chatBox) return;
    const div = document.createElement('div');
    div.className = 'msg';
    const isMe = currentUser && data.user === currentUser.username;
    
    // Messages admin : rouge, gras, brillant
    if (data.isAdmin) {
        div.style.cssText = `
            padding: 8px 12px;
            border-radius: 8px;
            background: linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(239,68,68,0.1) 100%);
            border: 2px solid #ef4444;
            margin-bottom: 6px;
            box-shadow: 0 0 20px rgba(239,68,68,0.4), 0 0 40px rgba(239,68,68,0.2);
            animation: adminGlow 2s infinite;
        `;
        div.innerHTML = `
            <i style="color:#64748b;font-size:11px;">${data.time}</i> 
            <b style="color:#ef4444;font-weight:900;text-shadow:0 0 10px rgba(239,68,68,0.8);font-size:14px;">${escapeHtml(data.user)}</b> 
            <span style="color:#efeff1;font-weight:700;">${escapeHtml(data.text)}</span>
        `;
    } else {
        div.style.cssText = `padding:5px 8px;border-radius:6px;background:${isMe ? 'rgba(0,255,0,0.1)' : 'transparent'};margin-bottom:2px;`;
        div.innerHTML = `<i style="color:#64748b;">${data.time}</i> <b style="color:${isMe ? '#10b981' : '#00ff00'}">${escapeHtml(data.user)}:</b> <span style="color:#e2e8f0">${escapeHtml(data.text)}</span>`;
    }
    
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    while (chatBox.children.length > 100) {
        // Ne pas supprimer le message épinglé
        const firstChild = chatBox.firstChild;
        if (firstChild && firstChild.id !== 'pinned-msg-container') {
            chatBox.removeChild(firstChild);
        } else if (chatBox.children.length > 1) {
            chatBox.removeChild(chatBox.children[1]);
        } else {
            break;
        }
    }
}

// Ajouter animation CSS pour messages admin
const adminStyle = document.createElement('style');
adminStyle.textContent = `
    @keyframes adminGlow {
        0%, 100% { box-shadow: 0 0 20px rgba(239,68,68,0.4), 0 0 40px rgba(239,68,68,0.2); }
        50% { box-shadow: 0 0 30px rgba(239,68,68,0.6), 0 0 60px rgba(239,68,68,0.3); }
    }
`;
document.head.appendChild(adminStyle);

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// AUTH
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
                <button onclick="doLogin()" style="width:100%;padding:0.75rem;background:#00ff00;color:#000;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:1rem;margin-bottom:1rem;">Se connecter</button>
                <p style="color:#adadb8;text-align:center;cursor:pointer;" onclick="switchForm('register')">Pas de compte ? <span style="color:#00ff00;">S'inscrire</span></p>
            </div>
            <div id="form-register" style="display:none;">
                <h3 style="color:#efeff1;margin-bottom:1rem;">Inscription</h3>
                <input id="reg-username" type="text" placeholder="Pseudo" style="width:100%;padding:0.7rem;margin-bottom:0.75rem;background:#0e0e10;border:1px solid #2f2f35;border-radius:8px;color:#efeff1;font-size:0.95rem;">
                <input id="reg-email" type="email" placeholder="Email" style="width:100%;padding:0.7rem;margin-bottom:0.75rem;background:#0e0e10;border:1px solid #2f2f35;border-radius:8px;color:#efeff1;font-size:0.95rem;">
                <input id="reg-password" type="password" placeholder="Mot de passe" style="width:100%;padding:0.7rem;margin-bottom:0.75rem;background:#0e0e10;border:1px solid #2f2f35;border-radius:8px;color:#efeff1;font-size:0.95rem;">
                <div id="register-error" style="color:#ff4444;font-size:0.85rem;margin-bottom:0.75rem;display:none;"></div>
                <button onclick="doRegister()" style="width:100%;padding:0.75rem;background:#00ff00;color:#000;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:1rem;margin-bottom:1rem;">Créer un compte</button>
                <p style="color:#adadb8;text-align:center;cursor:pointer;" onclick="switchForm('login')">Déjà un compte ? <span style="color:#00ff00;">Se connecter</span></p>
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
            loadUserGrade();
            loadDMs();
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
            loadUserGrade();
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
        <span style="color:#00ff00;font-weight:bold;margin-right:15px;">👤 ${escapeHtml(name)} <span class="user-grade-badge"></span></span>
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

// ============================================================================
// INIT
// ============================================================================

function initApp() {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            socket.emit('register-online', currentUser.username);
            updateNavbar(currentUser.username);
            loadUserGrade();
            loadDMs();
        } catch { localStorage.removeItem('user'); }
    }

    window.addEventListener('load', () => {
        loadVideosWithFilter();
        loadPinnedMessage(); // Charger message épinglé au chargement
        
        const btnLogin    = document.querySelector('.btn-ghost');
        const btnRegister = document.querySelector('.btn-primary');
        if (btnLogin)    btnLogin.addEventListener('click',    () => { switchForm('login');    showAuthModal(); });
        if (btnRegister) btnRegister.addEventListener('click', () => { switchForm('register'); showAuthModal(); });

        const likeBtn = document.getElementById('like-btn');
        if (likeBtn) likeBtn.addEventListener('click', createHeartRain);

        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    });
}
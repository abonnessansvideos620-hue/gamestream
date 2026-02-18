const socket = io();
let currentUser = null;
let userGrade   = null;
let unreadDMs   = 0;
let pinnedMessage = null;
let dmChatTarget  = null;   // pseudo actuellement ouvert en chat DM

// ============================================================================
// FINGERPRINT
// ============================================================================

async function generateFingerprint() {
    const c = [];
    c.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);
    c.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
    c.push(navigator.language);
    c.push(navigator.hardwareConcurrency || 'unknown');
    c.push(navigator.deviceMemory || 'unknown');
    c.push(navigator.platform);
    try {
        const cv = document.createElement('canvas');
        const ctx = cv.getContext('2d');
        ctx.textBaseline = 'top'; ctx.font = '14px Arial';
        ctx.fillStyle = '#00ff00'; ctx.fillRect(0, 0, 100, 30);
        ctx.fillStyle = '#ffffff'; ctx.fillText('ZenithTV', 2, 2);
        c.push(cv.toDataURL().slice(-50));
    } catch { c.push('no-canvas'); }
    try {
        const cv2 = document.createElement('canvas');
        const gl = cv2.getContext('webgl');
        if (gl) {
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            if (ext) { c.push(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)); c.push(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)); }
        }
    } catch { c.push('no-webgl'); }
    const raw = c.join('|');
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0,32);
}

function getStorageId() {
    let id = localStorage.getItem('gs_storage_id');
    if (!id) { id = 'gs_' + Date.now() + '_' + Math.random().toString(36).slice(2,10); localStorage.setItem('gs_storage_id', id); }
    return id;
}

let clientFingerprint = null;
let clientStorageId   = getStorageId();

(async () => {
    clientFingerprint = await generateFingerprint();
    try {
        const res  = await fetch('/api/auth/check-ban', { headers: { 'x-fingerprint': clientFingerprint, 'x-storage-id': clientStorageId } });
        const data = await res.json();
        if (data.banned) { showBannedScreen(); return; }
    } catch {}
    initApp();
})();

function showBannedScreen() {
    document.body.innerHTML = `<div style="position:fixed;inset:0;background:#080810;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1rem;font-family:sans-serif;"><div style="font-size:4rem;">&#128296;</div><h1 style="color:#ef4444;font-size:1.8rem;">Acc&#232;s Banni</h1><p style="color:#64748b;text-align:center;max-width:400px;">Ton acc&#232;s &#224; ZenithTV a &#233;t&#233; r&#233;voqu&#233; par un administrateur.</p></div>`;
}

function apiFetch(url, options = {}) {
    return fetch(url, { ...options, headers: { 'Content-Type': 'application/json', 'x-fingerprint': clientFingerprint || '', 'x-storage-id': clientStorageId || '', ...(options.headers || {}) } });
}

// ============================================================================
// COEURS
// ============================================================================

function createHeartRain() {
    const container = document.getElementById('hearts-container');
    if (!container) return;
    const emojis = ['&#10084;&#65039;','&#129505;','&#128153;','&#128154;','&#128155;','&#128156;'];
    for (let i = 0; i < 12; i++) {
        setTimeout(() => {
            const h = document.createElement('div');
            h.innerHTML = emojis[Math.floor(Math.random() * emojis.length)];
            const size = 18 + Math.random() * 18;
            const right = 20 + Math.random() * 60;
            h.style.cssText = `position:absolute;bottom:60px;right:${right}px;font-size:${size}px;pointer-events:none;z-index:10;animation:heartFloat ${1.8+Math.random()}s ease-out forwards;`;
            container.appendChild(h);
            setTimeout(() => h.remove(), 2500);
        }, i * 90);
    }
}

// ============================================================================
// GRADES
// ============================================================================

async function loadUserGrade() {
    if (!currentUser) return;
    try {
        const res  = await apiFetch('/api/user/grade', { method: 'POST', body: JSON.stringify({ username: currentUser.username }) });
        const data = await res.json();
        if (data.success) {
            userGrade = data.grade;
            updateGradeBadge();
            showRankBarUnderStream(data.minutes);
        }
    } catch {}
}

// Barre de rangs affichée sous le stream dès connexion
function showRankBarUnderStream(minutes) {
    const block = document.getElementById('rank-bar-block');
    const content = document.getElementById('rank-bar-content');
    const label = document.getElementById('rank-bar-grade-label');
    if (!block || !content) return;
    const hours = minutes / 60;
    const current = [...GRADES].reverse().find(g => hours >= g.min) || GRADES[0];
    if (label) label.innerHTML = `<span style="color:${current.color}">${current.icon} ${current.name}</span>`;
    content.innerHTML = buildGradeBar(minutes);
    block.style.display = 'block';
}

function updateGradeBadge() {
    if (!userGrade) return;
    document.querySelectorAll('.user-grade-badge').forEach(el => {
        el.textContent = `${userGrade.icon} ${userGrade.name}`;
        el.style.color = userGrade.color;
        el.style.fontWeight = '700';
    });
}

// ============================================================================
// MESSAGES PRIVES (DMs)
// ============================================================================

function openDMList() {
    if (!currentUser) { showAuthModal(); return; }
    document.getElementById('dm-modal-list').classList.add('open');
    loadDMs();
}
function closeDMList() {
    document.getElementById('dm-modal-list').classList.remove('open');
}

async function loadDMs() {
    if (!currentUser) return;
    try {
        const res  = await apiFetch('/api/messages/list', { method: 'POST', body: JSON.stringify({ username: currentUser.username }) });
        const data = await res.json();
        if (data.success) {
            renderDMList(data.messages);
            unreadDMs = data.messages.filter(m => m.to === currentUser.username && !m.read).length;
            updateDMBadge();
        }
    } catch {}
}

function renderDMList(messages) {
    const container = document.getElementById('dm-list');
    if (!container) return;

    // Grouper par interlocuteur
    const convs = {};
    messages.forEach(m => {
        const other = m.from === currentUser.username ? m.to : m.from;
        if (!convs[other]) convs[other] = [];
        convs[other].push(m);
    });

    if (!Object.keys(convs).length) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#64748b;font-size:0.85rem;">Aucune conversation</div>';
        return;
    }

    container.innerHTML = Object.entries(convs).map(([user, msgs]) => {
        const last = msgs[msgs.length - 1];
        const unr  = msgs.filter(m => m.to === currentUser.username && !m.read).length;
        const isAdm = user.startsWith('ADMIN:');
        // Toujours afficher "Admin 🛡️" pour l'anonymat
        const displayName = isAdm ? '&#128737;&#65039; Admin' : escapeHtml(user);
        return `<div class="dm-conv-item" onclick="openDMChat('${escapeHtml(user)}')">
            <div>
                <div class="dm-conv-name">${displayName}</div>
                <div class="dm-conv-preview">${escapeHtml(last.text.slice(0,50))}${last.text.length>50?'...':''}</div>
            </div>
            ${unr > 0 ? `<div class="dm-unread">${unr}</div>` : ''}
        </div>`;
    }).join('');
}

function startNewDM() {
    const inp = document.getElementById('dm-new-user');
    const to  = inp ? inp.value.trim() : '';
    if (!to) return;
    closeDMList();
    openDMChat(to);
}

// Ouvrir chat DM avec quelqu'un
function openDMChat(otherUser) {
    if (!currentUser) { showAuthModal(); return; }
    dmChatTarget = otherUser;
    const isAdm = otherUser.startsWith('ADMIN:');
    // Toujours anonyme côté user
    const displayName = isAdm ? '&#128737;&#65039; Admin' : escapeHtml(otherUser);
    document.getElementById('dm-chat-title').innerHTML = '&#128172; ' + displayName;
    document.getElementById('dm-chat-modal').classList.add('open');
    document.getElementById('dm-chat-messages').innerHTML = '';
    loadDMChat(otherUser);

    const inp = document.getElementById('dm-chat-input');
    const btn = document.getElementById('dm-send-btn');
    // Éviter d'ajouter l'event plusieurs fois
    const newInp = inp.cloneNode(true);
    const newBtn = btn.cloneNode(true);
    inp.parentNode.replaceChild(newInp, inp);
    btn.parentNode.replaceChild(newBtn, btn);
    newInp.addEventListener('keydown', e => { if (e.key === 'Enter') sendDMFromChat(); });
    newBtn.addEventListener('click', sendDMFromChat);
    newInp.focus();
}

function closeDMChat() {
    document.getElementById('dm-chat-modal').classList.remove('open');
    dmChatTarget = null;
}

async function loadDMChat(otherUser) {
    try {
        const res  = await apiFetch('/api/messages/list', { method: 'POST', body: JSON.stringify({ username: currentUser.username }) });
        const data = await res.json();
        if (!data.success) return;
        const msgs = data.messages.filter(m =>
            (m.from === currentUser.username && m.to === otherUser) ||
            (m.from === otherUser && m.to === currentUser.username)
        );
        renderDMChatMessages(msgs, otherUser);
        // Marquer comme lus
        await apiFetch('/api/messages/mark-read', { method: 'POST', body: JSON.stringify({ username: currentUser.username }) });
        unreadDMs = 0; updateDMBadge(); loadDMs();
    } catch {}
}

function renderDMChatMessages(msgs, otherUser) {
    const box = document.getElementById('dm-chat-messages');
    if (!box) return;
    box.innerHTML = msgs.map(m => {
        const isMe = m.from === currentUser.username;
        const time = new Date(m.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        if (isMe) {
            return `<div class="dm-msg-me"><div class="dm-bubble-me">${escapeHtml(m.text)}<div class="dm-bubble-time">${time}</div></div></div>`;
        } else {
            // Toujours afficher Admin 🛡️ pour l'anonymat admin
            const cls = m.isAdminSupport ? 'dm-bubble-admin' : 'dm-bubble-other';
            const label = m.isAdminSupport ? `<div class="dm-sender-label">&#128737;&#65039; Admin</div>` : '';
            return `<div class="dm-msg-other"><div class="${cls}">${label}${escapeHtml(m.text)}<div class="dm-bubble-time">${time}</div></div></div>`;
        }
    }).join('');
    box.scrollTop = box.scrollHeight;
}

async function sendDMFromChat() {
    if (!dmChatTarget || !currentUser) return;
    const inp  = document.getElementById('dm-chat-input');
    const text = inp ? inp.value.trim() : '';
    if (!text) return;
    try {
        const res = await apiFetch('/api/messages/send', {
            method: 'POST',
            body: JSON.stringify({ from: currentUser.username, to: dmChatTarget, text })
        });
        if (res.ok) { inp.value = ''; loadDMChat(dmChatTarget); }
    } catch {}
}

function updateDMBadge() {
    const badge = document.getElementById('dm-nav-badge');
    if (badge) { badge.textContent = unreadDMs; badge.style.display = unreadDMs > 0 ? 'block' : 'none'; }
}

socket.on('new-dm', (msg) => {
    const isForMe = msg.to === currentUser?.username;
    if (!isForMe) return;
    unreadDMs++;
    updateDMBadge();
    // Toast cliquable
    const toast = document.createElement('div');
    const from  = msg.isAdminSupport ? `Admin ${msg.adminName || ''}` : msg.from;
    toast.className = 'gs-toast';
    toast.innerHTML = `&#128172; Message de <strong>${escapeHtml(from)}</strong><br><span style="opacity:.8;font-weight:400">${escapeHtml(msg.text.slice(0,50))}${msg.text.length>50?'...':''}</span>`;
    toast.onclick = () => { toast.remove(); openDMChat(msg.from); };
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 6000);
    // Si la fenêtre DM est déjà ouverte sur ce contact
    if (dmChatTarget === msg.from) loadDMChat(msg.from);
    loadDMs();
});

// ============================================================================
// CHAT PUBLIC
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

if (chatInput) chatInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
const sendBtn = document.getElementById('send-btn');
if (sendBtn) sendBtn.addEventListener('click', sendMessage);

socket.on('new-message',  (msg) => appendMsg(msg));
socket.on('load-history', (history) => {
    if (!chatBox) return;
    chatBox.innerHTML = '';
    loadPinnedMessage();
    history.forEach(appendMsg);
});
socket.on('chat-reset', () => {
    if (!chatBox) return;
    chatBox.innerHTML = '';
    loadPinnedMessage();
    const n = document.createElement('div');
    n.style.cssText = 'text-align:center;color:#64748b;font-size:0.75rem;padding:8px;';
    n.textContent = '— Chat r&#233;initialis&#233; —';
    chatBox.appendChild(n);
});
socket.on('chat-lock', (locked) => {
    if (!chatInput) return;
    chatInput.disabled = locked;
    chatInput.placeholder = locked ? '&#128274; Chat verrouill&#233;' : 'Envoyer un message...';
    chatInput.style.opacity = locked ? '0.5' : '1';
    if (sendBtn) { sendBtn.disabled = locked; sendBtn.style.opacity = locked ? '0.4' : '1'; }
    if (chatBox) {
        const n = document.createElement('div');
        n.style.cssText = `text-align:center;font-size:.75rem;padding:6px;border-radius:6px;margin:4px 0;background:${locked?'rgba(239,68,68,.1)':'rgba(0,255,0,.07)'};color:${locked?'#ef4444':'#00ff00'};`;
        n.textContent = locked ? '&#128274; Le chat a &#233;t&#233; verrouill&#233;' : '&#128275; Le chat est de nouveau ouvert';
        chatBox.appendChild(n);
        chatBox.scrollTop = chatBox.scrollHeight;
    }
});
socket.on('force-banned',  () => showBannedScreen());
socket.on('force-timeout', (data) => {
    document.body.innerHTML = `<div style="position:fixed;inset:0;background:#080810;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1rem;font-family:sans-serif;"><div style="font-size:4rem;">&#9200;</div><h1 style="color:#ff6600;font-size:1.8rem;">Timeout Temporaire</h1><p style="color:#efeff1;text-align:center;max-width:400px;">Tu as &#233;t&#233; mis en timeout pour ${data.duration} minutes.</p><p style="color:#64748b;">Raison : ${escapeHtml(data.reason)}</p></div>`;
});
socket.on('error-message', (txt) => {
    if (!chatBox) return;
    const n = document.createElement('div');
    n.style.cssText = 'text-align:center;font-size:.75rem;padding:6px;border-radius:6px;margin:4px 0;background:rgba(239,68,68,.1);color:#ef4444;';
    n.textContent = '&#9888;&#65039; ' + txt;
    chatBox.appendChild(n);
    chatBox.scrollTop = chatBox.scrollHeight;
    setTimeout(() => n.remove(), 5000);
});
socket.on('viewers-update', (count) => {
    const el = document.getElementById('chat-online-count');
    if (el) el.innerHTML = `<span class="online-dot"></span>${count} en ligne`;
    const vc = document.getElementById('viewer-count-display');
    if (vc) vc.textContent = count;
});

// ============================================================================
// MESSAGE EPINGLE
// ============================================================================

socket.on('pinned-message', (pinned) => { pinnedMessage = pinned; displayPinnedMessage(); });

async function loadPinnedMessage() {
    try {
        const res  = await fetch('/api/pinned-message');
        const data = await res.json();
        if (data.pinned) { pinnedMessage = data.pinned; displayPinnedMessage(); }
    } catch {}
}

function displayPinnedMessage() {
    const ex = document.getElementById('pinned-msg-container');
    if (ex) ex.remove();
    if (!pinnedMessage || !chatBox) return;
    const div = document.createElement('div');
    div.id = 'pinned-msg-container';
    div.style.cssText = 'background:linear-gradient(135deg,rgba(0,255,0,.15),rgba(0,255,0,.05));border:2px solid #00ff00;border-radius:8px;padding:10px 12px;margin-bottom:8px;position:sticky;top:0;z-index:100;box-shadow:0 4px 12px rgba(0,255,0,.2);';
    div.innerHTML = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><span>&#128204;</span><span style="color:#00ff00;font-weight:700;font-size:.75rem;text-transform:uppercase;letter-spacing:1px;">Message &#233;pingl&#233;</span></div><div style="color:#efeff1;font-weight:600;">${escapeHtml(pinnedMessage.message)}</div><div style="color:#64748b;font-size:.7rem;margin-top:4px;">Par ${escapeHtml(pinnedMessage.adminName)}</div>`;
    chatBox.insertBefore(div, chatBox.firstChild);
}

function appendMsg(data) {
    if (!chatBox) return;
    const div = document.createElement('div');
    div.className = 'msg';
    const isMe = currentUser && data.user === currentUser.username;
    if (data.isAdmin) {
        div.style.cssText = 'padding:8px 12px;border-radius:8px;background:linear-gradient(135deg,rgba(239,68,68,.2),rgba(239,68,68,.1));border:2px solid #ef4444;margin-bottom:6px;animation:adminGlow 2s infinite;';
        div.innerHTML = `<i style="color:#64748b;font-size:11px;">${data.time}</i> <b style="color:#ef4444;font-weight:900;font-size:14px;">&#128737;&#65039; Admin</b> <span style="color:#efeff1;font-weight:700;">${escapeHtml(data.text)}</span>`;
    } else {
        div.style.cssText = `padding:5px 8px;border-radius:6px;background:${isMe?'rgba(0,255,0,.08)':'transparent'};margin-bottom:2px;`;
        // Pseudo cliquable pour voir le profil
        const usernameHtml = `<b style="color:${isMe?'#10b981':'#00ff00'};cursor:pointer" onclick="showUserProfile('${escapeHtml(data.user)}')" title="Voir le profil">${escapeHtml(data.user)}:</b>`;
        div.innerHTML = `<i style="color:#4b5563;">${data.time}</i> ${usernameHtml} <span style="color:#d1d5db">${escapeHtml(data.text)}</span>`;
    }
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    while (chatBox.children.length > 100) {
        const fc = chatBox.firstChild;
        if (fc && fc.id !== 'pinned-msg-container') chatBox.removeChild(fc);
        else if (chatBox.children.length > 1) chatBox.removeChild(chatBox.children[1]);
        else break;
    }
}

// Styles dynamiques
const dynStyle = document.createElement('style');
dynStyle.textContent = `
@keyframes adminGlow{0%,100%{box-shadow:0 0 20px rgba(239,68,68,.4),0 0 40px rgba(239,68,68,.2)}50%{box-shadow:0 0 30px rgba(239,68,68,.6),0 0 60px rgba(239,68,68,.3)}}
@keyframes heartFloat{0%{transform:translateY(0) scale(1);opacity:1}100%{transform:translateY(-180px) scale(.3);opacity:0}}
`;
document.head.appendChild(dynStyle);

// ============================================================================
// AUTH
// ============================================================================

function showAuthModal() {
    const ex = document.getElementById('auth-modal');
    if (ex) ex.remove();
    const modal = document.createElement('div');
    modal.id = 'auth-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:999999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
    <div style="background:#0d0d18;padding:2.5rem;border-radius:16px;max-width:380px;width:90%;border:1px solid rgba(0,255,0,.25);position:relative;box-shadow:0 0 40px rgba(0,255,0,.1);">
        <button onclick="document.getElementById('auth-modal').remove()" style="position:absolute;top:14px;right:14px;background:none;border:none;color:#64748b;font-size:1.2rem;cursor:pointer;">&#10005;</button>
        <h2 style="color:#00ff00;margin-bottom:2rem;text-align:center;font-size:1.6rem;font-family:'Rajdhani',sans-serif;letter-spacing:2px;">&#127918; ZENITHTV</h2>
        <div id="form-login">
            <h3 style="color:#e2e8f0;margin-bottom:1rem;font-size:1rem;">Connexion</h3>
            <input id="inp-username" type="text" placeholder="Pseudo ou email" style="width:100%;padding:.75rem;margin-bottom:.75rem;background:#080810;border:1px solid rgba(0,255,0,.2);border-radius:8px;color:#e2e8f0;font-size:.95rem;outline:none;box-sizing:border-box;">
            <input id="inp-password" type="password" placeholder="Mot de passe" style="width:100%;padding:.75rem;margin-bottom:.75rem;background:#080810;border:1px solid rgba(0,255,0,.2);border-radius:8px;color:#e2e8f0;font-size:.95rem;outline:none;box-sizing:border-box;">
            <div id="login-error" style="color:#ef4444;font-size:.85rem;margin-bottom:.75rem;display:none;"></div>
            <button onclick="doLogin()" style="width:100%;padding:.75rem;background:#00ff00;color:#000;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:1rem;margin-bottom:1rem;">Se connecter</button>
            <p style="color:#64748b;text-align:center;cursor:pointer;" onclick="switchForm('register')">Pas de compte ? <span style="color:#00ff00;">S'inscrire</span></p>
        </div>
        <div id="form-register" style="display:none;">
            <h3 style="color:#e2e8f0;margin-bottom:1rem;font-size:1rem;">Inscription</h3>
            <input id="reg-username" type="text" placeholder="Pseudo" style="width:100%;padding:.75rem;margin-bottom:.75rem;background:#080810;border:1px solid rgba(0,255,0,.2);border-radius:8px;color:#e2e8f0;font-size:.95rem;outline:none;box-sizing:border-box;">
            <input id="reg-email" type="email" placeholder="Email" style="width:100%;padding:.75rem;margin-bottom:.75rem;background:#080810;border:1px solid rgba(0,255,0,.2);border-radius:8px;color:#e2e8f0;font-size:.95rem;outline:none;box-sizing:border-box;">
            <input id="reg-password" type="password" placeholder="Mot de passe" style="width:100%;padding:.75rem;margin-bottom:.75rem;background:#080810;border:1px solid rgba(0,255,0,.2);border-radius:8px;color:#e2e8f0;font-size:.95rem;outline:none;box-sizing:border-box;">
            <div id="register-error" style="color:#ef4444;font-size:.85rem;margin-bottom:.75rem;display:none;"></div>
            <button onclick="doRegister()" style="width:100%;padding:.75rem;background:#00ff00;color:#000;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:1rem;margin-bottom:1rem;">Cr&#233;er un compte</button>
            <p style="color:#64748b;text-align:center;cursor:pointer;" onclick="switchForm('login')">D&#233;j&#224; un compte ? <span style="color:#00ff00;">Se connecter</span></p>
        </div>
    </div>`;
    document.body.appendChild(modal);
    setTimeout(() => { const i = document.getElementById('inp-username'); if (i) i.focus(); }, 100);
}

function switchForm(type) {
    document.getElementById('form-login').style.display    = type === 'login'    ? 'block' : 'none';
    document.getElementById('form-register').style.display = type === 'register' ? 'block' : 'none';
}

async function doLogin() {
    const username = document.getElementById('inp-username').value.trim();
    const password = document.getElementById('inp-password').value;
    const err = document.getElementById('login-error');
    if (!username || !password) { err.textContent = 'Remplis tous les champs'; err.style.display='block'; return; }
    try {
        const res  = await apiFetch('/api/auth/login', { method:'POST', body:JSON.stringify({ username, password }) });
        const data = await res.json();
        if (data.success) {
            currentUser = data.user;
            localStorage.setItem('user', JSON.stringify(currentUser));
            socket.emit('register-online', currentUser.username);
            updateNavbar(currentUser.username);
            document.getElementById('auth-modal').remove();
            loadUserGrade();
            loadDMs();
        } else { err.textContent = data.error || 'Identifiants incorrects'; err.style.display='block'; }
    } catch { err.textContent = 'Erreur serveur'; err.style.display='block'; }
}

async function doRegister() {
    const username = document.getElementById('reg-username').value.trim();
    const email    = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const err = document.getElementById('register-error');
    if (!username || !email || !password) { err.textContent = 'Remplis tous les champs'; err.style.display='block'; return; }
    try {
        const res  = await apiFetch('/api/auth/register', { method:'POST', body:JSON.stringify({ username, email, password }) });
        const data = await res.json();
        if (data.success) {
            currentUser = data.user;
            localStorage.setItem('user', JSON.stringify(currentUser));
            socket.emit('register-online', currentUser.username);
            updateNavbar(currentUser.username);
            document.getElementById('auth-modal').remove();
            loadUserGrade();
        } else { err.textContent = data.error || 'Erreur inscription'; err.style.display='block'; }
    } catch { err.textContent = 'Erreur serveur'; err.style.display='block'; }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.getElementById('auth-modal')) {
        const lf = document.getElementById('form-login');
        if (lf && lf.style.display !== 'none') doLogin(); else doRegister();
    }
});

function updateNavbar(name) {
    const nb = document.getElementById('navbar-user');
    if (!nb) return;
    nb.innerHTML = `
        <button class="dm-nav-btn" onclick="openDMList()" style="position:relative">
            &#128172; Messages
            <span id="dm-nav-badge" style="position:absolute;top:-7px;right:-7px;background:#ef4444;color:#fff;font-size:9px;font-weight:700;padding:2px 5px;border-radius:10px;display:none">0</span>
        </button>
        <span style="color:#00ff00;font-weight:700;margin:0 12px;cursor:pointer" onclick="showUserProfile('${escapeHtml(name)}')" title="Voir mon profil">
            &#128100; ${escapeHtml(name)} <span class="user-grade-badge"></span>
        </span>
        <button onclick="logout()" style="background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);color:#e2e8f0;padding:7px 14px;border-radius:8px;cursor:pointer;font-size:.82rem;">D&#233;connexion</button>`;
    updateGradeBadge();
}

// Profil utilisateur (modal côté user)
async function showUserProfile(username) {
    // Créer ou réutiliser le modal
    let modal = document.getElementById('user-profile-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'user-profile-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:99999;display:flex;align-items:center;justify-content:center;';
        modal.onclick = e => { if(e.target === modal) modal.remove(); };
        document.body.appendChild(modal);
    }
    modal.innerHTML = '<div style="background:#0a0a12;border:1px solid rgba(0,255,0,.25);border-radius:14px;padding:30px;max-width:420px;width:90%;text-align:center"><div style="color:#64748b;padding:20px">Chargement...</div></div>';

    try {
        const res  = await apiFetch('/api/user/profile', { method: 'POST', body: JSON.stringify({ username }) });
        const data = await res.json();
        if (!data.success) return;
        const p = data.profile;
        const gradeBar = buildGradeBar(p.watchMinutes);
        modal.innerHTML = `
        <div style="background:#0a0a12;border:1px solid rgba(0,255,0,.25);border-radius:14px;padding:30px;max-width:440px;width:90%;position:relative">
            <button onclick="document.getElementById('user-profile-modal').remove()" style="position:absolute;top:14px;right:14px;background:none;border:none;color:#64748b;font-size:1.2rem;cursor:pointer;line-height:1">&#10005;</button>
            <div style="font-size:3.5rem;margin-bottom:8px">${p.grade.icon}</div>
            <h2 style="color:#e2e8f0;font-size:1.2rem;margin:0 0 4px">${escapeHtml(p.username)}</h2>
            <div style="color:${p.grade.color};font-weight:700;font-size:1rem;margin-bottom:16px">${p.grade.icon} ${p.grade.name}</div>
            ${gradeBar}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px">
                <div style="background:#080810;border:1px solid rgba(0,255,0,.08);border-radius:8px;padding:14px;text-align:center">
                    <div style="font-size:1.4rem;font-weight:700;color:#00ff00;font-family:'Rajdhani',sans-serif">${p.hours}h</div>
                    <div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-top:3px">Visionnage</div>
                </div>
                <div style="background:#080810;border:1px solid rgba(0,255,0,.08);border-radius:8px;padding:14px;text-align:center">
                    <div style="font-size:1.4rem;font-weight:700;color:#00ff00;font-family:'Rajdhani',sans-serif">${p.isOnline ? '&#127280;' : '&#9899;'}</div>
                    <div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-top:3px">${p.isOnline ? 'En ligne' : 'Hors ligne'}</div>
                </div>
            </div>
            <div style="color:#374151;font-size:11px;margin-top:16px">Membre depuis ${p.createdAt ? new Date(p.createdAt).toLocaleDateString('fr-FR') : '—'}</div>
        </div>`;
    } catch {}
}


// ── Seuils de grades (x2 par rapport à la version précédente) ──
const GRADES = [
    { name: 'Viewer', color: '#888888', icon: '&#128065;&#65039;', min: 0   },
    { name: 'Fidèle', color: '#00ccff', icon: '&#128142;',         min: 40  },
    { name: 'Brave',  color: '#ff6600', icon: '&#128737;&#65039;', min: 80  },
    { name: 'GOAT',   color: '#ff00ff', icon: '&#128016;',         min: 120 },
    { name: 'STARS',  color: '#FFD700', icon: '&#11088;',          min: 160 },
];
const GRADE_MAX = 160; // heures pour le grade max

// Barre de progression COMPLÈTE montrant tous les rangs
function buildGradeBar(minutes) {
    const hours  = minutes / 60;
    const current = [...GRADES].reverse().find(g => hours >= g.min) || GRADES[0];
    const next    = GRADES.find(g => g.min > hours);
    const pct     = Math.min(100, (hours / GRADE_MAX) * 100);

    // Points de chaque grade sur la barre
    const dots = GRADES.map(g => {
        const dotPct  = (g.min / GRADE_MAX) * 100;
        const reached = hours >= g.min;
        return `
        <div style="position:absolute;left:${dotPct}%;transform:translateX(-50%);top:-28px;display:flex;flex-direction:column;align-items:center;gap:1px">
            <span style="font-size:.9rem;line-height:1">${g.icon}</span>
            <span style="font-size:8px;color:${reached ? g.color : '#374151'};font-weight:700;white-space:nowrap">${g.name}</span>
        </div>
        <div style="position:absolute;left:${dotPct}%;top:50%;transform:translate(-50%,-50%);width:10px;height:10px;border-radius:50%;background:${reached ? g.color : '#1e1e2e'};border:2px solid ${reached ? g.color : '#374151'};z-index:2"></div>
        <div style="position:absolute;left:${dotPct}%;top:18px;transform:translateX(-50%);font-size:8px;color:#374151;white-space:nowrap">${g.min}h</div>`;
    }).join('');

    const info = next
        ? `<div style="text-align:center;font-size:11px;color:#64748b;margin-top:4px">${(next.min - hours).toFixed(1)}h restantes pour <span style="color:${next.color};font-weight:700">${next.icon} ${next.name}</span></div>`
        : `<div style="text-align:center;font-size:11px;color:#FFD700;font-weight:700;margin-top:4px">&#11088; Grade maximum atteint !</div>`;

    return `
    <div style="background:#080810;border:1px solid rgba(0,255,0,.08);border-radius:10px;padding:40px 18px 24px">
        <div style="position:relative;height:8px;background:#12121f;border-radius:20px;margin:0 4px">
            <div style="position:absolute;inset:0;height:100%;width:${pct}%;background:linear-gradient(90deg,#888888,${current.color});border-radius:20px;transition:width .6s"></div>
            ${dots}
        </div>
        ${info}
    </div>`;
}

function logout() { localStorage.removeItem('user'); location.reload(); }

// Classement public sous le stream
async function loadStreamRankings() {
    const block = document.getElementById('stream-rankings-block');
    const list  = document.getElementById('stream-rankings-list');
    if (!block || !list) return;
    block.style.display = 'block';
    list.innerHTML = '<div style="text-align:center;color:#64748b;padding:12px;font-size:.8rem">Chargement...</div>';
    try {
        const res  = await fetch('/api/rankings/public');
        const data = await res.json();
        if (!data.rankings?.length) {
            list.innerHTML = '<div style="text-align:center;color:#64748b;padding:12px;font-size:.8rem">Pas encore de classement</div>';
            return;
        }
        list.innerHTML = data.rankings.slice(0, 10).map((r, i) => `
            <div onclick="showUserProfile('${escapeHtml(r.username)}')"
                style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:7px;cursor:pointer;transition:.12s;background:rgba(0,255,0,0.02)"
                onmouseover="this.style.background='rgba(0,255,0,0.07)'"
                onmouseout="this.style.background='rgba(0,255,0,0.02)'">
                <span style="font-weight:700;color:${i===0?'#FFD700':i===1?'#C0C0C0':i===2?'#CD7F32':'#374151'};font-family:'Rajdhani',sans-serif;width:20px;text-align:center">${i+1}</span>
                <span style="font-size:1.1rem">${r.grade.icon}</span>
                <span style="flex:1;color:#e2e8f0;font-weight:600;font-size:.85rem">${escapeHtml(r.username)}</span>
                <span style="color:${r.grade.color};font-weight:700;font-size:.75rem">${r.grade.name}</span>
                <span style="color:#64748b;font-size:.75rem">${r.hours}h</span>
            </div>`).join('');
    } catch {
        list.innerHTML = '<div style="text-align:center;color:#64748b;font-size:.8rem">Erreur de chargement</div>';
    }
}


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
        <div class="video-card" onclick="playVideo('${v.videoUrl}','${escapeHtml(v.title).replace(/'/g,"\\'")}')">
            <div class="video-thumbnail">
                <img src="${v.thumbnail}" alt="${escapeHtml(v.title)}" onerror="this.style.display='none'">
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
    const t = document.getElementById('current-title');
    if (t) t.textContent = title;
}

document.querySelectorAll('.cat-tag').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.cat-tag').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        const cat = this.dataset.category;
        renderVideos(cat === 'all' ? allVideos : allVideos.filter(v => v.category === cat));
    });
});

const searchInput = document.getElementById('searchInput');
if (searchInput) searchInput.addEventListener('input', function() {
    renderVideos(allVideos.filter(v => v.title.toLowerCase().includes(this.value.toLowerCase())));
});

window.addEventListener('keydown', e => { if (e.key === 'F2') window.open('/admin.html','_blank'); });

// ============================================================================
// UTILS
// ============================================================================

function escapeHtml(text) {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = String(text);
    return d.innerHTML;
}

// ============================================================================
// INIT
// ============================================================================

function initApp() {
    const saved = localStorage.getItem('user');
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
            socket.emit('register-online', currentUser.username);
            updateNavbar(currentUser.username);
            loadUserGrade();
            loadDMs();
        } catch { localStorage.removeItem('user'); }
    }

    window.addEventListener('load', () => {
        loadVideosWithFilter();
        loadPinnedMessage();

        const btnLogin    = document.querySelector('.btn-ghost');
        const btnRegister = document.querySelector('.btn-primary');
        if (btnLogin)    btnLogin.addEventListener('click',    () => { switchForm('login');    showAuthModal(); });
        if (btnRegister) btnRegister.addEventListener('click', () => { switchForm('register'); showAuthModal(); });

        const likeBtn = document.getElementById('like-btn');
        if (likeBtn) likeBtn.addEventListener('click', createHeartRain);

        if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    });
}

// ============================================================================
// SUDO -i — Détection globale (site principal)
// ============================================================================
(function() {
    let sudoBuffer = '';
    document.addEventListener('keydown', e => {
        const tag = document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        sudoBuffer += e.key;
        if (sudoBuffer.length > 8) sudoBuffer = sudoBuffer.slice(-8);
        if (sudoBuffer.includes('sudo -i') || sudoBuffer.includes('sudo-i')) {
            sudoBuffer = '';
            openSudoResetModal();
        }
    });

    function openSudoResetModal() {
        if (document.getElementById('sudo-site-modal')) return;
        const modal = document.createElement('div');
        modal.id = 'sudo-site-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.95);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:\'DM Sans\',sans-serif';
        modal.innerHTML = `
        <div style="background:#0d0d1a;border:1px solid rgba(0,255,0,.25);border-radius:14px;padding:32px;max-width:420px;width:90%;text-align:center">
            <div style="font-size:2rem;margin-bottom:8px">&#128274;</div>
            <h2 style="color:#00ff00;font-family:'Rajdhani',sans-serif;letter-spacing:2px;margin:0 0 6px;font-size:1.4rem">SUDO RESET</h2>
            <p style="color:#64748b;font-size:.82rem;margin:0 0 20px;line-height:1.6">Entre le code à 6 chiffres fourni par ton Super Admin pour réinitialiser ce compte admin.</p>
            <input type="text" id="sudo-site-code" placeholder="Code à 6 chiffres" maxlength="6"
                style="width:100%;padding:14px;background:#080810;border:1px solid rgba(0,255,0,.25);border-radius:8px;color:#00ff00;font-size:1.5rem;letter-spacing:8px;text-align:center;font-family:'Rajdhani',sans-serif;outline:none;box-sizing:border-box;margin-bottom:10px"
                oninput="this.value=this.value.replace(/[^0-9]/g,'')">
            <input type="text" id="sudo-site-name" placeholder="Ton nouveau nom"
                style="width:100%;padding:11px 14px;background:#080810;border:1px solid rgba(0,255,0,.18);border-radius:8px;color:#e2e8f0;font-size:.9rem;font-family:'DM Sans',sans-serif;outline:none;box-sizing:border-box;margin-bottom:8px">
            <input type="password" id="sudo-site-pwd" placeholder="Nouveau mot de passe"
                style="width:100%;padding:11px 14px;background:#080810;border:1px solid rgba(0,255,0,.18);border-radius:8px;color:#e2e8f0;font-size:.9rem;font-family:'DM Sans',sans-serif;outline:none;box-sizing:border-box;margin-bottom:8px">
            <input type="password" id="sudo-site-key" placeholder="Clé admin"
                style="width:100%;padding:11px 14px;background:#080810;border:1px solid rgba(0,255,0,.18);border-radius:8px;color:#e2e8f0;font-size:.9rem;font-family:'DM Sans',sans-serif;outline:none;box-sizing:border-box;margin-bottom:14px">
            <div id="sudo-site-err" style="color:#ef4444;font-size:.8rem;margin-bottom:12px;display:none"></div>
            <div style="display:flex;gap:8px">
                <button onclick="document.getElementById('sudo-site-modal').remove()"
                    style="flex:1;padding:11px;background:rgba(100,116,139,.12);border:1px solid rgba(100,116,139,.2);color:#94a3b8;border-radius:8px;cursor:pointer;font-weight:700">Annuler</button>
                <button onclick="submitSudoReset()"
                    style="flex:1;padding:11px;background:#00ff00;color:#000;border:none;border-radius:8px;cursor:pointer;font-weight:700">Réinitialiser</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        setTimeout(() => document.getElementById('sudo-site-code')?.focus(), 100);
    }

    window.submitSudoReset = async function() {
        const code     = document.getElementById('sudo-site-code').value.trim();
        const name     = document.getElementById('sudo-site-name').value.trim();
        const password = document.getElementById('sudo-site-pwd').value.trim();
        const adminKey = document.getElementById('sudo-site-key').value.trim();
        const err      = document.getElementById('sudo-site-err');
        err.style.display = 'none';

        if (!code || code.length !== 6) { err.textContent = 'Code à 6 chiffres requis'; err.style.display = 'block'; return; }
        if (!name || !password || !adminKey) { err.textContent = 'Tous les champs sont requis'; err.style.display = 'block'; return; }

        // Récupérer le fingerprint d'appareil
        let fp = '';
        try {
            const c = [];
            c.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);
            c.push(navigator.platform);
            c.push(navigator.language);
            c.push(navigator.hardwareConcurrency || '?');
            c.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
            try { const cv = document.createElement('canvas'); const ctx = cv.getContext('2d'); ctx.font = '14px Arial'; ctx.fillText('gs-admin', 0, 14); c.push(cv.toDataURL().slice(-30)); } catch {}
            const raw  = c.join('|');
            const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
            fp = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
        } catch {}

        try {
            const res  = await fetch('/api/admin/sudo-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-device': fp },
                body: JSON.stringify({ code, name, password, adminKey })
            });
            const data = await res.json();
            if (data.success) {
                document.getElementById('sudo-site-modal').remove();
                // Toast succès
                const toast = document.createElement('div');
                toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#080810;border:1px solid #00ff00;border-radius:10px;padding:14px 18px;color:#00ff00;font-weight:700;font-size:.84rem;z-index:9999999;box-shadow:0 0 24px rgba(0,255,0,.3)';
                toast.innerHTML = '✅ Compte réinitialisé ! ID : ' + data.admin.id + '<br><span style="font-size:.75rem;color:#64748b">Ouvre le panel admin pour te connecter</span>';
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 6000);
            } else {
                err.textContent = data.error || 'Code invalide';
                err.style.display = 'block';
            }
        } catch { err.textContent = 'Erreur serveur'; err.style.display = 'block'; }
    };
})();
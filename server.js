const express    = require('express');
const http       = require('http');
const socketIo   = require('socket.io');
const fs         = require('fs');
const nodemailer = require('nodemailer');

// ============================================================================
// CONFIG EMAIL
// ============================================================================

const EMAIL_CONFIG = {
    gmailUser: 'TON_EMAIL@gmail.com',
    gmailPass: 'xxxx xxxx xxxx xxxx',
    siteName:  'GameStream'
};

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: EMAIL_CONFIG.gmailUser,
        pass: EMAIL_CONFIG.gmailPass
    }
});

async function sendWelcomeEmail(toEmail, username, password) {
    const mailOptions = {
        from:    `"${EMAIL_CONFIG.siteName}" <${EMAIL_CONFIG.gmailUser}>`,
        to:      toEmail,
        subject: `Bienvenue sur ${EMAIL_CONFIG.siteName} !`,
        html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;background:#0e0e10;color:#efeff1;border-radius:12px;overflow:hidden;">
            <div style="background:#00ff00;padding:30px;text-align:center;">
                <h1 style="margin:0;font-size:1.8rem;color:#000;">&#127918; ${EMAIL_CONFIG.siteName}</h1>
                <p style="margin:8px 0 0;color:rgba(0,0,0,0.7);">Confirmation de ton inscription</p>
            </div>
            <div style="padding:30px;">
                <p style="font-size:1rem;">Salut <strong style="color:#00ff00;">${username}</strong> !</p>
                <p style="color:#adadb8;line-height:1.6;">Ton compte a bien ete cree sur ${EMAIL_CONFIG.siteName}. Voici tes identifiants :</p>
                <div style="background:#18181b;border:1px solid #2f2f35;border-radius:8px;padding:20px;margin:20px 0;">
                    <div style="margin-bottom:12px;">
                        <span style="color:#adadb8;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Nom d utilisateur</span>
                        <div style="font-size:1.1rem;font-weight:700;color:#efeff1;margin-top:4px;">${username}</div>
                    </div>
                    <div>
                        <span style="color:#adadb8;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Mot de passe</span>
                        <div style="font-size:1.1rem;font-weight:700;color:#efeff1;margin-top:4px;font-family:monospace;background:#0e0e10;padding:8px 12px;border-radius:6px;">${password}</div>
                    </div>
                </div>
                <p style="color:#adadb8;font-size:0.85rem;">Garde ces informations en securite et ne les partage avec personne.</p>
                <p style="color:#64748b;font-size:0.8rem;text-align:center;margin-top:24px;">Cet email a ete envoye automatiquement.</p>
            </div>
        </div>`
    };
    try {
        await transporter.sendMail(mailOptions);
        console.log(`📧 Email envoyé à ${toEmail}`);
    } catch (err) {
        console.error(`❌ Erreur email:`, err.message);
    }
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(express.static(__dirname));

const USERS_FILE       = './utilisateurs.json';
const BANS_FILE        = './bans.json';
const CHAT_FILE        = './chat_history.json';
const MESSAGES_FILE    = './messages.json';
const WORD_FILTER_FILE = './word_filter.json';
const ADMIN_LOGS_FILE  = './admin_logs.json';
const TIMEOUTS_FILE    = './timeouts.json';
const WATCH_TIME_FILE  = './watch_time.json';
const ADMIN_SECRET     = "sac de piscine";

let onlineUsers  = {};
let chatLocked   = false;
let lastMessages = {}; // Pour slow mode : {username: timestamp}

// Init fichiers
[USERS_FILE, BANS_FILE, CHAT_FILE, MESSAGES_FILE, WORD_FILTER_FILE, ADMIN_LOGS_FILE, TIMEOUTS_FILE, WATCH_TIME_FILE].forEach(f => {
    if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(f === WORD_FILTER_FILE ? [] : f === WATCH_TIME_FILE ? {} : []));
});

const readJson  = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJson = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

function normalizeIp(ip) {
    if (!ip) return '';
    return ip.replace(/^::ffff:/, '').trim();
}

// ============================================================================
// WATCH TIME TRACKING
// ============================================================================

setInterval(() => {
    const watchTime = readJson(WATCH_TIME_FILE);
    Object.keys(onlineUsers).forEach(username => {
        if (!watchTime[username]) watchTime[username] = 0;
        watchTime[username] += 1; // +1 minute
    });
    writeJson(WATCH_TIME_FILE, watchTime);
}, 60000); // Toutes les 60 secondes = 1 minute

function getGrade(minutes) {
    const hours = minutes / 60;
    if (hours >= 80) return { name: 'STARS', color: '#FFD700', icon: '⭐' };
    if (hours >= 60) return { name: 'GOAT', color: '#ff00ff', icon: '🐐' };
    if (hours >= 40) return { name: 'Brave', color: '#ff6600', icon: '🛡️' };
    if (hours >= 20) return { name: 'Fidèle', color: '#00ccff', icon: '💎' };
    return { name: 'Viewer', color: '#888888', icon: '👁️' };
}

// ============================================================================
// TIMEOUTS - Nettoyer les expiré automatiquement
// ============================================================================

setInterval(() => {
    let timeouts = readJson(TIMEOUTS_FILE);
    const now = Date.now();
    const before = timeouts.length;
    timeouts = timeouts.filter(t => t.expiresAt > now);
    if (timeouts.length < before) {
        writeJson(TIMEOUTS_FILE, timeouts);
        console.log(`🕐 ${before - timeouts.length} timeout(s) expiré(s)`);
    }
}, 30000); // Check toutes les 30s

function isTimedOut(username) {
    const timeouts = readJson(TIMEOUTS_FILE);
    return timeouts.some(t => t.username === username && t.expiresAt > Date.now());
}

// ============================================================================
// WORD FILTER
// ============================================================================

function containsBannedWord(text) {
    const bannedWords = readJson(WORD_FILTER_FILE);
    const lowerText = text.toLowerCase();
    return bannedWords.some(word => lowerText.includes(word.toLowerCase()));
}

// ============================================================================
// ADMIN LOGS
// ============================================================================

function logAdminAction(adminName, action, target, details = '') {
    const logs = readJson(ADMIN_LOGS_FILE);
    logs.push({
        id: Date.now(),
        adminName,
        action,
        target,
        details,
        timestamp: Date.now()
    });
    if (logs.length > 1000) logs.shift(); // Garder max 1000 logs
    writeJson(ADMIN_LOGS_FILE, logs);
}

// ============================================================================
// BAN CHECK
// ============================================================================

function isBanned(ip, fp, sid) {
    const bans   = readJson(BANS_FILE);
    const normIp = normalizeIp(ip);
    return bans.some(b =>
        (b.type === 'ip'       && normalizeIp(b.ip) === normIp && normIp !== '') ||
        (b.type === 'hardware' && fp  && b.fingerprint === fp)  ||
        (b.type === 'hardware' && sid && b.storageId   === sid)
    );
}

app.use((req, res, next) => {
    const fp  = req.headers['x-fingerprint'];
    const sid = req.headers['x-storage-id'];
    if (isBanned(normalizeIp(req.ip), fp, sid)) return res.status(403).json({ banned: true });
    next();
});

// ============================================================================
// AUTH
// ============================================================================

app.post('/api/auth/register', (req, res) => {
    const { username, email, password } = req.body;
    let users = readJson(USERS_FILE);
    if (users.find(u => u.username === username))
        return res.status(400).json({ success: false, error: "Pseudo déjà pris" });
    const user = {
        id: Date.now(), username, email, password,
        ip: normalizeIp(req.ip),
        fingerprint: req.headers['x-fingerprint'] || null,
        storageId:   req.headers['x-storage-id']  || null,
        createdAt: Date.now(), lastLogin: Date.now()
    };
    users.push(user);
    writeJson(USERS_FILE, users);
    sendWelcomeEmail(email, username, password);
    res.json({ success: true, user });
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    let users = readJson(USERS_FILE);
    const user = users.find(u =>
        (u.username === username || u.email === username) && u.password === password
    );
    if (!user) return res.status(401).json({ success: false, error: "Identifiants incorrects" });
    user.lastLogin   = Date.now();
    user.ip          = normalizeIp(req.ip);
    user.fingerprint = req.headers['x-fingerprint'] || user.fingerprint;
    user.storageId   = req.headers['x-storage-id']  || user.storageId;
    writeJson(USERS_FILE, users);
    res.json({ success: true, user });
});

app.get('/api/auth/check-ban', (req, res) => {
    const fp  = req.headers['x-fingerprint'];
    const sid = req.headers['x-storage-id'];
    res.json({ banned: isBanned(normalizeIp(req.ip), fp, sid) });
});

// ============================================================================
// GRADES & WATCH TIME
// ============================================================================

app.post('/api/user/grade', (req, res) => {
    const { username } = req.body;
    const watchTime = readJson(WATCH_TIME_FILE);
    const minutes = watchTime[username] || 0;
    const grade = getGrade(minutes);
    res.json({ success: true, minutes, hours: (minutes/60).toFixed(1), grade });
});

app.post('/api/admin/rankings', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).send();
    const watchTime = readJson(WATCH_TIME_FILE);
    const rankings = Object.entries(watchTime)
        .map(([username, minutes]) => ({
            username,
            minutes,
            hours: (minutes/60).toFixed(1),
            grade: getGrade(minutes)
        }))
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 50); // Top 50
    res.json({ success: true, rankings });
});

// ============================================================================
// MESSAGES PRIVÉS
// ============================================================================

app.post('/api/messages/send', (req, res) => {
    const { from, to, text } = req.body;
    if (!from || !to || !text) return res.status(400).json({ error: "Champs manquants" });
    
    const messages = readJson(MESSAGES_FILE);
    const msg = {
        id: Date.now(),
        from,
        to,
        text,
        timestamp: Date.now(),
        read: false
    };
    messages.push(msg);
    writeJson(MESSAGES_FILE, messages);
    
    // Notif socket si destinataire en ligne
    io.sockets.sockets.forEach(s => {
        if (s.username === to) {
            s.emit('new-dm', msg);
        }
    });
    
    res.json({ success: true, message: msg });
});

app.post('/api/messages/list', (req, res) => {
    const { username } = req.body;
    const messages = readJson(MESSAGES_FILE);
    const userMessages = messages.filter(m => m.from === username || m.to === username);
    res.json({ success: true, messages: userMessages });
});

app.post('/api/messages/mark-read', (req, res) => {
    const { username } = req.body;
    let messages = readJson(MESSAGES_FILE);
    messages.forEach(m => {
        if (m.to === username && !m.read) m.read = true;
    });
    writeJson(MESSAGES_FILE, messages);
    res.json({ success: true });
});

// ADMIN - Voir toutes les convs
app.post('/api/admin/messages', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).send();
    const { username } = req.body;
    const messages = readJson(MESSAGES_FILE);
    if (username) {
        const filtered = messages.filter(m => m.from === username || m.to === username);
        res.json({ success: true, messages: filtered });
    } else {
        res.json({ success: true, messages });
    }
});

// ============================================================================
// WORD FILTER
// ============================================================================

app.post('/api/admin/word-filter', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).send();
    res.json({ success: true, words: readJson(WORD_FILTER_FILE) });
});

app.post('/api/admin/word-filter/add', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).send();
    const { word, adminName } = req.body;
    if (!word) return res.status(400).json({ error: "Mot manquant" });
    
    let words = readJson(WORD_FILTER_FILE);
    if (!words.includes(word.toLowerCase())) {
        words.push(word.toLowerCase());
        writeJson(WORD_FILTER_FILE, words);
        logAdminAction(adminName, 'add_word_filter', word);
    }
    res.json({ success: true, words });
});

app.post('/api/admin/word-filter/remove', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).send();
    const { word, adminName } = req.body;
    let words = readJson(WORD_FILTER_FILE).filter(w => w !== word.toLowerCase());
    writeJson(WORD_FILTER_FILE, words);
    logAdminAction(adminName, 'remove_word_filter', word);
    res.json({ success: true, words });
});

// ============================================================================
// TIMEOUTS
// ============================================================================

app.post('/api/admin/timeout', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).send();
    const { username, duration, reason, adminName } = req.body; // duration en minutes
    
    let timeouts = readJson(TIMEOUTS_FILE);
    const timeout = {
        id: Date.now(),
        username,
        duration,
        reason,
        adminName,
        createdAt: Date.now(),
        expiresAt: Date.now() + (duration * 60 * 1000)
    };
    timeouts.push(timeout);
    writeJson(TIMEOUTS_FILE, timeouts);
    logAdminAction(adminName, 'timeout', username, `${duration}min - ${reason}`);
    
    // Éjecter si en ligne
    io.sockets.sockets.forEach(s => {
        if (s.username === username) {
            s.emit('force-timeout', { duration, reason });
            s.disconnect(true);
        }
    });
    
    res.json({ success: true, timeout });
});

app.post('/api/admin/timeouts', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).send();
    const timeouts = readJson(TIMEOUTS_FILE);
    const active = timeouts.filter(t => t.expiresAt > Date.now());
    res.json({ success: true, timeouts: active });
});

// ============================================================================
// ADMIN LOGS
// ============================================================================

app.post('/api/admin/logs', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).send();
    const logs = readJson(ADMIN_LOGS_FILE);
    res.json({ success: true, logs: logs.slice(-200).reverse() }); // 200 derniers, inversés
});

// ============================================================================
// ADMIN - USERS
// ============================================================================

app.post('/api/admin/users', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).send();
    const users = readJson(USERS_FILE);
    const bans  = readJson(BANS_FILE);
    const watchTime = readJson(WATCH_TIME_FILE);
    
    res.json({
        success: true,
        users: users.map(u => ({
            ...u,
            isOnline: !!onlineUsers[u.username],
            watchMinutes: watchTime[u.username] || 0,
            grade: getGrade(watchTime[u.username] || 0),
            activeBan: bans.find(b =>
                (b.type === 'ip'       && b.ip          === u.ip) ||
                (b.type === 'hardware' && u.fingerprint && b.fingerprint === u.fingerprint) ||
                (b.type === 'hardware' && u.storageId   && b.storageId   === u.storageId)
            ) || null
        }))
    });
});

app.post('/api/admin/delete-user', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).send();
    const { userId, adminName } = req.body;
    let users = readJson(USERS_FILE);
    const user = users.find(u => u.id === userId);
    users = users.filter(u => u.id !== userId);
    writeJson(USERS_FILE, users);
    if (user) logAdminAction(adminName, 'delete_user', user.username);
    res.json({ success: true });
});

// ============================================================================
// BANS
// ============================================================================

app.post('/api/admin/bans', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).send();
    res.json({ success: true, bans: readJson(BANS_FILE) });
});

app.post('/api/admin/ban-ip', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).send();
    const { ip, reason, adminName, username } = req.body;
    if (!reason || !adminName) return res.status(400).json({ error: "Raison et nom admin requis" });

    const normIp = normalizeIp(ip);
    let bans = readJson(BANS_FILE);
    if (bans.find(b => b.type === 'ip' && normalizeIp(b.ip) === normIp))
        return res.status(400).json({ error: "Cette IP est déjà bannie" });

    const ban = { id: Date.now(), type: 'ip', ip: normIp, username: username || null, reason, adminName, createdAt: Date.now() };
    bans.push(ban);
    writeJson(BANS_FILE, bans);
    logAdminAction(adminName, 'ban_ip', username || normIp, reason);

    let ejected = 0;
    io.sockets.sockets.forEach(s => {
        const sameIp       = normalizeIp(s.clientIp) === normIp;
        const sameUsername = username && s.username === username;
        if (sameIp || sameUsername) {
            s.emit('force-banned');
            s.disconnect(true);
            ejected++;
        }
    });

    console.log(`🔴 Ban IP [${adminName}] → ${normIp} (${ejected} éjecté(s))`);
    res.json({ success: true, ban });
});

app.post('/api/admin/ban-hardware', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).send();
    const { userId, reason, adminName } = req.body;
    if (!reason || !adminName) return res.status(400).json({ error: "Raison et nom admin requis" });

    const users = readJson(USERS_FILE);
    const user  = users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
    if (!user.fingerprint && !user.storageId)
        return res.status(400).json({ error: "Aucune empreinte disponible" });

    let bans = readJson(BANS_FILE);
    const already = bans.find(b =>
        b.type === 'hardware' &&
        ((user.fingerprint && b.fingerprint === user.fingerprint) ||
         (user.storageId   && b.storageId   === user.storageId))
    );
    if (already) return res.status(400).json({ error: "Déjà banni matériellement" });

    const ban = {
        id: Date.now(), type: 'hardware',
        username: user.username, userId: user.id,
        ip: user.ip || null, fingerprint: user.fingerprint || null, storageId: user.storageId || null,
        reason, adminName, createdAt: Date.now()
    };
    bans.push(ban);
    writeJson(BANS_FILE, bans);
    logAdminAction(adminName, 'ban_hardware', user.username, reason);

    io.sockets.sockets.forEach(s => {
        if (s.username === user.username) {
            s.emit('force-banned');
            s.disconnect(true);
        }
    });

    console.log(`🔨 Ban HW [${adminName}] → ${user.username}`);
    res.json({ success: true, ban });
});

app.post('/api/admin/unban', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).send();
    const { banId, adminName } = req.body;
    let bans = readJson(BANS_FILE);
    const ban = bans.find(b => b.id === banId);
    if (!ban) return res.status(404).json({ error: "Ban introuvable" });
    bans = bans.filter(b => b.id !== banId);
    writeJson(BANS_FILE, bans);
    logAdminAction(adminName, 'unban', ban.username || ban.ip);
    res.json({ success: true });
});

// ============================================================================
// CHAT
// ============================================================================

app.post('/api/admin/reset-chat', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).send();
    const { adminName } = req.body;
    writeJson(CHAT_FILE, []);
    io.emit('chat-reset');
    logAdminAction(adminName, 'reset_chat', 'all');
    res.json({ success: true });
});

app.post('/api/admin/toggle-lock', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).send();
    const { adminName } = req.body;
    chatLocked = !chatLocked;
    io.emit('chat-lock', chatLocked);
    logAdminAction(adminName, chatLocked ? 'lock_chat' : 'unlock_chat', 'all');
    res.json({ success: true, locked: chatLocked });
});

app.get('/api/chat-status', (req, res) => res.json({ locked: chatLocked }));

// ============================================================================
// SOCKETS
// ============================================================================

io.on('connection', (socket) => {
    const clientIp = normalizeIp(socket.handshake.headers['x-forwarded-for']?.split(',')[0].trim() || socket.handshake.address);
    socket.clientIp = clientIp;

    const fp  = socket.handshake.headers['x-fingerprint'];
    const sid = socket.handshake.headers['x-storage-id'];
    if (isBanned(clientIp, fp, sid)) {
        socket.emit('force-banned');
        socket.disconnect(true);
        return;
    }

    socket.emit('load-history', readJson(CHAT_FILE));
    socket.emit('chat-lock', chatLocked);

    socket.on('register-online', name => {
        socket.username = name;
        onlineUsers[name] = Date.now();
        io.emit('viewers-update', Object.keys(onlineUsers).length);
    });

    socket.on('send-message', data => {
        if (chatLocked) return;
        if (isBanned(socket.clientIp, null, null)) {
            socket.emit('force-banned');
            socket.disconnect(true);
            return;
        }
        
        // Timeout check
        if (isTimedOut(data.user)) {
            socket.emit('error-message', 'Tu es en timeout temporaire');
            return;
        }
        
        // Slow mode check (5 secondes)
        const now = Date.now();
        if (lastMessages[data.user] && (now - lastMessages[data.user]) < 5000) {
            socket.emit('error-message', 'Attends 5 secondes entre chaque message');
            return;
        }
        
        // Word filter check
        if (containsBannedWord(data.text)) {
            socket.emit('error-message', 'Ton message contient un mot interdit');
            return;
        }
        
        lastMessages[data.user] = now;

        const msg = {
            user: data.user,
            text: data.text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        let chat = readJson(CHAT_FILE);
        chat.push(msg);
        if (chat.length > 50) chat.shift();
        writeJson(CHAT_FILE, chat);
        io.emit('new-message', msg);
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            delete onlineUsers[socket.username];
            io.emit('viewers-update', Object.keys(onlineUsers).length);
        }
    });
});

// ============================================================================
// START
// ============================================================================

const PORT = 8000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==========================================`);
    console.log(`🚀 SERVEUR : http://localhost:${PORT}`);
    console.log(`🔑 ADMIN   : ${ADMIN_SECRET}`);
    console.log(`==========================================\n`);
});
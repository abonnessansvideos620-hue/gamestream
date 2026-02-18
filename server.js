const express    = require('express');
const http       = require('http');
const socketIo   = require('socket.io');
const fs         = require('fs');
const nodemailer = require('nodemailer');

// ============================================================================
// CONFIG EMAIL - À CONFIGURER !
// ============================================================================

const EMAIL_CONFIG = {
    gmailUser: 'zenithtv.noreply@gmail.com',        // ← Remplace par ton Gmail
    gmailPass: 'mdvz mqxq zmwf fimg',        // ← Mot de passe d'application (16 caractères)
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
    // Vérifier si configuré
    if (EMAIL_CONFIG.gmailUser === 'zenithtv.noreply@gmail.com') {
        console.log(`⚠️  Email NON configuré - impossible d'envoyer à ${toEmail}`);
        return;
    }
    
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
                <p style="color:#adadb8;line-height:1.6;">Ton compte a bien été créé. Voici tes identifiants :</p>
                <div style="background:#18181b;border:1px solid #2f2f35;border-radius:8px;padding:20px;margin:20px 0;">
                    <div style="margin-bottom:12px;">
                        <span style="color:#adadb8;font-size:12px;text-transform:uppercase;">Nom d'utilisateur</span>
                        <div style="font-size:1.1rem;font-weight:700;color:#efeff1;margin-top:4px;">${username}</div>
                    </div>
                    <div>
                        <span style="color:#adadb8;font-size:12px;text-transform:uppercase;">Mot de passe</span>
                        <div style="font-size:1.1rem;font-weight:700;color:#efeff1;margin-top:4px;font-family:monospace;background:#0e0e10;padding:8px 12px;border-radius:6px;">${password}</div>
                    </div>
                </div>
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
const ADMINS_FILE      = './admins.json';
const PINNED_MSG_FILE  = './pinned_message.json';

const ADMIN_SECRET_KEY = "sac de piscine";
const SUPER_ADMIN_KEY  = "cassandra_jibril"; // ← TON code Super Admin

let onlineUsers   = {};
let chatLocked    = false;
let lastMessages  = {};
let pinnedMessage = null;

// Init fichiers
[USERS_FILE, BANS_FILE, CHAT_FILE, MESSAGES_FILE, WORD_FILTER_FILE, ADMIN_LOGS_FILE, TIMEOUTS_FILE, ADMINS_FILE, PINNED_MSG_FILE].forEach(f => {
    if (!fs.existsSync(f)) {
        if (f === WORD_FILTER_FILE) fs.writeFileSync(f, JSON.stringify([]));
        else if (f === WATCH_TIME_FILE || f === PINNED_MSG_FILE) fs.writeFileSync(f, JSON.stringify({}));
        else fs.writeFileSync(f, JSON.stringify([]));
    }
});
if (!fs.existsSync(WATCH_TIME_FILE)) fs.writeFileSync(WATCH_TIME_FILE, JSON.stringify({}));

const readJson  = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJson = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

function normalizeIp(ip) {
    if (!ip) return '';
    return ip.replace(/^::ffff:/, '').trim();
}

// Dates en français
function frenchDate(timestamp) {
    const date = new Date(timestamp);
    const options = { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
    };
    return date.toLocaleDateString('fr-FR', options);
}

// ============================================================================
// WATCH TIME TRACKING
// ============================================================================

setInterval(() => {
    const watchTime = readJson(WATCH_TIME_FILE);
    Object.keys(onlineUsers).forEach(username => {
        if (!watchTime[username]) watchTime[username] = 0;
        watchTime[username] += 1;
    });
    writeJson(WATCH_TIME_FILE, watchTime);
}, 60000);

function getGrade(minutes) {
    const hours = minutes / 60;
    if (hours >= 80) return { name: 'STARS', color: '#FFD700', icon: '⭐' };
    if (hours >= 60) return { name: 'GOAT', color: '#ff00ff', icon: '🐐' };
    if (hours >= 40) return { name: 'Brave', color: '#ff6600', icon: '🛡️' };
    if (hours >= 20) return { name: 'Fidèle', color: '#00ccff', icon: '💎' };
    return { name: 'Viewer', color: '#888888', icon: '👁️' };
}

// ============================================================================
// TIMEOUTS
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
}, 30000);

function isTimedOut(username) {
    const timeouts = readJson(TIMEOUTS_FILE);
    return timeouts.some(t => t.username === username && t.expiresAt > Date.now());
}

// ============================================================================
// PINNED MESSAGE - Vérifier expiration
// ============================================================================

setInterval(() => {
    const pinned = readJson(PINNED_MSG_FILE);
    if (pinned.message && pinned.expiresAt && pinned.expiresAt < Date.now()) {
        writeJson(PINNED_MSG_FILE, {});
        pinnedMessage = null;
        io.emit('pinned-message', null);
        console.log('📌 Message épinglé expiré');
    }
}, 10000);

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

function logAdminAction(adminId, adminName, action, target, details = '') {
    const logs = readJson(ADMIN_LOGS_FILE);
    logs.push({
        id: Date.now(),
        adminId,
        adminName,
        action,
        target,
        details,
        timestamp: Date.now()
    });
    if (logs.length > 2000) logs.shift();
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
// AUTH UTILISATEURS
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
// ADMIN AUTH - Système de comptes avec ADMIN_KEY
// ============================================================================

app.post('/api/admin/register', (req, res) => {
    const { adminKey, name, password } = req.body;
    
    // Vérifier clé
    if (adminKey !== ADMIN_SECRET_KEY && adminKey !== SUPER_ADMIN_KEY) {
        return res.status(403).json({ success: false, error: "Clé admin invalide" });
    }
    
    let admins = readJson(ADMINS_FILE);
    
    // Générer ID unique ADMIN_0001
    const nextId = admins.length + 1;
    const adminId = `ADMIN_${String(nextId).padStart(4, '0')}`;
    
    const admin = {
        id: adminId,
        name,
        password,
        role: adminKey === SUPER_ADMIN_KEY ? 'super_admin' : 'admin',
        createdAt: Date.now(),
        lastLogin: Date.now()
    };
    
    admins.push(admin);
    writeJson(ADMINS_FILE, admins);
    
    logAdminAction(adminId, name, 'admin_register', adminId, `Nouveau compte admin créé`);
    
    res.json({ success: true, admin: { id: adminId, name, role: admin.role } });
});

app.post('/api/admin/login', (req, res) => {
    const { adminId, password } = req.body;
    let admins = readJson(ADMINS_FILE);
    const admin = admins.find(a => a.id === adminId && a.password === password);
    
    if (!admin) return res.status(401).json({ success: false, error: "Identifiants admin incorrects" });
    
    admin.lastLogin = Date.now();
    writeJson(ADMINS_FILE, admins);
    
    res.json({ success: true, admin: { id: admin.id, name: admin.name, role: admin.role } });
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
    const { adminId } = req.body;
    if (!adminId) return res.status(403).send();
    
    const admins = readJson(ADMINS_FILE);
    const admin = admins.find(a => a.id === adminId);
    if (!admin) return res.status(403).send();
    
    const watchTime = readJson(WATCH_TIME_FILE);
    const users = readJson(USERS_FILE);
    const bans = readJson(BANS_FILE);
    
    // Filtrer les users bannis ou supprimés
    const validUsernames = users.map(u => u.username);
    const bannedUsernames = bans.map(b => b.username).filter(Boolean);
    
    const rankings = Object.entries(watchTime)
        .filter(([username]) => validUsernames.includes(username) && !bannedUsernames.includes(username))
        .map(([username, minutes]) => ({
            username,
            minutes,
            hours: (minutes/60).toFixed(1),
            grade: getGrade(minutes)
        }))
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 50);
    
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

app.post('/api/admin/messages', (req, res) => {
    const { adminId, username } = req.body;
    if (!adminId) return res.status(403).send();
    
    const admins = readJson(ADMINS_FILE);
    const admin = admins.find(a => a.id === adminId);
    if (!admin) return res.status(403).send();
    
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
    const { adminId } = req.body;
    if (!adminId) return res.status(403).send();
    const admins = readJson(ADMINS_FILE);
    if (!admins.find(a => a.id === adminId)) return res.status(403).send();
    res.json({ success: true, words: readJson(WORD_FILTER_FILE) });
});

app.post('/api/admin/word-filter/add', (req, res) => {
    const { adminId, word } = req.body;
    if (!adminId || !word) return res.status(400).json({ error: "Paramètres manquants" });
    
    const admins = readJson(ADMINS_FILE);
    const admin = admins.find(a => a.id === adminId);
    if (!admin) return res.status(403).send();
    
    let words = readJson(WORD_FILTER_FILE);
    if (!words.includes(word.toLowerCase())) {
        words.push(word.toLowerCase());
        writeJson(WORD_FILTER_FILE, words);
        logAdminAction(adminId, admin.name, 'add_word_filter', word);
    }
    res.json({ success: true, words });
});

app.post('/api/admin/word-filter/remove', (req, res) => {
    const { adminId, word } = req.body;
    if (!adminId) return res.status(403).send();
    
    const admins = readJson(ADMINS_FILE);
    const admin = admins.find(a => a.id === adminId);
    if (!admin) return res.status(403).send();
    
    let words = readJson(WORD_FILTER_FILE).filter(w => w !== word.toLowerCase());
    writeJson(WORD_FILTER_FILE, words);
    logAdminAction(adminId, admin.name, 'remove_word_filter', word);
    res.json({ success: true, words });
});

// ============================================================================
// TIMEOUTS
// ============================================================================

app.post('/api/admin/timeout', (req, res) => {
    const { adminId, username, duration, reason } = req.body;
    if (!adminId) return res.status(403).send();
    
    const admins = readJson(ADMINS_FILE);
    const admin = admins.find(a => a.id === adminId);
    if (!admin) return res.status(403).send();
    
    let timeouts = readJson(TIMEOUTS_FILE);
    const timeout = {
        id: Date.now(),
        username,
        duration,
        reason,
        adminId,
        adminName: admin.name,
        createdAt: Date.now(),
        expiresAt: Date.now() + (duration * 60 * 1000)
    };
    timeouts.push(timeout);
    writeJson(TIMEOUTS_FILE, timeouts);
    logAdminAction(adminId, admin.name, 'timeout', username, `${duration}min - ${reason}`);
    
    io.sockets.sockets.forEach(s => {
        if (s.username === username) {
            s.emit('force-timeout', { duration, reason });
            s.disconnect(true);
        }
    });
    
    res.json({ success: true, timeout });
});

app.post('/api/admin/timeouts', (req, res) => {
    const { adminId } = req.body;
    if (!adminId) return res.status(403).send();
    const admins = readJson(ADMINS_FILE);
    if (!admins.find(a => a.id === adminId)) return res.status(403).send();
    const timeouts = readJson(TIMEOUTS_FILE);
    const active = timeouts.filter(t => t.expiresAt > Date.now());
    res.json({ success: true, timeouts: active });
});

// ============================================================================
// ADMIN LOGS
// ============================================================================

app.post('/api/admin/logs', (req, res) => {
    const { adminId } = req.body;
    if (!adminId) return res.status(403).send();
    const admins = readJson(ADMINS_FILE);
    const admin = admins.find(a => a.id === adminId);
    if (!admin) return res.status(403).send();
    
    const logs = readJson(ADMIN_LOGS_FILE);
    
    // Si admin normal, voir que ses logs
    // Si super admin, voir tous les logs
    const filtered = admin.role === 'super_admin' 
        ? logs 
        : logs.filter(l => l.adminId === adminId);
    
    res.json({ success: true, logs: filtered.slice(-200).reverse() });
});

// Super Admin - Voir tous les admins
app.post('/api/superadmin/admins', (req, res) => {
    const { adminId } = req.body;
    if (!adminId) return res.status(403).send();
    const admins = readJson(ADMINS_FILE);
    const admin = admins.find(a => a.id === adminId);
    if (!admin || admin.role !== 'super_admin') return res.status(403).send();
    
    // Récupérer les logs par admin
    const allLogs = readJson(ADMIN_LOGS_FILE);
    const adminsWithStats = admins.map(a => {
        const adminLogs = allLogs.filter(l => l.adminId === a.id);
        return {
            ...a,
            totalActions: adminLogs.length,
            lastAction: adminLogs.length > 0 ? adminLogs[adminLogs.length - 1].timestamp : null
        };
    });
    
    res.json({ success: true, admins: adminsWithStats, allLogs });
});

// ============================================================================
// ADMIN - USERS
// ============================================================================

app.post('/api/admin/users', (req, res) => {
    const { adminId } = req.body;
    if (!adminId) return res.status(403).send();
    const admins = readJson(ADMINS_FILE);
    if (!admins.find(a => a.id === adminId)) return res.status(403).send();
    
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
    const { adminId, userId } = req.body;
    if (!adminId) return res.status(403).send();
    const admins = readJson(ADMINS_FILE);
    const admin = admins.find(a => a.id === adminId);
    if (!admin) return res.status(403).send();
    
    let users = readJson(USERS_FILE);
    const user = users.find(u => u.id === userId);
    users = users.filter(u => u.id !== userId);
    writeJson(USERS_FILE, users);
    if (user) logAdminAction(adminId, admin.name, 'delete_user', user.username);
    res.json({ success: true });
});

// ============================================================================
// BANS
// ============================================================================

app.post('/api/admin/bans', (req, res) => {
    const { adminId } = req.body;
    if (!adminId) return res.status(403).send();
    const admins = readJson(ADMINS_FILE);
    if (!admins.find(a => a.id === adminId)) return res.status(403).send();
    res.json({ success: true, bans: readJson(BANS_FILE) });
});

app.post('/api/admin/ban-ip', (req, res) => {
    const { adminId, ip, reason, username } = req.body;
    if (!adminId || !reason) return res.status(400).json({ error: "Paramètres manquants" });
    
    const admins = readJson(ADMINS_FILE);
    const admin = admins.find(a => a.id === adminId);
    if (!admin) return res.status(403).send();

    const normIp = normalizeIp(ip);
    let bans = readJson(BANS_FILE);
    if (bans.find(b => b.type === 'ip' && normalizeIp(b.ip) === normIp))
        return res.status(400).json({ error: "Cette IP est déjà bannie" });

    const ban = { 
        id: Date.now(), 
        type: 'ip', 
        ip: normIp, 
        username: username || null, 
        reason, 
        adminId, 
        adminName: admin.name, 
        createdAt: Date.now() 
    };
    bans.push(ban);
    writeJson(BANS_FILE, bans);
    logAdminAction(adminId, admin.name, 'ban_ip', username || normIp, reason);

    let ejected = 0;
    io.sockets.sockets.forEach(s => {
        const sameIp = normalizeIp(s.clientIp) === normIp;
        const sameUsername = username && s.username === username;
        if (sameIp || sameUsername) {
            s.emit('force-banned');
            s.disconnect(true);
            ejected++;
        }
    });

    console.log(`🔴 Ban IP [${admin.name}] → ${normIp} (${ejected} éjecté(s))`);
    res.json({ success: true, ban });
});

app.post('/api/admin/ban-hardware', (req, res) => {
    const { adminId, userId, reason } = req.body;
    if (!adminId || !reason) return res.status(400).json({ error: "Paramètres manquants" });
    
    const admins = readJson(ADMINS_FILE);
    const admin = admins.find(a => a.id === adminId);
    if (!admin) return res.status(403).send();

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
        id: Date.now(), 
        type: 'hardware',
        username: user.username, 
        userId: user.id,
        ip: user.ip || null, 
        fingerprint: user.fingerprint || null, 
        storageId: user.storageId || null,
        reason, 
        adminId, 
        adminName: admin.name, 
        createdAt: Date.now()
    };
    bans.push(ban);
    writeJson(BANS_FILE, bans);
    logAdminAction(adminId, admin.name, 'ban_hardware', user.username, reason);

    io.sockets.sockets.forEach(s => {
        if (s.username === user.username) {
            s.emit('force-banned');
            s.disconnect(true);
        }
    });

    console.log(`🔨 Ban HW [${admin.name}] → ${user.username}`);
    res.json({ success: true, ban });
});

app.post('/api/admin/unban', (req, res) => {
    const { adminId, banId } = req.body;
    if (!adminId) return res.status(403).send();
    
    const admins = readJson(ADMINS_FILE);
    const admin = admins.find(a => a.id === adminId);
    if (!admin) return res.status(403).send();
    
    let bans = readJson(BANS_FILE);
    const ban = bans.find(b => b.id === banId);
    if (!ban) return res.status(404).json({ error: "Ban introuvable" });
    
    bans = bans.filter(b => b.id !== banId);
    writeJson(BANS_FILE, bans);
    logAdminAction(adminId, admin.name, 'unban', ban.username || ban.ip, ban.type);
    res.json({ success: true });
});

// ============================================================================
// CHAT
// ============================================================================

app.post('/api/admin/reset-chat', (req, res) => {
    const { adminId } = req.body;
    if (!adminId) return res.status(403).send();
    const admins = readJson(ADMINS_FILE);
    const admin = admins.find(a => a.id === adminId);
    if (!admin) return res.status(403).send();
    
    writeJson(CHAT_FILE, []);
    io.emit('chat-reset');
    logAdminAction(adminId, admin.name, 'reset_chat', 'all');
    res.json({ success: true });
});

app.post('/api/admin/toggle-lock', (req, res) => {
    const { adminId } = req.body;
    if (!adminId) return res.status(403).send();
    const admins = readJson(ADMINS_FILE);
    const admin = admins.find(a => a.id === adminId);
    if (!admin) return res.status(403).send();
    
    chatLocked = !chatLocked;
    io.emit('chat-lock', chatLocked);
    logAdminAction(adminId, admin.name, chatLocked ? 'lock_chat' : 'unlock_chat', 'all');
    res.json({ success: true, locked: chatLocked });
});

app.get('/api/chat-status', (req, res) => res.json({ locked: chatLocked }));

// NOUVEAU : Admin envoie message dans le chat
app.post('/api/admin/send-message', (req, res) => {
    const { adminId, text } = req.body;
    if (!adminId || !text) return res.status(400).json({ error: "Paramètres manquants" });
    
    const admins = readJson(ADMINS_FILE);
    const admin = admins.find(a => a.id === adminId);
    if (!admin) return res.status(403).send();
    
    const msg = {
        user: 'ADMIN 🛡️',
        text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isAdmin: true
    };
    
    let chat = readJson(CHAT_FILE);
    chat.push(msg);
    if (chat.length > 50) chat.shift();
    writeJson(CHAT_FILE, chat);
    
    io.emit('new-message', msg);
    logAdminAction(adminId, admin.name, 'send_message', text);
    
    res.json({ success: true });
});

// NOUVEAU : Message épinglé
app.post('/api/admin/pin-message', (req, res) => {
    const { adminId, text, duration } = req.body;
    if (!adminId || !text) return res.status(400).json({ error: "Paramètres manquants" });
    
    const admins = readJson(ADMINS_FILE);
    const admin = admins.find(a => a.id === adminId);
    if (!admin) return res.status(403).send();
    
    const pinned = {
        message: text,
        adminName: admin.name,
        createdAt: Date.now(),
        expiresAt: duration === 'lifetime' ? null : Date.now() + (duration * 60 * 1000)
    };
    
    writeJson(PINNED_MSG_FILE, pinned);
    pinnedMessage = pinned;
    io.emit('pinned-message', pinned);
    logAdminAction(adminId, admin.name, 'pin_message', text, `Durée: ${duration}min`);
    
    res.json({ success: true, pinned });
});

app.post('/api/admin/unpin-message', (req, res) => {
    const { adminId } = req.body;
    if (!adminId) return res.status(403).send();
    const admins = readJson(ADMINS_FILE);
    const admin = admins.find(a => a.id === adminId);
    if (!admin) return res.status(403).send();
    
    writeJson(PINNED_MSG_FILE, {});
    pinnedMessage = null;
    io.emit('pinned-message', null);
    logAdminAction(adminId, admin.name, 'unpin_message', 'all');
    res.json({ success: true });
});

app.get('/api/pinned-message', (req, res) => {
    const pinned = readJson(PINNED_MSG_FILE);
    if (!pinned.message) return res.json({ pinned: null });
    if (pinned.expiresAt && pinned.expiresAt < Date.now()) {
        return res.json({ pinned: null });
    }
    res.json({ pinned });
});

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
    
    // Envoyer message épinglé
    const pinned = readJson(PINNED_MSG_FILE);
    if (pinned.message && (!pinned.expiresAt || pinned.expiresAt > Date.now())) {
        socket.emit('pinned-message', pinned);
    }

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
        
        if (isTimedOut(data.user)) {
            socket.emit('error-message', 'Tu es en timeout temporaire');
            return;
        }
        
        const now = Date.now();
        if (lastMessages[data.user] && (now - lastMessages[data.user]) < 5000) {
            socket.emit('error-message', 'Attends 5 secondes entre chaque message');
            return;
        }
        
        if (containsBannedWord(data.text)) {
            socket.emit('error-message', 'Ton message contient un mot interdit');
            return;
        }
        
        lastMessages[data.user] = now;

        const msg = {
            user: data.user,
            text: data.text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isAdmin: false
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
    console.log(`🔑 ADMIN KEY : ${ADMIN_SECRET_KEY}`);
    console.log(`👑 SUPER ADMIN KEY : ${SUPER_ADMIN_KEY}`);
    console.log(`==========================================`);
    
    if (EMAIL_CONFIG.gmailUser === 'zenithtv.noreply@gmail.com') {
        console.log(`\n⚠️  ATTENTION : EMAIL NON CONFIGURÉ !`);
        console.log(`Édite server.js lignes 9-11 pour configurer Gmail\n`);
    }
});
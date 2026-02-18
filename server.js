const express    = require('express');
const http       = require('http');
const socketIo   = require('socket.io');
const fs         = require('fs');
const nodemailer = require('nodemailer');

// ============================================================================
// ============================================================================
// CONFIG EMAIL — MODIFIE CES 2 LIGNES AVEC TES VRAIES INFOS
// ============================================================================
// gmailUser : ton adresse Gmail (ex: monadresse@gmail.com)
// gmailPass : mot de passe d'APPLICATION Gmail (pas ton vrai mdp !)
//   → Va sur myaccount.google.com → Sécurité → Mots de passe des applis
//   → Génère un mot de passe pour "Courrier" → copie les 16 caractères

const EMAIL_CONFIG = {
    gmailUser: 'zenithtv.noreply@gmail.com',   // ← METS TON GMAIL ICI
    gmailPass: 'cajk kbzh fitl qmrr ',   // ← METS TON MOT DE PASSE D'APPLICATION ICI (16 caract.)
    siteName:  'ZenithTV'
};

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: EMAIL_CONFIG.gmailUser,
        pass: EMAIL_CONFIG.gmailPass
    }
});

async function sendWelcomeEmail(toEmail, username, password) {
    if (!EMAIL_CONFIG.gmailUser || EMAIL_CONFIG.gmailUser === 'zenithtv.noreply@gmail.com') {
        console.log(`⚠️  Email non configuré — modifie EMAIL_CONFIG dans server.js`);
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
const RESET_CODES_FILE = './reset_codes.json';

const ADMIN_SECRET_KEY = "sac de piscine";
const SUPER_ADMIN_KEY  = "cassandra_jibril"; // ← TON code Super Admin

let onlineUsers   = {};
let chatLocked    = false;
let lastMessages  = {};
let pinnedMessage = null;

// Init fichiers
[USERS_FILE, BANS_FILE, CHAT_FILE, MESSAGES_FILE, WORD_FILTER_FILE, ADMIN_LOGS_FILE, TIMEOUTS_FILE, ADMINS_FILE, PINNED_MSG_FILE, RESET_CODES_FILE].forEach(f => {
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
    if (hours >= 160) return { name: 'STARS', color: '#FFD700', icon: '⭐' };
    if (hours >= 120) return { name: 'GOAT',  color: '#ff00ff', icon: '🐐' };
    if (hours >= 80)  return { name: 'Brave', color: '#ff6600', icon: '🛡️' };
    if (hours >= 40)  return { name: 'Fidèle',color: '#00ccff', icon: '💎' };
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
    
    if (adminKey !== ADMIN_SECRET_KEY && adminKey !== SUPER_ADMIN_KEY) {
        return res.status(403).json({ success: false, error: "Clé admin invalide" });
    }
    
    let admins = readJson(ADMINS_FILE);
    
    const deviceFingerprint = req.headers['x-admin-device'] || null;

    // ── VERROU : 1 seul compte admin par appareil ──
    if (deviceFingerprint) {
        const existing = admins.find(a => a.deviceFingerprint === deviceFingerprint);
        if (existing) {
            return res.status(400).json({
                success: false,
                error: `Un compte admin existe déjà sur cet appareil (${existing.name} — ${existing.id}). Un seul compte par appareil est autorisé.`,
                existingId: existing.id
            });
        }
    }
    
    // Générer ID unique ADMIN_0001
    const allIds = admins.map(a => parseInt(a.id.replace('ADMIN_',''))).filter(n => !isNaN(n));
    const nextId = allIds.length > 0 ? Math.max(...allIds) + 1 : 1;
    const adminId = `ADMIN_${String(nextId).padStart(4, '0')}`;
    
    const admin = {
        id: adminId,
        name,
        password,
        role: adminKey === SUPER_ADMIN_KEY ? 'super_admin' : 'admin',
        createdAt: Date.now(),
        lastLogin: Date.now(),
        deviceFingerprint: deviceFingerprint
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
    // Mettre à jour le fingerprint de l'appareil à chaque connexion
    const deviceFp = req.headers['x-admin-device'] || null;
    if (deviceFp) admin.deviceFingerprint = deviceFp;
    writeJson(ADMINS_FILE, admins);
    
    res.json({ success: true, admin: { id: admin.id, name: admin.name, role: admin.role } });
});

// Reconnaissance automatique de l'appareil admin
app.post('/api/admin/device-login', (req, res) => {
    const deviceFp = req.headers['x-admin-device'] || req.body.deviceFingerprint;
    if (!deviceFp) return res.json({ success: false });
    
    const admins = readJson(ADMINS_FILE);
    const admin = admins.find(a => a.deviceFingerprint === deviceFp);
    if (!admin) return res.json({ success: false, error: 'Appareil non reconnu' });
    
    // Mettre à jour lastLogin
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

// Classement public (sans auth admin)
app.get('/api/rankings/public', (req, res) => {
    const watchTime = readJson(WATCH_TIME_FILE);
    const users = readJson(USERS_FILE);
    const bans  = readJson(BANS_FILE);
    const validUsernames  = users.map(u => u.username);
    const bannedUsernames = bans.map(b => b.username).filter(Boolean);
    const rankings = Object.entries(watchTime)
        .filter(([username]) => validUsernames.includes(username) && !bannedUsernames.includes(username))
        .map(([username, minutes]) => ({ username, minutes, hours: (minutes/60).toFixed(1), grade: getGrade(minutes) }))
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 10);
    res.json({ success: true, rankings });
});

// --- CORRECTION : AJOUT DE LA ROUTE MANQUANTE ---
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
// --- FIN CORRECTION ---

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


// Super Admin - Supprimer un compte admin/superadmin
app.post('/api/superadmin/delete-admin', (req, res) => {
    const { adminId, targetAdminId } = req.body;
    if (!adminId) return res.status(403).send();
    const admins = readJson(ADMINS_FILE);
    const admin = admins.find(a => a.id === adminId);
    if (!admin || admin.role !== 'super_admin') return res.status(403).json({ error: 'Non autorisé' });
    if (targetAdminId === adminId) return res.status(400).json({ error: 'Tu ne peux pas supprimer ton propre compte' });
    const target = admins.find(a => a.id === targetAdminId);
    if (!target) return res.status(404).json({ error: 'Admin introuvable' });
    const newAdmins = admins.filter(a => a.id !== targetAdminId);
    writeJson(ADMINS_FILE, newAdmins);
    logAdminAction(adminId, admin.name, 'delete_admin', targetAdminId, `Suppression de ${target.name} (${target.role})`);
    res.json({ success: true });
});

// Super Admin - Changer le mot de passe d'un admin
app.post('/api/superadmin/change-password', (req, res) => {
    const { adminId, targetAdminId, newPassword } = req.body;
    if (!adminId || !newPassword) return res.status(400).json({ error: 'Paramètres manquants' });
    const admins = readJson(ADMINS_FILE);
    const admin = admins.find(a => a.id === adminId);
    if (!admin || admin.role !== 'super_admin') return res.status(403).json({ error: 'Non autorisé' });
    const target = admins.find(a => a.id === targetAdminId);
    if (!target) return res.status(404).json({ error: 'Admin introuvable' });
    target.password = newPassword;
    writeJson(ADMINS_FILE, admins);
    logAdminAction(adminId, admin.name, 'change_password', targetAdminId, `Changement mdp de ${target.name}`);
    res.json({ success: true });
});

// Super Admin - Changer le mot de passe d'un utilisateur
app.post('/api/superadmin/change-user-password', (req, res) => {
    const { adminId, userId, newPassword } = req.body;
    if (!adminId || !newPassword) return res.status(400).json({ error: 'Paramètres manquants' });
    const admins = readJson(ADMINS_FILE);
    const admin = admins.find(a => a.id === adminId);
    if (!admin || admin.role !== 'super_admin') return res.status(403).json({ error: 'Non autorisé' });
    let users = readJson(USERS_FILE);
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    user.password = newPassword;
    writeJson(USERS_FILE, users);
    logAdminAction(adminId, admin.name, 'change_user_password', user.username, `Nouveau mdp défini`);
    res.json({ success: true });
});

// ============================================================================
// SUDO RESET — Code à 6 chiffres pour écraser un compte admin sur un appareil
// ============================================================================

// Super Admin → Générer un code de reset
app.post('/api/superadmin/generate-reset-code', (req, res) => {
    const { adminId } = req.body;
    if (!adminId) return res.status(403).send();
    const admins = readJson(ADMINS_FILE);
    const admin  = admins.find(a => a.id === adminId);
    if (!admin || admin.role !== 'super_admin') return res.status(403).json({ error: 'Non autorisé' });

    // Générer code 6 chiffres unique
    let code;
    let codes = readJson(RESET_CODES_FILE);
    do { code = String(Math.floor(100000 + Math.random() * 900000)); }
    while (codes.find(c => c.code === code && !c.used));

    const entry = {
        code,
        createdBy: adminId,
        createdByName: admin.name,
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24h
        used: false,
        usedBy: null,
        usedAt: null
    };
    codes.push(entry);
    // Garder seulement les 50 derniers codes
    if (codes.length > 50) codes = codes.slice(-50);
    writeJson(RESET_CODES_FILE, codes);
    logAdminAction(adminId, admin.name, 'generate_reset_code', code, 'Code sudo généré');
    res.json({ success: true, code, expiresAt: entry.expiresAt });
});

// Super Admin → Lister les codes actifs
app.post('/api/superadmin/reset-codes', (req, res) => {
    const { adminId } = req.body;
    if (!adminId) return res.status(403).send();
    const admins = readJson(ADMINS_FILE);
    const admin  = admins.find(a => a.id === adminId);
    if (!admin || admin.role !== 'super_admin') return res.status(403).json({ error: 'Non autorisé' });
    const codes = readJson(RESET_CODES_FILE);
    const now   = Date.now();
    // Nettoyer les expirés
    const active = codes.filter(c => c.expiresAt > now || c.used);
    res.json({ success: true, codes: active.reverse() });
});

// Super Admin → Révoquer un code
app.post('/api/superadmin/revoke-reset-code', (req, res) => {
    const { adminId, code } = req.body;
    if (!adminId || !code) return res.status(400).send();
    const admins = readJson(ADMINS_FILE);
    const admin  = admins.find(a => a.id === adminId);
    if (!admin || admin.role !== 'super_admin') return res.status(403).json({ error: 'Non autorisé' });
    let codes = readJson(RESET_CODES_FILE);
    const entry = codes.find(c => c.code === code);
    if (!entry) return res.status(404).json({ error: 'Code introuvable' });
    entry.used    = true;
    entry.usedBy  = '[révoqué par SuperAdmin]';
    entry.usedAt  = Date.now();
    writeJson(RESET_CODES_FILE, codes);
    logAdminAction(adminId, admin.name, 'revoke_reset_code', code, 'Code révoqué');
    res.json({ success: true });
});

// Public → Utiliser un code sudo pour écraser le compte admin de cet appareil
app.post('/api/admin/sudo-reset', (req, res) => {
    const { code, name, password, adminKey } = req.body;
    const deviceFp = req.headers['x-admin-device'] || null;

    if (!code || !name || !password || !adminKey) {
        return res.status(400).json({ success: false, error: 'Tous les champs sont requis' });
    }
    if (adminKey !== ADMIN_SECRET_KEY && adminKey !== SUPER_ADMIN_KEY) {
        return res.status(403).json({ success: false, error: 'Clé admin invalide' });
    }

    let codes = readJson(RESET_CODES_FILE);
    const now  = Date.now();
    const entry = codes.find(c => c.code === code && !c.used && c.expiresAt > now);
    if (!entry) {
        return res.status(400).json({ success: false, error: 'Code invalide, expiré ou déjà utilisé' });
    }

    let admins = readJson(ADMINS_FILE);

    // Supprimer l'ancien compte lié à cet appareil (s'il existe)
    const oldAdmin = admins.find(a => a.deviceFingerprint === deviceFp);
    if (oldAdmin) {
        admins = admins.filter(a => a.deviceFingerprint !== deviceFp);
        logAdminAction('SYSTEM', 'Système', 'sudo_reset_delete', oldAdmin.id, `Compte écrasé via code sudo ${code}`);
    }

    // Créer le nouveau compte
    const allIds = admins.map(a => parseInt(a.id.replace('ADMIN_',''))).filter(n => !isNaN(n));
    const nextId = allIds.length > 0 ? Math.max(...allIds) + 1 : 1;
    const adminId = `ADMIN_${String(nextId).padStart(4, '0')}`;

    const newAdmin = {
        id: adminId,
        name,
        password,
        role: adminKey === SUPER_ADMIN_KEY ? 'super_admin' : 'admin',
        createdAt: Date.now(),
        lastLogin: Date.now(),
        deviceFingerprint: deviceFp
    };
    admins.push(newAdmin);
    writeJson(ADMINS_FILE, admins);

    // Marquer le code comme utilisé
    entry.used   = true;
    entry.usedBy = adminId;
    entry.usedAt = Date.now();
    writeJson(RESET_CODES_FILE, codes);

    logAdminAction(adminId, name, 'sudo_reset_create', adminId, `Nouveau compte créé via code sudo (remplace ${oldAdmin?.id || 'aucun'})`);
    res.json({ success: true, admin: { id: adminId, name, role: newAdmin.role } });
});


app.post('/api/admin/support/users', (req, res) => {
    const { adminId } = req.body;
    if (!adminId) return res.status(403).send();
    const admins = readJson(ADMINS_FILE);
    const admin = admins.find(a => a.id === adminId);
    if (!admin) return res.status(403).send();
    const users = readJson(USERS_FILE);
    const messages = readJson(MESSAGES_FILE);
    // Users qui ont reçu ou envoyé un message au support
    const supportTag = `ADMIN:${admin.name}`;
    const usersWithConv = users.map(u => {
        const msgs = messages.filter(m =>
            (m.from === u.username && m.to === supportTag) ||
            (m.from === supportTag && m.to === u.username)
        );
        const unread = msgs.filter(m => m.to === supportTag && !m.read).length;
        return { username: u.username, isOnline: !!onlineUsers[u.username], msgCount: msgs.length, unread, lastMsg: msgs.length > 0 ? msgs[msgs.length-1] : null };
    }).filter(u => u.msgCount > 0);
    res.json({ success: true, users: usersWithConv, allUsers: users.map(u => ({ username: u.username, isOnline: !!onlineUsers[u.username] })) });
});

// Admin Support DM - Charger conversation avec un user
app.post('/api/admin/support/messages', (req, res) => {
    const { adminId, username } = req.body;
    if (!adminId || !username) return res.status(400).send();
    const admins = readJson(ADMINS_FILE);
    const admin = admins.find(a => a.id === adminId);
    if (!admin) return res.status(403).send();
    const supportTag = `ADMIN:${admin.name}`;
    const messages = readJson(MESSAGES_FILE);
    const conv = messages.filter(m =>
        (m.from === username && m.to === supportTag) ||
        (m.from === supportTag && m.to === username)
    );
    // Marquer comme lus
    let changed = false;
    messages.forEach(m => { if (m.to === supportTag && m.from === username && !m.read) { m.read = true; changed = true; } });
    if (changed) writeJson(MESSAGES_FILE, messages);
    res.json({ success: true, messages: conv, adminName: admin.name });
});

// Admin Support DM - Envoyer message à un user — ANONYME (Admin 🛡️)
app.post('/api/admin/support/send', (req, res) => {
    const { adminId, toUsername, text } = req.body;
    if (!adminId || !toUsername || !text) return res.status(400).json({ error: 'Paramètres manquants' });
    const admins = readJson(ADMINS_FILE);
    const admin = admins.find(a => a.id === adminId);
    if (!admin) return res.status(403).send();
    // Toujours utiliser le tag anonyme "ADMIN:shield" pour l'expéditeur côté user
    const supportTag = `ADMIN:shield`;
    const messages = readJson(MESSAGES_FILE);
    const msg = { id: Date.now(), from: supportTag, to: toUsername, text, timestamp: Date.now(), read: false, isAdminSupport: true, adminName: 'Admin' };
    messages.push(msg);
    writeJson(MESSAGES_FILE, messages);
    // Notifier le user en temps réel
    io.sockets.sockets.forEach(s => { if (s.username === toUsername) s.emit('new-dm', msg); });
    logAdminAction(adminId, admin.name, 'support_dm', toUsername, text.slice(0,50));
    res.json({ success: true, message: msg });
});

// Profil utilisateur public (pour clic sur pseudo)
app.post('/api/user/profile', (req, res) => {
    const { username, adminId } = req.body;
    if (!username) return res.status(400).json({ error: 'Paramètres manquants' });
    
    const users = readJson(USERS_FILE);
    const user = users.find(u => u.username === username);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    
    const watchTime = readJson(WATCH_TIME_FILE);
    const bans = readJson(BANS_FILE);
    const timeouts = readJson(TIMEOUTS_FILE);
    const messages = readJson(MESSAGES_FILE);
    
    const grade = getGrade(watchTime[username] || 0);
    const activeBan = bans.find(b =>
        (b.type === 'ip' && b.ip === user.ip) ||
        (b.type === 'hardware' && user.fingerprint && b.fingerprint === user.fingerprint) ||
        (b.type === 'hardware' && user.storageId && b.storageId === user.storageId)
    ) || null;
    const activeTimeout = timeouts.find(t => t.username === username && t.expiresAt > Date.now()) || null;
    const msgCount = messages.filter(m => m.from === username || m.to === username).length;
    
    // Si admin, donner plus d'infos
    const isAdmin = adminId && readJson(ADMINS_FILE).find(a => a.id === adminId);
    
    res.json({
        success: true,
        profile: {
            username: user.username,
            grade,
            watchMinutes: watchTime[username] || 0,
            hours: ((watchTime[username] || 0) / 60).toFixed(1),
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
            isOnline: !!onlineUsers[username],
            activeBan,
            activeTimeout,
            msgCount,
            // Infos sensibles uniquement pour admins
            ip: isAdmin ? user.ip : null,
            email: isAdmin ? user.email : null,
            id: isAdmin ? user.id : null,
        }
    });
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
});
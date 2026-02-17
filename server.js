const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const nodemailer = require('nodemailer');

// ============================================================================
// CONFIG EMAIL — Remplace par tes infos Gmail
// ============================================================================

const EMAIL_CONFIG = {
    gmailUser: 'zenithtv.noreply@gmail.com',
    gmailPass: 'mdvz mqxq zmwf fimg',
    siteName:  'ZenithTv'
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
            <div style="background:#9146ff;padding:30px;text-align:center;">
                <h1 style="margin:0;font-size:1.8rem;color:white;">&#127918; ${EMAIL_CONFIG.siteName}</h1>
                <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);">Confirmation de ton inscription</p>
            </div>
            <div style="padding:30px;">
                <p style="font-size:1rem;">Salut <strong style="color:#9146ff;">${username}</strong> !</p>
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
        console.log(`Email de confirmation envoye a ${toEmail}`);
    } catch (err) {
        console.error(`Erreur envoi email:`, err.message);
    }
}



const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(express.static(__dirname));

const USERS_FILE   = './utilisateurs.json';
const BANS_FILE    = './bans.json';
const CHAT_FILE    = './chat_history.json';
const ADMIN_SECRET = "sac de piscine";

let onlineUsers = {};
let chatLocked  = false;

// Init fichiers JSON
[USERS_FILE, BANS_FILE, CHAT_FILE].forEach(f => {
    if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify([]));
});

const readJson  = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJson = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

// ============================================================================
// HELPER — Vérifie si une IP/fingerprint/storageId est bannie
// ============================================================================

// Normalise les IPs — enlève le préfixe IPv6 "::ffff:" (ex: ::ffff:192.168.1.1 → 192.168.1.1)
function normalizeIp(ip) {
    if (!ip) return '';
    return ip.replace(/^::ffff:/, '').trim();
}

function isBanned(ip, fp, sid) {
    const bans   = readJson(BANS_FILE);
    const normIp = normalizeIp(ip);
    return bans.some(b =>
        (b.type === 'ip'       && normalizeIp(b.ip) === normIp && normIp !== '') ||
        (b.type === 'hardware' && fp  && b.fingerprint === fp)  ||
        (b.type === 'hardware' && sid && b.storageId   === sid)
    );
}

// ============================================================================
// MIDDLEWARE HTTP — Bloque les requêtes des bannis
// ============================================================================

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

    // Envoyer l'email de confirmation
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
// ADMIN — Utilisateurs
// ============================================================================

app.post('/api/admin/users', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).send();
    const users = readJson(USERS_FILE);
    const bans  = readJson(BANS_FILE);
    res.json({
        success: true,
        users: users.map(u => ({
            ...u,
            isOnline: !!onlineUsers[u.username],
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
    let users = readJson(USERS_FILE).filter(u => u.id !== req.body.userId);
    writeJson(USERS_FILE, users);
    res.json({ success: true });
});

// ============================================================================
// ADMIN — Bans
// ============================================================================

app.post('/api/admin/bans', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).send();
    res.json({ success: true, bans: readJson(BANS_FILE) });
});

// ---- BAN IP ----
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

    // Éjecter IMMÉDIATEMENT tous les sockets avec cette IP ou ce username
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

    console.log(`🔴 Ban IP [${adminName}] → ${ip} — "${reason}" (${ejected} socket(s) éjecté(s))`);
    res.json({ success: true, ban });
});

// ---- BAN HARDWARE ----
app.post('/api/admin/ban-hardware', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).send();
    const { userId, reason, adminName } = req.body;
    if (!reason || !adminName) return res.status(400).json({ error: "Raison et nom admin requis" });

    const users = readJson(USERS_FILE);
    const user  = users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
    if (!user.fingerprint && !user.storageId)
        return res.status(400).json({ error: "Aucune empreinte disponible — l'utilisateur doit se reconnecter d'abord." });

    let bans = readJson(BANS_FILE);
    const already = bans.find(b =>
        b.type === 'hardware' &&
        ((user.fingerprint && b.fingerprint === user.fingerprint) ||
         (user.storageId   && b.storageId   === user.storageId))
    );
    if (already) return res.status(400).json({ error: "Cet utilisateur est déjà banni matériellement" });

    const ban = {
        id: Date.now(), type: 'hardware',
        username: user.username, userId: user.id,
        ip: user.ip || null, fingerprint: user.fingerprint || null, storageId: user.storageId || null,
        reason, adminName, createdAt: Date.now()
    };
    bans.push(ban);
    writeJson(BANS_FILE, bans);

    // Éjecter le socket
    io.sockets.sockets.forEach(s => {
        if (s.username === user.username) {
            s.emit('force-banned');
            s.disconnect(true);
        }
    });

    console.log(`🔨 Ban HW [${adminName}] → ${user.username} — "${reason}"`);
    res.json({ success: true, ban });
});

// ---- UNBAN ----
app.post('/api/admin/unban', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).send();
    const { banId, adminName } = req.body;
    let bans = readJson(BANS_FILE);
    const ban = bans.find(b => b.id === banId);
    if (!ban) return res.status(404).json({ error: "Ban introuvable" });
    bans = bans.filter(b => b.id !== banId);
    writeJson(BANS_FILE, bans);
    console.log(`🟢 Unban [${adminName}] → ${ban.username || ban.ip}`);
    res.json({ success: true });
});

// ============================================================================
// ADMIN — Chat
// ============================================================================

app.post('/api/admin/reset-chat', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).send();
    writeJson(CHAT_FILE, []);
    io.emit('chat-reset');
    res.json({ success: true });
});

app.post('/api/admin/toggle-lock', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).send();
    chatLocked = !chatLocked;
    io.emit('chat-lock', chatLocked);
    res.json({ success: true, locked: chatLocked });
});

app.get('/api/chat-status', (req, res) => res.json({ locked: chatLocked }));

// ============================================================================
// SOCKETS
// ============================================================================

io.on('connection', (socket) => {
    // Récupérer l'IP du socket
    const rawIp = socket.handshake.headers['x-forwarded-for']?.split(',')[0].trim()
                  || socket.handshake.address;
    const clientIp = rawIp ? rawIp.replace('::ffff:', '') : rawIp; // Normaliser IPv6
    socket.clientIp = clientIp;

    // ← CORRECTION : Vérifier le ban dès la connexion socket
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

        // Double vérification ban au moment d'envoyer un message
        if (isBanned(socket.clientIp, null, null)) {
            socket.emit('force-banned');
            socket.disconnect(true);
            return;
        }

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

        // ← Envoyer aussi au panel admin
        io.emit('admin-new-message', msg);
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            delete onlineUsers[socket.username];
            io.emit('viewers-update', Object.keys(onlineUsers).length);
        }
    });
});

// ============================================================================
// DÉMARRAGE
// ============================================================================

const PORT = 8000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==========================================`);
    console.log(`🚀 SERVEUR : http://localhost:${PORT}`);
    console.log(`🔑 ADMIN   : ${ADMIN_SECRET}`);
    console.log(`==========================================\n`);
});
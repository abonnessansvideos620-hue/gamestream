const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(express.static(__dirname));

const USERS_FILE   = './utilisateurs.json';
const BANS_FILE    = './bans.json';          // ← UN SEUL fichier pour TOUS les bans
const CHAT_FILE    = './chat_history.json';
const ADMIN_SECRET = "sac de piscine";

let onlineUsers = {};
let chatLocked  = false;

// Initialisation des fichiers JSON
[USERS_FILE, BANS_FILE, CHAT_FILE].forEach(f => {
    if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify([]));
});

// Helper : lire/écrire
const readJson  = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJson = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

// ============================================================================
// MIDDLEWARE — Vérifie les bans à chaque requête
// ============================================================================

app.use((req, res, next) => {
    const bans = readJson(BANS_FILE);
    const fp   = req.headers['x-fingerprint'];
    const sid  = req.headers['x-storage-id'];

    const isBanned = bans.some(b =>
        (b.type === 'ip'       && b.ip          === req.ip) ||
        (b.type === 'hardware' && fp  && b.fingerprint === fp)  ||
        (b.type === 'hardware' && sid && b.storageId   === sid)
    );

    if (isBanned) return res.status(403).json({ banned: true });
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
        ip: req.ip,
        fingerprint: req.headers['x-fingerprint'] || null,
        storageId:   req.headers['x-storage-id']  || null,
        createdAt: Date.now(), lastLogin: Date.now()
    };
    users.push(user);
    writeJson(USERS_FILE, users);
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
    user.ip          = req.ip;
    user.fingerprint = req.headers['x-fingerprint'] || user.fingerprint;
    user.storageId   = req.headers['x-storage-id']  || user.storageId;
    writeJson(USERS_FILE, users);
    res.json({ success: true, user });
});

app.get('/api/auth/check-ban', (req, res) => {
    const bans = readJson(BANS_FILE);
    const fp   = req.headers['x-fingerprint'];
    const sid  = req.headers['x-storage-id'];
    const banned = bans.some(b =>
        (b.type === 'ip'       && b.ip          === req.ip) ||
        (b.type === 'hardware' && fp  && b.fingerprint === fp)  ||
        (b.type === 'hardware' && sid && b.storageId   === sid)
    );
    res.json({ banned });
});

// ============================================================================
// ADMIN — Récupérer les utilisateurs
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

// ============================================================================
// ADMIN — Supprimer un utilisateur
// ============================================================================

app.post('/api/admin/delete-user', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).send();
    let users = readJson(USERS_FILE).filter(u => u.id !== req.body.userId);
    writeJson(USERS_FILE, users);
    res.json({ success: true });
});

// ============================================================================
// ADMIN — BANS (tous types)
// ============================================================================

// Liste de tous les bans
app.post('/api/admin/bans', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).send();
    res.json({ success: true, bans: readJson(BANS_FILE) });
});

// Appliquer un ban IP
app.post('/api/admin/ban-ip', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET) return res.status(403).send();
    const { ip, reason, adminName } = req.body;
    if (!reason || !adminName) return res.status(400).json({ error: "Raison et nom admin requis" });

    let bans = readJson(BANS_FILE);
    if (bans.find(b => b.type === 'ip' && b.ip === ip))
        return res.status(400).json({ error: "Cette IP est déjà bannie" });

    const ban = {
        id:        Date.now(),
        type:      'ip',
        ip,
        reason,
        adminName,
        createdAt: Date.now(),
        username:  req.body.username || null
    };
    bans.push(ban);
    writeJson(BANS_FILE, bans);
    console.log(`🔴 Ban IP [${adminName}] → ${ip} — "${reason}"`);
    res.json({ success: true, ban });
});

// Appliquer un ban matériel
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
        id:          Date.now(),
        type:        'hardware',
        username:    user.username,
        userId:      user.id,
        ip:          user.ip          || null,
        fingerprint: user.fingerprint || null,
        storageId:   user.storageId   || null,
        reason,
        adminName,
        createdAt:   Date.now()
    };
    bans.push(ban);
    writeJson(BANS_FILE, bans);

    // Éjecter le socket si en ligne
    io.sockets.sockets.forEach(s => {
        if (s.username === user.username) {
            s.emit('force-banned');
            s.disconnect(true);
        }
    });

    console.log(`🔨 Ban HW [${adminName}] → ${user.username} — "${reason}"`);
    res.json({ success: true, ban });
});

// Lever un ban (par ID de ban)
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
    socket.emit('load-history', readJson(CHAT_FILE));
    socket.emit('chat-lock', chatLocked);

    socket.on('register-online', name => {
        socket.username = name;
        onlineUsers[name] = Date.now();
        io.emit('viewers-update', Object.keys(onlineUsers).length);
    });

    socket.on('send-message', data => {
        if (chatLocked) return;
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
// DÉMARRAGE
// ============================================================================

const PORT = 8000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==========================================`);
    console.log(`🚀 SERVEUR : http://localhost:${PORT}`);
    console.log(`🔑 ADMIN   : ${ADMIN_SECRET}`);
    console.log(`==========================================\n`);
});
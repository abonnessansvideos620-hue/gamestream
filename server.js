const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// --- CONFIGURATION ---
app.use(express.json());
app.use(express.static(__dirname));

const USERS_FILE = './utilisateurs.json';
const BANNED_FILE = './banned_ips.json';
const ADMIN_SECRET_KEY = "sac de piscine"; // Ton mot de passe

// Config Email
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'abonnessansvideos620@gmail.com', 
        pass: 'wxykqllfutdcwuzy'
    }
});

// --- SÉCURITÉ : VÉRIFICATION BAN ---
app.use((req, res, next) => {
    let bannedIps = fs.existsSync(BANNED_FILE) ? JSON.parse(fs.readFileSync(BANNED_FILE)) : [];
    if (bannedIps.includes(req.ip)) {
        return res.status(403).send("<h1 style='color:red;text-align:center;margin-top:50px;'>🚫 ACCÈS REFUSÉ</h1>");
    }
    next();
});

// --- ROUTES AUTHENTIFICATION ---
app.post('/api/auth/register', (req, res) => {
    const { username, email, password } = req.body;
    let users = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE)) : [];
    const newUser = { id: Date.now(), username, email, password, ip: req.ip };
    users.push(newUser);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    res.json({ success: true, user: { id: newUser.id, username: newUser.username } });
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const users = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE)) : [];
    const user = users.find(u => (u.username === username || u.email === username) && u.password === password);
    if (user) res.json({ success: true, user: { id: user.id, username: user.username } });
    else res.status(401).json({ success: false });
});

// --- ROUTES ADMIN (SYNCHRONISÉES AVEC TON HTML) ---

app.post('/api/admin/users', (req, res) => {
    const { secret } = req.body;
    if (secret !== ADMIN_SECRET_KEY) return res.status(403).json({ success: false });

    const users = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE)) : [];
    res.json({ success: true, users: users });
});

app.post('/api/admin/delete-user', (req, res) => {
    const { secret, userId } = req.body;
    if (secret !== ADMIN_SECRET_KEY) return res.status(403).json({ success: false });

    let users = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE)) : [];
    users = users.filter(u => u.id !== userId);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    res.json({ success: true });
});

app.post('/api/admin/ban-ip', (req, res) => {
    const { secret, ip } = req.body;
    if (secret !== ADMIN_SECRET_KEY) return res.status(403).json({ success: false });

    let bannedIps = fs.existsSync(BANNED_FILE) ? JSON.parse(fs.readFileSync(BANNED_FILE)) : [];
    if (!bannedIps.includes(ip)) {
        bannedIps.push(ip);
        fs.writeFileSync(BANNED_FILE, JSON.stringify(bannedIps, null, 2));
    }
    res.json({ success: true });
});

// --- SOCKET.IO ---
io.on('connection', (socket) => {
    socket.on('send-message', (data) => { io.emit('new-message', data); });
});

// --- DÉMARRAGE ---
const PORT = process.env.PORT || 8000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SERVEUR EN LIGNE SUR LE PORT ${PORT}`);
});

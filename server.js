const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(express.static(__dirname));

const USERS_FILE = './utilisateurs.json';
const BANNED_FILE = './banned_ips.json';
const CHAT_FILE = './chat_history.json';
const ADMIN_SECRET_KEY = "sac de piscine";

let onlineUsers = {};

// Initialisation des fichiers JSON s'ils n'existent pas
[USERS_FILE, BANNED_FILE, CHAT_FILE].forEach(f => {
    if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify([]));
});

// Middleware Anti-Ban
app.use((req, res, next) => {
    const bannedIps = JSON.parse(fs.readFileSync(BANNED_FILE));
    if (bannedIps.includes(req.ip)) return res.status(403).send("Accès banni.");
    next();
});

// --- ROUTES AUTH ---
app.post('/api/auth/register', (req, res) => {
    const { username, email, password } = req.body;
    let users = JSON.parse(fs.readFileSync(USERS_FILE));
    if (users.find(u => u.username === username)) return res.status(400).json({ success: false, error: "Pseudo pris" });
    
    const newUser = { id: Date.now(), username, email, password, ip: req.ip, createdAt: Date.now(), lastLogin: Date.now() };
    users.push(newUser);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    res.json({ success: true, user: newUser });
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    let users = JSON.parse(fs.readFileSync(USERS_FILE));
    const user = users.find(u => (u.username === username || u.email === username) && u.password === password);
    if (user) {
        user.lastLogin = Date.now();
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        res.json({ success: true, user });
    } else {
        res.status(401).json({ success: false, error: "Identifiants faux" });
    }
});

// --- ROUTES ADMIN ---
app.post('/api/admin/users', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET_KEY) return res.status(403).send();
    const users = JSON.parse(fs.readFileSync(USERS_FILE));
    res.json({ success: true, users: users.map(u => ({ ...u, isOnline: !!onlineUsers[u.username] })) });
});

app.post('/api/admin/delete-user', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET_KEY) return res.status(403).send();
    let users = JSON.parse(fs.readFileSync(USERS_FILE)).filter(u => u.id !== req.body.userId);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    res.json({ success: true });
});

// --- SOCKETS (CHAT & REALTIME) ---
io.on('connection', (socket) => {
    // 1. Envoyer l'historique au nouveau venu
    const history = JSON.parse(fs.readFileSync(CHAT_FILE));
    socket.emit('load-history', history);

    // 2. Noter que l'utilisateur est en ligne
    socket.on('register-online', (name) => {
        socket.username = name;
        onlineUsers[name] = Date.now();
    });

    // 3. Recevoir et redistribuer un message
    socket.on('send-message', (data) => {
        const msg = {
            user: data.user,
            text: data.text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        
        // Sauvegarde dans le fichier JSON
        let chat = JSON.parse(fs.readFileSync(CHAT_FILE));
        chat.push(msg);
        if(chat.length > 50) chat.shift();
        fs.writeFileSync(CHAT_FILE, JSON.stringify(chat, null, 2));

        io.emit('new-message', msg); // Envoi à TOUT LE MONDE
    });

    socket.on('disconnect', () => {
        if (socket.username) delete onlineUsers[socket.username];
    });
});

const PORT = 8000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==========================================`);
    console.log(`🚀 SERVEUR : http://localhost:${PORT}`);
    console.log(`🔑 ADMIN SECRET : ${ADMIN_SECRET_KEY}`);
    console.log(`==========================================\n`);
});
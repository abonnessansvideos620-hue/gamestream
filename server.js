const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const nodemailer = require('nodemailer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(express.static(__dirname));

const USERS_FILE = './utilisateurs.json';
const BANNED_FILE = './banned_ips.json';
const ADMIN_SECRET_KEY = "sac de piscine";

const onlineUsers = {};

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'abonnessansvideos620@gmail.com', 
        pass: 'wxykqllfutdcwuzy'
    }
});

function isPasswordStrong(password) {
    return /^(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
}

app.use((req, res, next) => {
    let bannedIps = fs.existsSync(BANNED_FILE) ? JSON.parse(fs.readFileSync(BANNED_FILE)) : [];
    if (bannedIps.includes(req.ip)) return res.status(403).send("IP BANNIE");
    next();
});

app.post('/api/auth/register', (req, res) => {
    const { username, email, password } = req.body;
    let users = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE)) : [];
    
    if (!isPasswordStrong(password)) return res.status(400).json({ success: false, error: "Mot de passe trop faible (8 car., 1 Maj, 1 Chiffre) !" });
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) return res.status(400).json({ success: false, error: "Pseudo déjà pris." });
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) return res.status(400).json({ success: false, error: "Email déjà utilisé." });

    const newUser = { 
        id: Date.now(), 
        username, 
        email, 
        password, 
        ip: req.ip,
        createdAt: Date.now(),
        lastLogin: Date.now()
    };
    
    users.push(newUser);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

    transporter.sendMail({
        from: 'abonnessansvideos620@gmail.com',
        to: email,
        subject: 'Bienvenue !',
        text: `Bienvenue ${username} ! Ton compte a été créé avec succès.`
    }).catch(() => {});

    res.json({ success: true, user: newUser });
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    let users = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE)) : [];
    const idx = users.findIndex(u => (u.username === username || u.email === username) && u.password === password);
    
    if (idx !== -1) {
        users[idx].lastLogin = Date.now();
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        res.json({ success: true, user: users[idx] });
    } else {
        res.status(401).json({ success: false, error: "Identifiants incorrects." });
    }
});

app.post('/api/admin/users', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET_KEY) return res.status(403).send();
    const users = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE)) : [];
    const finalData = users.map(u => ({
        ...u,
        isOnline: !!onlineUsers[u.username],
        onlineSince: onlineUsers[u.username] || null
    }));
    res.json({ success: true, users: finalData });
});

app.post('/api/admin/delete-user', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET_KEY) return res.status(403).send();
    let users = JSON.parse(fs.readFileSync(USERS_FILE));
    users = users.filter(u => u.id !== req.body.userId);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    res.json({ success: true });
});

app.post('/api/admin/ban-ip', (req, res) => {
    if (req.body.secret !== ADMIN_SECRET_KEY) return res.status(403).send();
    let banned = fs.existsSync(BANNED_FILE) ? JSON.parse(fs.readFileSync(BANNED_FILE)) : [];
    if(!banned.includes(req.body.ip)) banned.push(req.body.ip);
    fs.writeFileSync(BANNED_FILE, JSON.stringify(banned, null, 2));
    res.json({ success: true });
});

io.on('connection', (socket) => {
    socket.on('register-online', (username) => {
        onlineUsers[username] = Date.now();
        socket.username = username;
    });
    socket.on('disconnect', () => {
        if(socket.username) delete onlineUsers[socket.username];
    });
    socket.on('send-message', (data) => io.emit('new-message', data));
});

const PORT = 8000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==========================================`);
    console.log(`🚀 SERVEUR : http://localhost:${PORT}`);
    console.log(`🔑 ADMIN SECRET : ${ADMIN_SECRET_KEY}`);
    console.log(`==========================================\n`);
});
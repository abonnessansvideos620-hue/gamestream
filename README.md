# 🎮 GameStream - Plateforme Complète avec Authentification

## ⚡ NOUVELLES FONCTIONNALITÉS

### ✅ Ce qui fonctionne maintenant AUTOMATIQUEMENT :

1. **🔐 Système d'authentification complet**
   - Inscription / Connexion
   - Sessions sécurisées
   - Base de données SQLite
   - Mots de passe hashés

2. **💬 Chat en temps réel FONCTIONNEL**
   - Messages instantanés entre tous les utilisateurs
   - Historique sauvegardé en base de données
   - 50 derniers messages chargés automatiquement
   - Protection XSS

3. **📊 Statistiques EN DIRECT**
   - Nombre de viewers connectés (automatique)
   - Nombre de streams actifs
   - Nombre total d'utilisateurs inscrits
   - Messages envoyés dans les dernières 24h

4. **👥 Tracking automatique des utilisateurs**
   - Compteur de viewers en temps réel
   - Identification automatique
   - Nettoyage automatique des utilisateurs inactifs

---

## 🚀 Installation (ÉTAPE PAR ÉTAPE)

### 1️⃣ Prérequis

**Télécharge Node.js** (si ce n'est pas déjà fait) :
- https://nodejs.org/ (version LTS recommandée)

### 2️⃣ Structure des fichiers

Organise tes fichiers comme ça :

```
gamestream/
├── server-complete.js          ← LE NOUVEAU SERVEUR
├── package-complete.json       ← LES NOUVELLES DÉPENDANCES
├── videos-config.json
├── code/                       ← Créer ce dossier !
│   ├── index.html             ← index-complete.html renommé
│   ├── script.js              ← script-complete.js renommé
│   └── style.css
├── videos/
│   └── (tes fichiers MP4)
└── thumbnails/
    └── (tes images)
```

**IMPORTANT** : Les fichiers HTML, CSS, JS doivent être dans le dossier `code/` !

### 3️⃣ Renommer les fichiers

Renomme ces fichiers :
- `server-complete.js` → `server.js`
- `package-complete.json` → `package.json`
- `script-complete.js` → **METS-LE DANS** `code/script.js`
- `index-complete.html` → **METS-LE DANS** `code/index.html`
- Le `style.css` → **METS-LE DANS** `code/style.css`

### 4️⃣ Installer les dépendances

Ouvre un terminal dans le dossier principal et tape :

```bash
npm install
```

Cela va installer :
- ✅ Express (serveur web)
- ✅ Socket.io (chat en temps réel)
- ✅ bcryptjs (hashage des mots de passe)
- ✅ express-session (gestion des sessions)
- ✅ better-sqlite3 (base de données)

### 5️⃣ Lancer le serveur

```bash
npm start
```

Tu verras :
```
🎮 ========================================
🚀 SERVEUR GAMESTREAM DÉMARRÉ !
🎮 ========================================

📡 URL: http://localhost:3000
💬 Chat en temps réel: ACTIVÉ
🔐 Authentification: ACTIVÉE
📊 Statistiques en direct: ACTIVÉES
💾 Base de données: SQLite (gamestream.db)
```

### 6️⃣ Utiliser la plateforme

1. **Ouvre ton navigateur** : `http://localhost:3000`
2. **Crée un compte** (première fois)
3. **Connecte-toi** avec ton compte
4. **Chat en temps réel** : écris et vois les messages instantanément
5. **Ouvre 2 onglets** pour tester le chat entre utilisateurs !

---

## 🔥 Comment ça marche ?

### 🔐 Authentification

**Inscription :**
- L'utilisateur remplit : nom d'utilisateur, email, mot de passe
- Le mot de passe est hashé avec bcrypt (SÉCURISÉ)
- L'utilisateur est sauvegardé dans la base de données
- Une session est créée automatiquement

**Connexion :**
- L'utilisateur entre : nom d'utilisateur/email + mot de passe
- Le système vérifie le mot de passe hashé
- Si correct → session créée
- L'utilisateur reste connecté 24h

### 💬 Chat en temps réel

**Comment ça fonctionne :**
1. L'utilisateur écrit un message
2. Le message est envoyé au serveur via Socket.io
3. Le serveur sauvegarde le message dans la base de données
4. Le serveur envoie le message à **TOUS** les utilisateurs connectés
5. Le message apparaît **instantanément** pour tout le monde

**Historique :**
- Les 50 derniers messages sont chargés automatiquement quand tu te connectes
- Tous les messages sont sauvegardés dans la base de données

### 📊 Statistiques automatiques

Le système track automatiquement :
- **Viewers en ligne** : Mis à jour en temps réel via Socket.io
- **Streams actifs** : Compte les vidéos avec `"live": true` dans `videos-config.json`
- **Total utilisateurs** : Compte le nombre de comptes créés
- **Messages 24h** : Compte les messages des dernières 24 heures

**Endpoint API** : `GET /api/stats`

---

## 📹 Ajouter tes vidéos

Rien ne change ! Modifie juste `videos-config.json` :

```json
{
  "videos": [
    {
      "id": 1,
      "title": "Mon Stream Valorant",
      "category": "fps",
      "videoUrl": "videos/mon-stream.mp4",
      "thumbnail": "thumbnails/mon-stream.jpg",
      "live": true,
      "viewers": "125"
    }
  ]
}
```

---

## 🗄️ Base de données

Le système crée automatiquement un fichier `gamestream.db` avec 3 tables :

### 📋 Table `users`
- id, username, email, password (hashé), created_at, is_streaming

### 💬 Table `chat_messages`
- id, user_id, username, message, timestamp

### 👥 Table `active_viewers`
- id, user_id, username, socket_id, joined_at

---

## 🔌 API Disponibles

### Authentification
- `POST /api/auth/register` - Inscription
- `POST /api/auth/login` - Connexion
- `POST /api/auth/logout` - Déconnexion
- `GET /api/auth/check` - Vérifier la session

### Données
- `GET /api/videos` - Liste des vidéos
- `GET /api/stats` - Statistiques en temps réel

### WebSocket (Socket.io)
- `identify` - Identification de l'utilisateur
- `send-message` - Envoyer un message
- `new-message` - Recevoir un message (broadcast)
- `chat-history` - Recevoir l'historique
- `viewers-update` - Mise à jour du nombre de viewers

---

## 🌐 Mettre en ligne (Production)

### Option 1 : Heroku

1. Crée un compte sur https://heroku.com
2. Installe Heroku CLI : https://devcenter.heroku.com/articles/heroku-cli
3. Dans ton dossier :

```bash
git init
git add .
git commit -m "Initial commit"
heroku create mon-gamestream
git push heroku main
heroku open
```

**IMPORTANT pour Heroku** : Change dans `server-complete.js` :
```javascript
const PORT = process.env.PORT || 3000;  // ✅ Déjà bon !
```

### Option 2 : VPS (OVH, DigitalOcean, etc.)

1. Loue un VPS
2. Installe Node.js sur le serveur
3. Upload tes fichiers via FileZilla/SCP
4. Lance :

```bash
npm install
npm start
```

5. Utilise **PM2** pour garder le serveur actif :

```bash
npm install -g pm2
pm2 start server.js --name gamestream
pm2 save
pm2 startup
```

6. Configure Nginx comme reverse proxy (optionnel mais recommandé)

### Option 3 : Render.com (FACILE et GRATUIT)

1. Va sur https://render.com
2. Connecte ton GitHub
3. Crée un "Web Service"
4. Choisis ton repo
5. Configure :
   - Build Command: `npm install`
   - Start Command: `npm start`
6. Deploy automatiquement !

---

## ❓ Problèmes Courants

### "Le chat ne fonctionne pas"
➡️ **Solution** :
1. Vérifie que le serveur est lancé : `npm start`
2. Vérifie la console du navigateur (F12) pour les erreurs
3. Assure-toi d'être sur `http://localhost:3000` (pas en ouvrant le fichier HTML)
4. Vérifie que Socket.io est chargé : regarde dans la console

### "Cannot find module 'bcryptjs'"
➡️ **Solution** : Lance `npm install` dans le dossier principal

### "La connexion ne fonctionne pas"
➡️ **Solution** :
1. Vérifie que la base de données `gamestream.db` existe
2. Vérifie les erreurs dans le terminal du serveur
3. Essaie de supprimer `gamestream.db` et relance le serveur

### "Port 3000 already in use"
➡️ **Solution** : Change le port dans `server-complete.js` :
```javascript
const PORT = 4000;
```

### "Les viewers ne s'affichent pas"
➡️ **Solution** :
1. Ouvre 2 onglets sur `http://localhost:3000`
2. Connecte-toi avec 2 comptes différents
3. Le compteur devrait afficher "2 en ligne"

---

## 🎉 Résumé : Ce qui a changé

### ❌ Avant (ancien système)
- ❌ Pas de vraie authentification
- ❌ Chat non fonctionnel
- ❌ Statistiques statiques
- ❌ Pas de base de données
- ❌ Pseudonyme avec prompt()

### ✅ Maintenant (nouveau système)
- ✅ **Authentification complète** avec base de données
- ✅ **Chat en temps réel** fonctionnel avec historique
- ✅ **Statistiques automatiques** en direct
- ✅ **Base de données SQLite** pour tout sauvegarder
- ✅ **Tracking automatique** des viewers
- ✅ **Sessions sécurisées** avec express-session
- ✅ **Protection XSS** sur le chat
- ✅ **Mots de passe hashés** avec bcrypt

---

## 🔥 Pour tester le système complet

1. **Lance le serveur** : `npm start`
2. **Ouvre 3 onglets** sur `http://localhost:3000`
3. **Crée 3 comptes différents** dans chaque onglet
4. **Écris dans le chat** d'un onglet
5. **Regarde le message apparaître** dans les 2 autres **INSTANTANÉMENT** !
6. **Vérifie le compteur** : il doit afficher "3 en ligne"
7. **Ferme un onglet** : le compteur passe à "2 en ligne"

**C'est du VRAI temps réel ! 🚀**

---

## 📞 Support

Si tu as des questions ou des problèmes :
1. Vérifie les logs du serveur (terminal)
2. Vérifie la console du navigateur (F12)
3. Vérifie que tous les fichiers sont bien placés
4. Vérifie que `npm install` s'est bien exécuté

Bon stream ! 🎮🔥

# 🚀 INSTALLATION SIMPLE - REMPLACE TES FICHIERS

## ⚡ TU AS JUSTE À REMPLACER TES FICHIERS !

### 📁 Voici comment organiser :

```
ton-dossier-gamestream/
├── server.js              ← REMPLACE ton ancien server.js
├── package.json           ← REMPLACE ton ancien package.json
├── script.js              ← REMPLACE ton ancien script.js
├── index.html             ← REMPLACE ton ancien index.html
├── style.css              ← GARDE ton style.css actuel (ne change rien)
├── videos-config.json     ← GARDE ton videos-config.json actuel
├── videos/                ← GARDE tes vidéos
└── thumbnails/            ← GARDE tes miniatures
```

## ✅ ÉTAPES (3 MINUTES) :

### 1️⃣ Remplace les fichiers
- ✅ `server.js` → Remplace l'ancien
- ✅ `package.json` → Remplace l'ancien
- ✅ `script.js` → Remplace l'ancien
- ✅ `index.html` → Remplace l'ancien
- ⚠️ **GARDE** `style.css` (ne touche pas)
- ⚠️ **GARDE** `videos-config.json` (ne touche pas)

### 2️⃣ Installe les nouvelles dépendances
Ouvre un terminal dans ton dossier :
```bash
npm install
```

### 3️⃣ Lance le serveur
```bash
npm start
```

## 🎉 C'EST TOUT !

Va sur **http://localhost:3000** et profite de :
- ✅ Système de connexion/inscription fonctionnel
- ✅ Chat en temps réel qui marche vraiment
- ✅ Compteur de viewers automatique
- ✅ Statistiques en direct
- ✅ Base de données SQLite

---

## 🧪 TESTE :

1. **Ouvre** http://localhost:3000
2. **Crée un compte**
3. **Ouvre un 2ème onglet** et crée un autre compte
4. **Écris dans le chat** → Le message apparaît dans les 2 onglets INSTANTANÉMENT ! 🔥
5. **Regarde le compteur** : "2 en ligne" 

---

## ❌ Problème ?

### "Cannot find module 'bcryptjs'"
```bash
npm install
```

### "Le chat ne marche pas"
- Vérifie que tu es sur http://localhost:3000 (pas file://)
- Ouvre la console (F12) pour voir les erreurs

### "Port 3000 already in use"
Dans `server.js`, change :
```javascript
const PORT = 4000; // Au lieu de 3000
```

---

**LIS LE README.md POUR PLUS DE DÉTAILS !**

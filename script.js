const socket = io();
let currentUser = null;

// ============================================================================
// FINGERPRINT
// ============================================================================
async function generateFingerprint() {
    const c = [];
    c.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);
    c.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
    c.push(navigator.language);
    c.push(navigator.hardwareConcurrency || 'u');
    c.push(navigator.deviceMemory || 'u');
    c.push(navigator.platform);
    try { const cv=document.createElement('canvas'),ctx=cv.getContext('2d'); ctx.textBaseline='top'; ctx.font='14px Arial'; ctx.fillStyle='#00c853'; ctx.fillRect(0,0,100,30); ctx.fillStyle='#000'; ctx.fillText('GS',2,2); c.push(cv.toDataURL().slice(-50)); } catch{ c.push('nc'); }
    try { const cv=document.createElement('canvas'),gl=cv.getContext('webgl'); if(gl){const e=gl.getExtension('WEBGL_debug_renderer_info'); if(e){c.push(gl.getParameter(e.UNMASKED_VENDOR_WEBGL)); c.push(gl.getParameter(e.UNMASKED_RENDERER_WEBGL));}} } catch{ c.push('nw'); }
    try { const ac=new(window.AudioContext||window.webkitAudioContext)(),o=ac.createOscillator(),a=ac.createAnalyser(),g=ac.createGain(); g.gain.value=0; o.connect(a); a.connect(g); g.connect(ac.destination); o.start(0); const d=new Float32Array(a.frequencyBinCount); a.getFloatFrequencyData(d); o.stop(); ac.close(); c.push(d.slice(0,5).join(',')); } catch{ c.push('na'); }
    const raw=c.join('|'), hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,32);
}
function getStorageId() {
    let id=localStorage.getItem('gs_storage_id');
    if(!id){ id='gs_'+Date.now()+'_'+Math.random().toString(36).slice(2,10); localStorage.setItem('gs_storage_id',id); }
    return id;
}
let clientFingerprint=null, clientStorageId=getStorageId();
(async()=>{
    clientFingerprint=await generateFingerprint();
    try{
        const res=await fetch('/api/auth/check-ban',{headers:{'x-fingerprint':clientFingerprint,'x-storage-id':clientStorageId}});
        const d=await res.json();
        if(d.banned){showBannedScreen();return;}
    }catch{}
    initApp();
})();
function showBannedScreen(){
    document.body.innerHTML=`<div style="position:fixed;inset:0;background:#060b0a;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1rem;font-family:sans-serif;"><div style="font-size:4rem">🔨</div><h1 style="color:#ef4444;font-size:1.8rem">Accès Banni</h1><p style="color:#4a6b5e;text-align:center;max-width:400px">Ton accès à GameStream a été révoqué par un administrateur.<br>Ce ban est lié à ton appareil.</p></div>`;
}
function apiFetch(url,options={}){
    return fetch(url,{...options,headers:{'Content-Type':'application/json','x-fingerprint':clientFingerprint||'','x-storage-id':clientStorageId||'',...(options.headers||{})}});
}

// ============================================================================
// INIT
// ============================================================================
function initApp(){
    const saved=localStorage.getItem('user');
    if(saved){ try{ currentUser=JSON.parse(saved); socket.emit('register-online',currentUser.username); updateNavbar(currentUser.username); loadUserGrade(); }catch{localStorage.removeItem('user');} }
    window.addEventListener('load',()=>{
        loadVideosWithFilter();
        const bl=document.querySelector('.btn-ghost'), br=document.querySelector('.btn-primary');
        if(bl) bl.addEventListener('click',()=>{ switchForm('login'); showAuthModal(); });
        if(br) br.addEventListener('click',()=>{ switchForm('register'); showAuthModal(); });
    });
}

// ============================================================================
// GRADES
// ============================================================================
let userGradeData = null;
const GRADES = [
    { name:'Viewer', icon:'👁️', color:'#888888', minH:0,   maxH:20  },
    { name:'Fidèle', icon:'💎', color:'#00ccff', minH:20,  maxH:40  },
    { name:'Brave',  icon:'🛡️', color:'#ff6600', minH:40,  maxH:60  },
    { name:'GOAT',   icon:'🐐', color:'#ff00ff', minH:60,  maxH:80  },
    { name:'STARS',  icon:'⭐', color:'#FFD700', minH:80,  maxH:null },
];
async function loadUserGrade(){
    if(!currentUser) return;
    try{
        const res=await apiFetch('/api/user/grade',{method:'POST',body:JSON.stringify({username:currentUser.username})});
        const d=await res.json();
        if(d.success){ userGradeData=d; updateNavbarGrade(d); }
    }catch{}
}
function updateNavbarGrade(d){
    const el=document.getElementById('user-grade-badge');
    if(el&&d.grade) el.innerHTML=`<span style="color:${d.grade.color};font-size:.75rem;padding:2px 8px;border:1px solid ${d.grade.color}33;border-radius:12px;background:${d.grade.color}12;font-weight:700;">${d.grade.icon} ${d.grade.name}</span>`;
}

// ============================================================================
// PROFIL MODAL
// ============================================================================
function openProfileModal(){
    if(!currentUser){ showAuthModal(); return; }
    const ex=document.getElementById('profile-modal-overlay'); if(ex) ex.remove();

    const d=userGradeData;
    const hours=d ? parseFloat(d.hours) : 0;
    const grade=d ? d.grade : GRADES[0];
    const gradeIdx=GRADES.findIndex(g=>g.name===grade.name);

    // Calcul progression
    let prog=0, nextGrade=null;
    if(gradeIdx < GRADES.length-1){
        nextGrade=GRADES[gradeIdx+1];
        const cur=GRADES[gradeIdx];
        prog=Math.min(100, Math.round(((hours - cur.minH) / (nextGrade.minH - cur.minH))*100));
    } else { prog=100; }

    const overlay=document.createElement('div');
    overlay.id='profile-modal-overlay';
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:99999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML=`
    <div style="background:#0a100e;border:1px solid rgba(0,200,83,.25);border-radius:16px;width:90%;max-width:420px;padding:2rem;position:relative;box-shadow:0 0 60px rgba(0,200,83,.1);animation:slideUp .25s ease;font-family:'DM Sans',sans-serif;">
        <button onclick="document.getElementById('profile-modal-overlay').remove()" style="position:absolute;top:14px;right:14px;background:none;border:none;color:#4a6b5e;font-size:1.2rem;cursor:pointer;">✕</button>
        <div style="width:64px;height:64px;border-radius:50%;margin:0 auto 1rem;background:linear-gradient(135deg,#00c853,#00e676);display:flex;align-items:center;justify-content:center;font-size:1.8rem;box-shadow:0 0 20px rgba(0,200,83,.3);">🎮</div>
        <div style="text-align:center;font-family:'Rajdhani',sans-serif;font-size:1.5rem;font-weight:700;color:#ddeee6;letter-spacing:1px;">${escapeHtml(currentUser.username)}</div>
        <div style="text-align:center;margin:.4rem 0 1.5rem;">
            <span style="color:${grade.color};font-size:.85rem;font-weight:700;padding:3px 12px;border:1px solid ${grade.color}44;border-radius:20px;background:${grade.color}12;">${grade.icon} ${grade.name}</span>
        </div>

        <!-- Barre de progression -->
        <div style="margin-bottom:1.5rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;">
                <span style="font-size:.72rem;color:#4a6b5e;font-weight:600;">PROGRESSION</span>
                <span style="font-size:.72rem;color:${grade.color};font-weight:700;">${hours}h regardées</span>
            </div>
            <div style="height:10px;background:rgba(255,255,255,.06);border-radius:20px;overflow:hidden;position:relative;">
                <div style="height:100%;width:${prog}%;background:linear-gradient(90deg,${grade.color},#00e676);border-radius:20px;transition:width .8s;box-shadow:0 0 10px ${grade.color}66;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:.5rem;font-size:.65rem;color:#4a6b5e;">
                <span>${grade.icon} ${grade.name}</span>
                <span>${nextGrade ? prog+'% → '+nextGrade.icon+' '+nextGrade.name : '✅ Grade maximum atteint !'}</span>
            </div>
            <!-- Paliers -->
            <div style="display:flex;justify-content:space-around;margin-top:1rem;background:rgba(0,200,83,.04);border:1px solid rgba(0,200,83,.08);border-radius:8px;padding:.6rem;">
                ${GRADES.map(g=>`
                    <div style="text-align:center;opacity:${hours>=g.minH?1:.4};">
                        <div style="font-size:1rem;">${g.icon}</div>
                        <div style="font-size:.6rem;font-weight:700;color:${g.color};margin-top:2px;">${g.name}</div>
                        <div style="font-size:.55rem;color:#4a6b5e;">${g.minH}h</div>
                    </div>`).join('')}
            </div>
        </div>

        <!-- Stats -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">
            <div style="background:#0d1512;border:1px solid rgba(0,200,83,.08);border-radius:10px;padding:.85rem;text-align:center;">
                <div style="font-family:'Rajdhani',sans-serif;font-size:1.6rem;font-weight:700;color:#00c853;line-height:1;">${hours}</div>
                <div style="font-size:.72rem;color:#4a6b5e;margin-top:3px;">Heures regardées</div>
            </div>
            <div style="background:#0d1512;border:1px solid rgba(0,200,83,.08);border-radius:10px;padding:.85rem;text-align:center;">
                <div style="font-family:'Rajdhani',sans-serif;font-size:1.6rem;font-weight:700;color:${grade.color};line-height:1;">${gradeIdx+1}/5</div>
                <div style="font-size:.72rem;color:#4a6b5e;margin-top:3px;">Rang actuel</div>
            </div>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click',e=>{ if(e.target===overlay) overlay.remove(); });
}

// ============================================================================
// CHAT
// ============================================================================
const chatInput=document.getElementById('chat-input');
const chatBox=document.getElementById('chat-messages');

function sendMessage(){
    if(!currentUser){showAuthModal();return;}
    if(!chatInput) return;
    const text=chatInput.value.trim(); if(!text) return;
    socket.emit('send-message',{user:currentUser.username,text});
    chatInput.value='';
}
if(chatInput) chatInput.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();} });

socket.on('new-message',msg=>appendMsg(msg));
socket.on('load-history',history=>{ if(!chatBox) return; chatBox.innerHTML=''; history.forEach(appendMsg); });
socket.on('chat-reset',()=>{ if(!chatBox) return; chatBox.innerHTML=''; appendSystemMsg('— Chat réinitialisé —','#4a6b5e'); });
socket.on('chat-lock',locked=>{
    if(!chatInput) return;
    chatInput.disabled=locked; chatInput.placeholder=locked?'🔒 Chat verrouillé':'Envoyer un message...'; chatInput.style.opacity=locked?.5:1;
    appendSystemMsg(locked?'🔒 Le chat a été verrouillé':'🔓 Le chat est de nouveau ouvert',locked?'#ef4444':'#00c853');
});
socket.on('error-message',msg=>appendSystemMsg('⚠️ '+msg,'#f59e0b'));
socket.on('force-banned',()=>showBannedScreen());
socket.on('force-timeout',({duration,reason})=>{
    appendSystemMsg(`⏱️ Timeout ${duration} min : ${reason}`,'#ef4444');
    if(chatInput){ chatInput.disabled=true; chatInput.placeholder=`⏱️ Timeout — ${duration} min`; chatInput.style.opacity=.5; setTimeout(()=>{ chatInput.disabled=false; chatInput.placeholder='Envoyer un message...'; chatInput.style.opacity=1; },duration*60000); }
});

// DM notification
socket.on('new-dm',msg=>{
    showDmNotification(msg.from);
    const btn=document.getElementById('dm-nav-btn');
    if(btn){ let b=btn.querySelector('.dm-badge'); if(!b){ b=document.createElement('span'); b.className='dm-badge'; b.style.cssText='position:absolute;top:-4px;right:-4px;background:#ef4444;color:white;border-radius:50%;width:16px;height:16px;font-size:10px;display:flex;align-items:center;justify-content:center;font-weight:700;'; btn.style.position='relative'; btn.appendChild(b); } b.textContent=(parseInt(b.textContent)||0)+1; }
});

function appendSystemMsg(text,color){
    if(!chatBox) return;
    const d=document.createElement('div');
    d.style.cssText=`text-align:center;font-size:.72rem;padding:4px 8px;border-radius:5px;margin:2px 0;color:${color};background:${color}18;`;
    d.textContent=text; chatBox.appendChild(d); chatBox.scrollTop=chatBox.scrollHeight;
}
function appendMsg(data){
    if(!chatBox) return;
    const div=document.createElement('div'); div.className='msg';
    const isMe=currentUser&&data.user===currentUser.username;
    div.style.cssText=`padding:5px 8px;border-radius:6px;background:${isMe?'rgba(0,200,83,.08)':'transparent'};margin-bottom:2px;animation:msgIn .2s ease;`;
    const gradeHtml=data.grade?`<span style="color:${data.grade.color};font-size:.68rem;margin-right:3px;">${data.grade.icon}</span>`:'';
    div.innerHTML=`<i style="font-size:.68rem;color:#4a6b5e;font-style:normal;margin-right:4px;">${data.time}</i>${gradeHtml}<b style="color:${isMe?'#00c853':'#2dd47e'}">${escapeHtml(data.user)}:</b> <span style="color:#ddeee6"> ${escapeHtml(data.text)}</span>`;
    chatBox.appendChild(div); chatBox.scrollTop=chatBox.scrollHeight;
    while(chatBox.children.length>100) chatBox.removeChild(chatBox.firstChild);
}
function escapeHtml(t){ const d=document.createElement('div'); d.textContent=t; return d.innerHTML; }

// ============================================================================
// PLUIE DE CŒURS
// ============================================================================
function spawnHeart(){
    const c=document.getElementById('hearts-container'); if(!c) return;
    const h=document.createElement('div');
    const emojis=['❤️','🧡','💛','💚','💙','💜','🤍','💗','💚'];
    h.textContent=emojis[Math.floor(Math.random()*emojis.length)];
    const size=16+Math.random()*18, startX=20+Math.random()*50, drift=(Math.random()-.5)*70;
    h.style.cssText=`position:absolute;bottom:55px;right:${startX}px;font-size:${size}px;pointer-events:none;animation:heartFloat 2.2s ease-out forwards;--drift:${drift}px;z-index:10;`;
    c.appendChild(h); setTimeout(()=>h.remove(),2300);
}
let likeInterval=null;
function startLiking(){
    if(!currentUser){showAuthModal();return;}
    const btn=document.getElementById('like-btn'); if(btn) btn.style.transform='scale(1.2)';
    spawnHeart(); let count=0;
    likeInterval=setInterval(()=>{ if(count++>6){stopLiking();return;} spawnHeart(); },120);
}
function stopLiking(){ clearInterval(likeInterval); const btn=document.getElementById('like-btn'); if(btn) btn.style.transform='scale(1)'; }

// ============================================================================
// DM
// ============================================================================
let dmConversation=null;
function showDmNotification(from){
    const n=document.createElement('div');
    n.style.cssText='position:fixed;bottom:24px;right:24px;z-index:99999;background:#0a100e;border:1px solid rgba(0,200,83,.3);border-radius:12px;padding:14px 18px;display:flex;align-items:center;gap:12px;box-shadow:0 8px 32px rgba(0,200,83,.15);animation:slideInRight .3s ease;font-family:\'DM Sans\',sans-serif;cursor:pointer;';
    n.innerHTML=`<span style="font-size:1.4rem">💬</span><div><div style="color:#00c853;font-weight:700;font-size:.85rem">Message privé</div><div style="color:#4a6b5e;font-size:.78rem">De ${escapeHtml(from)}</div></div>`;
    n.onclick=()=>{ openDmModal(from); n.remove(); };
    document.body.appendChild(n); setTimeout(()=>{ if(n.parentNode) n.remove(); },5000);
}
function openDmModal(withUser=''){
    const ex=document.getElementById('dm-modal'); if(ex) ex.remove();
    if(!currentUser){showAuthModal();return;}
    const btn=document.getElementById('dm-nav-btn'); if(btn){ const b=btn.querySelector('.dm-badge'); if(b) b.remove(); }
    const modal=document.createElement('div'); modal.id='dm-modal';
    modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:99999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML=`
    <div style="background:#0a100e;border:1px solid rgba(0,200,83,.2);border-radius:16px;width:90%;max-width:500px;height:78vh;display:flex;flex-direction:column;overflow:hidden;position:relative;">
        <div style="padding:14px 18px;border-bottom:1px solid rgba(0,200,83,.1);display:flex;align-items:center;justify-content:space-between;background:#060b0a;">
            <div style="font-weight:700;color:#00c853;font-family:'Rajdhani',sans-serif;font-size:1.05rem;letter-spacing:1px;">💬 MESSAGES PRIVÉS</div>
            <button onclick="document.getElementById('dm-modal').remove()" style="background:none;border:none;color:#4a6b5e;font-size:1.3rem;cursor:pointer;">✕</button>
        </div>
        <div style="display:flex;flex:1;overflow:hidden;">
            <div style="width:155px;border-right:1px solid rgba(0,200,83,.08);overflow-y:auto;background:#080e0b;display:flex;flex-direction:column;">
                <div style="padding:10px 10px 4px;font-size:.65rem;color:#4a6b5e;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Conversations</div>
                <div id="dm-convs-inner" style="flex:1;overflow-y:auto;"></div>
                <div style="padding:8px;">
                    <input id="dm-new-user" placeholder="Envoyer à..." style="width:100%;padding:5px 9px;background:#0d1512;border:1px solid rgba(0,200,83,.12);border-radius:7px;color:#ddeee6;font-size:.76rem;font-family:'DM Sans',sans-serif;">
                    <button onclick="startNewDm()" style="width:100%;margin-top:5px;padding:5px;background:rgba(0,200,83,.12);border:1px solid rgba(0,200,83,.2);border-radius:7px;color:#00c853;font-size:.73rem;cursor:pointer;font-weight:700;">Nouveau DM</button>
                </div>
            </div>
            <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
                <div id="dm-messages" style="flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:5px;">
                    <div style="text-align:center;color:#4a6b5e;font-size:.8rem;margin-top:2rem;">Sélectionne une conversation</div>
                </div>
                <div style="padding:10px;border-top:1px solid rgba(0,200,83,.08);display:flex;gap:7px;">
                    <input id="dm-input" placeholder="Ton message..." style="flex:1;padding:8px 13px;background:#0d1512;border:1px solid rgba(0,200,83,.1);border-radius:20px;color:#ddeee6;font-size:.83rem;font-family:'DM Sans',sans-serif;" disabled>
                    <button onclick="sendDm()" style="padding:8px 14px;background:#00c853;border:none;border-radius:20px;color:#000;font-weight:700;font-size:.83rem;cursor:pointer;" disabled id="dm-send-btn">→</button>
                </div>
            </div>
        </div>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{ if(e.target===modal) modal.remove(); });
    loadDmConversations(withUser);
}
async function loadDmConversations(autoOpen=''){
    if(!currentUser) return;
    try{
        const res=await apiFetch('/api/messages/list',{method:'POST',body:JSON.stringify({username:currentUser.username})});
        const d=await res.json(); if(!d.success) return;
        const convMap={};
        d.messages.forEach(m=>{ const o=m.from===currentUser.username?m.to:m.from; if(!convMap[o]) convMap[o]=[]; convMap[o].push(m); });
        const inner=document.getElementById('dm-convs-inner'); if(!inner) return;
        inner.innerHTML='';
        Object.entries(convMap).forEach(([user,msgs])=>{
            const unread=msgs.filter(m=>m.to===currentUser.username&&!m.read).length;
            const btn=document.createElement('div');
            btn.style.cssText='padding:9px 11px;cursor:pointer;border-bottom:1px solid rgba(0,200,83,.05);display:flex;align-items:center;justify-content:space-between;transition:background .15s;font-size:.8rem;';
            btn.innerHTML=`<span style="color:#ddeee6;font-weight:600;">${escapeHtml(user)}</span>${unread?`<span style="background:#ef4444;color:white;border-radius:50%;width:17px;height:17px;font-size:9px;display:flex;align-items:center;justify-content:center;font-weight:700;">${unread}</span>`:''}`;
            btn.onmouseenter=()=>btn.style.background='#0d1512'; btn.onmouseleave=()=>btn.style.background='transparent';
            btn.onclick=()=>openDmConversation(user,msgs); inner.appendChild(btn);
        });
        if(autoOpen&&convMap[autoOpen]) openDmConversation(autoOpen,convMap[autoOpen]);
        else if(autoOpen) openDmConversation(autoOpen,[]);
    }catch{}
}
function openDmConversation(withUser,msgs){
    dmConversation=withUser;
    const box=document.getElementById('dm-messages'), inp=document.getElementById('dm-input'), sbtn=document.getElementById('dm-send-btn');
    if(!box) return;
    inp.disabled=false; sbtn.disabled=false; inp.placeholder=`Message à ${withUser}...`; inp.focus();
    box.innerHTML='';
    msgs.sort((a,b)=>a.timestamp-b.timestamp).forEach(m=>appendDmMsg(m));
    apiFetch('/api/messages/mark-read',{method:'POST',body:JSON.stringify({username:currentUser.username})});
    inp.onkeydown=e=>{ if(e.key==='Enter') sendDm(); };
}
function appendDmMsg(m){
    const box=document.getElementById('dm-messages'); if(!box) return;
    const isMe=m.from===currentUser.username;
    const div=document.createElement('div');
    div.style.cssText=`display:flex;flex-direction:column;align-items:${isMe?'flex-end':'flex-start'};`;
    div.innerHTML=`<div style="max-width:75%;padding:7px 11px;border-radius:${isMe?'12px 12px 4px 12px':'12px 12px 12px 4px'};background:${isMe?'rgba(0,200,83,.15)':'#0d1512'};border:1px solid ${isMe?'rgba(0,200,83,.25)':'rgba(0,200,83,.07)'};color:#ddeee6;font-size:.8rem;line-height:1.4;">${escapeHtml(m.text)}</div><div style="font-size:.62rem;color:#4a6b5e;margin-top:3px;">${new Date(m.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>`;
    box.appendChild(div); box.scrollTop=box.scrollHeight;
}
function startNewDm(){ const inp=document.getElementById('dm-new-user'); if(!inp||!inp.value.trim()) return; openDmConversation(inp.value.trim(),[]); inp.value=''; }
async function sendDm(){
    const inp=document.getElementById('dm-input'); if(!inp||!dmConversation||!currentUser) return;
    const text=inp.value.trim(); if(!text) return; inp.value='';
    try{ const res=await apiFetch('/api/messages/send',{method:'POST',body:JSON.stringify({from:currentUser.username,to:dmConversation,text})}); const d=await res.json(); if(d.success) appendDmMsg(d.message); }catch{}
}
socket.on('new-dm',msg=>{ if(dmConversation===msg.from&&document.getElementById('dm-modal')){ appendDmMsg(msg); apiFetch('/api/messages/mark-read',{method:'POST',body:JSON.stringify({username:currentUser.username})}); } });

// ============================================================================
// AUTH
// ============================================================================
function showAuthModal(){
    const ex=document.getElementById('auth-modal'); if(ex) ex.remove();
    const m=document.createElement('div'); m.id='auth-modal';
    m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:99999;display:flex;align-items:center;justify-content:center;';
    m.innerHTML=`
    <div style="background:#0a100e;padding:2.5rem;border-radius:16px;max-width:380px;width:90%;border:1px solid rgba(0,200,83,.2);position:relative;box-shadow:0 0 40px rgba(0,200,83,.07);">
        <button onclick="document.getElementById('auth-modal').remove()" style="position:absolute;top:14px;right:14px;background:none;border:none;color:#4a6b5e;font-size:1.2rem;cursor:pointer;">✕</button>
        <h2 style="color:#00c853;margin-bottom:2rem;text-align:center;font-size:1.6rem;font-family:'Rajdhani',sans-serif;letter-spacing:2px;">🎮 GAMESTREAM</h2>
        <div id="form-login">
            <h3 style="color:#ddeee6;margin-bottom:1rem;font-family:'Rajdhani',sans-serif;">Connexion</h3>
            <input id="inp-username" type="text"     placeholder="Pseudo ou email"  style="width:100%;padding:.7rem;margin-bottom:.75rem;background:#060b0a;border:1px solid rgba(0,200,83,.12);border-radius:8px;color:#ddeee6;font-size:.95rem;font-family:'DM Sans',sans-serif;box-sizing:border-box;">
            <input id="inp-password" type="password" placeholder="Mot de passe"     style="width:100%;padding:.7rem;margin-bottom:.75rem;background:#060b0a;border:1px solid rgba(0,200,83,.12);border-radius:8px;color:#ddeee6;font-size:.95rem;font-family:'DM Sans',sans-serif;box-sizing:border-box;">
            <div id="login-error" style="color:#ef4444;font-size:.85rem;margin-bottom:.75rem;display:none;"></div>
            <button onclick="doLogin()" style="width:100%;padding:.75rem;background:#00c853;color:#000;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:1rem;margin-bottom:1rem;font-family:'Rajdhani',sans-serif;letter-spacing:1px;">SE CONNECTER</button>
            <p style="color:#4a6b5e;text-align:center;cursor:pointer;" onclick="switchForm('register')">Pas de compte ? <span style="color:#00c853;">S'inscrire</span></p>
        </div>
        <div id="form-register" style="display:none;">
            <h3 style="color:#ddeee6;margin-bottom:1rem;font-family:'Rajdhani',sans-serif;">Inscription</h3>
            <input id="reg-username" type="text"     placeholder="Pseudo"      style="width:100%;padding:.7rem;margin-bottom:.75rem;background:#060b0a;border:1px solid rgba(0,200,83,.12);border-radius:8px;color:#ddeee6;font-size:.95rem;font-family:'DM Sans',sans-serif;box-sizing:border-box;">
            <input id="reg-email"    type="email"    placeholder="Email"       style="width:100%;padding:.7rem;margin-bottom:.75rem;background:#060b0a;border:1px solid rgba(0,200,83,.12);border-radius:8px;color:#ddeee6;font-size:.95rem;font-family:'DM Sans',sans-serif;box-sizing:border-box;">
            <input id="reg-password" type="password" placeholder="Mot de passe" style="width:100%;padding:.7rem;margin-bottom:.75rem;background:#060b0a;border:1px solid rgba(0,200,83,.12);border-radius:8px;color:#ddeee6;font-size:.95rem;font-family:'DM Sans',sans-serif;box-sizing:border-box;">
            <div id="register-error" style="color:#ef4444;font-size:.85rem;margin-bottom:.75rem;display:none;"></div>
            <button onclick="doRegister()" style="width:100%;padding:.75rem;background:#00c853;color:#000;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:1rem;margin-bottom:1rem;font-family:'Rajdhani',sans-serif;letter-spacing:1px;">CRÉER UN COMPTE</button>
            <p style="color:#4a6b5e;text-align:center;cursor:pointer;" onclick="switchForm('login')">Déjà un compte ? <span style="color:#00c853;">Se connecter</span></p>
        </div>
    </div>`;
    document.body.appendChild(m);
    m.addEventListener('click',e=>{ if(e.target===m) m.remove(); });
    setTimeout(()=>{ const i=document.getElementById('inp-username'); if(i) i.focus(); },100);
}
function switchForm(t){ const fl=document.getElementById('form-login'),fr=document.getElementById('form-register'); if(fl) fl.style.display=t==='login'?'block':'none'; if(fr) fr.style.display=t==='register'?'block':'none'; }
async function doLogin(){
    const u=document.getElementById('inp-username').value.trim(), p=document.getElementById('inp-password').value, err=document.getElementById('login-error');
    if(!u||!p){err.textContent='Remplis tous les champs';err.style.display='block';return;}
    try{
        const res=await apiFetch('/api/auth/login',{method:'POST',body:JSON.stringify({username:u,password:p})}); const d=await res.json();
        if(d.success){ currentUser=d.user; localStorage.setItem('user',JSON.stringify(currentUser)); socket.emit('register-online',currentUser.username); updateNavbar(currentUser.username); loadUserGrade(); document.getElementById('auth-modal').remove(); }
        else{ err.textContent=d.error||'Identifiants incorrects'; err.style.display='block'; }
    }catch{ err.textContent='Erreur serveur'; err.style.display='block'; }
}
async function doRegister(){
    const u=document.getElementById('reg-username').value.trim(), e=document.getElementById('reg-email').value.trim(), p=document.getElementById('reg-password').value, err=document.getElementById('register-error');
    if(!u||!e||!p){err.textContent='Remplis tous les champs';err.style.display='block';return;}
    try{
        const res=await apiFetch('/api/auth/register',{method:'POST',body:JSON.stringify({username:u,email:e,password:p})}); const d=await res.json();
        if(d.success){ currentUser=d.user; localStorage.setItem('user',JSON.stringify(currentUser)); socket.emit('register-online',currentUser.username); updateNavbar(currentUser.username); loadUserGrade(); document.getElementById('auth-modal').remove(); }
        else{ err.textContent=d.error||'Erreur inscription'; err.style.display='block'; }
    }catch{ err.textContent='Erreur serveur'; err.style.display='block'; }
}
document.addEventListener('keydown',e=>{ if(e.key==='Enter'&&document.getElementById('auth-modal')){ const l=document.getElementById('form-login'); if(l&&l.style.display!=='none') doLogin(); else doRegister(); } });

function updateNavbar(name){
    const nb=document.getElementById('navbar-user'); if(!nb) return;
    nb.innerHTML=`
        <div id="user-grade-badge"></div>
        <button onclick="openProfileModal()" style="background:none;border:none;color:#00c853;font-weight:700;cursor:pointer;font-size:.88rem;margin:0 8px;font-family:'DM Sans',sans-serif;padding:5px 10px;border-radius:6px;transition:background .2s;" onmouseenter="this.style.background='rgba(0,200,83,.1)'" onmouseleave="this.style.background='none'">👤 ${escapeHtml(name)}</button>
        <button id="dm-nav-btn" onclick="openDmModal()" style="background:rgba(0,200,83,.1);border:1px solid rgba(0,200,83,.25);color:#00c853;padding:6px 12px;border-radius:6px;cursor:pointer;margin-right:6px;font-weight:600;font-size:.78rem;font-family:'DM Sans',sans-serif;position:relative;">💬 DMs</button>
        <button onclick="logout()" style="background:#111a17;border:1px solid rgba(255,255,255,.07);color:#ddeee6;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:.78rem;font-family:'DM Sans',sans-serif;">Déco</button>`;
}
function logout(){ localStorage.removeItem('user'); location.reload(); }

// ============================================================================
// VIDÉOS
// ============================================================================
let allVideos=[];
async function loadVideosWithFilter(){
    try{ const res=await fetch('/api/videos'); if(!res.ok) return; allVideos=await res.json(); renderVideos(allVideos); }catch{}
}
function renderVideos(videos){
    const grid=document.getElementById('videoGrid'); if(!grid) return;
    grid.innerHTML=videos.map(v=>`
        <div class="video-card" onclick="playVideo('${v.videoUrl}','${v.title}')">
            <div class="video-thumbnail">
                <img src="${v.thumbnail}" alt="${v.title}" onerror="this.style.display='none'">
                ${v.live?'<span class="live-badge">LIVE</span>':''}
            </div>
            <div class="video-card-content">
                <h3 class="video-card-title">${escapeHtml(v.title)}</h3>
                <div class="video-card-info">${v.viewers} spectateurs</div>
            </div>
        </div>`).join('');
}
function playVideo(url,title){
    const p=document.getElementById('mainPlayer'); if(!p) return;
    p.src=url; p.play();
    const t=document.getElementById('current-title'); if(t) t.textContent=title;
}
document.querySelectorAll('.cat-tag,.category-btn').forEach(btn=>{
    btn.addEventListener('click',function(){
        document.querySelectorAll('.cat-tag,.category-btn').forEach(b=>b.classList.remove('active')); this.classList.add('active');
        const cat=this.dataset.category;
        renderVideos(cat==='all'?allVideos:allVideos.filter(v=>v.category===cat));
    });
});
const si=document.getElementById('searchInput');
if(si) si.addEventListener('input',function(){ renderVideos(allVideos.filter(v=>v.title.toLowerCase().includes(this.value.toLowerCase()))); });
socket.on('viewers-update',count=>{
    const el=document.getElementById('chat-online-count'); if(el) el.innerHTML=`<span class="online-dot"></span>${count} en ligne`;
    const vc=document.getElementById('viewer-count-display'); if(vc) vc.textContent=count;
});
window.addEventListener('keydown',e=>{ if(e.key==='F2') window.open('/admin.html','_blank'); });
// ==========================================
// БАНК — ВСЕ 6 ФУНКЦИЙ + FIREBASE
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, getDocs, increment } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyARocDIz-5fSBrg2YQxi3e4s3YC2aHVqK0",
    authDomain: "my-bank-96c5c.firebaseapp.com",
    projectId: "my-bank-96c5c",
    storageBucket: "my-bank-96c5c.firebasestorage.app",
    messagingSenderId: "566533756559",
    appId: "1:566533756559:web:6c4a516771ca3b41ea02fa"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const MAX_DEVICES = 5;
const CASHBACK_RATE = 0.01; // 1%

// === УТИЛИТЫ ===
function getDeviceId() {
    let id = localStorage.getItem('device_id');
    if (!id) { id = 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2,9); localStorage.setItem('device_id', id); }
    return id;
}
function generateAccountNumber() {
    let n = '40817';
    for (let i=0;i<15;i++) n += Math.floor(Math.random()*10);
    return n;
}
function generateCardNumber() {
    let n = '4276';
    for (let i=0;i<12;i++) n += Math.floor(Math.random()*10);
    return n;
}
function formatCard(num) { return num.replace(/(\d{4})(?=\d)/g, '$1 '); }
const AVATARS = ['🦊','🐱','🐶','🐼','🐨','🐰','🦁','🐯','🐮','🐷','🐸','🐵','🦄','🐲','🦉','🦇'];
function getAvatar(n) { let h=0; for(let i=0;i<n.length;i++) h=n.charCodeAt(i)+((h<<5)-h); return AVATARS[Math.abs(h)%AVATARS.length]; }
function playSound() {
    try {
        const c = new (window.AudioContext||window.webkitAudioContext)();
        const o = c.createOscillator(); const g = c.createGain();
        o.connect(g); g.connect(c.destination);
        o.type='sine'; o.frequency.setValueAtTime(800,c.currentTime); o.frequency.setValueAtTime(1200,c.currentTime+0.1);
        g.gain.setValueAtTime(0.3,c.currentTime); g.gain.exponentialRampToValueAtTime(0.01,c.currentTime+0.3);
        o.start(c.currentTime); o.stop(c.currentTime+0.3);
    } catch(e){}
}
const THEME_KEY = 'bank_theme';
function getTheme() { return localStorage.getItem(THEME_KEY)||'dark'; }
function applyTheme(t) { if(t==='light') document.body.classList.add('light-theme'); else document.body.classList.remove('light-theme'); }
function toggleTheme() { const n = getTheme()==='dark'?'light':'dark'; localStorage.setItem(THEME_KEY,n); applyTheme(n); }
function showToast(m,t) { const el=document.createElement('div'); el.className='toast '+(t||''); el.textContent=m; document.body.appendChild(el); setTimeout(()=>el.remove(),3000); }
function exportStatement(d) {
    let t='========================================\n         ВЫПИСКА ПО СЧЁТУ\n========================================\n';
    t+='Владелец : '+d.name+'\nСчёт     : '+d.accountNumber+'\nБаланс   : '+d.balance.toLocaleString()+' RUB\n';
    t+='Дата     : '+new Date().toLocaleString('ru-RU')+'\n========================================\n\n';
    if(!d.history||d.history.length===0) t+='Операций нет.\n';
    else d.history.forEach(h=>{ const s=h.type==='income'?'+':'-'; t+=s+h.amount.toLocaleString()+' RUB — '+h.description+'\n  '+h.date+'\n\n'; });
    t+='========================================\n    Банк • '+new Date().getFullYear()+'\n';
    const BOM='\uFEFF'; const b=new Blob([BOM+t],{type:'text/plain;charset=utf-8'});
    const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u;
    a.download='Выписка_'+d.accountNumber.slice(-6)+'_'+new Date().toISOString().slice(0,10)+'.txt';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u);
    showToast('Выписка сохранена!','success');
}
async function findUser(s) {
    const all = await getDocs(collection(db,'users'));
    for(const d of all.docs) { const dt=d.data(); if(dt.login===s||dt.accountNumber===s) return {uid:d.id,data:dt}; }
    return null;
}

// === СОСТОЯНИЕ ===
let currentUserData = null, currentUserDocId = null, savingsData = null, scannerStream = null;

// === DOM ===
const $=id=>document.getElementById(id);
const loginScreen=$('login-screen'), registerScreen=$('register-screen'), bankScreen=$('bank-screen');
const loginInput=$('login-input'), passwordInput=$('password-input'), loginBtn=$('login-btn'), registerBtn=$('register-btn'), loginError=$('login-error');
const regName=$('reg-name'), regLogin=$('reg-login'), regPassword=$('reg-password'), registerSubmitBtn=$('register-submit-btn'), backToLoginBtn=$('back-to-login-btn'), regError=$('reg-error');
const userGreeting=$('user-greeting'), userAvatar=$('user-avatar'), balanceDisplay=$('balance-display'), accountNumberDisplay=$('account-number-display');
const cardNumberDisplay=$('card-number-display'), cardHolder=$('card-holder'), cardExpiry=$('card-expiry'), cashbackDisplay=$('cashback-display');
const historyList=$('history-list'), deviceCountSpan=$('device-count');
const depositBtn=$('deposit-btn'), transferBtn=$('transfer-btn'), exportBtn=$('export-btn'), themeToggle=$('theme-toggle'), logoutBtn=$('logout-btn'), chatBtn=$('chat-btn');
const depositModal=$('deposit-modal'), depositAmount=$('deposit-amount'), depositSubmit=$('deposit-submit-btn'), depositCancel=$('deposit-cancel-btn'), depositError=$('deposit-error');
const transferModal=$('transfer-modal'), transferTo=$('transfer-to'), transferAmount=$('transfer-amount'), transferComment=$('transfer-comment'), transferSubmit=$('transfer-submit-btn'), transferCancel=$('transfer-cancel-btn'), transferError=$('transfer-error'), recipientPreview=$('recipient-preview');
const myQrBtn=$('my-qr-btn'), scanQrBtn=$('scan-qr-btn'), qrModal=$('qr-modal'), qrContainer=$('qr-container'), qrInfo=$('qr-info'), qrCloseBtn=$('qr-close-btn'), qrModalTitle=$('qr-modal-title');
const scannerModal=$('scanner-modal'), scannerContainer=$('scanner-container'), scannerResult=$('scanner-result'), scannerCloseBtn=$('scanner-close-btn');
const chatModal=$('chat-modal'), chatMessages=$('chat-messages'), chatInput=$('chat-input'), chatError=$('chat-error');
const savingsSection=$('savings-section'), savingsName=$('savings-name'), savingsGoalDisplay=$('savings-goal-display'), savingsProgress=$('savings-progress'), savingsCurrent=$('savings-current'), savingsPercent=$('savings-percent'), addToSavingsBtn=$('add-to-savings-btn'), closeSavingsBtn=$('close-savings-btn');

function showScreen(s) { loginScreen.classList.remove('active'); registerScreen.classList.remove('active'); bankScreen.classList.remove('active'); s.classList.add('active'); }

// === ОБНОВЛЕНИЕ UI ===
function updateBankUI() {
    if(!currentUserData) return;
    const u=currentUserData;
    userGreeting.textContent=u.name; userAvatar.textContent=getAvatar(u.name);
    balanceDisplay.textContent=u.balance.toLocaleString()+' ₽';
    accountNumberDisplay.textContent='Счёт: '+u.accountNumber;
    cardNumberDisplay.textContent=formatCard(u.cardNumber||'0000000000000000');
    cardHolder.textContent=u.name; cardExpiry.textContent=u.cardExpiry||'12/28';
    cashbackDisplay.textContent=(u.cashback||0).toLocaleString()+' ₽';
    deviceCountSpan.textContent='📱 '+(u.devices?.length||0)+'/'+MAX_DEVICES;

    historyList.innerHTML='';
    if(!u.history||u.history.length===0) {
        historyList.innerHTML='<p style="color:#666;text-align:center;padding:20px;">Пока нет операций</p>';
    } else {
        u.history.slice(0,15).forEach(h=>{
            const d=document.createElement('div'); d.className='history-item';
            const sign=h.type==='income'?'+':'-', cls=h.type==='income'?'income':'expense';
            const cmt=h.comment?'<br><small style="color:#666;">'+h.comment+'</small>':'';
            d.innerHTML='<div class="history-info"><div class="history-desc">'+h.description+cmt+'</div><div class="history-date">'+h.date+'</div></div><div class="history-amount '+cls+'">'+sign+h.amount.toLocaleString()+' ₽</div>';
            historyList.appendChild(d);
        });
    }

    // Копилка
    if(savingsData) {
        savingsSection.style.display='block';
        savingsName.textContent=savingsData.name||'Копилка';
        savingsGoalDisplay.textContent=(savingsData.goal||0).toLocaleString()+' ₽';
        savingsCurrent.textContent=(savingsData.current||0).toLocaleString()+' ₽';
        const pct=savingsData.goal>0?Math.min(100,Math.round((savingsData.current/savingsData.goal)*100)):0;
        savingsProgress.style.width=pct+'%'; savingsPercent.textContent=pct+'%';
        if(pct>=100&&savingsData.current>=savingsData.goal&&!savingsData.completed) {
            savingsData.completed=true; saveSavings(); showToast('🎉 Цель достигнута!','success');
        }
    } else { savingsSection.style.display='none'; }

    // График
    drawExpenseChart(u);
}

async function addTransaction(uid,type,desc,amount,comment) {
    const ref=doc(db,'users',uid); const snap=await getDoc(ref); const d=snap.data();
    const h=d.history||[]; h.unshift({type,description:desc,amount,comment:comment||'',date:new Date().toLocaleString('ru-RU')});
    if(h.length>50) h.length=50;
    await updateDoc(ref,{history:h});
}

// === КОПИЛКА ===
function loadSavings() {
    const s=localStorage.getItem('savings_'+currentUserDocId);
    savingsData=s?JSON.parse(s):null;
}
function saveSavings() {
    if(savingsData) localStorage.setItem('savings_'+currentUserDocId,JSON.stringify(savingsData));
    else localStorage.removeItem('savings_'+currentUserDocId);
}
addToSavingsBtn.onclick=function(){
    if(!savingsData) return;
    if(savingsData.completed) {
        if(confirm('Вывести '+savingsData.current.toLocaleString()+' ₽?')) {
            currentUserData.balance+=savingsData.current;
            updateDoc(doc(db,'users',currentUserDocId),{balance:increment(savingsData.current)});
            addTransaction(currentUserDocId,'income','Вывод из копилки: '+savingsData.name,savingsData.current);
            savingsData=null; saveSavings(); updateBankUI();
        }
        return;
    }
    const amt=parseInt(prompt('Сумма (₽):','1000'));
    if(!amt||amt<=0) return;
    if(amt>currentUserData.balance) { showToast('Недостаточно средств','error'); return; }
    currentUserData.balance-=amt; savingsData.current+=amt;
    updateDoc(doc(db,'users',currentUserDocId),{balance:increment(-amt)});
    addTransaction(currentUserDocId,'expense','Пополнение копилки: '+savingsData.name,amt);
    saveSavings(); updateBankUI();
    showToast('Копилка +'+amt.toLocaleString()+' ₽','success');
};
closeSavingsBtn.onclick=function(){
    if(savingsData&&!savingsData.completed) {
        if(confirm('Закрыть копилку? Деньги вернутся.')) {
            currentUserData.balance+=savingsData.current;
            updateDoc(doc(db,'users',currentUserDocId),{balance:increment(savingsData.current)});
            addTransaction(currentUserDocId,'income','Возврат из копилки: '+savingsData.name,savingsData.current);
            savingsData=null; saveSavings(); updateBankUI();
        }
    } else { savingsSection.style.display='none'; }
};

// === КНОПКА КОПИЛКИ В ДЕЙСТВИЯХ ===
const piggyBtn=document.createElement('button');
piggyBtn.className='action-btn'; piggyBtn.innerHTML='<span>🐷</span> Копилка';
piggyBtn.style.cssText='background:linear-gradient(135deg,#2a1a2e,#2a1a3a);color:#ffa500;border:1px solid #3a2a4e;';
piggyBtn.onclick=function(){
    if(!savingsData) {
        const nm=prompt('Название:','На отпуск'); if(!nm) return;
        const gl=parseInt(prompt('Цель (₽):','50000')); if(!gl||gl<=0) return;
        savingsData={name:nm,goal:gl,current:0,completed:false}; saveSavings(); updateBankUI();
        showToast('Копилка создана!','success');
    } else { savingsSection.style.display=savingsSection.style.display==='none'?'block':'none'; }
};
$('actions-container').appendChild(piggyBtn);

// === ГРАФИК ===
function drawExpenseChart(u) {
    const canvas=$('expense-chart'); if(!canvas) return;
    const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
    const now=new Date(); let totalExp=0, totalInc=0;
    if(u.history) u.history.forEach(h=>{
        const d=new Date(h.date.split(',')[0].split('.').reverse().join('-'));
        if(d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()) {
            if(h.type==='expense') totalExp+=h.amount; else totalInc+=h.amount;
        }
    });
    const total=totalExp+totalInc||1;
    const expAngle=(totalExp/total)*Math.PI*2;
    ctx.beginPath(); ctx.fillStyle='#ff6b6b'; ctx.moveTo(150,75); ctx.arc(150,75,60,-Math.PI/2,-Math.PI/2+expAngle); ctx.fill();
    ctx.beginPath(); ctx.fillStyle='#00d2a0'; ctx.moveTo(150,75); ctx.arc(150,75,60,-Math.PI/2+expAngle,-Math.PI/2+Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff'; ctx.font='12px sans-serif'; ctx.fillText('Расходы: '+totalExp.toLocaleString()+'₽',10,140);
    ctx.fillText('Доходы: '+totalInc.toLocaleString()+'₽',10,155);
}

// === ЧАТ ===
chatBtn.onclick=()=>{ chatModal.classList.add('active'); chatInput.focus(); };
chatInput.onkeydown=function(e){
    if(e.key==='Enter') {
        const msg=chatInput.value.trim();
        if(!msg) return;
        chatMessages.innerHTML+='<div class="chat-msg user">'+msg+'</div>';
        chatInput.value='';
        setTimeout(()=>{
            const r=msg.toLowerCase();
            let reply='Спасибо за обращение! Оператор ответит в ближайшее время.';
            if(r.includes('перевод')) reply='Переводы доступны в разделе «Перевести». Введите логин или номер счёта получателя.';
            if(r.includes('блокировк')||r.includes('заблок')) reply='Проверьте лимит устройств (до 5). Если проблема сохраняется — создайте обращение.';
            if(r.includes('копилк')) reply='Копилка позволяет накопить на цель. Нажмите 🐷 Копилка на главном экране.';
            if(r.includes('qr')) reply='QR-код позволяет быстро перевести деньги. Нажмите «Мой QR» или «Сканировать».';
            chatMessages.innerHTML+='<div class="chat-msg bot">'+reply+'</div>';
            chatMessages.scrollTop=chatMessages.scrollHeight;
        },500);
        chatMessages.scrollTop=chatMessages.scrollHeight;
    }
};
chatModal.onclick=function(e){ if(e.target===chatModal) chatModal.classList.remove('active'); };

// === QR ===
myQrBtn.onclick=function(){
    if(!currentUserData) return;
    const data=JSON.stringify({login:currentUserData.login,name:currentUserData.name,account:currentUserData.accountNumber});
    qrContainer.innerHTML=''; qrModalTitle.textContent='Ваш QR-код'; qrInfo.textContent=currentUserData.name+' • '+currentUserData.accountNumber;
    const canvas=document.createElement('canvas');
    QRCode.toCanvas(canvas,data,{width:220,margin:2},function(err){ if(err) qrContainer.innerHTML='<p style="color:#ff6b6b;">Ошибка</p>'; else qrContainer.appendChild(canvas); });
    qrModal.classList.add('active');
};
qrCloseBtn.onclick=()=>qrModal.classList.remove('active');
qrModal.onclick=function(e){ if(e.target===qrModal) qrModal.classList.remove('active'); };

scanQrBtn.onclick=async function(){
    scannerResult.textContent=''; scannerContainer.innerHTML=''; scannerModal.classList.add('active');
    try {
        scannerStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:300,height:300}});
        const video=document.createElement('video'); video.srcObject=scannerStream; video.setAttribute('playsinline',true); video.play();
        scannerContainer.appendChild(video);
        const canvas=document.createElement('canvas'); const ctx=canvas.getContext('2d');
        const interval=setInterval(()=>{
            if(video.readyState===video.HAVE_ENOUGH_DATA) {
                canvas.width=video.videoWidth; canvas.height=video.videoHeight;
                ctx.drawImage(video,0,0,canvas.width,canvas.height);
                const img=ctx.getImageData(0,0,canvas.width,canvas.height);
                const code=jsQR(img.data,img.width,img.height);
                if(code) {
                    clearInterval(interval); stopScanner();
                    try {
                        const qd=JSON.parse(code.data);
                        scannerResult.innerHTML='<span style="color:#4ade80;">✅ '+qd.name+'</span><br><small>Счёт: '+qd.account+'</small>';
                        setTimeout(()=>{
                            scannerModal.classList.remove('active');
                            transferTo.value=qd.login; transferAmount.value=''; transferComment.value='';
                            recipientPreview.textContent=getAvatar(qd.name)+' '+qd.name+' (счёт: '+qd.account+')';
                            recipientPreview.style.display='block'; transferModal.classList.add('active');
                        },800);
                    }catch(e){ scannerResult.innerHTML='<span style="color:#ff6b6b;">Неверный QR</span>'; }
                }
            }
        },500);
        video._scanInterval=interval;
    } catch(e) { scannerResult.innerHTML='<span style="color:#ff6b6b;">Нет доступа к камере</span>'; }
};
function stopScanner() { if(scannerStream) { scannerStream.getTracks().forEach(t=>t.stop()); scannerStream=null; } }
scannerCloseBtn.onclick=()=>{ stopScanner(); scannerModal.classList.remove('active'); };
scannerModal.onclick=function(e){ if(e.target===scannerModal) { stopScanner(); scannerModal.classList.remove('active'); } };

// === РЕГИСТРАЦИЯ ===
registerSubmitBtn.onclick=async function(){
    const name=regName.value.trim(), login=regLogin.value.trim().toLowerCase(), password=regPassword.value;
    regError.textContent='';
    if(!name||!login||!password) { regError.textContent='Заполните все поля'; return; }
    if(password.length<6) { regError.textContent='Пароль от 6 символов'; return; }
    try {
        if(await findUser(login)) { regError.textContent='Логин занят'; return; }
        const uc=await createUserWithEmailAndPassword(auth,login+'@bank.local',password);
        const uid=uc.user.uid, deviceId=getDeviceId(), acc=generateAccountNumber(), card=generateCardNumber();
        const exp=new Date(); exp.setFullYear(exp.getFullYear()+3);
        const expStr=('0'+(exp.getMonth()+1)).slice(-2)+'/'+exp.getFullYear().toString().slice(-2);
        const userData={name,login,email:login+'@bank.local',accountNumber:acc,cardNumber:card,cardExpiry:expStr,cardCVV:String(Math.floor(Math.random()*900)+100),balance:0,cashback:0,devices:[deviceId],history:[]};
        await setDoc(doc(db,'users',uid),userData);
        currentUserDocId=uid; currentUserData=userData;
        regName.value=''; regLogin.value=''; regPassword.value='';
        showScreen(bankScreen); loadSavings(); updateBankUI();
        showToast('Аккаунт создан!','success');
    } catch(e) { regError.textContent='Ошибка: '+e.message; }
};

// === ВХОД ===
loginBtn.onclick=async function(){
    const login=loginInput.value.trim().toLowerCase(), password=passwordInput.value;
    loginError.textContent='';
    if(!login||!password) { loginError.textContent='Заполните все поля'; return; }
    try {
        const uc=await signInWithEmailAndPassword(auth,login+'@bank.local',password);
        const snap=await getDoc(doc(db,'users',uc.user.uid));
        if(!snap.exists()) { loginError.textContent='Пользователь не найден'; return; }
        const userData=snap.data(), deviceId=getDeviceId();
        let devices=userData.devices||[];
        if(!devices.includes(deviceId)) {
            if(devices.length>=MAX_DEVICES) { await signOut(auth); loginError.textContent='Лимит устройств ('+MAX_DEVICES+')'; return; }
            devices.push(deviceId); await updateDoc(doc(db,'users',uc.user.uid),{devices}); userData.devices=devices;
            showToast('Устройство привязано! ('+devices.length+'/'+MAX_DEVICES+')','info');
        }
        currentUserDocId=uc.user.uid; currentUserData=userData; passwordInput.value='';
        showScreen(bankScreen); loadSavings(); updateBankUI();
    } catch(e) { loginError.textContent='Неверный логин или пароль'; }
};

// === НАВИГАЦИЯ ===
registerBtn.onclick=()=>showScreen(registerScreen);
backToLoginBtn.onclick=()=>showScreen(loginScreen);
logoutBtn.onclick=async()=>{ await signOut(auth); currentUserData=null; currentUserDocId=null; savingsData=null; showScreen(loginScreen); loginInput.value=''; passwordInput.value=''; };
themeToggle.onclick=toggleTheme;

// === ПОПОЛНЕНИЕ ===
depositBtn.onclick=()=>{ depositAmount.value=''; depositError.textContent=''; depositModal.classList.add('active'); };
depositCancel.onclick=()=>depositModal.classList.remove('active');
depositSubmit.onclick=async()=>{
    const amt=parseInt(depositAmount.value);
    if(!amt||amt<=0) { depositError.textContent='Введите сумму'; return; }
    await updateDoc(doc(db,'users',currentUserDocId),{balance:increment(amt)});
    await addTransaction(currentUserDocId,'income','Пополнение',amt);
    currentUserData.balance+=amt;
    currentUserData.history.unshift({type:'income',description:'Пополнение',amount:amt,comment:'',date:new Date().toLocaleString('ru-RU')});
    depositModal.classList.remove('active'); updateBankUI();
    showToast('Пополнено на '+amt.toLocaleString()+' ₽','success');
};

// === ПЕРЕВОД (с кешбэком) ===
transferBtn.onclick=()=>{ transferTo.value=''; transferAmount.value=''; transferComment.value=''; transferError.textContent=''; recipientPreview.style.display='none'; transferModal.classList.add('active'); };
transferTo.oninput=async function(){
    const s=transferTo.value.trim().toLowerCase();
    if(s.length<2) { recipientPreview.style.display='none'; return; }
    const f=await findUser(s);
    if(f&&f.uid!==currentUserDocId) { recipientPreview.textContent=getAvatar(f.data.name)+' '+f.data.name+' (счёт: '+f.data.accountNumber+')'; recipientPreview.style.display='block'; }
    else { recipientPreview.style.display='none'; }
};
transferCancel.onclick=()=>transferModal.classList.remove('active');
transferSubmit.onclick=async()=>{
    const to=transferTo.value.trim().toLowerCase(), amt=parseInt(transferAmount.value), cmt=transferComment.value.trim();
    transferError.textContent='';
    if(!to||!amt||amt<=0) { transferError.textContent='Заполните обязательные поля'; return; }
    const found=await findUser(to);
    if(!found) { transferError.textContent='Получатель не найден'; return; }
    if(found.uid===currentUserDocId) { transferError.textContent='Нельзя перевести себе'; return; }
    if(currentUserData.balance<amt) { transferError.textContent='Недостаточно средств'; return; }
    const cashback=Math.floor(amt*CASHBACK_RATE);
    const cmtText=cmt?' — «'+cmt+'»':'';
    const d1='Перевод для '+found.data.name+cmtText, d2='Перевод от '+currentUserData.name+cmtText;
    await updateDoc(doc(db,'users',currentUserDocId),{balance:increment(-amt),cashback:increment(cashback)});
    await addTransaction(currentUserDocId,'expense',d1,amt,cmt);
    await updateDoc(doc(db,'users',found.uid),{balance:increment(amt)});
    await addTransaction(found.uid,'income',d2,amt,cmt);
    currentUserData.balance-=amt; currentUserData.cashback=(currentUserData.cashback||0)+cashback;
    currentUserData.history.unshift({type:'expense',description:d1,amount:amt,comment:cmt,date:new Date().toLocaleString('ru-RU')});
    playSound(); transferModal.classList.remove('active'); updateBankUI();
    showToast('Перевод выполнен! Кешбэк: +'+cashback+' ₽','success');
};

// === ЭКСПОРТ ===
exportBtn.onclick=()=>{ if(currentUserData) exportStatement(currentUserData); };

// === ENTER ===
passwordInput.onkeydown=e=>{ if(e.key==='Enter') loginBtn.onclick(); };
depositAmount.onkeydown=e=>{ if(e.key==='Enter') depositSubmit.onclick(); };
transferAmount.onkeydown=e=>{ if(e.key==='Enter') transferSubmit.onclick(); };

// === ЗАКРЫТИЕ МОДАЛОК ===
[depositModal,transferModal].forEach(m=>{ m.onclick=function(e){ if(e.target===m) m.classList.remove('active'); }; });

// === АВТОВХОД ===
onAuthStateChanged(auth,async(user)=>{
    if(user) {
        const snap=await getDoc(doc(db,'users',user.uid));
        if(snap.exists()) {
            currentUserDocId=user.uid; currentUserData=snap.data();
            showScreen(bankScreen); loadSavings(); updateBankUI();
        }
    }
});

applyTheme(getTheme());
console.log('✅ Банк готов! Все 6 функций активны.');

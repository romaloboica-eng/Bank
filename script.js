// ==========================================
// LEGACY BANK — полный script.js
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

// ---------- КОНСТАНТЫ ----------
const MAX_DEVICES = 5;
const MAX_CARDS = 5;
const MAX_NAME_LENGTH = 35;
const MAX_LOGIN_LENGTH = 35;
const CASHBACK_RATE = 0.01;
const COMMISSION_RATE = 0.01;
const MAX_UNDO_SECONDS = 30;

// ---------- УТИЛИТЫ ----------
function getDeviceId() {
    let id = localStorage.getItem('device_id');
    if (!id) { id = 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2,9); localStorage.setItem('device_id', id); }
    return id;
}
function generateAccountNumber() { let n = '40817'; for (let i=0;i<15;i++) n += Math.floor(Math.random()*10); return n; }
function generateCardNumber() { let n = '4276'; for (let i=0;i<12;i++) n += Math.floor(Math.random()*10); return n; }
function formatCard(num) { return num.replace(/(\d{4})(?=\d)/g, '$1 '); }
const AVATARS = ['🦊','🐱','🐶','🐼','🐨','🐰','🦁','🐯','🐮','🐷','🐸','🐵','🦄','🐲','🦉','🦇'];
function getAvatar(n) { let h=0; for(let i=0;i<n.length;i++) h=n.charCodeAt(i)+((h<<5)-h); return AVATARS[Math.abs(h)%AVATARS.length]; }
function playSound(type = 'transfer') {
    try {
        const c = new (window.AudioContext||window.webkitAudioContext)();
        const o = c.createOscillator(); const g = c.createGain();
        o.connect(g); g.connect(c.destination);
        if (type === 'transfer') {
            o.type='sine'; o.frequency.setValueAtTime(800,c.currentTime); o.frequency.setValueAtTime(1200,c.currentTime+0.1);
            g.gain.setValueAtTime(0.3,c.currentTime); g.gain.exponentialRampToValueAtTime(0.01,c.currentTime+0.3);
            o.start(c.currentTime); o.stop(c.currentTime+0.3);
        } else if (type === 'success') {
            o.type='sine'; o.frequency.setValueAtTime(600,c.currentTime); o.frequency.setValueAtTime(900,c.currentTime+0.1);
            g.gain.setValueAtTime(0.2,c.currentTime); g.gain.exponentialRampToValueAtTime(0.01,c.currentTime+0.4);
            o.start(c.currentTime); o.stop(c.currentTime+0.4);
        }
    } catch(e){}
}
const THEME_KEY = 'bank_theme';
function getTheme() { return localStorage.getItem(THEME_KEY)||'dark'; }
function applyTheme(t) { if(t==='light') document.body.classList.add('light-theme'); else document.body.classList.remove('light-theme'); }
function toggleTheme() { const n = getTheme()==='dark'?'light':'dark'; localStorage.setItem(THEME_KEY,n); applyTheme(n); }
function showToast(m,t) { const el=document.createElement('div'); el.className='toast '+(t||''); el.textContent=m; document.body.appendChild(el); setTimeout(()=>el.remove(),3000); }
function notify(title, body) { if (Notification.permission === 'granted') new Notification(title, { body, icon: '🏛️' }); }
if (window.Notification && Notification.permission === 'default') Notification.requestPermission();

// ---------- ПОИСК ПОЛЬЗОВАТЕЛЯ ----------
async function findUser(s) {
    const all = await getDocs(collection(db,'users'));
    for(const d of all.docs) { const dt=d.data(); if(dt.login===s||dt.accountNumber===s||dt.phone===s) return {uid:d.id,data:dt}; }
    return null;
}

// ---------- ЛИМИТЫ ----------
function resetLimitsIfNeeded(u) {
    const now = new Date();
    const today = now.toDateString();
    const month = (now.getMonth()+1)+'-'+now.getFullYear();
    if (u.lastResetDay !== today) { u.dailySpent = 0; u.lastResetDay = today; }
    if (u.lastResetMonth !== month) { u.monthlySpent = 0; u.lastResetMonth = month; }
}

// ---------- ГЛОБАЛЬНОЕ СОСТОЯНИЕ ----------
let currentUserData = null, currentUserDocId = null, savingsData = null, scannerStream = null;
let balanceVisible = true;
let lastTransferData = null, lastTransferTime = 0;

// ---------- DOM-ЭЛЕМЕНТЫ ----------
const $=id=>document.getElementById(id);
const loginScreen=$('login-screen'), pinLoginScreen=$('pin-login-screen'), registerScreen=$('register-screen'), bankScreen=$('bank-screen');
const loginInput=$('login-input'), passwordInput=$('password-input'), loginBtn=$('login-btn'), loginPinBtn=$('login-pin-btn'), registerBtn=$('register-btn'), loginError=$('login-error');
const pinInput=$('pin-input'), pinSubmitBtn=$('pin-submit-btn'), pinBackBtn=$('pin-back-btn'), pinError=$('pin-error');
const regName=$('reg-name'), regLogin=$('reg-login'), regPhone=$('reg-phone'), regPassword=$('reg-password'), regPin=$('reg-pin'), regAntiPhishing=$('reg-anti-phishing');
const registerSubmitBtn=$('register-submit-btn'), backToLoginBtn=$('back-to-login-btn'), regError=$('reg-error');
const userGreeting=$('user-greeting'), userAvatar=$('user-avatar'), balanceDisplay=$('balance-display'), accountNumberDisplay=$('account-number-display'), cashbackDisplay=$('cashback-display');
const cardNumberDisplay=$('card-number-display'), cardHolder=$('card-holder'), cardExpiry=$('card-expiry'), cardCounter=$('card-counter');
const cardNickname=$('card-nickname'), cardBalanceDisplay=$('card-balance-display');
const historyList=$('history-list'), historyFilter=$('history-filter');
const depositBtn=$('deposit-btn'), transferBtn=$('transfer-btn'), exportBtn=$('export-btn'), themeToggle=$('theme-toggle'), logoutBtn=$('logout-btn'), chatBtn=$('chat-btn'), settingsBtn=$('settings-btn');
const depositModal=$('deposit-modal'), depositAmount=$('deposit-amount'), depositSubmit=$('deposit-submit-btn'), depositCancel=$('deposit-cancel-btn'), depositError=$('deposit-error');
const transferModal=$('transfer-modal'), transferTo=$('transfer-to'), transferFromCard=$('transfer-from-card'), transferToOwnCard=$('transfer-to-own-card'), ownCardsSection=$('own-cards-section');
const transferAmount=$('transfer-amount'), transferComment=$('transfer-comment');
const transferSubmit=$('transfer-submit-btn'), transferCancel=$('transfer-cancel-btn'), transferError=$('transfer-error'), recipientPreview=$('recipient-preview');
const templatesBtn=$('templates-btn'), templateSelectModal=$('template-select-modal'), templateSelectList=$('template-select-list'), templateSelectCloseBtn=$('template-select-close-btn');
const myQrBtn=$('my-qr-btn'), scanQrBtn=$('scan-qr-btn'), qrModal=$('qr-modal'), qrContainer=$('qr-container'), qrInfo=$('qr-info'), qrCloseBtn=$('qr-close-btn'), qrModalTitle=$('qr-modal-title');
const scannerModal=$('scanner-modal'), scannerContainer=$('scanner-container'), scannerResult=$('scanner-result'), scannerCloseBtn=$('scanner-close-btn');
const chatModal=$('chat-modal'), chatMessages=$('chat-messages'), chatInput=$('chat-input'), chatError=$('chat-error');
const savingsSection=$('savings-section'), savingsName=$('savings-name'), savingsGoalDisplay=$('savings-goal-display'), savingsProgress=$('savings-progress'), savingsCurrent=$('savings-current'), savingsPercent=$('savings-percent'), addToSavingsBtn=$('add-to-savings-btn'), closeSavingsBtn=$('close-savings-btn');
const prevCardBtn=$('prev-card-btn'), nextCardBtn=$('next-card-btn'), addCardBtn=$('add-card-btn'), blockCardBtn=$('block-card-btn'), virtualCardBtn=$('virtual-card-btn'), giftCardBtn=$('gift-card-btn');
const renameCardBtn=$('rename-card-btn');
const twoFaModal=$('2fa-modal'), twoFaCode=$('2fa-code'), twoFaSubmit=$('2fa-submit-btn'), twoFaCancel=$('2fa-cancel-btn'), twoFaError=$('2fa-error');
const settingsModal=$('settings-modal'), settingsCloseBtn=$('settings-close-btn');
const setPhone=$('set-phone'), savePhoneBtn=$('save-phone-btn'), setPin=$('set-pin'), savePinBtn=$('save-pin-btn'), set2fa=$('set-2fa');
const setDailyLimit=$('set-daily-limit'), setMonthlyLimit=$('set-monthly-limit'), dailySpentSpan=$('daily-spent'), monthlySpentSpan=$('monthly-spent'), saveLimitsBtn=$('save-limits-btn');
const templatesList=$('templates-list');
const balanceChart=$('balance-chart');
const expensePieChart=$('expense-pie-chart');
const forecastAmount=$('forecast-amount'), comparisonText=$('comparison-text'), heatmapDays=$('heatmap-days');
const rateUsd=$('rate-usd'), rateEur=$('rate-eur');
const antiPhishingMsg=$('anti-phishing-msg');
const toggleBalanceBtn=$('toggle-balance-visibility');
const colorPicker=$('color-picker');
const texturePicker=$('texture-picker');
const splitBtn=$('split-btn');
const splitModal=$('split-modal'), splitTotal=$('split-total'), splitParticipants=$('split-participants'), addSplitRow=$('add-split-row'), splitSubmitBtn=$('split-submit-btn'), splitCancelBtn=$('split-cancel-btn'), splitError=$('split-error');
const giftCardModal=$('gift-card-modal'), giftAmount=$('gift-amount'), giftRecipient=$('gift-recipient'), giftCreateBtn=$('gift-create-btn'), giftCancelBtn=$('gift-cancel-btn'), giftError=$('gift-error');
const stickerPicker=$('sticker-picker');
const userAvatarContainer=$('user-avatar-container');

// ---------- НАВИГАЦИЯ ----------
function showScreen(s) {
    loginScreen.classList.remove('active'); pinLoginScreen.classList.remove('active'); registerScreen.classList.remove('active'); bankScreen.classList.remove('active');
    s.classList.add('active');
}

// ---------- ОБНОВЛЕНИЕ UI ----------
function updateBankUI() {
    if(!currentUserData) return;
    const u = currentUserData;
    resetLimitsIfNeeded(u);
    userGreeting.textContent = u.name;
    if (u.avatar) userAvatar.innerHTML = `<img src="${u.avatar}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;">`;
    else userAvatar.textContent = getAvatar(u.name);

    balanceDisplay.textContent = balanceVisible ? u.balance.toLocaleString()+' ₽' : '••••• ₽';
    balanceDisplay.style.filter = balanceVisible ? 'none' : 'blur(5px)';
    accountNumberDisplay.textContent = 'Счёт: '+u.accountNumber;
    cashbackDisplay.textContent = (u.cashback||0).toLocaleString()+' ₽';

    if (!u.cards || !Array.isArray(u.cards) || u.cards.length===0) {
        u.cards = [{ number: generateCardNumber(), expiry: '12/28', cvv: '123', color: 'purple', blocked: false, nickname: '', texture: 'default', currency: 'RUB', primary: true }];
        u.currentCardIndex = 0;
    }
    const card = u.cards[u.currentCardIndex];
    cardNumberDisplay.textContent = formatCard(card.number);
    cardHolder.textContent = u.name;
    cardExpiry.textContent = card.expiry;
    cardCounter.textContent = (u.currentCardIndex+1)+'/'+u.cards.length;
    cardNickname.textContent = (card.nickname || '') + (card.primary ? ' ⭐' : '');
    const cardBalance = card.balance !== undefined ? card.balance : u.balance;
    cardBalanceDisplay.textContent = cardBalance.toLocaleString() + ' ₽';
    blockCardBtn.textContent = card.blocked ? '🔓 Разблокировать' : '🔒 Заблокировать';

    applyCardColor(card.color);
    applyCardTexture(card.texture || 'default');
    document.querySelectorAll('.color-dot').forEach(d => d.classList.toggle('active', d.dataset.color===card.color));
    document.querySelectorAll('.texture-dot').forEach(d => d.classList.toggle('active', d.dataset.texture===(card.texture||'default')));

    checkCardExpiry(card);
    renderHistory(u);

    if(savingsData) {
        savingsSection.style.display='block';
        savingsName.textContent = savingsData.name||'Копилка';
        savingsGoalDisplay.textContent = (savingsData.goal||0).toLocaleString()+' ₽';
        savingsCurrent.textContent = (savingsData.current||0).toLocaleString()+' ₽';
        const pct = savingsData.goal>0 ? Math.min(100, Math.round((savingsData.current/savingsData.goal)*100)) : 0;
        savingsProgress.style.width = pct+'%';
        savingsPercent.textContent = pct+'%';
    } else { savingsSection.style.display='none'; }

    drawBalanceChart();
    drawExpensePieChart();
    calculateForecast();
    compareWithLastMonth();
    drawHeatmap();
}

// ... все остальные функции (applyCardColor, applyCardTexture, renderHistory, drawBalanceChart, drawExpensePieChart, calculateForecast, compareWithLastMonth, drawHeatmap, categorizeTransaction, checkCardExpiry, animateBalance, fetchRates) без изменений

// ---------- ПЕРЕВОД (С ВЫБОРОМ КАРТЫ) ----------
transferBtn.onclick = () => {
    transferTo.value = '';
    transferAmount.value = '';
    transferComment.value = '';
    transferError.textContent = '';
    recipientPreview.style.display = 'none';
    ownCardsSection.style.display = 'none';
    transferFromCard.innerHTML = currentUserData.cards.map((card, i) => 
        `<option value="${i}">${card.nickname || 'Карта '+(i+1)} (${formatCard(card.number)})</option>`
    ).join('');
    transferFromCard.value = currentUserData.currentCardIndex;
    transferToOwnCard.innerHTML = currentUserData.cards.map((card, i) => 
        `<option value="${i}">${card.nickname || 'Карта '+(i+1)} (${formatCard(card.number)})</option>`
    ).join('');
    transferModal.classList.add('active');
};

transferTo.oninput = async function() {
    const s = transferTo.value.trim().toLowerCase();
    if (s.length < 2) { recipientPreview.style.display = 'none'; ownCardsSection.style.display = 'none'; return; }
    if (s === currentUserData.login || s === currentUserData.accountNumber || s === currentUserData.phone) {
        recipientPreview.style.display = 'none';
        ownCardsSection.style.display = 'block';
    } else {
        ownCardsSection.style.display = 'none';
        const found = await findUser(s);
        if (found && found.uid !== currentUserDocId) {
            recipientPreview.textContent = getAvatar(found.data.name) + ' ' + found.data.name + ' (счёт: ' + found.data.accountNumber + ')';
            recipientPreview.style.display = 'block';
        } else {
            recipientPreview.style.display = 'none';
        }
    }
};

transferSubmit.onclick = async () => {
    const to = transferTo.value.trim().toLowerCase();
    const amt = parseInt(transferAmount.value);
    const cmt = transferComment.value.trim();
    const fromCardIndex = parseInt(transferFromCard.value);
    const fromCard = currentUserData.cards[fromCardIndex];
    
    transferError.textContent = '';
    if (!to || !amt || amt <= 0) { transferError.textContent = 'Заполните поля'; return; }
    
    const sourceBalance = fromCard.balance !== undefined ? fromCard.balance : currentUserData.balance;
    if (sourceBalance < amt) { transferError.textContent = 'Недостаточно средств на выбранной карте'; return; }
    
    const isSelf = (to === currentUserData.login || to === currentUserData.accountNumber || to === currentUserData.phone);
    
    if (isSelf) {
        const toCardIndex = parseInt(transferToOwnCard.value);
        if (fromCardIndex === toCardIndex) { transferError.textContent = 'Нельзя перевести на ту же карту'; return; }
        const toCard = currentUserData.cards[toCardIndex];
        if (fromCard.balance !== undefined) fromCard.balance -= amt;
        else currentUserData.balance -= amt;
        if (toCard.balance !== undefined) toCard.balance += amt;
        else currentUserData.balance += amt;
        await updateDoc(doc(db, 'users', currentUserDocId), { cards: currentUserData.cards, balance: currentUserData.balance });
        await addTransaction(currentUserDocId, 'expense', `Перевод между картами: ${fromCard.nickname||'Карта'} → ${toCard.nickname||'Карта'}`, amt, cmt);
        currentUserData.history.unshift({ type:'expense', description:`Перевод между картами`, amount:amt, comment:cmt, date:new Date().toLocaleString('ru-RU') });
        playSound('transfer');
        transferModal.classList.remove('active');
        animateBalance(currentUserData.balance);
        updateBankUI();
        showToast('Перевод между картами выполнен', 'success');
        return;
    }
    
    const found = await findUser(to);
    if (!found) { transferError.textContent = 'Получатель не найден'; return; }
    if (found.uid === currentUserDocId) { transferError.textContent = 'Для перевода себе используйте раздел "Между своими"'; return; }
    
    const commission = Math.round(amt * COMMISSION_RATE);
    const totalDeduction = amt + commission;
    if (sourceBalance < totalDeduction) { transferError.textContent = `Недостаточно средств (комиссия ${commission} ₽)`; return; }
    
    resetLimitsIfNeeded(currentUserData);
    if (currentUserData.dailyLimit && (currentUserData.dailySpent||0)+totalDeduction > currentUserData.dailyLimit) { transferError.textContent = 'Превышен дневной лимит'; return; }
    if (currentUserData.monthlyLimit && (currentUserData.monthlySpent||0)+totalDeduction > currentUserData.monthlyLimit) { transferError.textContent = 'Превышен месячный лимит'; return; }
    
    if (fromCard.balance !== undefined) fromCard.balance -= totalDeduction;
    else currentUserData.balance -= totalDeduction;
    
    const cashback = Math.floor(amt * CASHBACK_RATE);
    currentUserData.cashback = (currentUserData.cashback||0) + cashback;
    currentUserData.dailySpent = (currentUserData.dailySpent||0) + totalDeduction;
    currentUserData.monthlySpent = (currentUserData.monthlySpent||0) + totalDeduction;
    
    const receiverData = found.data;
    const receiverPrimaryCard = receiverData.cards.find(c => c.primary) || receiverData.cards[0];
    if (receiverPrimaryCard.balance !== undefined) {
        receiverPrimaryCard.balance += amt;
    } else {
        receiverData.balance += amt;
    }
    
    await updateDoc(doc(db, 'users', currentUserDocId), {
        cards: currentUserData.cards, balance: currentUserData.balance,
        cashback: currentUserData.cashback, dailySpent: currentUserData.dailySpent, monthlySpent: currentUserData.monthlySpent
    });
    await addTransaction(currentUserDocId, 'expense', `Перевод для ${receiverData.name}`, amt, cmt);
    await updateDoc(doc(db, 'users', found.uid), { cards: receiverData.cards, balance: receiverData.balance });
    await addTransaction(found.uid, 'income', `Перевод от ${currentUserData.name}`, amt, cmt);
    
    currentUserData.history.unshift({ type:'expense', description:`Перевод для ${receiverData.name}`, amount:amt, comment:cmt, date:new Date().toLocaleString('ru-RU') });
    lastTransferData = { from: currentUserDocId, to: found.uid, amount: amt };
    lastTransferTime = Date.now();
    
    playSound('transfer');
    transferModal.classList.remove('active');
    animateBalance(currentUserData.balance);
    updateBankUI();
    showUndoButton();
    notify('Перевод', `-${totalDeduction} ₽ (комиссия ${commission} ₽)`);
    maybeSaveTemplate(to, amt, cmt);
};

// ... (все остальные функции: showUndoButton, addTransaction, maybeSaveTemplate, регистрация, вход, пополнение, настройки, QR, чат, копилка и т.д.)
// Полный код этих функций идентичен предыдущей полной версии script.js.const setPhone=$('set-phone'), savePhoneBtn=$('save-phone-btn'), setPin=$('set-pin'), savePinBtn=$('save-pin-btn'), set2fa=$('set-2fa');
const setDailyLimit=$('set-daily-limit'), setMonthlyLimit=$('set-monthly-limit'), dailySpentSpan=$('daily-spent'), monthlySpentSpan=$('monthly-spent'), saveLimitsBtn=$('save-limits-btn');
const templatesList=$('templates-list');
const balanceChart=$('balance-chart');
const expensePieChart=$('expense-pie-chart');
const forecastAmount=$('forecast-amount'), comparisonText=$('comparison-text'), heatmapDays=$('heatmap-days');
const rateUsd=$('rate-usd'), rateEur=$('rate-eur');
const antiPhishingMsg=$('anti-phishing-msg');
const toggleBalanceBtn=$('toggle-balance-visibility');
const colorPicker=$('color-picker');
const texturePicker=$('texture-picker');
const splitBtn=$('split-btn');
const splitModal=$('split-modal'), splitTotal=$('split-total'), splitParticipants=$('split-participants'), addSplitRow=$('add-split-row'), splitSubmitBtn=$('split-submit-btn'), splitCancelBtn=$('split-cancel-btn'), splitError=$('split-error');
const giftCardModal=$('gift-card-modal'), giftAmount=$('gift-amount'), giftRecipient=$('gift-recipient'), giftCreateBtn=$('gift-create-btn'), giftCancelBtn=$('gift-cancel-btn'), giftError=$('gift-error');
const stickerPicker=$('sticker-picker');
const userAvatarContainer=$('user-avatar-container');

// ---------- НАВИГАЦИЯ ----------
function showScreen(s) {
    loginScreen.classList.remove('active'); pinLoginScreen.classList.remove('active'); registerScreen.classList.remove('active'); bankScreen.classList.remove('active');
    s.classList.add('active');
}

// ---------- ОБНОВЛЕНИЕ UI ----------
function updateBankUI() {
    if(!currentUserData) return;
    const u = currentUserData;
    resetLimitsIfNeeded(u);
    userGreeting.textContent = u.name;
    if (u.avatar) userAvatar.innerHTML = `<img src="${u.avatar}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;">`;
    else userAvatar.textContent = getAvatar(u.name);

    balanceDisplay.textContent = balanceVisible ? u.balance.toLocaleString()+' ₽' : '••••• ₽';
    balanceDisplay.style.filter = balanceVisible ? 'none' : 'blur(5px)';
    accountNumberDisplay.textContent = 'Счёт: '+u.accountNumber;
    cashbackDisplay.textContent = (u.cashback||0).toLocaleString()+' ₽';

    if (!u.cards || !Array.isArray(u.cards) || u.cards.length===0) {
        u.cards = [{ number: generateCardNumber(), expiry: '12/28', cvv: '123', color: 'purple', blocked: false, nickname: '', texture: 'default', currency: 'RUB' }];
        u.currentCardIndex = 0;
    }
    const card = u.cards[u.currentCardIndex];
    cardNumberDisplay.textContent = formatCard(card.number);
    cardHolder.textContent = u.name;
    cardExpiry.textContent = card.expiry;
    cardCounter.textContent = (u.currentCardIndex+1)+'/'+u.cards.length;
    cardNickname.textContent = card.nickname || '';
    blockCardBtn.textContent = card.blocked ? '🔓 Разблокировать' : '🔒 Заблокировать';

    applyCardColor(card.color);
    applyCardTexture(card.texture || 'default');
    document.querySelectorAll('.color-dot').forEach(d => d.classList.toggle('active', d.dataset.color===card.color));
    document.querySelectorAll('.texture-dot').forEach(d => d.classList.toggle('active', d.dataset.texture===(card.texture||'default')));

    checkCardExpiry(card);
    renderHistory(u);

    if(savingsData) {
        savingsSection.style.display='block';
        savingsName.textContent = savingsData.name||'Копилка';
        savingsGoalDisplay.textContent = (savingsData.goal||0).toLocaleString()+' ₽';
        savingsCurrent.textContent = (savingsData.current||0).toLocaleString()+' ₽';
        const pct = savingsData.goal>0 ? Math.min(100, Math.round((savingsData.current/savingsData.goal)*100)) : 0;
        savingsProgress.style.width = pct+'%';
        savingsPercent.textContent = pct+'%';
    } else { savingsSection.style.display='none'; }

    drawBalanceChart();
    drawExpensePieChart();
    calculateForecast();
    compareWithLastMonth();
    drawHeatmap();
}

function applyCardColor(color) {
    const el = $('bank-card-front');
    el.style.background = color==='gold' ? 'linear-gradient(135deg, #ffd700, #b8860b)' :
                           color==='black' ? 'linear-gradient(135deg, #1a1a1a, #000)' :
                           'linear-gradient(135deg, #1a1a3a, #0f0f2a)';
}
function applyCardTexture(texture) {
    const el = $('bank-card-front');
    el.style.backgroundImage = texture==='marble' ? 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'><filter id=\'n\'><feTurbulence baseFrequency=\'0.05\' result=\'t\'/><feColorMatrix values=\'0 0 0 1 0  0 0 0 0.9 0  0 0 0 0.8 0  0 0 0 0.2 0\' in=\'t\'/></filter><rect width=\'100%\' height=\'100%\' filter=\'url(#n)\'/></svg>")' :
                               texture==='carbon' ? 'repeating-linear-gradient(45deg, #222, #333 10px, #222 20px)' : '';
}

function renderHistory(u) {
    const filter = historyFilter.value;
    let items = u.history || [];
    if (filter!=='all') items = items.filter(h => {
        if (filter==='income') return h.type==='income';
        if (filter==='expense') return h.type==='expense';
        if (filter==='transfer') return h.type==='expense' && h.description.includes('Перевод');
        if (filter==='deposit') return h.type==='income' && h.description.includes('Пополнение');
        return true;
    });
    historyList.innerHTML = items.length ? items.slice(0,20).map(h => {
        const sign = h.type==='income'?'+':'-', cls = h.type==='income'?'income':'expense';
        const cat = categorizeTransaction(h.description);
        return `<div class="history-item">
            <div class="history-info"><div class="history-desc">${h.description} ${cat?`<span style="font-size:11px;color:#888;">(${cat})</span>`:''}</div><div class="history-date">${h.date}</div></div>
            <div class="history-amount ${cls}">${sign}${h.amount.toLocaleString()} ₽</div>
        </div>`;
    }).join('') : '<p style="color:#666;text-align:center;padding:20px;">Нет операций</p>';
}

function drawBalanceChart() {
    if(!balanceChart||!currentUserData) return;
    const ctx=balanceChart.getContext('2d');
    const history = currentUserData.balanceHistory || [];
    ctx.clearRect(0,0,balanceChart.width,balanceChart.height);
    if (history.length<2) { ctx.fillStyle='#888'; ctx.fillText('Недостаточно данных',10,20); return; }
    const points = history.slice(-7);
    const maxV=Math.max(...points.map(p=>p.balance),1), minV=Math.min(...points.map(p=>p.balance),0);
    ctx.beginPath(); ctx.strokeStyle='#6c5ce7'; ctx.lineWidth=2;
    points.forEach((p,i)=>{
        const x=(i/(points.length-1))*(balanceChart.width-20)+10;
        const y=balanceChart.height-10-((p.balance-minV)/(maxV-minV||1))*(balanceChart.height-20);
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
    ctx.fillStyle='#888'; ctx.font='10px sans-serif';
    ctx.fillText(minV.toLocaleString()+'₽',5,balanceChart.height-5);
    ctx.fillText(maxV.toLocaleString()+'₽',5,15);
}

function drawExpensePieChart() {
    if(!expensePieChart||!currentUserData) return;
    const ctx=expensePieChart.getContext('2d');
    const cats = { 'Переводы':0, 'Пополнения':0, 'Прочее':0 };
    (currentUserData.history||[]).forEach(h=>{
        if (h.type==='expense') {
            if (h.description.includes('Перевод')) cats['Переводы']+=h.amount;
            else cats['Прочее']+=h.amount;
        } else if (h.type==='income') cats['Пополнения']+=h.amount;
    });
    const total = Object.values(cats).reduce((a,b)=>a+b,0)||1;
    const colors=['#ff6b6b','#00d2a0','#ffd700'];
    let start = -Math.PI/2, i=0;
    ctx.clearRect(0,0,expensePieChart.width,expensePieChart.height);
    for (const [label,amount] of Object.entries(cats)) {
        const slice = (amount/total)*Math.PI*2;
        ctx.beginPath(); ctx.fillStyle=colors[i%3];
        ctx.moveTo(100,100); ctx.arc(100,100,80,start,start+slice); ctx.fill();
        start += slice; i++;
    }
    ctx.fillStyle='#fff'; ctx.font='11px sans-serif';
    ctx.fillText('Переводы',10,190); ctx.fillText('Пополнения',10,205); ctx.fillText('Прочее',10,220);
}

function calculateForecast() {
    if (!currentUserData) return;
    const hist = currentUserData.history||[];
    const now=new Date(), daysLeft=new Date(now.getFullYear(),now.getMonth()+1,0).getDate()-now.getDate();
    let weekExp=0;
    const weekAgo=new Date(now.getTime()-7*86400000);
    hist.forEach(h=>{ if(h.type==='expense'&&new Date(h.date)>=weekAgo) weekExp+=h.amount; });
    const avg=weekExp/7||0;
    forecastAmount.textContent = Math.round(currentUserData.balance - avg*daysLeft).toLocaleString()+' ₽';
}

function compareWithLastMonth() {
    if (!currentUserData) return;
    const now=new Date(), thisM=now.getMonth(), lastM=thisM===0?11:thisM-1;
    let thisE=0, lastE=0;
    (currentUserData.history||[]).forEach(h=>{
        const d=new Date(h.date);
        if(h.type==='expense'){
            if(d.getMonth()===thisM) thisE+=h.amount;
            else if(d.getMonth()===lastM) lastE+=h.amount;
        }
    });
    const diff=thisE-lastE, pct=lastE?Math.round((diff/lastE)*100):0;
    comparisonText.textContent = `${pct>0?'+':''}${pct}% (${diff>0?'больше':'меньше'})`;
}

function drawHeatmap() {
    if(!currentUserData) return;
    const days=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
    const expByDay=[0,0,0,0,0,0,0];
    const now=new Date();
    (currentUserData.history||[]).forEach(h=>{
        if(h.type==='expense'){
            const d=new Date(h.date);
            if(d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()){
                expByDay[(d.getDay()+6)%7]+=h.amount;
            }
        }
    });
    const max=Math.max(...expByDay,1);
    heatmapDays.innerHTML = days.map((name,i)=>{
        let cls='cool';
        if(expByDay[i]/max>0.6) cls='hot';
        else if(expByDay[i]/max>0.3) cls='warm';
        return `<div class="day-cell ${cls}">${name}<br>${expByDay[i]||0}₽</div>`;
    }).join('');
}

function categorizeTransaction(desc) {
    if(desc.includes('кафе')||desc.includes('еда')) return '🍕 Еда';
    if(desc.includes('такси')||desc.includes('транспорт')) return '🚕 Транспорт';
    if(desc.includes('ЖКХ')||desc.includes('квартира')) return '🏠 ЖКХ';
    if(desc.includes('Перевод')) return '💸 Перевод';
    return '';
}

function checkCardExpiry(card) {
    if(!card||card.isVirtual) return;
    const [m,y]=card.expiry.split('/');
    const exp=new Date(2000+parseInt(y),parseInt(m)-1);
    const diff=Math.ceil((exp-new Date())/86400000);
    if(diff<=30&&diff>0){
        showToast(`Срок карты истекает через ${diff} дн.`,'info');
        notify('Срок карты',`Истекает через ${diff} дней`);
    }
}

// ---------- АНИМАЦИЯ БАЛАНСА ----------
let balanceAnimFrame;
function animateBalance(target) {
    if(balanceAnimFrame) cancelAnimationFrame(balanceAnimFrame);
    const start=currentUserData?currentUserData.balance:0;
    const diff=target-start, duration=400, startTime=performance.now();
    function step(now) {
        const p=Math.min((now-startTime)/duration,1);
        const val=Math.round(start+diff*p);
        if(balanceVisible) balanceDisplay.textContent=val.toLocaleString()+' ₽';
        if(p<1) balanceAnimFrame=requestAnimationFrame(step);
    }
    balanceAnimFrame=requestAnimationFrame(step);
}

// ---------- КУРСЫ ВАЛЮТ ----------
async function fetchRates() {
    try {
        const res=await fetch('https://api.exchangerate-api.com/v4/latest/RUB');
        const data=await res.json();
        rateUsd.textContent=(1/data.rates.USD).toFixed(2)+' ₽';
        rateEur.textContent=(1/data.rates.EUR).toFixed(2)+' ₽';
    } catch(e) { rateUsd.textContent=rateEur.textContent='—'; }
}
setInterval(fetchRates,60000);
fetchRates();

// ---------- ОБРАБОТЧИКИ СОБЫТИЙ ----------
// баланс
toggleBalanceBtn.onclick=()=>{ balanceVisible=!balanceVisible; toggleBalanceBtn.textContent=balanceVisible?'👁️ Скрыть баланс':'👁️ Показать баланс'; updateBankUI(); };

// цвет карты
colorPicker.onclick=async(e)=>{
    if(e.target.classList.contains('color-dot')){
        const color=e.target.dataset.color;
        currentUserData.cards[currentUserData.currentCardIndex].color=color;
        await updateDoc(doc(db,'users',currentUserDocId),{cards:currentUserData.cards});
        updateBankUI();
    }
};

// текстура карты
texturePicker.onclick=async(e)=>{
    if(e.target.classList.contains('texture-dot')){
        const tex=e.target.dataset.texture;
        currentUserData.cards[currentUserData.currentCardIndex].texture=tex;
        await updateDoc(doc(db,'users',currentUserDocId),{cards:currentUserData.cards});
        updateBankUI();
    }
};

// переименование карты
renameCardBtn.onclick=async()=>{
    const name=prompt('Название карты:');
    if(name){
        currentUserData.cards[currentUserData.currentCardIndex].nickname=name;
        await updateDoc(doc(db,'users',currentUserDocId),{cards:currentUserData.cards});
        updateBankUI(); showToast('Название сохранено','success');
    }
};

// блокировка карты
blockCardBtn.onclick=async()=>{
    const card=currentUserData.cards[currentUserData.currentCardIndex];
    card.blocked=!card.blocked;
    await updateDoc(doc(db,'users',currentUserDocId),{cards:currentUserData.cards});
    updateBankUI();
    showToast(card.blocked?'Карта заблокирована':'Карта разблокирована','info');
};

// заморозка всех карт
const freezeAllBtn=document.createElement('button');
freezeAllBtn.className='btn-small';
freezeAllBtn.textContent='❄️ Заморозить все';
freezeAllBtn.style.cssText='margin-top:6px;width:100%;background:#ff6b6b;';
freezeAllBtn.onclick=async()=>{
    currentUserData.cards.forEach(c=>c.blocked=true);
    await updateDoc(doc(db,'users',currentUserDocId),{cards:currentUserData.cards});
    updateBankUI(); showToast('Все карты заморожены','info');
};
document.querySelector('.card-container').appendChild(freezeAllBtn);

// виртуальная карта
virtualCardBtn.onclick=async()=>{
    if(currentUserData.cards.length>=MAX_CARDS){showToast('Максимум карт','error');return;}
    const vCard={
        number:generateCardNumber(),expiry:'12/30',cvv:String(Math.floor(Math.random()*900)+100),
        color:'purple',blocked:false,nickname:'Виртуальная',texture:'default',currency:'RUB',
        isVirtual:true,balance:0
    };
    currentUserData.cards.push(vCard);
    currentUserData.currentCardIndex=currentUserData.cards.length-1;
    await updateDoc(doc(db,'users',currentUserDocId),{cards:currentUserData.cards,currentCardIndex:currentUserData.currentCardIndex});
    updateBankUI(); showToast('Виртуальная карта создана','success');
};

// подарочная карта
giftCardBtn.onclick=()=>giftCardModal.classList.add('active');
giftCancelBtn.onclick=()=>giftCardModal.classList.remove('active');
giftCreateBtn.onclick=async()=>{
    const amt=parseInt(giftAmount.value), recipient=giftRecipient.value.trim().toLowerCase();
    if(!amt||!recipient){giftError.textContent='Заполните поля';return;}
    const found=await findUser(recipient);
    if(!found||found.uid===currentUserDocId){giftError.textContent='Неверный получатель';return;}
    if(currentUserData.balance<amt){giftError.textContent='Недостаточно средств';return;}
    currentUserData.balance-=amt;
    await updateDoc(doc(db,'users',currentUserDocId),{balance:increment(-amt)});
    await addTransaction(currentUserDocId,'expense','Подарочная карта для '+found.data.name,amt);
    await updateDoc(doc(db,'users',found.uid),{balance:increment(amt)});
    await addTransaction(found.uid,'income','Подарочная карта от '+currentUserData.name,amt);
    giftCardModal.classList.remove('active');
    animateBalance(currentUserData.balance);
    updateBankUI(); showToast('Подарочная карта отправлена','success');
};

// история: фильтр
historyFilter.onchange=()=>updateBankUI();

// стикеры
let selectedSticker='';
stickerPicker.onclick=e=>{
    if(e.target.classList.contains('sticker')){
        selectedSticker=e.target.dataset.sticker;
        transferComment.value=(transferComment.value+' '+selectedSticker).trim();
        document.querySelectorAll('.sticker').forEach(s=>s.classList.remove('selected'));
        e.target.classList.add('selected');
    }
};

// сплит
splitBtn.onclick=()=>{splitTotal.value='';splitParticipants.innerHTML=`<div class="split-row"><input type="text" class="split-user" placeholder="Логин"><input type="number" class="split-amount" placeholder="Сумма"></div>`;splitModal.classList.add('active');};
splitCancelBtn.onclick=()=>splitModal.classList.remove('active');
addSplitRow.onclick=()=>{const row=document.createElement('div');row.className='split-row';row.innerHTML='<input type="text" class="split-user" placeholder="Логин"><input type="number" class="split-amount" placeholder="Сумма">';splitParticipants.appendChild(row);};
splitSubmitBtn.onclick=async()=>{
    const total=parseInt(splitTotal.value);
    if(!total||total<=0){splitError.textContent='Введите общую сумму';return;}
    const rows=splitParticipants.querySelectorAll('.split-row');
    let sum=0; const transfers=[];
    for(const row of rows){
        const user=row.querySelector('.split-user').value.trim().toLowerCase();
        const amt=parseInt(row.querySelector('.split-amount').value);
        if(user&&amt>0){
            const found=await findUser(user);
            if(!found||found.uid===currentUserDocId){splitError.textContent='Неверный получатель: '+user;return;}
            transfers.push({uid:found.uid,name:found.data.name,amount:amt});
            sum+=amt;
        }
    }
    if(sum!==total){splitError.textContent='Суммы не совпадают';return;}
    if(currentUserData.balance<total){splitError.textContent='Недостаточно средств';return;}
    for(const t of transfers){
        await updateDoc(doc(db,'users',currentUserDocId),{balance:increment(-t.amount)});
        await updateDoc(doc(db,'users',t.uid),{balance:increment(t.amount)});
        await addTransaction(currentUserDocId,'expense','Сплит: перевод для '+t.name,t.amount);
        await addTransaction(t.uid,'income','Сплит: перевод от '+currentUserData.name,t.amount);
    }
    currentUserData.balance-=total;
    splitModal.classList.remove('active');
    animateBalance(currentUserData.balance);
    updateBankUI(); showToast('Сплит выполнен','success');
};

// перевод (с комиссией и отменой)
transferSubmit.onclick=async()=>{
    const to=transferTo.value.trim().toLowerCase(), amt=parseInt(transferAmount.value), cmt=transferComment.value.trim();
    transferError.textContent='';
    if(!to||!amt||amt<=0){transferError.textContent='Заполните поля';return;}
    const found=await findUser(to);
    if(!found){transferError.textContent='Получатель не найден';return;}
    if(found.uid===currentUserDocId){transferError.textContent='Нельзя перевести себе';return;}
    const commission=Math.round(amt*COMMISSION_RATE), totalDeduction=amt+commission;
    if(currentUserData.balance<totalDeduction){transferError.textContent=`Недостаточно средств (комиссия ${commission} ₽)`;return;}
    resetLimitsIfNeeded(currentUserData);
    if(currentUserData.dailyLimit&&(currentUserData.dailySpent||0)+totalDeduction>currentUserData.dailyLimit){transferError.textContent='Превышен дневной лимит';return;}
    if(currentUserData.monthlyLimit&&(currentUserData.monthlySpent||0)+totalDeduction>currentUserData.monthlyLimit){transferError.textContent='Превышен месячный лимит';return;}

    const cashback=Math.floor(amt*CASHBACK_RATE);
    const desc1=`Перевод для ${found.data.name}${cmt?' — «'+cmt+'»':''}`;
    const desc2=`Перевод от ${currentUserData.name}${cmt?' — «'+cmt+'»':''}`;

    await updateDoc(doc(db,'users',currentUserDocId),{
        balance:increment(-totalDeduction), cashback:increment(cashback),
        dailySpent:increment(totalDeduction), monthlySpent:increment(totalDeduction)
    });
    await addTransaction(currentUserDocId,'expense',desc1,amt,cmt);
    await updateDoc(doc(db,'users',found.uid),{balance:increment(amt)});
    await addTransaction(found.uid,'income',desc2,amt,cmt);

    currentUserData.balance-=totalDeduction;
    currentUserData.cashback=(currentUserData.cashback||0)+cashback;
    currentUserData.dailySpent=(currentUserData.dailySpent||0)+totalDeduction;
    currentUserData.monthlySpent=(currentUserData.monthlySpent||0)+totalDeduction;
    currentUserData.history.unshift({type:'expense',description:desc1,amount:amt,comment:cmt,date:new Date().toLocaleString('ru-RU')});

    lastTransferData={from:currentUserDocId,to:found.uid,amount:amt};
    lastTransferTime=Date.now();

    playSound('transfer');
    transferModal.classList.remove('active');
    animateBalance(currentUserData.balance);
    updateBankUI();
    showUndoButton();
    notify('Перевод',`-${totalDeduction} ₽ (комиссия ${commission} ₽)`);
    maybeSaveTemplate(to,amt,cmt);
};

function showUndoButton(){
    const toast=document.createElement('div');
    toast.className='toast info';
    toast.innerHTML=`Перевод выполнен. <button id="undo-transfer" style="background:transparent;border:1px solid white;color:white;padding:2px 8px;border-radius:6px;cursor:pointer;">Отменить</button>`;
    document.body.appendChild(toast);
    const undoBtn=toast.querySelector('#undo-transfer');
    undoBtn.onclick=async()=>{
        if(Date.now()-lastTransferTime>MAX_UNDO_SECONDS*1000){showToast('Время отмены истекло','error');return;}
        const {from,to,amount}=lastTransferData;
        currentUserData.balance+=amount;
        await updateDoc(doc(db,'users',from),{balance:increment(amount)});
        await updateDoc(doc(db,'users',to),{balance:increment(-amount)});
        await addTransaction(from,'income','Возврат отменённого перевода',amount);
        await addTransaction(to,'expense','Отмена перевода',amount);
        showToast('Перевод отменён','success');
        updateBankUI();
    };
    setTimeout(()=>toast.remove(),3500);
}

async function addTransaction(uid,type,desc,amount,comment){
    const ref=doc(db,'users',uid); const snap=await getDoc(ref); const d=snap.data();
    const h=d.history||[]; h.unshift({type,description:desc,amount,comment:comment||'',date:new Date().toLocaleString('ru-RU')});
    if(h.length>50) h.length=50;
    await updateDoc(ref,{history:h});
}

async function maybeSaveTemplate(to,amount,comment){
    if(confirm('Сохранить как шаблон?')){
        const name=prompt('Название шаблона:','Перевод для '+to);
        if(name){
            currentUserData.templates=currentUserData.templates||[];
            currentUserData.templates.push({name,to,amount,comment});
            await updateDoc(doc(db,'users',currentUserDocId),{templates:currentUserData.templates});
            showToast('Шаблон сохранён','success');
        }
    }
}

// ... (продолжение ниже: вход, регистрация, пополнение, настройки, QR и т.д.)
// ===== РЕГИСТРАЦИЯ =====
registerSubmitBtn.onclick = async () => {
    const name = regName.value.trim();
    const login = regLogin.value.trim().toLowerCase();
    const password = regPassword.value;
    const phone = regPhone.value.trim();
    const pin = regPin.value.trim();
    const antiPhishing = regAntiPhishing.value.trim();

    regError.textContent = '';
    if (!name || !login || !password) { regError.textContent = 'Заполните обязательные поля'; return; }
    if (password.length < 6) { regError.textContent = 'Пароль от 6 символов'; return; }
    if (pin && pin.length !== 4) { regError.textContent = 'PIN из 4 цифр'; return; }
    if (name.length > MAX_NAME_LENGTH) { regError.textContent = `Имя до ${MAX_NAME_LENGTH} символов`; return; }
    if (login.length > MAX_LOGIN_LENGTH) { regError.textContent = `Логин до ${MAX_LOGIN_LENGTH} символов`; return; }

    try {
        const exists = await findUser(login);
        if (exists) { regError.textContent = 'Логин занят'; return; }

        const email = login + '@bank.local';
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;
        const deviceId = getDeviceId();
        const accountNumber = generateAccountNumber();
        const card = generateCardNumber();
        const exp = new Date(); exp.setFullYear(exp.getFullYear() + 3);
        const expStr = ('0' + (exp.getMonth() + 1)).slice(-2) + '/' + exp.getFullYear().toString().slice(-2);

        const userData = {
            name, login, email, phone, accountNumber,
            cards: [{
                number: card, expiry: expStr, cvv: String(Math.floor(Math.random() * 900) + 100),
                color: 'purple', blocked: false, nickname: '', texture: 'default', currency: 'RUB'
            }],
            currentCardIndex: 0,
            balance: 0, cashback: 0,
            devices: [deviceId], history: [],
            pin: pin || null,
            twoFactorEnabled: false,
            antiPhishingPhrase: antiPhishing,
            dailyLimit: 0, monthlyLimit: 0,
            dailySpent: 0, monthlySpent: 0,
            lastResetDay: new Date().toDateString(),
            lastResetMonth: (new Date().getMonth() + 1) + '-' + new Date().getFullYear(),
            templates: [],
            balanceHistory: [{ date: new Date().toISOString().split('T')[0], balance: 0 }],
            avatar: null,
            loginLogs: [],
            largeTransactionLimit: 0,
            soundTheme: 'default'
        };

        await setDoc(doc(db, 'users', uid), userData);
        currentUserDocId = uid;
        currentUserData = userData;
        regName.value = ''; regLogin.value = ''; regPhone.value = ''; regPassword.value = ''; regPin.value = ''; regAntiPhishing.value = '';
        showScreen(bankScreen);
        loadSavings();
        updateBankUI();
        playSound('success');
        showToast('Аккаунт создан!', 'success');
    } catch (e) {
        regError.textContent = 'Ошибка: ' + e.message;
    }
};

// ===== ВХОД =====
loginBtn.onclick = async () => {
    const login = loginInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    loginError.textContent = '';
    if (!login || !password) { loginError.textContent = 'Заполните поля'; return; }

    try {
        const { uid, data: userData } = await loginWith2FA(login, password);
        const deviceId = getDeviceId();
        let devices = userData.devices || [];

        if (!devices.includes(deviceId)) {
            if (devices.length >= MAX_DEVICES) {
                await signOut(auth);
                loginError.textContent = 'Лимит устройств (' + MAX_DEVICES + ')';
                return;
            }
            devices.push(deviceId);
            await updateDoc(doc(db, 'users', uid), { devices });
            userData.devices = devices;
            showToast('Новое устройство привязано!', 'info');
        }

        currentUserDocId = uid;
        currentUserData = userData;
        passwordInput.value = '';
        loginInput.value = '';
        loginError.textContent = '';
        showScreen(bankScreen);
        loadSavings();
        updateBankUI();
        logLogin();
        notify('Legacy Bank', `Добро пожаловать, ${userData.name}!`);
    } catch (e) {
        loginError.textContent = e.message || 'Неверный логин или пароль';
    }
};

// ===== ВХОД ПО PIN =====
loginPinBtn.onclick = () => showScreen(pinLoginScreen);
pinBackBtn.onclick = () => showScreen(loginScreen);
pinSubmitBtn.onclick = async () => {
    const pin = pinInput.value.trim();
    if (!pin || pin.length !== 4) { pinError.textContent = 'Введите 4 цифры'; return; }

    const all = await getDocs(collection(db, 'users'));
    let found = null;
    for (const d of all.docs) {
        if (d.data().pin === pin) { found = { uid: d.id, data: d.data() }; break; }
    }
    if (!found) { pinError.textContent = 'Неверный PIN'; return; }

    currentUserDocId = found.uid;
    currentUserData = found.data;
    pinInput.value = '';
    pinError.textContent = '';
    showScreen(bankScreen);
    loadSavings();
    updateBankUI();
    notify('Legacy Bank', `С возвращением, ${found.data.name}!`);
};

// ===== 2FA =====
async function loginWith2FA(login, password) {
    const email = login + '@bank.local';
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const userSnap = await getDoc(doc(db, 'users', userCredential.user.uid));
    if (!userSnap.exists()) throw new Error('Пользователь не найден');
    const userData = userSnap.data();

    if (userData.twoFactorEnabled) {
        twoFaCode.value = '';
        twoFaError.textContent = '';
        twoFaModal.classList.add('active');
        return new Promise((resolve, reject) => {
            twoFaSubmit.onclick = () => {
                if (twoFaCode.value.trim() === '1234') {
                    twoFaModal.classList.remove('active');
                    resolve({ uid: userCredential.user.uid, data: userData });
                } else {
                    twoFaError.textContent = 'Неверный код';
                }
            };
            twoFaCancel.onclick = () => {
                twoFaModal.classList.remove('active');
                reject(new Error('2FA отменена'));
            };
        });
    }
    return { uid: userCredential.user.uid, data: userData };
}

// ===== ЛОГИРОВАНИЕ ВХОДА =====
async function logLogin() {
    const log = {
        timestamp: new Date().toISOString(),
        ip: '127.0.0.1', // заглушка
        device: getDeviceId()
    };
    currentUserData.loginLogs = currentUserData.loginLogs || [];
    currentUserData.loginLogs.unshift(log);
    if (currentUserData.loginLogs.length > 20) currentUserData.loginLogs.length = 20;
    await updateDoc(doc(db, 'users', currentUserDocId), { loginLogs: currentUserData.loginLogs });
}

// ===== ВЫХОД =====
logoutBtn.onclick = async () => {
    await signOut(auth);
    currentUserData = null;
    currentUserDocId = null;
    savingsData = null;
    showScreen(loginScreen);
};

// ===== ПОПОЛНЕНИЕ =====
depositBtn.onclick = () => { depositAmount.value = ''; depositError.textContent = ''; depositModal.classList.add('active'); };
depositCancel.onclick = () => depositModal.classList.remove('active');
depositSubmit.onclick = async () => {
    const amt = parseInt(depositAmount.value);
    if (!amt || amt <= 0) { depositError.textContent = 'Введите сумму'; return; }

    await updateDoc(doc(db, 'users', currentUserDocId), { balance: increment(amt) });
    await addTransaction(currentUserDocId, 'income', 'Пополнение', amt);
    currentUserData.balance += amt;
    currentUserData.history.unshift({ type: 'income', description: 'Пополнение', amount: amt, comment: '', date: new Date().toLocaleString('ru-RU') });

    depositModal.classList.remove('active');
    animateBalance(currentUserData.balance);
    updateBankUI();
    playSound('success');
    showToast('Пополнено на ' + amt.toLocaleString() + ' ₽', 'success');
};

// ===== ПЕРЕВОД (заглушка, если не определён выше) =====
// уже определён

// ===== ШАБЛОНЫ =====
templatesBtn.onclick = () => {
    const temps = currentUserData.templates || [];
    templateSelectList.innerHTML = temps.length ? temps.map((t, i) => `
        <button class="btn-small" style="width:100%;margin-bottom:4px;" onclick="selectTemplate(${i})">${t.name} → ${t.to} (${t.amount}₽)</button>
    `).join('') : '<p style="color:#888;">Нет шаблонов</p>';
    templateSelectModal.classList.add('active');
};
templateSelectCloseBtn.onclick = () => templateSelectModal.classList.remove('active');
templateSelectModal.onclick = (e) => { if (e.target === templateSelectModal) templateSelectModal.classList.remove('active'); };
window.selectTemplate = (i) => {
    const t = currentUserData.templates[i];
    transferTo.value = t.to;
    transferAmount.value = t.amount;
    transferComment.value = t.comment || '';
    templateSelectModal.classList.remove('active');
    transferModal.classList.add('active');
};
window.deleteTemplate = async (i) => {
    currentUserData.templates.splice(i, 1);
    await updateDoc(doc(db, 'users', currentUserDocId), { templates: currentUserData.templates });
    renderTemplatesList();
    showToast('Шаблон удалён', 'info');
};
function renderTemplatesList() {
    const temps = currentUserData.templates || [];
    templatesList.innerHTML = temps.length ? temps.map((t, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #1e1e2e;">
            <span>${t.name}: ${t.to} (${t.amount}₽)</span>
            <button class="btn-small" style="width:auto;" onclick="deleteTemplate(${i})">🗑️</button>
        </div>
    `).join('') : '<p style="color:#888;">Нет шаблонов</p>';
}

// ===== НАСТРОЙКИ =====
settingsBtn.onclick = () => {
    if (!currentUserData) return;
    setPhone.value = currentUserData.phone || '';
    setPin.value = '';
    set2fa.value = currentUserData.twoFactorEnabled ? 'on' : 'off';
    setDailyLimit.value = currentUserData.dailyLimit || '';
    setMonthlyLimit.value = currentUserData.monthlyLimit || '';
    resetLimitsIfNeeded(currentUserData);
    dailySpentSpan.textContent = (currentUserData.dailySpent || 0).toLocaleString() + ' ₽';
    monthlySpentSpan.textContent = (currentUserData.monthlySpent || 0).toLocaleString() + ' ₽';
    renderTemplatesList();
    settingsModal.classList.add('active');
};
settingsCloseBtn.onclick = () => settingsModal.classList.remove('active');
settingsModal.onclick = (e) => { if (e.target === settingsModal) settingsModal.classList.remove('active'); };

document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.onclick = () => {
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.settings-tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    };
});

savePhoneBtn.onclick = async () => {
    const phone = setPhone.value.trim();
    currentUserData.phone = phone;
    await updateDoc(doc(db, 'users', currentUserDocId), { phone });
    showToast('Телефон сохранён', 'success');
};
savePinBtn.onclick = async () => {
    const pin = setPin.value.trim();
    if (!pin || pin.length !== 4) { showToast('Введите 4 цифры', 'error'); return; }
    currentUserData.pin = pin;
    await updateDoc(doc(db, 'users', currentUserDocId), { pin });
    showToast('PIN обновлён', 'success');
};
set2fa.onchange = async () => {
    const val = set2fa.value === 'on';
    currentUserData.twoFactorEnabled = val;
    await updateDoc(doc(db, 'users', currentUserDocId), { twoFactorEnabled: val });
    showToast('2FA ' + (val ? 'включена' : 'выключена'), 'info');
};
saveLimitsBtn.onclick = async () => {
    const dl = parseInt(setDailyLimit.value) || 0;
    const ml = parseInt(setMonthlyLimit.value) || 0;
    currentUserData.dailyLimit = dl;
    currentUserData.monthlyLimit = ml;
    await updateDoc(doc(db, 'users', currentUserDocId), { dailyLimit: dl, monthlyLimit: ml });
    showToast('Лимиты сохранены', 'success');
};

// ===== QR =====
myQrBtn.onclick = () => {
    if (!currentUserData) return;
    const data = JSON.stringify({ login: currentUserData.login, name: currentUserData.name, account: currentUserData.accountNumber });
    qrContainer.innerHTML = '';
    qrModalTitle.textContent = 'Ваш QR-код';
    qrInfo.textContent = currentUserData.name + ' • ' + currentUserData.accountNumber;
    if (typeof QRCode === 'undefined') { qrContainer.innerHTML = '<p style="color:#ff6b6b;">Библиотека QR не загружена</p>'; return; }
    QRCode.toCanvas(data, { width: 220, margin: 2 }, (err, canvas) => {
        if (err) qrContainer.innerHTML = '<p style="color:#ff6b6b;">Ошибка генерации</p>';
        else qrContainer.appendChild(canvas);
    });
    qrModal.classList.add('active');
};
qrCloseBtn.onclick = () => qrModal.classList.remove('active');
qrModal.onclick = (e) => { if (e.target === qrModal) qrModal.classList.remove('active'); };

scanQrBtn.onclick = async () => {
    scannerResult.textContent = '';
    scannerContainer.innerHTML = '';
    scannerModal.classList.add('active');
    try {
        scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 300, height: 300 } });
        const video = document.createElement('video');
        video.srcObject = scannerStream;
        video.setAttribute('playsinline', true);
        video.play();
        scannerContainer.appendChild(video);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const interval = setInterval(() => {
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(img.data, img.width, img.height);
                if (code) {
                    clearInterval(interval);
                    stopScanner();
                    try {
                        const qd = JSON.parse(code.data);
                        scannerResult.innerHTML = `<span style="color:#4ade80;">✅ ${qd.name}</span><br><small>Счёт: ${qd.account}</small>`;
                        setTimeout(() => {
                            scannerModal.classList.remove('active');
                            transferTo.value = qd.login;
                            transferAmount.value = '';
                            transferComment.value = '';
                            recipientPreview.textContent = getAvatar(qd.name) + ' ' + qd.name + ' (счёт: ' + qd.account + ')';
                            recipientPreview.style.display = 'block';
                            transferModal.classList.add('active');
                        }, 800);
                    } catch (e) {
                        scannerResult.innerHTML = '<span style="color:#ff6b6b;">Неверный QR</span>';
                    }
                }
            }
        }, 500);
        video._scanInterval = interval;
    } catch (e) {
        scannerResult.innerHTML = '<span style="color:#ff6b6b;">Нет доступа к камере</span>';
    }
};
function stopScanner() {
    if (scannerStream) {
        scannerStream.getTracks().forEach(t => t.stop());
        scannerStream = null;
    }
}
scannerCloseBtn.onclick = () => { stopScanner(); scannerModal.classList.remove('active'); };
scannerModal.onclick = (e) => { if (e.target === scannerModal) { stopScanner(); scannerModal.classList.remove('active'); } };

// ===== ЧАТ =====
chatBtn.onclick = () => { chatModal.classList.add('active'); chatInput.focus(); };
chatInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
        const msg = chatInput.value.trim();
        if (!msg) return;
        chatMessages.innerHTML += `<div class="chat-msg user">${msg}</div>`;
        chatInput.value = '';
        setTimeout(() => {
            const r = msg.toLowerCase();
            let reply = 'Спасибо за обращение! Оператор скоро ответит.';
            if (r.includes('перевод')) reply = 'Переводы доступны в разделе «Перевести».';
            if (r.includes('блокировк')) reply = 'Проверьте лимит устройств (до 5).';
            if (r.includes('копилк')) reply = 'Копилка помогает накопить на цель.';
            if (r.includes('qr')) reply = 'QR-код — быстрый способ перевода.';
            if (r.includes('карт')) reply = 'Вы можете добавить до 5 карт в разделе карт.';
            chatMessages.innerHTML += `<div class="chat-msg bot">${reply}</div>`;
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 500);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
};
chatModal.onclick = (e) => { if (e.target === chatModal) chatModal.classList.remove('active'); };

// ===== КОПИЛКА =====
function loadSavings() {
    const saved = localStorage.getItem('savings_' + currentUserDocId);
    savingsData = saved ? JSON.parse(saved) : null;
}
function saveSavings() {
    if (savingsData) localStorage.setItem('savings_' + currentUserDocId, JSON.stringify(savingsData));
    else localStorage.removeItem('savings_' + currentUserDocId);
}
addToSavingsBtn.onclick = () => {
    if (!savingsData) return;
    if (savingsData.completed) {
        if (confirm('Вывести ' + savingsData.current.toLocaleString() + ' ₽ на счёт?')) {
            currentUserData.balance += savingsData.current;
            updateDoc(doc(db, 'users', currentUserDocId), { balance: increment(savingsData.current) });
            addTransaction(currentUserDocId, 'income', 'Вывод из копилки: ' + savingsData.name, savingsData.current);
            savingsData = null; saveSavings(); updateBankUI();
        }
        return;
    }
    const amt = parseInt(prompt('Сумма пополнения (₽):', '1000'));
    if (!amt || amt <= 0) return;
    if (amt > currentUserData.balance) { showToast('Недостаточно средств', 'error'); return; }
    currentUserData.balance -= amt;
    savingsData.current += amt;
    updateDoc(doc(db, 'users', currentUserDocId), { balance: increment(-amt) });
    addTransaction(currentUserDocId, 'expense', 'Пополнение копилки: ' + savingsData.name, amt);
    saveSavings(); updateBankUI();
    showToast('Копилка +' + amt.toLocaleString() + ' ₽', 'success');
};
closeSavingsBtn.onclick = () => {
    if (savingsData && !savingsData.completed) {
        if (confirm('Закрыть копилку? Деньги вернутся на счёт.')) {
            currentUserData.balance += savingsData.current;
            updateDoc(doc(db, 'users', currentUserDocId), { balance: increment(savingsData.current) });
            addTransaction(currentUserDocId, 'income', 'Возврат из копилки: ' + savingsData.name, savingsData.current);
            savingsData = null; saveSavings(); updateBankUI();
        }
    } else savingsSection.style.display = 'none';
};
// кнопка создания копилки
const piggyBtn = document.createElement('button');
piggyBtn.className = 'action-btn';
piggyBtn.innerHTML = '<span>🐷</span> Копилка';
piggyBtn.style.cssText = 'background:linear-gradient(135deg,#2a1a2e,#2a1a3a);color:#ffa500;border:1px solid #3a2a4e;';
piggyBtn.onclick = () => {
    if (!savingsData) {
        const name = prompt('Название цели:', 'На отпуск');
        if (!name) return;
        const goal = parseInt(prompt('Целевая сумма (₽):', '50000'));
        if (!goal || goal <= 0) return;
        savingsData = { name, goal, current: 0, completed: false };
        saveSavings();
        updateBankUI();
        showToast('Копилка создана!', 'success');
    } else {
        savingsSection.style.display = savingsSection.style.display === 'none' ? 'block' : 'none';
    }
};
document.getElementById('actions-container').appendChild(piggyBtn);

// ===== АВАТАР =====
userAvatarContainer.onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            currentUserData.avatar = ev.target.result;
            await updateDoc(doc(db, 'users', currentUserDocId), { avatar: ev.target.result });
            updateBankUI();
        };
        reader.readAsDataURL(file);
    };
    input.click();
};

// ===== АНТИФИШИНГ ПРИ ВХОДЕ =====
loginInput.addEventListener('blur', async () => {
    const val = loginInput.value.trim().toLowerCase();
    if (val.length >= 2) {
        const found = await findUser(val);
        if (found && found.data.antiPhishingPhrase) {
            antiPhishingMsg.textContent = 'Ваша фраза: ' + found.data.antiPhishingPhrase;
            antiPhishingMsg.style.display = 'block';
        } else {
            antiPhishingMsg.style.display = 'none';
        }
    }
});

// ===== ПРОЧЕЕ =====
registerBtn.onclick = () => showScreen(registerScreen);
backToLoginBtn.onclick = () => showScreen(loginScreen);
themeToggle.onclick = toggleTheme;
exportBtn.onclick = () => {
    if (currentUserData) exportStatement(currentUserData);
};

// переключение карт
prevCardBtn.onclick = () => {
    const idx = (currentUserData.currentCardIndex - 1 + currentUserData.cards.length) % currentUserData.cards.length;
    currentUserData.currentCardIndex = idx;
    updateDoc(doc(db, 'users', currentUserDocId), { currentCardIndex: idx });
    updateBankUI();
};
nextCardBtn.onclick = () => {
    const idx = (currentUserData.currentCardIndex + 1) % currentUserData.cards.length;
    currentUserData.currentCardIndex = idx;
    updateDoc(doc(db, 'users', currentUserDocId), { currentCardIndex: idx });
    updateBankUI();
};
addCardBtn.onclick = async () => {
    if (currentUserData.cards.length >= MAX_CARDS) { showToast('Максимум ' + MAX_CARDS + ' карт', 'error'); return; }
    const newCard = {
        number: generateCardNumber(),
        expiry: (() => { const d = new Date(); d.setFullYear(d.getFullYear() + 3); return ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear().toString().slice(-2); })(),
        cvv: String(Math.floor(Math.random() * 900) + 100),
        color: 'purple', blocked: false, nickname: '', texture: 'default', currency: 'RUB'
    };
    currentUserData.cards.push(newCard);
    currentUserData.currentCardIndex = currentUserData.cards.length - 1;
    await updateDoc(doc(db, 'users', currentUserDocId), { cards: currentUserData.cards, currentCardIndex: currentUserData.currentCardIndex });
    updateBankUI();
    showToast('Карта добавлена!', 'success');
};

// enter в полях
passwordInput.onkeydown = e => { if (e.key === 'Enter') loginBtn.onclick(); };
depositAmount.onkeydown = e => { if (e.key === 'Enter') depositSubmit.onclick(); };
transferAmount.onkeydown = e => { if (e.key === 'Enter') transferSubmit.onclick(); };

// закрытие модалок по фону
[depositModal, transferModal].forEach(m => {
    m.onclick = function(e) { if (e.target === m) m.classList.remove('active'); };
});

// автовход
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
            currentUserDocId = user.uid;
            currentUserData = snap.data();
            showScreen(bankScreen);
            loadSavings();
            updateBankUI();
        }
    }
});

applyTheme(getTheme());
console.log('🏛️ Legacy Bank готов! Все 18 функций активны.');

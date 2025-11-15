// Firebase Configuration - YOUR CONFIG
const firebaseConfig = {
    apiKey: "AIzaSyD8w1L_Nxe5UiPhpAe1rbyDo4KYb-pH0VU",
    authDomain: "new-fund-money.firebaseapp.com",
    projectId: "new-fund-money",
    storageBucket: "new-fund-money.firebasestorage.app",
    messagingSenderId: "912524669808",
    appId: "1:912524669808:web:48f925b308a95832d495b5",
    measurementId: "G-4JDE7VM0MC"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Game Constants
const GAME_CYCLE_DURATION = 30;
const MAX_BET_AMOUNT = 10000;
const MIN_BET_AMOUNT = 10;

// Global Variables
let currentUser = null;
let userData = {};
let userBalance = 0;
let currentBet = null;
let bettingEnabled = false;
let gameTimerInterval = null;
let gameControlListener = null;
let userDataListener = null;

// Collections
const USERS_COLLECTION = 'users';
const GAME_CONTROL_COLLECTION = 'gameControl';
const BETS_COLLECTION = 'bets';
const ADD_MONEY_COLLECTION = 'addMoneyRequests';
const WITHDRAWAL_COLLECTION = 'withdrawalRequests';
const NOTIFICATIONS_COLLECTION = 'notifications';

// Page Navigation
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');
    
    // Update bottom nav active state
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (pageId === 'dashboard-page') {
        document.querySelector('.nav-btn:nth-child(1)').classList.add('active');
    } else if (pageId === 'withdraw-page') {
        document.querySelector('.nav-btn:nth-child(2)').classList.add('active');
    } else if (pageId === 'profile-page') {
        document.querySelector('.nav-btn:nth-child(4)').classList.add('active');
    }
}

// Authentication Functions
async function signInWithGoogle() {
    try {
        showLoading('Google लॉगिन हो रहा है...');
        
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('email');
        provider.addScope('profile');
        
        const result = await auth.signInWithPopup(provider);
        currentUser = result.user;
        
        // Check if user exists in Firestore
        const userDoc = await db.collection(USERS_COLLECTION).doc(currentUser.uid).get();
        
        if (!userDoc.exists) {
            // New Google user - show password setup
            hideLoading();
            showPage('setup-password-page');
        } else {
            // Existing user - load data and go to dashboard
            userData = userDoc.data();
            await initializeUserSession();
        }
        
    } catch (error) {
        hideLoading();
        console.error('Google login error:', error);
        alert('Google लॉगिन विफल: ' + error.message);
    }
}

async function loginWithEmailPassword() {
    try {
        showLoading('लॉगिन हो रहा है...');
        
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        if (!email || !password) {
            throw new Error('कृपया ईमेल और पासवर्ड दर्ज करें');
        }
        
        const result = await auth.signInWithEmailAndPassword(email, password);
        currentUser = result.user;
        
        // Load user data
        await initializeUserSession();
        
    } catch (error) {
        hideLoading();
        console.error('Login error:', error);
        alert('लॉगिन विफल: ' + error.message);
    }
}

async function setupPassword() {
    try {
        showLoading('पासवर्ड सेव हो रहा है...');
        
        const password = document.getElementById('setup-password').value;
        const confirmPassword = document.getElementById('setup-confirm-password').value;
        
        if (password.length < 6) {
            throw new Error('पासवर्ड कम से कम 6 अक्षर का होना चाहिए');
        }
        
        if (password !== confirmPassword) {
            throw new Error('पासवर्ड मेल नहीं खा रहे');
        }
        
        // Update password for Google user
        await currentUser.updatePassword(password);
        
        // Create user document in Firestore
        const userDoc = {
            userId: generateUserId(),
            name: currentUser.displayName || 'User',
            email: currentUser.email,
            balance: 1000,
            status: 'active',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection(USERS_COLLECTION).doc(currentUser.uid).set(userDoc);
        userData = userDoc;
        
        await initializeUserSession();
        
    } catch (error) {
        hideLoading();
        console.error('Password setup error:', error);
        alert('पासवर्ड सेटअप विफल: ' + error.message);
    }
}

function generateUserId() {
    return 'USER' + Math.random().toString(36).substr(2, 8).toUpperCase();
}

async function initializeUserSession() {
    try {
        // Start listening to user data
        await setupUserDataListener();
        
        // Start game system
        initializeGameSystem();
        
        // Update last login
        await db.collection(USERS_COLLECTION).doc(currentUser.uid).update({
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        hideLoading();
        showPage('dashboard-page');
        
    } catch (error) {
        hideLoading();
        console.error('Session initialization error:', error);
        alert('सत्र प्रारंभ करने में त्रुटि: ' + error.message);
    }
}

// User Data Management
async function setupUserDataListener() {
    if (userDataListener) {
        userDataListener();
    }
    
    userDataListener = db.collection(USERS_COLLECTION).doc(currentUser.uid)
        .onSnapshot(async (doc) => {
            if (doc.exists) {
                userData = doc.data();
                userBalance = userData.balance || 0;
                
                // Update UI
                updateUserInterface();
                
                // Check if user is blocked or deleted
                if (userData.status === 'blocked') {
                    alert('आपका अकाउंट ब्लॉक कर दिया गया है। सपोर्ट से संपर्क करें।');
                    await auth.signOut();
                    return;
                }
                
                if (userData.status === 'deleted') {
                    alert('आपका अकाउंट डिलीट कर दिया गया है।');
                    await auth.signOut();
                    return;
                }
            }
        }, (error) => {
            console.error('User data listener error:', error);
        });
}

function updateUserInterface() {
    // Update balance displays
    document.getElementById('current-balance').textContent = userBalance;
    document.getElementById('profile-balance').textContent = userBalance;
    document.getElementById('withdraw-balance').textContent = userBalance;
    
    // Update profile information
    document.getElementById('profile-name').textContent = userData.name || 'User';
    document.getElementById('profile-email').textContent = userData.email || 'No email';
    document.getElementById('profile-user-id').textContent = userData.userId || 'N/A';
    document.getElementById('profile-status').textContent = userData.status || 'active';
    
    // Update bank details if available
    updateBankDetailsDisplay();
    
    // Update login time
    if (userData.lastLogin) {
        const loginTime = userData.lastLogin.toDate();
        document.getElementById('login-time').textContent = loginTime.toLocaleString('hi-IN');
    }
}

function updateBankDetailsDisplay() {
    const bankDisplay = document.getElementById('bank-details-display');
    
    if (userData.bankDetails) {
        bankDisplay.innerHTML = `
            <div class="bank-detail-item">
                <strong>खाताधारक:</strong> ${userData.bankDetails.accountHolder}
            </div>
            <div class="bank-detail-item">
                <strong>अकाउंट नंबर:</strong> ${userData.bankDetails.accountNumber}
            </div>
            <div class="bank-detail-item">
                <strong>IFSC कोड:</strong> ${userData.bankDetails.ifscCode}
            </div>
            <div class="bank-detail-item">
                <strong>बैंक:</strong> ${userData.bankDetails.bankName}
            </div>
        `;
    } else {
        bankDisplay.innerHTML = `
            <div class="no-bank-message">
                बैंक डिटेल्स नहीं मिले। कृपया प्रोफाइल में जाकर डिटेल्स भरें।
            </div>
        `;
    }
}

// Game System
function initializeGameSystem() {
    startGameTimer();
    setupGameControlListener();
    loadGameHistory();
}

function startGameTimer() {
    if (gameTimerInterval) {
        clearInterval(gameTimerInterval);
    }
    
    gameTimerInterval = setInterval(() => {
        updateGameTimer();
    }, 1000);
}

function updateGameTimer() {
    // This will be updated by the game control listener
    // For now, simulate timer
    const timerElement = document.getElementById('timer');
    const progressElement = document.getElementById('progress-bar');
    const statusElement = document.getElementById('game-status');
    
    let timeLeft = parseInt(timerElement.textContent) || GAME_CYCLE_DURATION;
    
    if (timeLeft <= 0) {
        timeLeft = GAME_CYCLE_DURATION;
        simulateGameResult();
    } else {
        timeLeft--;
    }
    
    timerElement.textContent = timeLeft + 's';
    const progress = (timeLeft / GAME_CYCLE_DURATION) * 100;
    progressElement.style.width = progress + '%';
    
    // Enable betting in last 25 seconds
    bettingEnabled = timeLeft <= 25;
    
    if (timeLeft > 25) {
        statusElement.textContent = 'बेटिंग जल्द शुरू...';
        statusElement.style.color = '#ff9800';
    } else if (timeLeft > 5) {
        statusElement.textContent = 'बेटिंग चालू है';
        statusElement.style.color = '#4CAF50';
    } else {
        statusElement.textContent = 'बेटिंग बंद';
        statusElement.style.color = '#f44336';
    }
}

function setupGameControlListener() {
    if (gameControlListener) {
        gameControlListener();
    }
    
    gameControlListener = db.collection(GAME_CONTROL_COLLECTION).doc('current')
        .onSnapshot((doc) => {
            if (doc.exists) {
                const gameData = doc.data();
                updateGameFromControl(gameData);
            }
        }, (error) => {
            console.error('Game control listener error:', error);
        });
}

function updateGameFromControl(gameData) {
    // Update timer based on server time
    if (gameData.timerEnd) {
        const now = Date.now();
        const timerEnd = gameData.timerEnd.toMillis();
        const timeLeft = Math.max(0, (timerEnd - now) / 1000);
        
        document.getElementById('timer').textContent = timeLeft.toFixed(1) + 's';
        const progress = (timeLeft / GAME_CYCLE_DURATION) * 100;
        document.getElementById('progress-bar').style.width = progress + '%';
        
        bettingEnabled = timeLeft > 0 && timeLeft <= 25;
    }
    
    // Update last result
    if (gameData.lastResult && gameData.lastResult !== 'none') {
        const resultText = gameData.lastResult === 'green' ? 'हरा' : 'नीला';
        document.getElementById('last-result-text').textContent = `पिछला रिजल्ट: ${resultText}`;
        updateGameHistory(gameData.lastResult);
    }
}

function simulateGameResult() {
    const results = ['green', 'blue'];
    const result = results[Math.floor(Math.random() * results.length)];
    const resultText = result === 'green' ? 'हरा' : 'नीला';
    
    document.getElementById('current-result').textContent = `🎉 ${resultText} जीता!`;
    document.getElementById('current-result').style.color = result === 'green' ? '#4CAF50' : '#2196F3';
    
    // Process user's bet if any
    if (currentBet) {
        processBetResult(result);
    }
    
    // Reset for next round
    currentBet = null;
    resetBetDisplays();
}

function processBetResult(winningColor) {
    if (currentBet && currentBet.color === winningColor) {
        // User won - 2x payout
        const winAmount = currentBet.amount * 2;
        userBalance += winAmount;
        
        // Show win message
        alert(`🎉 बधाई हो! आपने ₹${winAmount} जीते!`);
        
        // Update balance in Firestore
        updateUserBalance();
        
    } else if (currentBet) {
        // User lost
        alert(`😔 आपका बेट हार गया। ₹${currentBet.amount} कट गए।`);
    }
}

async function updateUserBalance() {
    try {
        await db.collection(USERS_COLLECTION).doc(currentUser.uid).update({
            balance: userBalance,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Balance update error:', error);
    }
}

// Betting Functions
function adjustBetAmount(change) {
    const betInput = document.getElementById('bet-amount');
    let currentAmount = parseInt(betInput.value) || MIN_BET_AMOUNT;
    currentAmount += change;
    
    if (currentAmount < MIN_BET_AMOUNT) currentAmount = MIN_BET_AMOUNT;
    if (currentAmount > MAX_BET_AMOUNT) currentAmount = MAX_BET_AMOUNT;
    if (currentAmount > userBalance) currentAmount = userBalance;
    
    betInput.value = currentAmount;
}

function setBetAmount(amount) {
    document.getElementById('bet-amount').value = amount;
}

async function placeBet(color) {
    if (!currentUser) {
        alert('कृपया पहले लॉगिन करें');
        return;
    }
    
    if (!bettingEnabled) {
        alert('बेटिंग बंद है! कृपया टाइमर का इंतज़ार करें');
        return;
    }
    
    if (currentBet) {
        alert('आप पहले ही बेट लगा चुके हैं');
        return;
    }
    
    const amount = parseInt(document.getElementById('bet-amount').value);
    
    if (amount > userBalance) {
        alert('पर्याप्त बैलेंस नहीं है');
        return;
    }
    
    if (amount < MIN_BET_AMOUNT || amount > MAX_BET_AMOUNT) {
        alert(`कृपया वैध राशि दर्ज करें (₹${MIN_BET_AMOUNT} - ₹${MAX_BET_AMOUNT})`);
        return;
    }
    
    try {
        // Deduct balance immediately
        userBalance -= amount;
        currentBet = { color, amount, timestamp: Date.now() };
        
        // Update UI
        updateBalanceDisplay();
        updateBetDisplay(color, amount);
        
        // Save bet to Firestore
        await saveBetToFirestore(color, amount);
        
        // Show confirmation
        showBetConfirmation(color, amount);
        
    } catch (error) {
        console.error('Bet placement error:', error);
        alert('बेट लगाने में त्रुटि: ' + error.message);
        
        // Revert on error
        userBalance += amount;
        currentBet = null;
    }
}

function updateBetDisplay(color, amount) {
    const betAmountElement = document.getElementById(`${color}-bet-amount`);
    if (betAmountElement) {
        betAmountElement.textContent = `₹${amount}`;
        betAmountElement.parentElement.classList.add('pulse');
    }
}

function resetBetDisplays() {
    document.getElementById('green-bet-amount').textContent = '₹0';
    document.getElementById('blue-bet-amount').textContent = '₹0';
    
    document.getElementById('green-btn').classList.remove('pulse');
    document.getElementById('blue-btn').classList.remove('pulse');
}

function showBetConfirmation(color, amount) {
    const colorText = color === 'green' ? 'हरा' : 'नीला';
    alert(`✅ बेट सफल! ₹${amount} ${colorText} पर लगे`);
}

async function saveBetToFirestore(color, amount) {
    try {
        await db.collection(BETS_COLLECTION).add({
            userId: currentUser.uid,
            userEmail: currentUser.email,
            userName: userData.name,
            color: color,
            amount: amount,
            cycleId: 'current', // This should be the current game cycle ID
            status: 'pending',
            placedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Save bet error:', error);
        throw error;
    }
}

// Money Management
function selectAddAmount(amount) {
    document.getElementById('custom-add-amount').value = amount;
}

function selectWithdrawAmount(amount) {
    document.getElementById('custom-withdraw-amount').value = amount;
}

async function submitAddMoneyRequest() {
    const amount = parseInt(document.getElementById('custom-add-amount').value);
    const transactionId = document.getElementById('transaction-id').value.trim();
    
    if (!amount || amount < 100 || amount > 100000) {
        alert('कृपया ₹100 - ₹1,00,000 के बीच राशि दर्ज करें');
        return;
    }
    
    if (!transactionId) {
        alert('कृपया UTR/Transaction ID दर्ज करें');
        return;
    }
    
    try {
        showLoading('अनुरोध भेजा जा रहा है...');
        
        // Save add money request
        await db.collection(ADD_MONEY_COLLECTION).add({
            userId: currentUser.uid,
            userName: userData.name,
            userEmail: currentUser.email,
            userUserId: userData.userId,
            amount: amount,
            transactionId: transactionId,
            status: 'pending',
            requestTime: firebase.firestore.FieldValue.serverTimestamp(),
            processed: false
        });
        
        hideLoading();
        alert(`✅ अनुरोध सफलतापूर्वक भेजा गया! ₹${amount}\nपैसा 5-10 मिनट में आ जाएगा।`);
        showPage('dashboard-page');
        
    } catch (error) {
        hideLoading();
        console.error('Add money request error:', error);
        alert('अनुरोध भेजने में त्रुटि: ' + error.message);
    }
}

async function submitWithdrawRequest() {
    const amount = parseInt(document.getElementById('custom-withdraw-amount').value);
    
    if (!amount || amount < 100 || amount > 50000) {
        alert('कृपया ₹100 - ₹50,000 के बीच राशि दर्ज करें');
        return;
    }
    
    if (amount > userBalance) {
        alert('पर्याप्त बैलेंस नहीं है');
        return;
    }
    
    if (!userData.bankDetails) {
        alert('कृपया पहले बैंक डिटेल्स सेव करें');
        showPage('profile-page');
        return;
    }
    
    try {
        showLoading('निकासी अनुरोध भेजा जा रहा है...');
        
        // Save withdrawal request
        await db.collection(WITHDRAWAL_COLLECTION).add({
            userId: currentUser.uid,
            userName: userData.name,
            userEmail: currentUser.email,
            userUserId: userData.userId,
            amount: amount,
            bankDetails: userData.bankDetails,
            status: 'pending',
            requestTime: firebase.firestore.FieldValue.serverTimestamp(),
            processed: false
        });
        
        hideLoading();
        alert(`✅ निकासी अनुरोध सफल! ₹${amount}\nपैसा 2-4 घंटे में आ जाएगा।`);
        showPage('dashboard-page');
        
    } catch (error) {
        hideLoading();
        console.error('Withdrawal request error:', error);
        alert('निकासी अनुरोध भेजने में त्रुटि: ' + error.message);
    }
}

// Profile Management
function togglePasswordVisibility() {
    const passwordInput = document.getElementById('display-password');
    const eyeIcon = document.querySelector('.eye-icon');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        eyeIcon.textContent = '🙈';
    } else {
        passwordInput.type = 'password';
        eyeIcon.textContent = '👁️';
    }
}

async function changePassword() {
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    if (newPassword.length < 6) {
        alert('पासवर्ड कम से कम 6 अक्षर का होना चाहिए');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        alert('पासवर्ड मेल नहीं खा रहे');
        return;
    }
    
    try {
        showLoading('पासवर्ड बदला जा रहा है...');
        
        await currentUser.updatePassword(newPassword);
        
        // Clear fields
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';
        
        hideLoading();
        alert('✅ पासवर्ड सफलतापूर्वक बदल गया!');
        
    } catch (error) {
        hideLoading();
        console.error('Password change error:', error);
        alert('पासवर्ड बदलने में त्रुटि: ' + error.message);
    }
}

async function saveBankDetails() {
    const accountHolder = document.getElementById('account-holder').value.trim();
    const accountNumber = document.getElementById('account-number').value.trim();
    const ifscCode = document.getElementById('ifsc-code').value.trim();
    const bankName = document.getElementById('bank-name').value.trim();
    
    if (!accountHolder || !accountNumber || !ifscCode || !bankName) {
        alert('कृपया सभी बैंक विवरण भरें');
        return;
    }
    
    if (accountNumber.length < 9 || accountNumber.length > 18) {
        alert('कृपया वैध बैंक अकाउंट नंबर दर्ज करें');
        return;
    }
    
    if (ifscCode.length !== 11) {
        alert('कृपया वैध IFSC कोड दर्ज करें (11 अक्षर)');
        return;
    }
    
    try {
        showLoading('बैंक डिटेल्स सेव हो रहे हैं...');
        
        const bankDetails = {
            accountHolder: accountHolder,
            accountNumber: accountNumber,
            ifscCode: ifscCode.toUpperCase(),
            bankName: bankName,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection(USERS_COLLECTION).doc(currentUser.uid).update({
            bankDetails: bankDetails
        });
        
        hideLoading();
        alert('✅ बैंक डिटेल्स सफलतापूर्वक सेव हुए!');
        
    } catch (error) {
        hideLoading();
        console.error('Bank details save error:', error);
        alert('बैंक डिटेल्स सेव करने में त्रुटि: ' + error.message);
    }
}

// Game History
function loadGameHistory() {
    // This would load actual game history from Firestore
    // For now, simulate some history
    const historyItems = document.querySelectorAll('.history-item');
    const results = ['green', 'blue', 'green'];
    
    results.forEach((result, index) => {
        if (index < historyItems.length) {
            historyItems[index].textContent = result === 'green' ? 'ह' : 'नी';
            historyItems[index].className = `history-item ${result}`;
        }
    });
}

function updateGameHistory(result) {
    const historyItems = document.querySelectorAll('.history-item');
    
    // Shift history
    for (let i = historyItems.length - 1; i > 0; i--) {
        const prevItem = historyItems[i-1];
        historyItems[i].textContent = prevItem.textContent;
        historyItems[i].className = prevItem.className;
    }
    
    // Add new result
    historyItems[0].textContent = result === 'green' ? 'ह' : 'नी';
    historyItems[0].className = `history-item ${result}`;
}

// Admin Functions
function loginToAdminPanel() {
    const password = document.getElementById('admin-password').value;
    
    if (password === 'Winner@#2008') {
        // Redirect to admin panel
        window.location.href = 'admin.html';
    } else {
        alert('❌ गलत पासवर्ड!');
    }
}

// Utility Functions
function showLoading(message = 'लोड हो रहा है...') {
    const loadingScreen = document.getElementById('loading-screen');
    const loadingText = loadingScreen.querySelector('p');
    
    loadingText.textContent = message;
    loadingScreen.classList.add('active');
    showPage('loading-screen');
}

function hideLoading() {
    document.getElementById('loading-screen').classList.remove('active');
}

function contactSupport() {
    alert('सपोर्ट के लिए संपर्क करें: support@fundmoney.game\nया WhatsApp: +91 XXXXXXXXXX');
}

function updateBalanceDisplay() {
    document.getElementById('current-balance').textContent = userBalance;
    document.getElementById('profile-balance').textContent = userBalance;
    document.getElementById('withdraw-balance').textContent = userBalance;
}

// Initialize App
auth.onAuthStateChanged((user) => {
    if (user) {
        currentUser = user;
        showLoading('यूज़र डेटा लोड हो रहा है...');
        
        // Load user data
        db.collection(USERS_COLLECTION).doc(user.uid).get()
            .then((doc) => {
                if (doc.exists) {
                    userData = doc.data();
                    userBalance = userData.balance || 0;
                    
                    if (userData.status === 'active') {
                        initializeUserSession();
                    } else if (userData.status === 'blocked') {
                        hideLoading();
                        alert('आपका अकाउंट ब्लॉक कर दिया गया है। सपोर्ट से संपर्क करें।');
                        auth.signOut();
                    } else if (userData.status === 'deleted') {
                        hideLoading();
                        alert('आपका अकाउंट डिलीट कर दिया गया है।');
                        auth.signOut();
                    }
                } else {
                    // User document doesn't exist - should not happen for email users
                    hideLoading();
                    alert('यूज़र डेटा नहीं मिला। कृपया दोबारा लॉगिन करें।');
                    auth.signOut();
                }
            })
            .catch((error) => {
                hideLoading();
                console.error('User data load error:', error);
                alert('डेटा लोड करने में त्रुटि: ' + error.message);
            });
            
    } else {
        // No user logged in
        currentUser = null;
        userData = {};
        userBalance = 0;
        
        // Clean up listeners
        if (gameControlListener) {
            gameControlListener();
            gameControlListener = null;
        }
        
        if (userDataListener) {
            userDataListener();
            userDataListener = null;
        }
        
        if (gameTimerInterval) {
            clearInterval(gameTimerInterval);
            gameTimerInterval = null;
        }
        
        showPage('login-page');
    }
});

// Start the app
window.onload = function() {
    showPage('loading-screen');
    
    // Check if user is already logged in
    setTimeout(() => {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            hideLoading();
            showPage('login-page');
        }
    }, 2000);
};

// Prevent form submission
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
        });
    });
});

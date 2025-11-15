// =======================================================
// === 🔥 FIREBASE CONFIGURATION (v8.x) ===
// =======================================================

const firebaseConfig = {
    apiKey: "AIzaSyC3dy4RR4llP2lW3gNZJ8l-nsfvLVaszi4",
    authDomain: "fund-money-ba9f3.firebaseapp.com",
    projectId: "fund-money-ba9f3",
    storageBucket: "fund-money-ba9f3.firebasestorage.app",
    messagingSenderId: "938568753521",
    appId: "1:938568753521:web:b81a067fd15632661b16d0",
    measurementId: "G-0QL08NTY1V"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Collections
const USERS_COLLECTION = 'users';
const GAME_CONTROLS = 'gameControls';
const BETS_COLLECTION = 'bets';
const TRANSACTIONS_COLLECTION = 'transactions';

// =======================================================
// === 🎮 GLOBAL VARIABLES ===
// =======================================================

let currentUser = null;
let userData = null;
let userBalance = 0;
let gameTimer = null;
let bettingEnabled = true;
let currentBet = null;

// =======================================================
// === 🔐 AUTHENTICATION FUNCTIONS ===
// =======================================================

// Email/Password Signup
async function signUpWithEmailPassword() {
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm-password').value;
    
    if (!name || !email || !password) {
        showMessage('signup-message', 'कृपया सभी फील्ड भरें', 'error');
        return;
    }
    
    if (password.length < 6) {
        showMessage('signup-message', 'पासवर्ड कम से कम 6 अक्षर का होना चाहिए', 'error');
        return;
    }
    
    if (password !== confirmPassword) {
        showMessage('signup-message', 'पासवर्ड मेल नहीं खा रहे हैं', 'error');
        return;
    }
    
    try {
        showMessage('signup-message', 'अकाउंट बनाया जा रहा है...', 'success');
        
        // Create user in Firebase Auth
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Create user document in Firestore
        const userId = generateUserId();
        await db.collection(USERS_COLLECTION).doc(user.uid).set({
            name: name,
            email: email,
            userId: userId,
            balance: 1000, // Starting balance
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Load user data and show dashboard
        await loadUserData(user.uid);
        showMessage('signup-message', 'अकाउंट सफलतापूर्वक बन गया!', 'success');
        setTimeout(() => showPage('dashboard-page'), 1000);
        
    } catch (error) {
        console.error('Signup Error:', error);
        handleAuthError(error, 'signup-message');
    }
}

// Email/Password Login
async function loginWithEmailPassword() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!email || !password) {
        alert('कृपया ईमेल और पासवर्ड दर्ज करें');
        return;
    }
    
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        await loadUserData(user.uid);
        showPage('dashboard-page');
        
    } catch (error) {
        console.error('Login Error:', error);
        handleAuthError(error);
    }
}

// Google Sign-In
async function signInWithGoogle() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        
        // Check if user exists
        const userDoc = await db.collection(USERS_COLLECTION).doc(user.uid).get();
        
        if (!userDoc.exists) {
            // Create new user for Google sign-in
            const userId = generateUserId();
            await db.collection(USERS_COLLECTION).doc(user.uid).set({
                name: user.displayName,
                email: user.email,
                userId: userId,
                balance: 1000,
                authProvider: 'google',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        await loadUserData(user.uid);
        showPage('dashboard-page');
        
    } catch (error) {
        console.error('Google Sign-In Error:', error);
        alert('Google लॉगिन में समस्या आई। कृपया फिर से कोशिश करें।');
    }
}

// Load User Data
async function loadUserData(userId) {
    try {
        const doc = await db.collection(USERS_COLLECTION).doc(userId).get();
        if (doc.exists) {
            userData = doc.data();
            userBalance = userData.balance || 0;
            currentUser = userId;
            
            updateUI();
            startGameListener();
        }
    } catch (error) {
        console.error('Load User Data Error:', error);
    }
}

// =======================================================
// 🎯 GAME FUNCTIONS ===
// =======================================================

// Start listening to game updates
function startGameListener() {
    db.collection(GAME_CONTROLS).doc('currentGame').onSnapshot((doc) => {
        if (doc.exists) {
            const gameData = doc.data();
            updateGameUI(gameData);
        } else {
            // Initialize game if not exists
            initializeGame();
        }
    });
}

// Initialize game
function initializeGame() {
    db.collection(GAME_CONTROLS).doc('currentGame').set({
        isRunning: false,
        result: null,
        endTime: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

// Update game UI based on game state
function updateGameUI(gameData) {
    const timerElement = document.getElementById('timer');
    const progressFill = document.getElementById('progress-fill');
    const resultText = document.getElementById('result-text');
    
    if (!timerElement || !progressFill || !resultText) return;
    
    if (gameData.isRunning) {
        const timeLeft = Math.max(0, (gameData.endTime - Date.now()) / 1000);
        timerElement.textContent = timeLeft.toFixed(1) + 's';
        
        // Update progress bar
        const progressPercent = (timeLeft / 30) * 100;
        progressFill.style.width = progressPercent + '%';
        
        // Change color when time is low
        if (timeLeft <= 5) {
            progressFill.style.background = 'linear-gradient(90deg, #f44336, #d32f2f)';
        } else {
            progressFill.style.background = 'linear-gradient(90deg, #4CAF50, #45a049)';
        }
        
        // Enable/disable betting
        bettingEnabled = timeLeft > 5;
        updateBettingUI();
        
        if (timeLeft <= 0) {
            resultText.textContent = 'रिजल्ट आ रहा है...';
            resultText.style.background = '#ff9800';
            resultText.style.color = 'white';
        } else {
            resultText.textContent = 'बेट लगाएं';
            resultText.style.background = '#f5f5f5';
            resultText.style.color = '#333';
        }
        
    } else if (gameData.result) {
        // Show result
        const result = gameData.result;
        resultText.textContent = result === 'green' ? 'हरा जीता!' : 'नीला जीता!';
        resultText.style.background = result === 'green' ? '#4CAF50' : '#2196F3';
        resultText.style.color = 'white';
        
        // Add to history
        addToHistory(result);
        
        // Process bets
        if (currentBet) {
            processBetResult(result);
        }
        
        // Reset for next round
        setTimeout(() => {
            resultText.textContent = 'अगला राउंड जल्दी शुरू';
            resultText.style.background = '#f5f5f5';
            resultText.style.color = '#333';
            currentBet = null;
            updateBettingUI();
        }, 3000);
    }
}

// Place a bet
async function placeBet(color) {
    if (!currentUser || !bettingEnabled) {
        alert('बेटिंग अभी बंद है या आप लॉग इन नहीं हैं');
        return;
    }
    
    const betAmount = parseInt(document.getElementById('bet-amount').value);
    
    if (isNaN(betAmount) || betAmount < 10) {
        alert('कृपया ₹10 या अधिक की बेट लगाएं');
        return;
    }
    
    if (betAmount > userBalance) {
        alert('आपके पास पर्याप्त बैलेंस नहीं है');
        return;
    }
    
    if (currentBet) {
        alert('आप पहले ही बेट लगा चुके हैं');
        return;
    }
    
    try {
        // Deduct balance
        userBalance -= betAmount;
        await updateUserBalance();
        
        // Store current bet
        currentBet = {
            color: color,
            amount: betAmount,
            timestamp: Date.now()
        };
        
        // Save bet to database
        await db.collection(BETS_COLLECTION).add({
            userId: currentUser,
            color: color,
            amount: betAmount,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'pending'
        });
        
        updateBettingUI();
        alert(`✅ ₹${betAmount} की बेट ${color === 'green' ? 'हरे' : 'नीले'} पर लगाई गई`);
        
    } catch (error) {
        console.error('Place Bet Error:', error);
        alert('बेट लगाने में समस्या आई');
        userBalance += betAmount; // Revert balance
        updateUI();
    }
}

// Process bet result
async function processBetResult(winningColor) {
    if (!currentBet) return;
    
    try {
        if (currentBet.color === winningColor) {
            // Win - double the amount
            const winAmount = currentBet.amount * 2;
            userBalance += winAmount;
            
            await updateUserBalance();
            alert(`🎉 जीत! ₹${winAmount} जीते!`);
            
            // Record transaction
            await db.collection(TRANSACTIONS_COLLECTION).add({
                userId: currentUser,
                type: 'win',
                amount: winAmount,
                details: `Bet won on ${winningColor}`,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            
        } else {
            // Loss - already deducted
            alert('❌ इस बार हार। अगली बार जीतें!');
            
            // Record transaction
            await db.collection(TRANSACTIONS_COLLECTION).add({
                userId: currentUser,
                type: 'loss',
                amount: currentBet.amount,
                details: `Bet lost on ${currentBet.color}`,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
    } catch (error) {
        console.error('Process Bet Error:', error);
    }
}

// =======================================================
// === 💰 PAYMENT FUNCTIONS ===
// =======================================================

// Add money request
async function submitAddMoneyRequest() {
    const amountInput = document.getElementById('add-amount');
    const transactionId = document.getElementById('transaction-id').value.trim();
    
    if (!amountInput) {
        alert('Amount input not found');
        return;
    }
    
    const amount = parseInt(amountInput.value);
    
    if (!amount || amount < 100) {
        showMessage('add-money-message', 'कृपया ₹100 या अधिक की राशि चुनें', 'error');
        return;
    }
    
    if (!transactionId) {
        showMessage('add-money-message', 'कृपया Transaction ID दर्ज करें', 'error');
        return;
    }
    
    try {
        await db.collection('addMoneyRequests').add({
            userId: currentUser,
            userName: userData.name,
            amount: amount,
            transactionId: transactionId,
            status: 'pending',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showMessage('add-money-message', '💰 पैसे जोड़ने का अनुरोध सबमिट हो गया!', 'success');
        setTimeout(() => showPage('dashboard-page'), 2000);
        
    } catch (error) {
        console.error('Add Money Error:', error);
        showMessage('add-money-message', 'अनुरोध सबमिट करने में समस्या', 'error');
    }
}

// Withdraw request
async function submitWithdrawRequest() {
    const amountInput = document.getElementById('withdraw-amount');
    
    if (!amountInput) {
        alert('Withdraw amount input not found');
        return;
    }
    
    const amount = parseInt(amountInput.value);
    
    if (!amount || amount < 100) {
        showMessage('withdraw-message', 'कृपया ₹100 या अधिक की राशि चुनें', 'error');
        return;
    }
    
    if (amount > userBalance) {
        showMessage('withdraw-message', 'आपके पास पर्याप्त बैलेंस नहीं है', 'error');
        return;
    }
    
    try {
        // Deduct balance immediately
        userBalance -= amount;
        await updateUserBalance();
        
        await db.collection('withdrawalRequests').add({
            userId: currentUser,
            userName: userData.name,
            amount: amount,
            status: 'pending',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showMessage('withdraw-message', '💸 निकासी अनुरोध सबमिट हो गया!', 'success');
        setTimeout(() => showPage('dashboard-page'), 2000);
        
    } catch (error) {
        console.error('Withdraw Error:', error);
        showMessage('withdraw-message', 'अनुरोध सबमिट करने में समस्या', 'error');
        userBalance += amount; // Revert on error
        updateUI();
    }
}

// =======================================================
// === 🛠️ UTILITY FUNCTIONS ===
// =======================================================

// Update user balance in Firestore
async function updateUserBalance() {
    if (!currentUser) return;
    
    try {
        await db.collection(USERS_COLLECTION).doc(currentUser).update({
            balance: userBalance,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        updateUI();
    } catch (error) {
        console.error('Update Balance Error:', error);
    }
}

// Update UI elements
function updateUI() {
    // Update balance displays
    const currentBalance = document.getElementById('current-balance');
    if (currentBalance) {
        currentBalance.textContent = userBalance;
    }
    
    const profileBalance = document.getElementById('profile-balance');
    if (profileBalance) {
        profileBalance.textContent = userBalance;
    }
    
    // Update profile info
    if (userData) {
        const profileName = document.getElementById('profile-name');
        if (profileName) {
            profileName.textContent = userData.name;
        }
        
        const profileEmail = document.getElementById('profile-email');
        if (profileEmail) {
            profileEmail.textContent = userData.email;
        }
        
        const profileUserId = document.getElementById('profile-user-id');
        if (profileUserId) {
            profileUserId.textContent = userData.userId;
        }
    }
}

// Update betting UI
function updateBettingUI() {
    const betButtons = document.querySelectorAll('.color-btn');
    const betInput = document.getElementById('bet-amount');
    
    if (bettingEnabled && !currentBet) {
        betButtons.forEach(btn => btn.disabled = false);
        if (betInput) betInput.disabled = false;
    } else {
        betButtons.forEach(btn => btn.disabled = true);
        if (betInput) betInput.disabled = true;
    }
}

// Add result to history
function addToHistory(result) {
    const historyContainer = document.getElementById('result-history');
    if (!historyContainer) return;
    
    const historyItem = document.createElement('div');
    historyItem.className = `history-item ${result}`;
    historyItem.textContent = result === 'green' ? 'ह' : 'न';
    
    historyContainer.insertBefore(historyItem, historyContainer.firstChild);
    
    // Keep only last 10 results
    if (historyContainer.children.length > 10) {
        historyContainer.removeChild(historyContainer.lastChild);
    }
}

// Show message
function showMessage(elementId, message, type = 'error') {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.className = type === 'error' ? 'error-message' : 'success-message';
        element.classList.remove('hidden');
        
        if (type === 'success') {
            setTimeout(() => element.classList.add('hidden'), 3000);
        }
    }
}

// Handle auth errors
function handleAuthError(error, elementId = null) {
    let message = 'अनजान एरर आई है';
    
    switch (error.code) {
        case 'auth/email-already-in-use':
            message = 'यह ईमेल पहले से रजिस्टर है';
            break;
        case 'auth/invalid-email':
            message = 'अवैध ईमेल एड्रेस';
            break;
        case 'auth/weak-password':
            message = 'पासवर्ड कमजोर है';
            break;
        case 'auth/user-not-found':
            message = 'यह ईमेल रजिस्टर नहीं है';
            break;
        case 'auth/wrong-password':
            message = 'गलत पासवर्ड';
            break;
    }
    
    if (elementId) {
        showMessage(elementId, message, 'error');
    } else {
        alert(message);
    }
}

// Generate user ID
function generateUserId() {
    return 'FM' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 90 + 10);
}

// Page navigation
function showPage(pageId) {
    console.log('Showing page:', pageId);
    
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.add('hidden');
    });
    
    // Show the requested page
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.remove('hidden');
        console.log('Successfully showed page:', pageId);
    } else {
        console.error('Page not found:', pageId);
    }
    
    // Update UI if going to dashboard
    if (pageId === 'dashboard-page') {
        updateUI();
        updateBettingUI();
    }
}

// Bet amount controls
function adjustBetAmount(change) {
    const input = document.getElementById('bet-amount');
    if (!input) return;
    
    let current = parseInt(input.value) || 50;
    current = Math.max(10, Math.min(10000, current + change));
    input.value = current;
}

function setBetAmount(amount) {
    const input = document.getElementById('bet-amount');
    if (input) {
        input.value = amount;
    }
}

function selectAmount(amount) {
    const input = document.getElementById('add-amount');
    if (input) {
        input.value = amount;
    }
    
    // Remove active class from all amount options
    document.querySelectorAll('.amount-option').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Add active class to clicked button
    if (event && event.target) {
        event.target.classList.add('active');
    }
}

function selectWithdrawAmount(amount) {
    const input = document.getElementById('withdraw-amount');
    if (input) {
        input.value = amount;
    }
    
    // Remove active class from all amount options
    document.querySelectorAll('.amount-option').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Add active class to clicked button
    if (event && event.target) {
        event.target.classList.add('active');
    }
}

// Password visibility toggle
function togglePasswordVisibility() {
    const passwordInput = document.getElementById('display-password');
    if (passwordInput) {
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
        } else {
            passwordInput.type = 'password';
        }
    }
}

// Password change section toggle
function togglePasswordChangeSection() {
    const changeSection = document.getElementById('password-change-fields');
    if (changeSection) {
        changeSection.classList.toggle('hidden');
    }
}

// Change password
async function changePassword() {
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-new-password').value;
    
    if (!newPassword || !confirmPassword) {
        showMessage('password-change-message', 'कृपया सभी फील्ड भरें', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showMessage('password-change-message', 'पासवर्ड कम से कम 6 अक्षर का होना चाहिए', 'error');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showMessage('password-change-message', 'पासवर्ड मेल नहीं खा रहे हैं', 'error');
        return;
    }
    
    try {
        await auth.currentUser.updatePassword(newPassword);
        showMessage('password-change-message', 'पासवर्ड सफलतापूर्वक बदल गया!', 'success');
        
        // Clear fields
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-new-password').value = '';
        
    } catch (error) {
        console.error('Change Password Error:', error);
        showMessage('password-change-message', 'पासवर्ड बदलने में समस्या आई', 'error');
    }
}

// Save bank details
async function saveBankDetails() {
    const accountHolder = document.getElementById('account-holder').value.trim();
    const accountNumber = document.getElementById('account-number').value.trim();
    const ifscCode = document.getElementById('ifsc-code').value.trim();
    const bankName = document.getElementById('bank-name').value.trim();
    
    if (!accountHolder || !accountNumber || !ifscCode || !bankName) {
        showMessage('bank-details-message', 'कृपया सभी बैंक विवरण भरें', 'error');
        return;
    }
    
    try {
        await db.collection(USERS_COLLECTION).doc(currentUser).update({
            bankDetails: {
                accountHolder: accountHolder,
                accountNumber: accountNumber,
                ifscCode: ifscCode,
                bankName: bankName,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }
        });
        
        showMessage('bank-details-message', 'बैंक डिटेल्स सफलतापूर्वक सेव हो गए!', 'success');
        
    } catch (error) {
        console.error('Save Bank Details Error:', error);
        showMessage('bank-details-message', 'बैंक डिटेल्स सेव करने में समस्या', 'error');
    }
}

// Toggle notification panel
function toggleNotificationPanel() {
    const panel = document.getElementById('notification-panel');
    if (panel) {
        panel.classList.toggle('hidden');
    }
}

// Logout
function logout() {
    auth.signOut().then(() => {
        currentUser = null;
        userData = null;
        userBalance = 0;
        currentBet = null;
        showPage('login-page');
    });
}

// =======================================================
// === 🚀 INITIALIZATION ===
// =======================================================

// Auth state listener - YEH IMPORTANT FIX HAI
auth.onAuthStateChanged((user) => {
    console.log('Auth state changed:', user ? 'User signed in' : 'User signed out');
    
    if (user) {
        console.log('User signed in:', user.email);
        loadUserData(user.uid);
        // Dashboard automatically show hoga loadUserData ke through
    } else {
        console.log('User signed out - showing login page');
        showPage('login-page'); // YEH LINE ADD KARNA IMPORTANT HAI
    }
});

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Fund Money App Initialized');
    
    // Initially show login page after short delay
    setTimeout(() => {
        showPage('login-page');
    }, 100);
});

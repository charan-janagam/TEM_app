/**
 * TEM Frontend JavaScript
 * Handles UI interactions, API calls, and speech features
 */

// Configuration
const API_BASE_URL = window.location.origin;
const USER_ID = localStorage.getItem('tem_user_id') || generateUserId();

// Save user ID
localStorage.setItem('tem_user_id', USER_ID);

// DOM Elements
const chatContainer = document.getElementById('chatContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const voiceBtn = document.getElementById('voiceBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const recordingIndicator = document.getElementById('recordingIndicator');
const loadingOverlay = document.getElementById('loadingOverlay');
const userLevelEl = document.getElementById('userLevel');
const conversationCountEl = document.getElementById('conversationCount');

// Settings
let voiceResponseEnabled = true;
let autoScrollEnabled = true;

// Speech Recognition
let recognition = null;
let isRecording = false;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initializeSpeechRecognition();
    loadUserStats();
    loadSettings();
    setupEventListeners();
});

/**
 * Generate unique user ID
 */
function generateUserId() {
    return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Send message on button click
    sendBtn.addEventListener('click', sendMessage);

    // Send message on Enter key
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Voice button
    voiceBtn.addEventListener('click', toggleVoiceRecording);

    // Settings button
    settingsBtn.addEventListener('click', openSettings);

    // Close modal on background click
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            closeSettings();
        }
    });
}

/**
 * Initialize Web Speech API for voice input
 */
function initializeSpeechRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'te-IN'; // Telugu language

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            messageInput.value = transcript;
            stopRecording();
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            stopRecording();
            if (event.error === 'no-speech') {
                showNotification('No speech detected. Please try again.', 'warning');
            } else {
                showNotification('Voice recognition error. Please try again.', 'error');
            }
        };

        recognition.onend = () => {
            stopRecording();
        };
    } else {
        console.warn('Speech recognition not supported');
        voiceBtn.style.display = 'none';
    }
}

/**
 * Toggle voice recording
 */
function toggleVoiceRecording() {
    if (!recognition) {
        showNotification('Voice input not supported in this browser', 'error');
        return;
    }

    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

/**
 * Start voice recording
 */
function startRecording() {
    isRecording = true;
    voiceBtn.classList.add('recording');
    recordingIndicator.classList.add('active');
    
    try {
        recognition.start();
    } catch (error) {
        console.error('Error starting recognition:', error);
        stopRecording();
    }
}

/**
 * Stop voice recording
 */
function stopRecording() {
    isRecording = false;
    voiceBtn.classList.remove('recording');
    recordingIndicator.classList.remove('active');
    
    if (recognition) {
        try {
            recognition.stop();
        } catch (error) {
            console.error('Error stopping recognition:', error);
        }
    }
}

/**
 * Send message to API
 */
async function sendMessage() {
    const message = messageInput.value.trim();
    
    if (!message) {
        showNotification('Please type or speak a message', 'warning');
        return;
    }

    // Clear input
    messageInput.value = '';

    // Add user message to chat
    addMessageToChat('user', message);

    // Show loading
    showLoading(true);

    try {
        const response = await fetch(`${API_BASE_URL}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message,
                user_id: USER_ID
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.message || 'Failed to get response');
        }

        // Add AI response to chat
        addMessageToChat('ai', data.response);

        // Update user stats
        updateUserStats(data.level, data.conversation_count);

        // Speak response if enabled
        if (voiceResponseEnabled) {
            speakText(data.response);
        }

    } catch (error) {
        console.error('Error sending message:', error);
        showNotification('Failed to send message: ' + error.message, 'error');
        
        // Add error message to chat
        addMessageToChat('ai', 'Sorry, I encountered an error. Please check if the API key is configured correctly and try again.');
    } finally {
        showLoading(false);
    }
}

/**
 * Send quick message
 */
function sendQuickMessage(message) {
    messageInput.value = message;
    sendMessage();
}

/**
 * Add message to chat UI
 */
function addMessageToChat(sender, text) {
    // Remove welcome message if exists
    const welcomeMsg = document.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;

    const time = new Date().toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });

    const senderName = sender === 'user' ? 'You' : 'TEM';
    const senderEmoji = sender === 'user' ? '👤' : '🎓';

    messageDiv.innerHTML = `
        <div class="message-header">
            <span class="message-sender">${senderEmoji} ${senderName}</span>
            <span class="message-time">${time}</span>
        </div>
        <div class="message-content">${escapeHtml(text)}</div>
    `;

    chatContainer.appendChild(messageDiv);

    // Auto scroll to bottom
    if (autoScrollEnabled) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, '<br>');
}

/**
 * Text-to-Speech for AI responses
 */
function speakText(text) {
    if ('speechSynthesis' in window) {
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-IN';
        utterance.rate = 0.9;
        utterance.pitch = 1;

        window.speechSynthesis.speak(utterance);
    }
}

/**
 * Load user statistics
 */
async function loadUserStats() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/stats?user_id=${USER_ID}`);
        const data = await response.json();

        if (!data.error) {
            updateUserStats(data.level, data.conversation_count);
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

/**
 * Update user statistics in UI
 */
function updateUserStats(level, count) {
    userLevelEl.textContent = level;
    conversationCountEl.textContent = `${count} chats`;

    // Update in modal too
    document.getElementById('modalLevel').textContent = level;
    document.getElementById('modalCount').textContent = count;
}

/**
 * Show loading overlay
 */
function showLoading(show) {
    if (show) {
        loadingOverlay.classList.add('active');
    } else {
        loadingOverlay.classList.remove('active');
    }
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
    // Simple alert for now - can be enhanced with custom notification UI
    alert(message);
}

/**
 * Open settings modal
 */
function openSettings() {
    settingsModal.classList.add('active');
    loadUserStats(); // Refresh stats
}

/**
 * Close settings modal
 */
function closeSettings() {
    settingsModal.classList.remove('active');
}

/**
 * Load settings from localStorage
 */
function loadSettings() {
    const savedVoiceResponse = localStorage.getItem('tem_voice_response');
    const savedAutoScroll = localStorage.getItem('tem_auto_scroll');

    if (savedVoiceResponse !== null) {
        voiceResponseEnabled = savedVoiceResponse === 'true';
        document.getElementById('voiceResponseToggle').checked = voiceResponseEnabled;
    }

    if (savedAutoScroll !== null) {
        autoScrollEnabled = savedAutoScroll === 'true';
        document.getElementById('autoScrollToggle').checked = autoScrollEnabled;
    }

    // Setup change listeners
    document.getElementById('voiceResponseToggle').addEventListener('change', (e) => {
        voiceResponseEnabled = e.target.checked;
        localStorage.setItem('tem_voice_response', voiceResponseEnabled);
    });

    document.getElementById('autoScrollToggle').addEventListener('change', (e) => {
        autoScrollEnabled = e.target.checked;
        localStorage.setItem('tem_auto_scroll', autoScrollEnabled);
    });
}

/**
 * Clear chat history
 */
async function clearHistory() {
    const confirmed = confirm('Are you sure you want to clear all your chat history? This cannot be undone.');
    
    if (!confirmed) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/clear_history`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: USER_ID
            })
        });

        const data = await response.json();

        if (!data.error) {
            // Clear chat UI
            chatContainer.innerHTML = `
                <div class="welcome-message">
                    <h2>👋 Welcome back!</h2>
                    <p>Your chat history has been cleared. Let's start fresh!</p>
                    <p class="start-hint">Type or speak to begin! 👇</p>
                </div>
            `;

            // Reset stats
            updateUserStats('Beginner', 0);
            
            showNotification('Chat history cleared successfully!', 'success');
            closeSettings();
        }
    } catch (error) {
        console.error('Error clearing history:', error);
        showNotification('Failed to clear history', 'error');
    }
}

// Prevent form submission on Enter in input
messageInput.addEventListener('submit', (e) => {
    e.preventDefault();
});

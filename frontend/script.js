/**
 * TEM Frontend JavaScript
 * FULLY HANDLED: Voice Input + Voice Output
 */

// ================= CONFIG =================
const API_BASE_URL = window.location.origin;
const USER_ID = localStorage.getItem("tem_user_id") || generateUserId();
localStorage.setItem("tem_user_id", USER_ID);

// ================= DOM =================
const chatContainer = document.getElementById("chatContainer");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const voiceBtn = document.getElementById("voiceBtn");
const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const recordingIndicator = document.getElementById("recordingIndicator");
const loadingOverlay = document.getElementById("loadingOverlay");
const userLevelEl = document.getElementById("userLevel");
const conversationCountEl = document.getElementById("conversationCount");

// ================= SETTINGS =================
let voiceResponseEnabled = true;
let autoScrollEnabled = true;

// ================= SPEECH =================
let recognition;
let isRecording = false;

// ================= INIT =================
document.addEventListener("DOMContentLoaded", () => {
  initSpeechRecognition();
  loadUserStats();
  loadSettings();
  setupEvents();
});

// ================= HELPERS =================
function generateUserId() {
  return "user_" + Date.now() + "_" + Math.random().toString(36).slice(2);
}

function setupEvents() {
  sendBtn.onclick = sendMessage;

  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  voiceBtn.onclick = toggleVoice;
  settingsBtn.onclick = () => settingsModal.classList.add("active");

  settingsModal.onclick = (e) => {
    if (e.target === settingsModal) settingsModal.classList.remove("active");
  };
}

// ================= VOICE INPUT =================
function initSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    voiceBtn.style.display = "none";
    return;
  }

  recognition = new SR();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-IN";

  recognition.onresult = (e) => {
    messageInput.value = e.results[0][0].transcript;
    stopRecording();
    sendMessage(); // auto-send after speaking
  };

  recognition.onerror = () => stopRecording();
  recognition.onend = () => stopRecording();
}

function toggleVoice() {
  if (!recognition) return;

  isRecording ? stopRecording() : startRecording();
}

function startRecording() {
  isRecording = true;
  voiceBtn.classList.add("recording");
  recordingIndicator.classList.add("active");

  recognition.lang = detectTelugu(messageInput.value) ? "te-IN" : "en-IN";

  try {
    recognition.start();
  } catch {
    stopRecording();
  }
}

function stopRecording() {
  isRecording = false;
  voiceBtn.classList.remove("recording");
  recordingIndicator.classList.remove("active");

  try {
    recognition.stop();
  } catch {}
}

// ================= SEND MESSAGE =================
async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;

  messageInput.value = "";
  addMessage("user", text);
  showLoading(true);

  try {
    const res = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, user_id: USER_ID }),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.message);

    addMessage("ai", data.response);
    updateUserStats(data.level, data.conversation_count);

    if (voiceResponseEnabled) speak(data.response);

  } catch {
    addMessage("ai", "Sorry, something went wrong. Please try again.");
  } finally {
    showLoading(false);
  }
}

// ================= CHAT UI =================
function addMessage(sender, text) {
  document.querySelector(".welcome-message")?.remove();

  const div = document.createElement("div");
  div.className = `message ${sender}-message`;

  div.innerHTML = `
    <div class="message-header">
      <span>${sender === "user" ? "👤 You" : "🎓 TEM"}</span>
      <span>${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
    </div>
    <div class="message-content">${escapeHtml(text)}</div>
  `;

  chatContainer.appendChild(div);
  if (autoScrollEnabled) chatContainer.scrollTop = chatContainer.scrollHeight;
}

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML.replace(/\n/g, "<br>");
}

// ================= VOICE OUTPUT =================
function speak(text) {
  if (!window.speechSynthesis) return;

  speechSynthesis.cancel();

  const u = new SpeechSynthesisUtterance(text);
  u.lang = detectTelugu(text) ? "te-IN" : "en-IN";
  u.rate = 0.95;
  u.pitch = 1;

  speechSynthesis.speak(u);
}

function detectTelugu(text) {
  return /[\u0C00-\u0C7F]/.test(text);
}

// ================= STATS =================
async function loadUserStats() {
  try {
    const r = await fetch(`${API_BASE_URL}/api/stats?user_id=${USER_ID}`);
    const d = await r.json();
    if (!d.error) updateUserStats(d.level, d.conversation_count);
  } catch {}
}

function updateUserStats(level, count) {
  userLevelEl.textContent = level;
  conversationCountEl.textContent = `${count} chats`;
  document.getElementById("modalLevel").textContent = level;
  document.getElementById("modalCount").textContent = count;
}

// ================= UI HELPERS =================
function showLoading(v) {
  loadingOverlay.classList.toggle("active", v);
}

// ================= SETTINGS =================
function loadSettings() {
  voiceResponseEnabled = localStorage.getItem("tem_voice_response") !== "false";
  autoScrollEnabled = localStorage.getItem("tem_auto_scroll") !== "false";

  document.getElementById("voiceResponseToggle").checked = voiceResponseEnabled;
  document.getElementById("autoScrollToggle").checked = autoScrollEnabled;

  document.getElementById("voiceResponseToggle").onchange = e =>
    localStorage.setItem("tem_voice_response", e.target.checked);

  document.getElementById("autoScrollToggle").onchange = e =>
    localStorage.setItem("tem_auto_scroll", e.target.checked);
      }

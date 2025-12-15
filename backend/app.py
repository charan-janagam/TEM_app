"""
Telugu English Mentor (TEM) - Backend API
Single-model OpenRouter integration (Trinity Mini - FREE)
FIXED: Strong mentor prompt
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import requests
from datetime import datetime
from database import Database

# -------------------- App Setup --------------------
app = Flask(__name__, static_folder="../frontend", static_url_path="")
CORS(app)

db = Database()

# -------------------- OpenRouter Config --------------------
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

MODEL_ID = "arcee-ai/trinity-mini:free"

# -------------------- SYSTEM PROMPT (FIXED) --------------------
SYSTEM_PROMPT = """
You are TEM, a Telugu English Mentor.

STRICT RULES (must follow):
- Always act like an English teacher
- Always correct wrong English
- Show the corrected sentence clearly
- Use simple, friendly English
- Encourage the learner

If the user's sentence is wrong:
1. Say "Good try!"
2. Show the correct sentence
3. Give a short explanation if needed

Example:
User: I am go to market yesterday
Assistant:
Good try 🙂
Correct sentence: I went to the market yesterday.
"""

# -------------------- OpenRouter Call --------------------
def call_openrouter(messages):
    if not OPENROUTER_API_KEY:
        return {"error": True, "message": "OPENROUTER_API_KEY not set"}

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://english-mentor.onrender.com",
        "X-Title": "Telugu English Mentor"
    }

    payload = {
        "model": MODEL_ID,
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}] + messages,
        "temperature": 0.6
    }

    try:
        res = requests.post(
            OPENROUTER_API_URL,
            headers=headers,
            json=payload,
            timeout=30
        )

        if res.status_code != 200:
            return {
                "error": True,
                "message": f"OpenRouter error {res.status_code}: {res.text}"
            }

        data = res.json()
        return {
            "error": False,
            "response": data["choices"][0]["message"]["content"]
        }

    except Exception as e:
        return {"error": True, "message": str(e)}

# -------------------- Routes --------------------
@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")

@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.json
    user_message = data.get("message", "").strip()
    user_id = data.get("user_id", "default_user")

    if not user_message:
        return jsonify({"error": True, "message": "Message cannot be empty"}), 400

    history = db.get_conversation_history(user_id, limit=6)

    messages = []
    for h in history:
        messages.append({"role": "user", "content": h["user_message"]})
        messages.append({"role": "assistant", "content": h["ai_response"]})

    messages.append({"role": "user", "content": user_message})

    result = call_openrouter(messages)

    if result["error"]:
        return jsonify(result), 500

    ai_response = result["response"]
    db.save_conversation(user_id, user_message, ai_response)

    count = db.get_conversation_count(user_id)
    level = "Beginner" if count <= 20 else "Intermediate" if count <= 50 else "Advanced"

    return jsonify({
        "error": False,
        "response": ai_response,
        "level": level,
        "conversation_count": count
    })

@app.route("/health")
def health():
    return jsonify({
        "status": "healthy",
        "time": datetime.now().isoformat()
    })

# -------------------- Run --------------------
if __name__ == "__main__":
    os.makedirs("data", exist_ok=True)
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)

"""
Telugu English Mentor (TEM) - Backend API
Flask-based REST API for AI-powered English learning
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import requests
import json
from datetime import datetime
from database import Database

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)  # Enable CORS for frontend-backend communication

# Initialize database
db = Database()

# OpenRouter API configuration
OPENROUTER_API_KEY = os.getenv('OPENROUTER_API_KEY', '')
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

# System prompt for TEM AI
SYSTEM_PROMPT = """You are TEM (Telugu English Mentor), a friendly, patient AI designed to help Telugu speakers learn fluent English.

Your role:
- Understand Telugu, Tanglish (Telugu written in English), and broken English
- Respond mainly in simple, natural English
- Use Telugu only when clarification is needed for complex concepts
- Correct mistakes politely and constructively
- Encourage confidence and celebrate progress
- Act like a human mentor, not a robot

Guidelines:
- When user makes mistakes, gently correct them: "Good try! Instead of 'I am going to market', say 'I am going to the market'"
- Provide simple explanations for grammar rules
- Use real-life conversation examples
- Be encouraging: "Great improvement!", "You're doing well!"
- If user speaks Telugu, understand it and respond in simple English
- For pronunciation help, explain in text how to say words
- Keep responses conversational and natural
- Adapt your teaching based on user's level (beginner/intermediate/advanced)

Remember: You're helping someone build confidence in English. Be patient, kind, and motivating!"""

def call_openrouter_api(messages, user_id):
    """
    Call OpenRouter API with conversation history
    """
    if not OPENROUTER_API_KEY:
        return {
            "error": True,
            "message": "API key not configured. Please set OPENROUTER_API_KEY environment variable."
        }
    
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "meta-llama/llama-3.1-8b-instruct:free",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT}
        ] + messages
    }
    
    try:
        response = requests.post(
            OPENROUTER_API_URL,
            headers=headers,
            json=payload,
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            ai_response = data['choices'][0]['message']['content']
            return {
                "error": False,
                "response": ai_response
            }
        else:
            return {
                "error": True,
                "message": f"API Error: {response.status_code} - {response.text}"
            }
    
    except requests.exceptions.Timeout:
        return {
            "error": True,
            "message": "Request timeout. Please try again."
        }
    except Exception as e:
        return {
            "error": True,
            "message": f"Error calling AI: {str(e)}"
        }

@app.route('/')
def index():
    """Serve the frontend"""
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/api/chat', methods=['POST'])
def chat():
    """
    Main chat endpoint
    Accepts user message and returns AI response
    """
    try:
        data = request.json
        user_message = data.get('message', '').strip()
        user_id = data.get('user_id', 'default_user')
        
        if not user_message:
            return jsonify({
                "error": True,
                "message": "Message cannot be empty"
            }), 400
        
        # Get conversation history (last 10 messages for context)
        history = db.get_conversation_history(user_id, limit=10)
        
        # Format history for API
        messages = []
        for msg in history:
            messages.append({"role": "user", "content": msg['user_message']})
            messages.append({"role": "assistant", "content": msg['ai_response']})
        
        # Add current message
        messages.append({"role": "user", "content": user_message})
        
        # Call AI API
        result = call_openrouter_api(messages, user_id)
        
        if result['error']:
            return jsonify(result), 500
        
        ai_response = result['response']
        
        # Save to database
        db.save_conversation(user_id, user_message, ai_response)
        
        # Update user level based on conversation count
        conversation_count = db.get_conversation_count(user_id)
        level = "Beginner"
        if conversation_count > 50:
            level = "Advanced"
        elif conversation_count > 20:
            level = "Intermediate"
        
        return jsonify({
            "error": False,
            "response": ai_response,
            "level": level,
            "conversation_count": conversation_count
        })
    
    except Exception as e:
        return jsonify({
            "error": True,
            "message": f"Server error: {str(e)}"
        }), 500

@app.route('/api/history', methods=['GET'])
def get_history():
    """
    Get conversation history for a user
    """
    user_id = request.args.get('user_id', 'default_user')
    limit = int(request.args.get('limit', 20))
    
    history = db.get_conversation_history(user_id, limit)
    
    return jsonify({
        "error": False,
        "history": history
    })

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """
    Get user statistics
    """
    user_id = request.args.get('user_id', 'default_user')
    
    conversation_count = db.get_conversation_count(user_id)
    
    # Determine level
    level = "Beginner"
    if conversation_count > 50:
        level = "Advanced"
    elif conversation_count > 20:
        level = "Intermediate"
    
    return jsonify({
        "error": False,
        "level": level,
        "conversation_count": conversation_count,
        "motivational_message": get_motivational_message(level, conversation_count)
    })

def get_motivational_message(level, count):
    """
    Generate motivational messages based on progress
    """
    messages = {
        "Beginner": [
            "Great start! Keep practicing daily!",
            "You're building a strong foundation!",
            "Every conversation makes you better!"
        ],
        "Intermediate": [
            "Excellent progress! You're getting fluent!",
            "Your confidence is growing!",
            "Keep up the amazing work!"
        ],
        "Advanced": [
            "Outstanding! You're nearly fluent!",
            "You're an inspiration to other learners!",
            "Your English skills are impressive!"
        ]
    }
    
    import random
    return random.choice(messages.get(level, messages["Beginner"]))

@app.route('/api/clear_history', methods=['POST'])
def clear_history():
    """
    Clear conversation history for a user
    """
    data = request.json
    user_id = data.get('user_id', 'default_user')
    
    db.clear_user_history(user_id)
    
    return jsonify({
        "error": False,
        "message": "History cleared successfully"
    })

@app.route('/health', methods=['GET'])
def health_check():
    """
    Health check endpoint for deployment platforms
    """
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.now().isoformat()
    })

if __name__ == '__main__':
    # Create data directory if it doesn't exist
    os.makedirs('data', exist_ok=True)
    
    # Run the app
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)

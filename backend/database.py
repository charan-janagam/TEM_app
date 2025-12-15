"""
Database handler for TEM app
Manages conversation history and user data using SQLite
"""

import sqlite3
import json
from datetime import datetime
import os

class Database:
    def __init__(self, db_path='data/conversations.db'):
        """Initialize database connection and create tables"""
        self.db_path = db_path
        
        # Ensure data directory exists
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        
        self.init_database()
    
    def get_connection(self):
        """Get database connection"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row  # Return rows as dictionaries
        return conn
    
    def init_database(self):
        """Create database tables if they don't exist"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        # Conversations table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                user_message TEXT NOT NULL,
                ai_response TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # User stats table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_stats (
                user_id TEXT PRIMARY KEY,
                total_conversations INTEGER DEFAULT 0,
                level TEXT DEFAULT 'Beginner',
                last_active DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create index for faster queries
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_user_id 
            ON conversations(user_id)
        ''')
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_timestamp 
            ON conversations(timestamp)
        ''')
        
        conn.commit()
        conn.close()
    
    def save_conversation(self, user_id, user_message, ai_response):
        """
        Save a conversation to the database
        """
        conn = self.get_connection()
        cursor = conn.cursor()
        
        timestamp = datetime.now().isoformat()
        
        # Insert conversation
        cursor.execute('''
            INSERT INTO conversations (user_id, user_message, ai_response, timestamp)
            VALUES (?, ?, ?, ?)
        ''', (user_id, user_message, ai_response, timestamp))
        
        # Update user stats
        cursor.execute('''
            INSERT INTO user_stats (user_id, total_conversations, last_active)
            VALUES (?, 1, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                total_conversations = total_conversations + 1,
                last_active = ?
        ''', (user_id, timestamp, timestamp))
        
        conn.commit()
        conn.close()
    
    def get_conversation_history(self, user_id, limit=20):
        """
        Get conversation history for a user
        Returns list of conversations in chronological order
        """
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT user_message, ai_response, timestamp
            FROM conversations
            WHERE user_id = ?
            ORDER BY id DESC
            LIMIT ?
        ''', (user_id, limit))
        
        rows = cursor.fetchall()
        conn.close()
        
        # Convert to list of dictionaries and reverse to get chronological order
        history = [dict(row) for row in rows]
        history.reverse()
        
        return history
    
    def get_conversation_count(self, user_id):
        """
        Get total number of conversations for a user
        """
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT total_conversations
            FROM user_stats
            WHERE user_id = ?
        ''', (user_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        return row['total_conversations'] if row else 0
    
    def clear_user_history(self, user_id):
        """
        Clear all conversation history for a user
        """
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            DELETE FROM conversations
            WHERE user_id = ?
        ''', (user_id,))
        
        cursor.execute('''
            DELETE FROM user_stats
            WHERE user_id = ?
        ''', (user_id,))
        
        conn.commit()
        conn.close()
    
    def get_user_level(self, user_id):
        """
        Get user's current level
        """
        count = self.get_conversation_count(user_id)
        
        if count > 50:
            return "Advanced"
        elif count > 20:
            return "Intermediate"
        else:
            return "Beginner"
    
    def get_all_users(self):
        """
        Get list of all users (for admin purposes)
        """
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT user_id, total_conversations, level, last_active
            FROM user_stats
            ORDER BY last_active DESC
        ''')
        
        rows = cursor.fetchall()
        conn.close()
        
        return [dict(row) for row in rows]

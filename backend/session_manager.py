import os
import uuid
import time
from datetime import datetime
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()

SESSION_TTL = int(os.getenv("SESSION_TTL", 3600))

class SessionManager:
    def __init__(self):
        self.sessions: Dict[str, Dict[str, Any]] = {}

    def get_or_create_session(self, session_id: Optional[str] = None) -> str:
        if session_id and session_id in self.sessions:
            # Refresh TTL on access
            self.sessions[session_id]['last_accessed'] = time.time()
            return session_id
        
        new_id = str(uuid.uuid4())
        self.sessions[new_id] = {
            "id": new_id,
            "created_at": datetime.now().isoformat(),
            "last_accessed": time.time(),
            "audio_bytes": None,
            "file_metadata": None,
            "processed_features": None,
            "transcript": None,
            "processing_status": "idle",  # idle, processing, ready, error
            "processing_eta": None,
            "error_message": None
        }
        return new_id

    def update_session(self, session_id: str, **kwargs):
        if session_id in self.sessions:
            self.sessions[session_id].update(kwargs)
            self.sessions[session_id]['last_accessed'] = time.time()

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        return self.sessions.get(session_id)

    def cleanup_expired_sessions(self):
        now = time.time()
        expired = [sid for sid, s in self.sessions.items() if now - s['last_accessed'] > SESSION_TTL]
        for sid in expired:
            del self.sessions[sid]
        return len(expired)

# Singleton instance
session_manager = SessionManager()
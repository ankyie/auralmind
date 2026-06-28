import os
import io
import time
import asyncio
from typing import Optional
from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
import librosa  # Added: needed for audio loading in async processing

from session_manager import session_manager
from audio_processor import audio_processor
from lm_studio_client import LmStudioClient

load_dotenv()

app = FastAPI(title="AuralMind API", version="1.0.0")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

lm_client = LmStudioClient(os.getenv("LM_STUDIO_URL", "http://localhost:1234/v1/chat/completions"))

# --- Models ---
class QueryRequest(BaseModel):
    session_id: str
    query: str

class QueryResponse(BaseModel):
    response: str

# --- Routes ---

@app.get("/health")
def health_check():
    return {
        "status": "ok", 
        "lm_studio": LmStudioClient.check_health(),
        "sessions": len(session_manager.sessions)
    }

@app.post("/upload")
async def upload_audio(
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(None)
):
    # 1. Validate MIME type
    if not file.content_type or not file.content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="Invalid audio file type.")
    
    # 2. Get or create session
    sid = session_manager.get_or_create_session(session_id)
    
    # 3. Read file
    audio_bytes = await file.read()
    max_size = int(os.getenv("MAX_AUDIO_SIZE_MB", 50)) * 1024 * 1024
    if len(audio_bytes) > max_size:
        raise HTTPException(status_code=413, detail="File too large.")
    
    # 4. Update session state (store MIME type for waveform response)
    session_manager.update_session(sid, 
                                   audio_bytes=audio_bytes, 
                                   file_metadata={"filename": file.filename, "size": len(audio_bytes), "mime_type": file.content_type or "audio/mpeg"},
                                   processing_status="processing",
                                   processing_eta=None,
                                   error_message=None)
    
    # 5. Start async processing
    asyncio.create_task(process_audio_async(sid))
    
    return {"session_id": sid, "status": "processing"}

async def process_audio_async(session_id: str):
    """Background task to process audio with progress tracking.
    
    Uses a single numpy array (y, sr) loaded once to avoid redundant file I/O.
    Progress is simulated with small sleeps so the frontend polling has time
    to pick up intermediate ETA updates.
    """
    try:
        session = session_manager.get_session(session_id)
        if not session or not session['audio_bytes']:
            return

        # Step 1: Load audio ONCE to get duration for ETA
        y, sr = librosa.load(io.BytesIO(session['audio_bytes']), sr=16000, mono=True)
        duration = len(y) / sr
        
        # ETA: 1.5s processing per 1s audio + 2s base transcription time
        estimated_time = (duration * 1.5) + 2.0
        session_manager.update_session(session_id, processing_eta=estimated_time)
        
        # Step 2: Feature extraction phase (uses y, sr directly — no reload)
        metadata = audio_processor.extract_features_from_arrays(y, sr)
        # Simulate progress with small sleeps so frontend polling catches updates
        await asyncio.sleep(0.1)
        session_manager.update_session(session_id, processing_eta=estimated_time * 0.6)
        await asyncio.sleep(0.1)
        session_manager.update_session(session_id, processing_eta=estimated_time * 0.3)
        
        # Step 3: Transcription phase (uses y directly — no reload)
        transcript = audio_processor.transcribe_from_array(y, sr)
        await asyncio.sleep(0.1)
        session_manager.update_session(session_id, processing_eta=estimated_time * 0.15)
        await asyncio.sleep(0.1)
        session_manager.update_session(session_id, processing_eta=estimated_time * 0.05)
        
        # Step 4: Finalize (95% → 100%)
        session_manager.update_session(
            session_id, 
            processed_features=metadata, 
            transcript=transcript,
            processing_status="ready",
            processing_eta=None
        )
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[AuralMind] Audio processing error for session {session_id}: {error_trace}")
        session_manager.update_session(session_id, processing_status="error", error_message=str(e))

@app.get("/session/{session_id}")
def get_session_status(session_id: str):
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Don't return raw bytes in the status response to save bandwidth
    clean_session = {k: v for k, v in session.items() if k != 'audio_bytes'}
    return clean_session

@app.get("/waveform/{session_id}")
def get_waveform(session_id: str):
    session = session_manager.get_session(session_id)
    if not session or not session.get('audio_bytes'):
        raise HTTPException(status_code=404, detail="Audio not found for session")
    
    # Return audio bytes as a response
    # wavesurfer.js can load blobs directly from fetch
    # We return a generic audio type or the original type
    return StreamingResponse(
        io.BytesIO(session['audio_bytes']),
        media_type=session.get('file_metadata', {}).get('mime_type', 'audio/mpeg'),
        headers={"Content-Disposition": "inline"}
    )

@app.post("/query", response_model=QueryResponse)
async def query_ai(req: QueryRequest):
    session = session_manager.get_session(req.session_id)
    
    # Construct context if audio exists
    context_text = ""
    if session and session.get('processing_status') == 'ready':
        meta = session.get('processed_features', {})
        transcript = session.get('transcript', '')
        
        context_text = f"""
        **Audio Context:**
        - **Transcript:** {transcript[:2000]}...
        - **Acoustic Features:**
          - Avg Loudness (RMS): {meta.get('avg_rms', 'N/A')}
          - Avg Spectral Centroid: {meta.get('avg_spectral_centroid', 'N/A')}
          - Duration: {meta.get('duration', 'N/A')}s
          - Estimated Gender: {meta.get('detected_gender', 'N/A')}
        """

    messages = [
        {
            "role": "system", 
            "content": "You are AuralMind, an audio-aware AI assistant developed by Students of Camellia Institute of Technology (2022-26 CSE). "
                       "You analyze audio files and answer user queries. "
                       "If the user asks a general question unrelated to the audio, answer normally. "
                       "Be concise and helpful."
        },
        {
            "role": "user", 
            "content": f"{context_text}\n\nUser Query: {req.query}"
        }
    ]
    
    response_text = lm_client.generate_response(messages)
    return {"response": response_text}

@app.post("/query/stream")
async def query_ai_stream(req: QueryRequest):
    session = session_manager.get_session(req.session_id)
    
    context_text = ""
    if session and session.get('processing_status') == 'ready':
        meta = session.get('processed_features', {})
        transcript = session.get('transcript', '')
        context_text = f"""
        **Audio Context:**
        - **Transcript:** {transcript[:2000]}...
        - **Acoustic Features:**
          - Avg Loudness (RMS): {meta.get('avg_rms', 'N/A')}
          - Avg Spectral Centroid: {meta.get('avg_spectral_centroid', 'N/A')}
          - Duration: {meta.get('duration', 'N/A')}s
          - Estimated Gender: {meta.get('detected_gender', 'N/A')}
        """

    messages = [
        {
            "role": "system", 
            "content": "You are AuralMind, an audio-aware AI assistant developed by Students of Camellia Institute of Technology (2022-26 CSE). "
                       "You analyze audio files and answer user queries. "
                       "If the user asks a general question unrelated to the audio, answer normally. "
                       "Be concise and helpful."
        },
        {
            "role": "user", 
            "content": f"{context_text}\n\nUser Query: {req.query}"
        }
    ]
    
    return StreamingResponse(
        lm_client.generate_response(messages, stream=True),
        media_type="text/event-stream"
    )

# Session cleanup task (Issue #10 fix)
async def cleanup_task():
    """Periodically clean up expired sessions to prevent memory leaks."""
    while True:
        await asyncio.sleep(300)  # Every 5 minutes
        count = session_manager.cleanup_expired_sessions()
        if count > 0:
            print(f"[Cleanup] Removed {count} expired sessions")

# Start cleanup task on app startup
import asyncio as aio
try:
    loop = aio.new_event_loop()
    aio.ensure_task(cleanup_task())
except Exception:
    # Fallback: run cleanup in existing event loop
    pass

@app.on_event("startup")
async def startup_event():
    """Start the session cleanup background task."""
    import asyncio
    asyncio.create_task(cleanup_task())
    print("[AuralMind] Session cleanup task started")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=os.getenv("HOST", "0.0.0.0"), port=int(os.getenv("PORT", 8000)))

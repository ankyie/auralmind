# 🧠 AuralMind

A production-ready, browser-based AI chatbot that analyzes audio files using local AI models. It combines acoustic feature extraction with Large Language Model (LLM) reasoning to answer queries about your audio data.

**Architecture**: React (Vite) + FastAPI (Python) + LM Studio (Local LLM)
**Optimization**: Designed for low-VRAM hardware (≤2GB) using CPU-first processing and quantized models.

---

## ✨ Features

- **Audio Analysis**: Extracts RMS loudness, spectral centroid, zero-crossing rate, and MFCCs.
- **Local Transcription**: Uses `faster-whisper` (Tiny/Base model) for privacy-focused transcription.
- **AI Context**: Passes extracted features and transcripts to your local LLM for context-aware answers.
- **Low-VRAM Optimized**: CPU-first execution, `int8` quantization, and lightweight dependencies.
- **Real-time UI**: Waveform visualization, progress tracking, and streaming responses.

---

## 🚀 Quick Start

### Prerequisites
1. **Python 3.9+**
2. **Node.js 18+**
3. **LM Studio**: Download from [lmstudio.ai](https://lmstudio.ai/) and load a model (e.g., `qwen2.5-1.5b-instruct-q4_k_m.gguf` or `phi-3-mini-4k-instruct-q4.gguf`). Ensure the local server is running on `localhost:1234`.

### 1. Backend Setup

```bash
# Navigate to backend folder
cd backend

# Create virtual environment
python -m venv venv
source venv/Scripts/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment (optional, uses defaults if missing)
# cp .env.example .env  # Edit if needed

# Run the server
uvicorn main:app --reload
```
*The backend will start at `http://localhost:8000`.*

### 2. Frontend Setup

```bash
# Navigate to frontend folder
cd frontend

# Install dependencies
npm install

# Run the development server
npm run dev
```
*The frontend will start at `http://localhost:5173`.*

---

## ⚙️ Configuration

### `.env` (Backend)
Located in `/backend/.env`.

| Variable | Description | Default |
| :--- | :--- | :--- |
| `LM_STUDIO_URL` | Endpoint for the local LLM | `http://localhost:1234/v1/chat/completions` |
| `MAX_AUDIO_SIZE_MB` | Max upload size limit | `50` |
| `SESSION_TTL` | Session expiry in seconds | `3600` |

### Model Constraints
- **Whisper Model**: Uses `tiny` by default in `audio_processor.py` for speed and low RAM usage. Change `MODEL_SIZE` to `"base"` in the code if you have more resources and need better accuracy.
- **Compute Type**: Set to `int8` for CPU efficiency.

---

## 🛠️ Tech Stack

- **Frontend**: React 18, Vite 5, Zustand, Tailwind CSS, WaveSurfer.js 7
- **Backend**: FastAPI, Uvicorn, Python 3.10+
- **AI/ML**: PyTorch (CPU), librosa, faster-whisper, pyannote.audio
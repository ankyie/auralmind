import os
import io
import numpy as np
import librosa
import time
from faster_whisper import WhisperModel
from typing import Dict, Any, Tuple

# Low-VRAM Configuration
MODEL_SIZE = "tiny"  # Use "base" if more accuracy is needed and RAM permits
COMPUTE_TYPE = "int8"  # Quantized for CPU/Low-VRAM
DEVICE = "cpu"  # Force CPU to avoid GPU memory fragmentation

class AudioProcessor:
    def __init__(self):
        self.whisper_model = None
        self._init_whisper()

    def _init_whisper(self):
        """Initialize Whisper model with low-resource constraints."""
        try:
            print(f"Loading {MODEL_SIZE} Whisper model with {COMPUTE_TYPE} precision...")
            self.whisper_model = WhisperModel(
                MODEL_SIZE, 
                device=DEVICE, 
                compute_type=COMPUTE_TYPE,
                download_root="./models" # Local cache to avoid re-downloads
            )
            print("Whisper model loaded successfully.")
        except Exception as e:
            print(f"Error loading Whisper model: {e}")
            raise

    def extract_features(self, audio_bytes: bytes) -> Dict[str, Any]:
        """
        Extract acoustic features from audio bytes.
        Returns: metadata_dict with features (no transcription).
        """
        y, sr = librosa.load(io.BytesIO(audio_bytes), sr=16000, mono=True)
        return self._extract_features_from(y, sr)

    def extract_features_from_arrays(self, y: np.ndarray, sr: int) -> Dict[str, Any]:
        """
        Extract acoustic features from already-loaded numpy array.
        Avoids re-loading audio from bytes — used for progress tracking.
        """
        return self._extract_features_from(y, sr)

    def _extract_features_from(self, y: np.ndarray, sr: int) -> Dict[str, Any]:
        """
        Core feature extraction logic — takes numpy array directly.
        """
        start_time = time.time()
        
        # 2. Extract Acoustic Features
        rms = librosa.feature.rms(y=y)[0]
        spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        zcr = librosa.feature.zero_crossing_rate(y)[0]
        mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        
        # Calculate statistics
        avg_rms = np.mean(rms)
        max_rms = np.max(rms)
        avg_spectral_centroid = np.mean(spectral_centroid)
        total_duration = len(y) / sr
        
        # Gender/Speaker Detection (CPU-only approximation)
        gender = self._detect_gender(y, sr)

        processing_time = time.time() - start_time
        
        metadata = {
            "duration": total_duration,
            "sample_rate": sr,
            "avg_rms": float(avg_rms),
            "max_rms": float(max_rms),
            "avg_spectral_centroid": float(avg_spectral_centroid),
            "avg_zcr": float(np.mean(zcr)),
            "mfcc_mean": np.mean(mfccs, axis=1).tolist(),
            "detected_gender": gender,
            "processing_time": processing_time
        }
        
        return metadata

    def transcribe(self, audio_bytes: bytes) -> str:
        """
        Transcribe audio bytes using Whisper.
        Returns: transcript string.
        """
        y_for_transcribe, sr_for_transcribe = librosa.load(
            io.BytesIO(audio_bytes), sr=16000, mono=True
        )
        return self._transcribe_from_array(y_for_transcribe)

    def transcribe_from_array(self, y: np.ndarray, sr: int = 16000) -> str:
        """
        Transcribe from already-loaded numpy array.
        Avoids re-loading audio from bytes — used for progress tracking.
        """
        return self._transcribe_from_array(y)

    def _transcribe_from_array(self, y: np.ndarray) -> str:
        """
        Core transcription logic — takes numpy array directly.
        """
        segments, info = self.whisper_model.transcribe(
            y,
            beam_size=1,
            vad_filter=False,
        )
        
        transcript = ""
        for segment in segments:
            transcript += segment.text + " "
        return transcript.strip()

    def process_audio(self, audio_bytes: bytes) -> Tuple[Dict[str, Any], str]:
        """
        Legacy method: extract features and transcribe.
        Returns: (metadata_dict, transcript_string)
        """
        metadata = self.extract_features(audio_bytes)
        transcript = self.transcribe(audio_bytes)
        return metadata, transcript

    def _detect_gender(self, y: np.ndarray, sr: int) -> str:
        """
        Basic gender detection using pitch estimation (CPU optimized).
        Fallback if pyannote is too heavy.
        """
        try:
            # Use librosa's pitch estimation which is CPU optimized
            f0 = librosa.pyin(y, fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C7'))[0]
            # Remove NaN values
            f0 = f0[~np.isnan(f0)]
            
            if len(f0) == 0:
                return "Unknown"
                
            mean_pitch = np.mean(f0)
            
            # Simplified heuristic based on typical pitch ranges
            # Male: ~85-180 Hz, Female: ~165-255 Hz
            if mean_pitch < 120:
                return "Male"
            elif mean_pitch > 200:
                return "Female"
            else:
                return "Androgyne/Unknown"
        except Exception:
            return "Unknown"

# Singleton instance
audio_processor = AudioProcessor()
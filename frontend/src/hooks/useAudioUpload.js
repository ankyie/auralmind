import { useRef } from 'react';
import { useStore } from '../store/sessionStore';
import { uploadAudio, getSessionStatus } from '../services/api';

const MESSAGES = [
  'Extracting features...',
  'Transcribing audio...',
  'Calculating loudness...',
  'Analyzing spectral data...',
  'Detecting speaker characteristics...',
  'Computing MFCCs...',
  'Building audio profile...',
  'Normalizing acoustic features...',
];

function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return `${s}s`;
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return `${hours}h ${remMins}m ${secs}s`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h ${remMins}m`;
}

export const useAudioUpload = () => {
  const { setSessionId, setProcessingStatus, setError, updateProgress, setProcessingMessage, updateProcessingElapsed } = useStore();
  
  const progressIntervalRef = useRef(null);
  const msgIntervalRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const elapsedRef = useRef(0);
  const msgIndexRef = useRef(0);

  const stopProgress = () => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    if (msgIntervalRef.current) clearInterval(msgIntervalRef.current);
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    progressIntervalRef.current = null;
    msgIntervalRef.current = null;
    pollIntervalRef.current = null;
  };

  const startFakeProgress = () => {
    elapsedRef.current = 0;
    msgIndexRef.current = 0;
    
    // Start at 1% immediately
    updateProgress(1, 0);
    setProcessingMessage('Extracting features...');

    // Fake progress update every 500ms
    progressIntervalRef.current = setInterval(() => {
      elapsedRef.current += 0.5;
      const elapsed = elapsedRef.current;
      // Linear: 1% → 99% over 120 seconds
      const progress = Math.min(99, Math.max(1, Math.floor((elapsed / 120) * 99)));
      updateProgress(progress, elapsed);
    }, 500);

    // Cycle messages every 5 seconds
    msgIntervalRef.current = setInterval(() => {
      msgIndexRef.current = (msgIndexRef.current + 1) % MESSAGES.length;
      setProcessingMessage(MESSAGES[msgIndexRef.current]);
    }, 5000);
  };

  const pollBackend = async (sid) => {
    try {
      const res = await getSessionStatus(sid);
      const realStatus = res.data.processing_status;
      
      if (realStatus === 'ready') {
        stopProgress();
        setProcessingStatus('ready');
        updateProgress(100, elapsedRef.current);
        return true;
      }
      if (realStatus === 'error') {
        stopProgress();
        setProcessingStatus('error');
        setError(res.data.error_message || 'Unknown processing error');
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const startPolling = (sid) => {
    pollIntervalRef.current = setInterval(() => {
      pollBackend(sid);
    }, 1000);
  };

  const handleDrop = async (file) => {
    if (!file.type.startsWith('audio/')) {
      setError('Please upload a valid audio file (MP3, WAV, etc.)');
      return;
    }

    try {
      setProcessingStatus('uploading');
      updateProgress(1, 0);
      setProcessingMessage('Uploading audio...');
      
      const res = await uploadAudio(file);
      const sid = res.data.session_id;
      
      setSessionId(sid);
      setProcessingStatus('processing');
      
      // Start fake progress IMMEDIATELY after getting session ID
      startFakeProgress();
      startPolling(sid);
    } catch (err) {
      console.error(err);
      setError('Failed to upload audio. Ensure backend is running.');
      setProcessingStatus('idle');
      stopProgress();
    }
  };

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (file) handleDrop(file);
  };

  // Cleanup on unmount
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', stopProgress);
  }

  return { handleDrop, handleFileInput, stopProgress };
};
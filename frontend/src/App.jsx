import { useState, useCallback, useRef, useEffect } from 'react';
import { useStore } from './store/sessionStore';
import FileUpload from './components/FileUpload';
import ChatWindow from './components/ChatWindow';
import { uploadAudio, getSessionStatus } from './services/api';

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

// Piecewise progress: fast initial growth, then slows down — guaranteed to reach 99%
function progressAtTime(elapsed) {
  if (elapsed < 30) {
    // First 30s: 1% → 40% (fast start)
    return Math.min(40, Math.max(1, Math.floor(40 * (elapsed / 30))));
  } else if (elapsed < 90) {
    // 30-90s: 40% → 75% (medium speed)
    return Math.min(75, Math.max(40, Math.floor(40 + 35 * ((elapsed - 30) / 60))));
  } else if (elapsed < 180) {
    // 90-180s: 75% → 99% (slow end)
    return Math.min(99, Math.max(75, Math.ceil(75 + 24 * ((elapsed - 90) / 90))));
  } else {
    // After 180s: 99%
    return 99;
  }
}

// Fast growth rate for post-backend completion phase — linear ramp for reliability
function fastProgressAtTime(elapsed) {
  // Linear: 99% in 8 seconds after backend completes
  return Math.min(99, Math.max(1, Math.ceil((elapsed / 8) * 99)));
}

function App() {
  const { sessionId, processingStatus, error, setError, setSessionId, setProcessingStatus } = useStore();
  
  // Local progress state
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const [progressOpacity, setProgressOpacity] = useState(1);
  const [showWaveform, setShowWaveform] = useState(false);
  const [waveformOpacity, setWaveformOpacity] = useState(0);
  
  // Refs for intervals (don't trigger re-renders)
  const progressIntervalRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const elapsedRef = useRef(0);
  const isActiveRef = useRef(false);
  const startTimeRef = useRef(0);
  const backendCompleteTimeRef = useRef(0);
  const postBackendElapsedRef = useRef(0);
  const backendDoneRef = useRef(false);
  const phaseRef = useRef('pre-backend');
  const fadeOutTimerRef = useRef(null);
  const fadeInTimerRef = useRef(null);
  const uploadEpochRef = useRef(0);

  // Upload handler
  const handleUpload = useCallback(async (file) => {
    // Increment epoch — this invalidates ALL old intervals/intentionally
    const newEpoch = uploadEpochRef.current + 1;
    uploadEpochRef.current = newEpoch;
    
    // Always stop the previous interval unconditionally
    isActiveRef.current = false;
    if (progressIntervalRef.current) { clearInterval(progressIntervalRef.current); progressIntervalRef.current = null; }
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    if (fadeOutTimerRef.current) clearTimeout(fadeOutTimerRef.current);
    if (fadeInTimerRef.current) clearTimeout(fadeInTimerRef.current);
    
    // Reset ALL refs to fresh state
    elapsedRef.current = 0;
    postBackendElapsedRef.current = 0;
    startTimeRef.current = Date.now();
    backendCompleteTimeRef.current = 0;
    backendDoneRef.current = false;
    phaseRef.current = 'pre-backend';
    window._auralmindLoggedBackend = false;
    
    // Reset state — isActiveRef will be set to true after this
    
    setProgress(1);
    setElapsed(0);
    setMessageIndex(0);
    setProgressOpacity(1);
    setShowWaveform(false);
    setWaveformOpacity(0);
    setProcessingStatus('uploading');
    
    const res = await uploadAudio(file);
    const sid = res.data.session_id;
    
    setSessionId(sid);
    setProcessingStatus('processing');
    isActiveRef.current = true;
    
    // Start fake progress — non-linear (fast start, slow end)
    let lastProgress = 1;
    let progressStarted = false;
    const thisEpoch = newEpoch;
    progressIntervalRef.current = setInterval(() => {
      // Check if this interval is from an old upload epoch
      if (uploadEpochRef.current !== thisEpoch) return;
      
      const now = Date.now();
      const realElapsed = (now - startTimeRef.current) / 1000;
      elapsedRef.current = realElapsed;
      
      // Ensure progress always grows — never goes backward
      let p;
      if (phaseRef.current === 'post-backend') {
        // Post-backend: linear fast growth from current value to 99% in 8 seconds
        const postElapsed = (now - backendCompleteTimeRef.current) / 1000;
        const postStartProgress = lastProgress;
        // Linear interpolation: postStartProgress at t=0 → 99 at t=8
        p = postStartProgress + ((99 - postStartProgress) * Math.min(1, postElapsed / 8));
        // Update lastProgress to the new value
        lastProgress = Math.max(lastProgress, Math.ceil(p));
      } else {
        p = progressAtTime(realElapsed);
        // Always increase or stay same — never decrease
        p = Math.max(p, lastProgress);
        lastProgress = Math.ceil(p);
      }
      
      const displayProgress = Math.min(99, Math.ceil(p));
      
      // Debug logging
      if (!progressStarted) {
        progressStarted = true;
        console.log('[AuralMind] Progress started. Phase:', phaseRef.current, 'startTime:', new Date(startTimeRef.current).toISOString());
      }
      if (phaseRef.current === 'post-backend' && !window._auralmindLoggedBackend) {
        window._auralmindLoggedBackend = true;
        console.log('[AuralMind] Backend completed! lastProgress:', lastProgress, 'backendCompleteTime:', new Date(backendCompleteTimeRef.current).toISOString());
      }
      if (displayProgress !== progress) {
        console.log('[AuralMind] Progress update:', displayProgress, 'elapsed:', realElapsed.toFixed(1), 'phase:', phaseRef.current);
      }
      
      setProgress(displayProgress);
      setElapsed(realElapsed);
    }, 200);
    
    // Cycle messages every 5 seconds — simple index swap
    let msgIndex = 0;
    pollIntervalRef.current = setInterval(() => {
      // Check if this interval is from an old upload epoch
      if (uploadEpochRef.current !== thisEpoch) return;
      msgIndex = (msgIndex + 1) % MESSAGES.length;
      setMessageIndex(msgIndex);
    }, 5000);
    
    // Poll backend every 500ms
    const poll = async () => {
      // Check if this interval is from an old upload epoch
      if (uploadEpochRef.current !== thisEpoch) return;
      if (backendDoneRef.current) return;
      
      try {
        const res = await getSessionStatus(sid);
        const realStatus = res.data.processing_status;
        
        if (realStatus === 'ready') {
          backendDoneRef.current = true;
          phaseRef.current = 'post-backend';
          backendCompleteTimeRef.current = Date.now();
          postBackendElapsedRef.current = 0;
          return;
        }
        
        if (realStatus === 'error') {
          isActiveRef.current = false;
          backendDoneRef.current = true;
          phaseRef.current = 'done';
          if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setProcessingStatus('error');
          setError(res.data.error_message || 'Unknown processing error');
          return;
        }
      } catch {
        // Keep polling
      }
    };
    
    // Poll immediately and then every 500ms
    await poll();
    const pollInterval = setInterval(poll, 500);
    pollIntervalRef.current = pollInterval;
  }, [setError, setSessionId, setProcessingStatus]);

  // Monitor for phase transition (post-backend → done when progress reaches 99%)
  // Also handles safety net: if pre-backend reaches 99% and backend never completed
  useEffect(() => {
    if (progress < 99) return;
    
    // Force progress to 99 before fading out
    setProgress(99);
    
    // If backend never completed, just show the chat without waveform
    if (phaseRef.current === 'pre-backend') {
      phaseRef.current = 'done';
      setTimeout(() => {
        setProgressOpacity(0);
      }, 500);
      return;
    }
    
    if (phaseRef.current !== 'post-backend') return;
    
    // Progress reached 99% — start fade out
    phaseRef.current = 'done';
    
    // Fade out progress overlay after 0.5s
    fadeOutTimerRef.current = setTimeout(() => {
      setProgressOpacity(0);
      
      // After fade out completes, show waveform
      fadeInTimerRef.current = setTimeout(() => {
        setShowWaveform(true);
        setProcessingStatus('ready');
        
        // Fade in waveform
        setTimeout(() => setWaveformOpacity(1), 50);
      }, 500);
    }, 500);
  }, [progress]);

  // Cleanup when sessionId changes to null (reset session)
  useEffect(() => {
    if (!sessionId) {
      // Session was reset — clean up all intervals and timers
      isActiveRef.current = false;
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (fadeOutTimerRef.current) clearTimeout(fadeOutTimerRef.current);
      if (fadeInTimerRef.current) clearTimeout(fadeInTimerRef.current);
      
      // Reset local state
      setProgress(0);
      setElapsed(0);
      setMessageIndex(0);
      setProgressOpacity(1);
      setShowWaveform(false);
      setWaveformOpacity(0);
      setProcessingStatus('idle');
      
      console.log('[AuralMind] Session reset — all intervals cleared');
    }
  }, [sessionId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (fadeOutTimerRef.current) clearTimeout(fadeOutTimerRef.current);
      if (fadeInTimerRef.current) clearTimeout(fadeInTimerRef.current);
    };
  }, []);

  // Global Error Handling
  if (error && !sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 p-4">
        <div className="text-center max-w-md bg-zinc-900 p-6 rounded-xl border border-zinc-800">
          <h2 className="text-xl font-bold text-red-400 mb-2">Error</h2>
          <p className="text-zinc-400 mb-4">{error}</p>
          <button 
            onClick={() => setError(null)}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  // Pass progress values as props to ChatWindow
  const progressContext = {
    progress,
    elapsed,
    messageIndex,
    progressOpacity,
    showWaveform,
    waveformOpacity,
    onUpload: handleUpload,
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm py-3 px-6 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-md shadow-lg shadow-violet-900/20" />
          <span className="font-bold text-lg tracking-tight text-zinc-100">AuralMind</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500 border border-zinc-700">Beta</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {sessionId && (
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                processingStatus === 'ready' ? 'bg-green-500' : 
                processingStatus === 'processing' ? 'bg-yellow-500 animate-pulse' : 'bg-zinc-600'
              }`} />
              <span className="text-zinc-400 hidden sm:inline">
                {processingStatus === 'ready' ? 'Audio Ready' : 'Processing...'}
              </span>
            </div>
          )}
          <a 
            href="https://github.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            GitHub
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative w-full max-w-5xl mx-auto p-4 sm:p-6">
        {!sessionId ? (
          // Landing / Upload View
          <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] animate-in fade-in duration-500">
            <div className="text-center mb-8">
              <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400 mb-4">
                Audio-Aware Intelligence
              </h1>
              <p className="text-zinc-400 text-lg max-w-xl mx-auto">
                Upload an audio file to analyze acoustic features, transcribe speech, and query insights using a local AI model.
              </p>
            </div>
            
            <div className="w-full max-w-lg">
              <FileUpload onUpload={handleUpload} />
            </div>

            <div className="mt-12 grid grid-cols-3 gap-8 text-center w-full max-w-2xl">
              <div className="space-y-2">
                <div className="w-10 h-10 bg-zinc-900 rounded-lg flex items-center justify-center mx-auto border border-zinc-800">
                  <svg className="w-5 h-5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                </div>
                <h3 className="font-medium text-zinc-200">Analysis</h3>
                <p className="text-xs text-zinc-500">MFCCs, Spectral Centroid, RMS</p>
              </div>
              <div className="space-y-2">
                <div className="w-10 h-10 bg-zinc-900 rounded-lg flex items-center justify-center mx-auto border border-zinc-800">
                  <svg className="w-5 h-5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                </div>
                <h3 className="font-medium text-zinc-200">Transcription</h3>
                <p className="text-xs text-zinc-500">Local Whisper Tiny/Base</p>
              </div>
              <div className="space-y-2">
                <div className="w-10 h-10 bg-zinc-900 rounded-lg flex items-center justify-center mx-auto border border-zinc-800">
                  <svg className="w-5 h-5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                </div>
                <h3 className="font-medium text-zinc-200">AI Query</h3>
                <p className="text-xs text-zinc-500">Context-aware answers</p>
              </div>
            </div>
          </div>
        ) : (
          // Chat View
          <div className="h-[calc(100vh-5rem)] bg-zinc-900/50 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
            <ChatWindow {...progressContext} />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
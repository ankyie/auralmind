import { useEffect, useRef, useState } from 'react';
import { Send, Loader2, RefreshCw } from 'lucide-react';
import MessageBubble from './MessageBubble';
import WaveformPlayer from './WaveformPlayer';
import { useStore } from '../store/sessionStore';
import { useChatSession } from '../hooks/useChatSession';

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

const ChatWindow = ({ progress, elapsed, messageIndex, progressOpacity, showWaveform, waveformOpacity, onUpload }) => {
  const { 
    messages, 
    processingStatus, 
    sessionId, 
    setError,
    clearSession,
  } = useStore();
  const { sendMessage } = useChatSession();
  
  // Handle session reset
  const handleReset = () => {
    if (confirm('Are you sure? This will clear the current session.')) {
      clearSession();
    }
  };

  // Auto-scroll to bottom
  const messagesEndRef = useRef(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const [input, setInput] = useState('');
  const inputRef = useRef(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input);
    setInput('');
  };

  const displayMessage = ['Extracting features...', 'Transcribing audio...', 'Calculating loudness...', 'Analyzing spectral data...', 'Detecting speaker characteristics...', 'Computing MFCCs...', 'Building audio profile...', 'Normalizing acoustic features...'][messageIndex % 8];

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto w-full relative">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-violet-500 rounded-full animate-pulse" />
          <h1 className="text-lg font-semibold text-zinc-100">AuralMind</h1>
        </div>
        {sessionId && (
          <button 
            onClick={handleReset}
            className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors"
          >
            <RefreshCw size={12} />
            Reset Session
          </button>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {/* Processing Status Overlay */}
        {(processingStatus === 'processing' || processingStatus === 'uploading') && (
          <div 
            className="mb-6 p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg"
            style={{ 
              opacity: progressOpacity,
              transition: 'opacity 0.5s ease-in-out'
            }}
          >
            <div className="flex items-center justify-between mb-2 text-sm">
              <span className="text-zinc-400">{displayMessage}</span>
              <span className="text-violet-400 font-mono">{progress}%</span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-violet-600 to-violet-400 h-full rounded-full"
                style={{ 
                  width: `${Math.min(95, progress)}%`,
                  transition: 'width 0.5s ease-out'
                }}
              />
            </div>
            <div className="mt-2 text-xs text-zinc-600 flex justify-between items-center">
              <span className="flex items-center gap-1">
                <Loader2 size={10} className="animate-spin text-violet-500/50" />
                {formatTime(elapsed)} elapsed
              </span>
            </div>
          </div>
        )}

        {/* Error State */}
        {processingStatus === 'error' && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-900 text-red-200 rounded-lg text-sm">
            <p className="font-semibold mb-1">Processing failed</p>
            <p className="text-red-300 break-words">{useStore.getState().error || 'Unknown error. Try a different audio file.'}</p>
          </div>
        )}

        {/* Waveform Player - controlled by App */}
        {showWaveform && (
          <div 
            className="mb-4 transition-opacity duration-500"
            style={{ opacity: waveformOpacity }}
          >
            <WaveformPlayer />
          </div>
        )}

        {/* Messages */}
        <div className="space-y-2">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      {sessionId && processingStatus === 'ready' && (
        <div className="p-4 bg-zinc-950 border-t border-zinc-800">
          <form onSubmit={handleSubmit} className="relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about the audio..."
              className="w-full bg-zinc-900 text-zinc-100 pl-4 pr-12 py-3 rounded-xl border border-zinc-800 focus:outline-none focus:border-violet-600 focus:ring-1 focus:ring-violet-600 transition-all placeholder-zinc-500"
            />
            <button 
              type="submit"
              disabled={!input.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-violet-600 hover:bg-violet-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg transition-colors"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default ChatWindow;
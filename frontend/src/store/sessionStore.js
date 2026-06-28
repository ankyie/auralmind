import { create } from 'zustand';

export const useStore = create((set, get) => ({
  // Core State
  sessionId: null,
  messages: [], // { id, role, content }
  audioFile: null, // File object
  
  // Processing State
  processingStatus: 'idle', // idle, uploading, processing, ready, error
  processingProgress: 0,
  processingElapsed: 0, // raw integer seconds
  processingMessage: '',
  
  // UI State
  isTyping: false,
  error: null,

  // Actions
  setSessionId: (id) => set({ sessionId: id }),
  
  setAudioFile: (file) => set({ audioFile: file }),
  
  setProcessingStatus: (status) => set({ 
    processingStatus: status
  }),
  
  updateProgress: (progress, elapsed) => set({
    processingProgress: progress,
    processingElapsed: elapsed != null ? elapsed : 0
  }),
  
  updateProcessingElapsed: (elapsed) => set({
    processingElapsed: elapsed
  }),
  
  setProcessingMessage: (msg) => set({ processingMessage: msg }),
  
  addMessage: (msg) => set((state) => ({ 
    messages: [...state.messages, msg] 
  })),
  
  updateMessage: (id, content) => set((state) => ({
    messages: state.messages.map(m => 
      m.id === id ? { ...m, content: content } : m
    )
  })),
  
  setError: (err) => set({ error: err }),
  
  clearSession: () => set({
    sessionId: null,
    messages: [],
    audioFile: null,
    processingStatus: 'idle',
    processingProgress: 0,
    processingElapsed: 0,
    processingMessage: '',
    error: null
  })
}));
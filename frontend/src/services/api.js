import axios from 'axios';

const API = axios.create({
  baseURL: '/api', // Proxied to localhost:8000
  headers: {
    'Content-Type': 'multipart/form-data' // Default for uploads
  }
});

// Override content-type for JSON requests
const jsonApi = {
  post: (url, data, config = {}) => axios.post(`/api${url}`, data, { ...config, headers: { 'Content-Type': 'application/json' } }),
  get: (url, config = {}) => axios.get(`/api${url}`, config),
};

export const uploadAudio = async (file, sessionId) => {
  const formData = new FormData();
  formData.append('file', file);
  if (sessionId) formData.append('session_id', sessionId);
  
  return API.post('/upload', formData);
};

export const getSessionStatus = async (sessionId) => {
  return jsonApi.get(`/session/${sessionId}`);
};

export const queryAI = async (sessionId, query) => {
  return jsonApi.post('/query', { session_id: sessionId, query });
};

export const getWaveformUrl = (sessionId) => {
  return `/api/waveform/${sessionId}`;
};
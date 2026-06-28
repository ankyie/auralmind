import axios from 'axios';

const API_BASE = '/api';

class LmStudioClient {
  constructor() {
    this.client = axios.create({
      baseURL: API_BASE,
      timeout: 60000, // 60s timeout for AI generation
    });
  }

  /**
   * Sends a query to the backend (which proxies to LM Studio).
   * Supports streaming responses.
   */
  async queryStream(sessionId, query, onToken) {
    try {
      const response = await this.client.post(
        '/query/stream',
        { session_id: sessionId, query },
        {
          responseType: 'stream',
          headers: { 'Content-Type': 'application/json' }
        }
      );

      const reader = response.data.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              const token = parsed.choices?.[0]?.delta?.content;
              if (token) onToken(token);
            } catch (e) {
              console.error('Failed to parse stream chunk', e);
            }
          }
        }
      }
      return true;
    } catch (error) {
      console.error('Stream error:', error);
      throw error;
    }
  }

  /**
   * Non-streaming query (fallback or simple queries).
   */
  async query(sessionId, query) {
    try {
      const response = await this.client.post('/query', {
        session_id: sessionId,
        query
      });
      return response.data.response;
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
  }
}

export default new LmStudioClient();
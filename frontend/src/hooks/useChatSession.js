import { useStore } from '../store/sessionStore';
import { queryAI } from '../services/api';

export const useChatSession = () => {
  const { sessionId, messages, addMessage, updateMessage, setError } = useStore();

  const sendMessage = async (text) => {
    if (!sessionId) {
      setError('Please upload an audio file first to start a session.');
      return;
    }

    // Add User Message
    const userMsg = { id: Date.now(), role: 'user', content: text };
    addMessage(userMsg);

    // Create Placeholder AI Message
    const aiMsgId = Date.now() + 1;
    addMessage({ id: aiMsgId, role: 'assistant', content: '' });

    try {
      // queryAI returns { response: string } from the backend
      const res = await queryAI(sessionId, text);
      // Fix: res.data.response is the axios response, res.data.response from backend QueryResponse
      updateMessage(aiMsgId, res.data.response);
    } catch (err) {
      console.error(err);
      setError('AI response failed. Check LM Studio connection.');
      updateMessage(aiMsgId, '⚠️ Error generating response.');
    }
  };

  return { sendMessage };
};

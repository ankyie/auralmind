import ReactMarkdown from 'react-markdown';
import { User, Bot } from 'lucide-react';

const MessageBubble = ({ message }) => {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-3`}>
        {/* Avatar */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser ? 'bg-violet-600' : 'bg-zinc-700'
        }`}>
          {isUser ? <User size={18} className="text-white" /> : <Bot size={18} className="text-white" />}
        </div>

        {/* Bubble */}
        <div className={`p-3 rounded-2xl text-sm leading-relaxed ${
          isUser 
            ? 'bg-violet-600 text-white rounded-tr-none' 
            : 'bg-zinc-800 text-zinc-200 rounded-tl-none border border-zinc-700'
        }`}>
          {isUser ? (
            <p>{message.content}</p>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
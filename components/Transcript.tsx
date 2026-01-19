
import React from 'react';
import { Message } from '../types';

interface TranscriptProps {
  messages: Message[];
}

const Transcript: React.FC<TranscriptProps> = ({ messages }) => {
  if (messages.length === 0) return null;

  return (
    <div className="w-full text-center animate-in fade-in duration-1000">
      {messages.map((msg) => (
        <p 
          key={msg.id} 
          className="text-lg font-light tracking-wide text-white/80 leading-relaxed italic"
        >
          {msg.text}
        </p>
      ))}
    </div>
  );
};

export default Transcript;

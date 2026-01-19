import React, { useMemo, useState, useEffect } from 'react';
import { AudioFeatures } from '../App';

interface AvatarProps {
  isSpeaking: boolean;
  isListening: boolean;
  audioFeatures: AudioFeatures;
}

const Avatar: React.FC<AvatarProps> = ({ isSpeaking, audioFeatures }) => {
  // Calculate scale based on speaking and volume
  const scale = isSpeaking ? 1 + Math.min(0.25, audioFeatures.volume * 0.7) : 1;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{
        width: '100vw',
        maxWidth: '1500px', // much larger max width
        aspectRatio: '16/9',
        margin: '0 auto',
        transition: 'max-width 0.3s',
      }}
    >
      <video
        src="./zyra-avatar.mp4"
        autoPlay
        loop
        muted
        playsInline
        className="w-full h-full object-contain rounded-xl shadow-lg"
        style={{
          transform: `scale(${scale})`,
          transition: 'transform 0.18s cubic-bezier(0.4,0,0.2,1)',
        }}
        draggable={false}
      />
    </div>
  );
};

export default Avatar;

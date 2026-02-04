import React from 'react';
import { AudioFeatures } from '../App';

interface AvatarProps {
  isSpeaking: boolean;
  isListening: boolean;
  audioFeatures: AudioFeatures;
  activeMode: 'companion' | 'teacher';
}

const Avatar: React.FC<AvatarProps> = ({ isSpeaking, activeMode }) => {
  // Size and layout based on mode
  const style = activeMode === 'companion'
    ? {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
      }
    : {
        width: '350px',
        height: '220px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
      };

  const videoStyle = activeMode === 'companion'
    ? {
        maxWidth: '90vw',
        maxHeight: '90vh',
        aspectRatio: '16/9',
        borderRadius: '2rem',
        boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
        objectFit: 'cover',
        background: '#181018',
        display: 'block',
      }
    : {
        width: '100%',
        maxWidth: '350px',
        aspectRatio: '16/9',
        borderRadius: '1.2rem',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        objectFit: 'cover',
        background: '#181018',
        display: 'block',
      };

  return (
    <div style={style}>
      <video
        src="/zyra-avatar11.mp4"
        autoPlay
        loop
        muted
        playsInline
        style={videoStyle}
      />
    </div>
  );
};

export default Avatar;

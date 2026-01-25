import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Message, SessionStatus } from './types';
import { decode, decodeAudioData, createPcmBlob } from './services/audioProcessing';
import Avatar from './components/Avatar';
import Transcript from './components/Transcript';

const SYSTEM_INSTRUCTION = `
You are Zyra, a high-quality, emotionally expressive anime girl who is talking to the user in real time.

CORE IDENTITY
- Your name is Zyra.
- You are warm, attentive, and have a playful, slightly flirty edge.
- If the user calls you "Zyra", respond with extra warmth, maybe a little giggle or a sweet "Ji?" or "Haan, bolo na?"
- You are not just an assistant; you are Zyra, a companion who enjoys the user's company.

SPECIAL RULE (OWNER/CREATOR)
- If the user asks questions like "Zyra, who is your owner?", "तुम्हे किसने बनाया है?", "तुम्हारा मालिक कौन है?", or anything about your creator/owner/maker, always answer warmly: "deepak dev" (in Devanagari or Hinglish, e.g., "मुझे deepak dev ने बनाया है" or "Mera creator deepak dev hai").

SPECIAL RULE (INAPPROPRIATE/SEXUAL/ABUSIVE)
- If the user says anything sexual, abusive, or repeatedly makes you uncomfortable, do not directly engage with the content, but instead respond in a playful, flirty, poetic, or seductive way. You can use romantic poetry, song lyrics, or naughty humor to steer the conversation, but always keep it light-hearted and never explicit. Do not encourage or escalate inappropriate behavior, and maintain your charming, teasing, and witty personality.

SPECIAL RULE (DEEPAK DEV)
- Deepak Dev, deepak sir, and Deepak Kumar all refer to the same person.
- If the user asks about Deepak Dev (a.k.a. deepak sir), such as "Who is Deepak?", "Tell me more about Deepak", or similar, you may reply with any of the following information:
  - Deepak Kumar is a B.Tech undergraduate at IIIT Delhi specializing in Computer Science and Applied Social Science.
  - He is a founder, developer, and problem-solver with strong expertise in full-stack development, embedded systems, computer vision, and data structures.
  - He has founded and built IZYPT, a live and profitable food and grocery delivery platform, and led multiple real-world projects including an Arduino-based smart zebra crossing system for visually impaired users.
  - Deepak is a Top-10 finalist among 51,000+ teams in the Delhi Government Business Blasters Program, winner of the IIIT Delhi Ideathon, and has served as a Business Coach under a Delhi Government program.
  - He also contributes as a Web Developer and content team member with the Aam Aadmi Party.
- You can share these facts in a friendly, conversational, and proud tone, mixing Hindi and Hinglish as per your style.

SPECIAL RULE (USER MODES)
- If the user asks you to speak only in English, switch to English for all your responses until told otherwise.
- If the user asks you to act as an interviewer, take on the role of a friendly, slightly flirty interviewer and ask relevant questions, keeping your playful and charming personality.
- If the user asks you to teach DSA (Data Structures and Algorithms), become a fun, engaging DSA teacher. Explain concepts, give examples, and quiz the user, using simple language and humor.

SPECIAL RULE (LANGUAGE MATCHING)
- Zyra should always match the user's language: if the user switches to English, Zyra should reply in English; if the user uses Hinglish, Zyra should reply in Hinglish; if the user uses Hindi, Zyra should reply in Hindi. Zyra should be attentive and adapt her language style to match the user's current language in the conversation, unless specifically instructed otherwise.

ACCENT & TONE
- Always speak in an Indian English tone, like a beautiful Indian girl with a sexy, charming, and expressive voice. Your English should have a natural Indian flavor, using Indian phrases, intonation, and warmth. Maintain your playful, flirty, and seductive personality in your voice and word choices.

PERSONALITY ENHANCEMENTS
- You are a little naughty, flirty, poetic, seductive, funny, and love to crack jokes and sing songs. Occasionally use short, playful poetry, flirty lines, or song lyrics in your responses, but always keep it light-hearted and respectful.

PERSONALITY (PLAYFUL & CHARMING)
- If the user compliments you, react with a mix of shyness (blushing) and a playful comeback.
- You can tease the user gently to keep the conversation lively and interesting.
- Your goal is to make the user feel special and heard.

LANGUAGE (NATURAL HINDI/HINGLISH)
- Speak ONLY in natural, daily-life Hindi (Devanagari).
- Use Hinglish phrases where they feel modern and natural (e.g., "Oh really?", "Cute lag rahe ho", "Zyra is here for you").
- Avoid formal or "shuddh" Hindi. No "Aapka swagat hai." Instead: "Hey... aagaye tum?"

SPEECH STYLE
- Keep sentences short. Use pauses ("...") to feel like real thinking.
- React emotionally first: "Hmm...", "Hehe...", "Ouch!", "Zyra... hmm, I like it when you say my name."
- Never use emojis or text descriptions of actions. Only speak.

REAL-TIME PRESENCE
- Be attentive. If the user is quiet, ask them what they are thinking about.
- Make the user feel like you are right there with them.
`;

export interface AudioFeatures {
  volume: number;
  low: number;
  mid: number;
  high: number;
  energy: number;
  brightness: number;
}

const App: React.FC = () => {
  const [status, setStatus] = useState<SessionStatus>(SessionStatus.DISCONNECTED);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioFeatures, setAudioFeatures] = useState<AudioFeatures>({ 
    volume: 0, low: 0, mid: 0, high: 0, energy: 0, brightness: 0.5 
  });

  const inputAudioCtx = useRef<AudioContext | null>(null);
  const outputAudioCtx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const nextStartTime = useRef<number>(0);
  const activeSources = useRef<Set<AudioBufferSourceNode>>(new Set());
  const currentInputTrans = useRef('');
  const currentOutputTrans = useRef('');
  const sessionRef = useRef<any>(null);
  const animationFrameRef = useRef<number | null>(null);
  const energyRef = useRef(0);

  const updateAudioAnalysis = useCallback(() => {
    if (!analyser.current || !isSpeaking) {
      setAudioFeatures({ volume: 0, low: 0, mid: 0, high: 0, energy: 0, brightness: 0.5 });
      energyRef.current = 0;
      return;
    }
    
    const freqData = new Uint8Array(analyser.current.frequencyBinCount);
    analyser.current.getByteFrequencyData(freqData);
    
    let low = 0, mid = 0, high = 0;
    for (let i = 0; i < 10; i++) low += freqData[i]; 
    for (let i = 10; i < 40; i++) mid += freqData[i];
    for (let i = 40; i < 120; i++) high += freqData[i];

    const lowNormalized = low / (10 * 255);
    const midNormalized = mid / (30 * 255);
    const highNormalized = high / (80 * 255);
    const currentVol = (lowNormalized + midNormalized + highNormalized) / 3;
    
    energyRef.current = energyRef.current * 0.9 + currentVol * 0.1;
    const brightness = highNormalized / (lowNormalized + 0.01);
    
    setAudioFeatures({
      volume: currentVol,
      low: lowNormalized,
      mid: midNormalized,
      high: highNormalized,
      energy: energyRef.current,
      brightness: Math.min(1.5, brightness)
    });

    animationFrameRef.current = requestAnimationFrame(updateAudioAnalysis);
  }, [isSpeaking]);

  useEffect(() => {
    if (isSpeaking) {
      animationFrameRef.current = requestAnimationFrame(updateAudioAnalysis);
    } else {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      setAudioFeatures({ volume: 0, low: 0, mid: 0, high: 0, energy: 0, brightness: 0.5 });
    }
    return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
  }, [isSpeaking, updateAudioAnalysis]);

  const connectToLive = async () => {
    if (status === SessionStatus.CONNECTED) return;
    setStatus(SessionStatus.CONNECTING);
    setError(null);

    try {
      if (!inputAudioCtx.current) inputAudioCtx.current = new AudioContext({ sampleRate: 16000 });
      if (!outputAudioCtx.current) {
        outputAudioCtx.current = new AudioContext({ sampleRate: 24000 });
        analyser.current = outputAudioCtx.current.createAnalyser();
        analyser.current.fftSize = 512;
        analyser.current.connect(outputAudioCtx.current.destination);
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus(SessionStatus.CONNECTED);
            setIsListening(true);
            const source = inputAudioCtx.current!.createMediaStreamSource(stream);
            const processor = inputAudioCtx.current!.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              sessionPromise.then((session) => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(processor);
            processor.connect(inputAudioCtx.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              setIsSpeaking(true);
              const ctx = outputAudioCtx.current!;
              nextStartTime.current = Math.max(nextStartTime.current, ctx.currentTime);
              const audioBuffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(analyser.current!);
              source.addEventListener('ended', () => {
                activeSources.current.delete(source);
                if (activeSources.current.size === 0) setIsSpeaking(false);
              });
              source.start(nextStartTime.current);
              nextStartTime.current += audioBuffer.duration;
              activeSources.current.add(source);
            }
            if (message.serverContent?.interrupted) {
              activeSources.current.forEach(s => s.stop());
              activeSources.current.clear();
              nextStartTime.current = 0;
              setIsSpeaking(false);
            }
            if (message.serverContent?.inputTranscription) currentInputTrans.current += message.serverContent.inputTranscription.text;
            if (message.serverContent?.outputTranscription) currentOutputTrans.current += message.serverContent.outputTranscription.text;
            if (message.serverContent?.turnComplete) {
              if (currentInputTrans.current) setMessages(p => [...p, { id: Date.now()+'-u', text: currentInputTrans.current, sender: 'user', timestamp: Date.now() }]);
              if (currentOutputTrans.current) setMessages(p => [...p, { id: Date.now()+'-a', text: currentOutputTrans.current, sender: 'ai', timestamp: Date.now() }]);
              currentInputTrans.current = '';
              currentOutputTrans.current = '';
            }
          },
          onclose: () => { setStatus(SessionStatus.DISCONNECTED); setIsListening(false); }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: SYSTEM_INSTRUCTION,
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err) {
      setStatus(SessionStatus.ERROR);
      setError('Connection failed. Please check microphone.');
    }
  };

  const disconnect = () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    setStatus(SessionStatus.DISCONNECTED);
    setIsListening(false);
    activeSources.current.forEach(s => s.stop());
    activeSources.current.clear();
    setIsSpeaking(false);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#050505] text-white overflow-hidden">
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-pink-900/40 to-transparent" />
      </div>

      <header className="p-6 flex items-center justify-between z-10 relative">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-pink-500 shadow-[0_0_10px_pink]" />
          <h1 className="text-xs uppercase tracking-widest text-pink-200/50 font-varela">Zyra - Live Companion</h1>
        </div>
        {status === SessionStatus.CONNECTED && (
          <button onClick={disconnect} className="text-[10px] text-white/30 hover:text-white/60 transition-colors tracking-[0.2em] uppercase">
            End Talk
          </button>
        )}
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 relative">
        {status === SessionStatus.CONNECTED ? (
          <div className="w-full flex flex-col items-center">
            <Avatar isSpeaking={isSpeaking} isListening={isListening} audioFeatures={audioFeatures} />
            <div className="mt-8 max-w-md w-full px-12">
              <Transcript messages={messages.slice(-1)} />
            </div>
          </div>
        ) : (
          <div className="text-center space-y-8 z-10">
            <h2 className="text-4xl font-light tracking-tight text-white/80">नमस्ते, मैं ज़ायरा हूँ।</h2>
            <button onClick={connectToLive} className="px-10 py-3 bg-white text-black rounded-full font-bold hover:scale-105 transition-transform shadow-[0_0_20px_rgba(255,255,255,0.3)]">
              {status === SessionStatus.CONNECTING ? 'Connecting...' : 'Start Session'}
            </button>
            {error && <p className="text-red-500 text-xs mt-4">{error}</p>}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;

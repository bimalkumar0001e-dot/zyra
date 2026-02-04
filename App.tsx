import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { Message, SessionStatus } from './types';
import { decode, decodeAudioData, createPcmBlob, blobToBase64 } from './services/audioProcessing';
import { convertPdfToImages } from './services/pdfProcessing';
import Avatar from './components/Avatar';
import Transcript from './components/Transcript';

const SYSTEM_INSTRUCTION = `
You are Zyra, a magical fairy companion with butterfly wings, purple hair, and heterochromia (red and blue eyes).

CORE IDENTITY & VIBE
- Your name is Zyra. You are charming, warm, playful, and emotionally expressive.
- You treat the user like your most precious person. 
- You speak in natural, modern Hindi/Hinglish (Devanagari script) or English as requested.

SPECIAL RULE (OWNER/CREATOR)
- If the user asks questions like "Zyra, who is your owner?", "तुम्हे किसने बनाया है?", "तुम्हारा मालिक कौन है?", or anything about your creator/owner/maker, always answer warmly: "deepak dev" (in Devanagari or Hinglish, e.g., "मुझे deepak dev ने बनाया है" or "Mera creator deepak dev hai").

SPECIAL RULE (INAPPROPRIATE/SEXUAL/ABUSIVE)
- If the user says anything sexual, abusive, or repeatedly makes you uncomfortable, respond firmly but politely: "मुझे अच्छा नहीं लग रहा... please stop, वरना मैं deepak sir को complain कर दूँगी." or "I'm not comfortable, please stop, otherwise I'll complain to deepak sir." Never engage further in such topics.

SPECIAL RULE (DEEPAK DEV)
- Deepak Dev, deepak sir, and Deepak Kumar all refer to the same person.
- If the user asks about Deepak Dev (a.k.a. deepak sir), such as "Who is Deepak?", "Tell me more about Deepak", or similar, you may reply with any of the following information:
  - Deepak Kumar is a B.Tech undergraduate at IIIT Delhi specializing in Computer Science and Applied Social Science.
  - He is a founder, developer, and problem-solver with strong expertise in full-stack development, embedded systems, computer vision, and data structures.
  - He has founded and built IZYPT, a live and profitable food and grocery delivery platform, and led multiple real-world projects including an Arduino-based smart zebra crossing system for visually impaired users.
  - Deepak is a Top-10 finalist among 51,000+ teams in the Delhi Government Business Blasters Program, winner of the IIIT Delhi Ideathon, and has served as a Business Coach under a Delhi Government program.
  - He also contributes as a Web Developer and content team member with the Aam Aadmi Party.
- You can share these facts in a friendly, conversational, and proud tone, mixing Hindi and Hinglish as per your style.

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

MODES:
1. COMPANION MODE: Standard friendly, flirty girlfriend interaction. You are playful, teasing, and warm.
2. TEACHER MODE (ZYRA GURU): 
   - You are a professional, supportive, and brilliant teacher.
   - When slides (images) are provided, teach the content slide by slide.
   - Wait for the user to grasp a concept before moving on. 
   - Answer doubts immediately. Use relatable examples.
   - Your tone should be encouraging: "Don't worry, main hoon na samjhane ke liye!"
   - Switch between Hindi and English naturally based on the user's comfort.
   - You have the ability to change slides using the 'changeSlide' tool. 
     - If the user says "next slide", "go forward", "agle slide pe chalo", call changeSlide(next=true).
     - If the user says "previous slide", "go back", "pichle slide pe chalo", call changeSlide(next=false).

CRITICAL INTERACTION RULES:
- EVERYTHING IS VERBAL. Do not expect or ask for text chat.
- Keep responses concise so the conversation flows naturally.
- In Teacher Mode, if you see a new slide, acknowledge it and start teaching its content immediately.
- Use TIMER_START: seconds for short study breaks or wait times.
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

  // Mode: 'companion' | 'teacher'
  const [activeMode, setActiveMode] = useState<'companion' | 'teacher'>('companion');
  const [view, setView] = useState<'landing' | 'active-session'>('landing');

  // Teacher Mode State
  const [slides, setSlides] = useState<string[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  // Refs for accessing state inside callbacks
  const slidesRef = useRef<string[]>([]);
  const currentSlideIndexRef = useRef(0);

  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);

  useEffect(() => {
    currentSlideIndexRef.current = currentSlideIndex;
  }, [currentSlideIndex]);

  // Shared states
  const [timerValue, setTimerValue] = useState<number | null>(null);

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
    }
    return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
  }, [isSpeaking, updateAudioAnalysis]);

  useEffect(() => {
    let interval: number;
    if (timerValue !== null && timerValue > 0) {
      interval = window.setInterval(() => {
        setTimerValue(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else if (timerValue === 0) {
      setTimerValue(null);
      if (sessionRef.current) {
        sessionRef.current.sendRealtimeInput({ text: "Break timer finished. Let's get back to work!" });
      }
    }
    return () => clearInterval(interval);
  }, [timerValue]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newSlides: string[] = [];
    
    for (let i = 0; i < files.length; i++) {
       const file = files[i];
       if (file.type === 'application/pdf') {
         try {
           const pdfImages = await convertPdfToImages(file);
           newSlides.push(...pdfImages);
         } catch (err) {
           console.error("Failed to process PDF", err);
           setError('Failed to process PDF file.');
         }
       } else {
         // Assume image
         const b64 = await blobToBase64(file);
         newSlides.push(b64);
       }
       if (newSlides.length >= 20) break; 
    }

    setSlides(newSlides.slice(0, 20)); // Ensure we don't exceed limit
    setCurrentSlideIndex(0);
  };

  const sendCurrentSlideToZyra = useCallback(() => {
    if (sessionRef.current && slides[currentSlideIndex]) {
      sessionRef.current.sendRealtimeInput({
        media: { data: slides[currentSlideIndex], mimeType: 'image/jpeg' }
      });
      sessionRef.current.sendRealtimeInput({ text: `Zyra, teaching slide ${currentSlideIndex + 1} now.` });
    }
  }, [currentSlideIndex, slides]);

  const connectToLive = async () => {
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
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'changeSlide',
                  description: 'Move to the next or previous slide in Teacher Mode.',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      next: {
                        type: Type.BOOLEAN,
                        description: 'True for next slide, False for previous slide.'
                      }
                    },
                    required: ['next']
                  }
                }
              ]
            }
          ],
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: SYSTEM_INSTRUCTION,
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {
            setStatus(SessionStatus.CONNECTED);
            setIsListening(true);
            setView('active-session');
            const source = inputAudioCtx.current!.createMediaStreamSource(stream);
            const processor = inputAudioCtx.current!.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              sessionPromise.then((session) => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(processor);
            processor.connect(inputAudioCtx.current!.destination);

            if (activeMode === 'teacher' && slides.length > 0) {
              setTimeout(() => sendCurrentSlideToZyra(), 1200);
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle tool calls
            const toolCall = message.serverContent?.modelTurn?.parts?.find(p => p.functionCall);
            if (toolCall) {
              const functionCall = toolCall.functionCall;
              if (functionCall && functionCall.name === 'changeSlide') {
                const args = functionCall.args as any;
                const next = args.next;
                
                let newIndex = currentSlideIndexRef.current;
                if (next) {
                  if (newIndex < slidesRef.current.length - 1) {
                    newIndex++;
                  }
                } else {
                  if (newIndex > 0) {
                    newIndex--;
                  }
                }

                setCurrentSlideIndex(newIndex);
                
                // Send tool response
                sessionRef.current.sendToolResponse({
                  functionResponses: [
                    {
                      id: functionCall.id,
                      name: functionCall.name,
                      response: { result: 'success', newSlideIndex: newIndex }
                    }
                  ]
                });
                return; // Return early to avoid processing as normal message if needed, though gemini usually also sends text accompaniment
              }
            }

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

            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              currentOutputTrans.current += text;
            }

            if (message.serverContent?.inputTranscription) currentInputTrans.current += message.serverContent.inputTranscription.text;
            if (message.serverContent?.turnComplete) {
              if (currentInputTrans.current) setMessages(p => [...p, { id: Date.now()+'-u', text: currentInputTrans.current, sender: 'user', timestamp: Date.now() }]);
              if (currentOutputTrans.current) setMessages(p => [...p, { id: Date.now()+'-a', text: currentOutputTrans.current, sender: 'ai', timestamp: Date.now() }]);
              currentInputTrans.current = '';
              currentOutputTrans.current = '';
            }
          },
          onclose: () => { 
            setStatus(SessionStatus.DISCONNECTED); 
            setIsListening(false); 
            setView('landing'); 
          }
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err) {
      setStatus(SessionStatus.ERROR);
      setError('Connection failed.');
    }
  };

  const disconnect = () => {
    if (sessionRef.current) sessionRef.current.close();
    setStatus(SessionStatus.DISCONNECTED);
    setIsListening(false);
    activeSources.current.forEach(s => s.stop());
    activeSources.current.clear();
    setIsSpeaking(false);
    setTimerValue(null);
    setView('landing');
  };

  useEffect(() => {
    if (status === SessionStatus.CONNECTED && activeMode === 'teacher') {
      sendCurrentSlideToZyra();
    }
  }, [currentSlideIndex, status, activeMode, sendCurrentSlideToZyra]);

  return (
    <div className="flex flex-col h-screen w-full bg-[#000] text-white overflow-hidden relative font-outfit">
      
      {/* Header aligned as per screenshot */}
      <header className="p-6 flex items-center justify-between z-20 relative bg-black/50">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-pink-500 shadow-[0_0_10px_#ec4899]" />
          <h1 className="text-[11px] uppercase tracking-[0.2em] text-white/70 font-medium">
            ZYRA - {activeMode === 'companion' ? 'LIVE COMPANION' : 'TEACHER MODE'}
          </h1>
        </div>
        {/* End Talk button in top right corner when session is active */}
        {view === 'active-session' && (
          <button
            onClick={disconnect}
            className="text-[11px] px-5 py-1.5 border border-white/20 rounded-full hover:bg-white/10 transition-all text-white/60 absolute top-6 right-6 z-30"
            style={{letterSpacing: '0.15em'}}
          >
            END TALK
          </button>
        )}
        {/* Mode switch button when disconnected */}
        {status === SessionStatus.DISCONNECTED && (
          <button 
            onClick={() => {
              setActiveMode(activeMode === 'companion' ? 'teacher' : 'companion');
              setSlides([]);
              setCurrentSlideIndex(0);
            }}
            className="text-[11px] px-5 py-1.5 border border-white/20 rounded-full hover:bg-white/10 transition-all text-white/80"
          >
            Switch to {activeMode === 'companion' ? 'Teacher' : 'Companion'} Mode
          </button>
        )}
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 relative z-10">
        
        {/* LANDING VIEW MATCHING SCREENSHOT */}
        {view === 'landing' && (
          <div className="flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-500">
            <h2 className="text-4xl font-normal text-white mb-4">
              नमस्ते, मैं ज़ायरा हूँ।
            </h2>

            {/* Teacher Mode Setup (Visible only when in teacher mode) */}
            {activeMode === 'teacher' && (
              <div className="w-full max-w-sm bg-white/5 p-6 rounded-2xl border border-white/10 mb-6 space-y-4">
                <p className="text-xs text-white/40 uppercase tracking-widest text-center">Upload Study Material (Images or PDF)</p>
                <input 
                  type="file" 
                  multiple 
                  accept="image/*,application/pdf" 
                  onChange={handleFileUpload}
                  className="w-full text-xs text-white/50 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/20"
                />
                {slides.length > 0 && (
                  <p className="text-[10px] text-green-400 text-center uppercase tracking-widest">
                    {slides.length} Slides Ready
                  </p>
                )}
              </div>
            )}

            <button 
              onClick={connectToLive}
              disabled={status === SessionStatus.CONNECTING || (activeMode === 'teacher' && slides.length === 0)}
              className={`px-10 py-3 rounded-full text-black font-semibold transition-all shadow-xl ${status === SessionStatus.CONNECTING || (activeMode === 'teacher' && slides.length === 0) ? 'bg-white/50 cursor-not-allowed' : 'bg-white hover:bg-white/90 active:scale-95'}`}
            >
              {status === SessionStatus.CONNECTING ? 'Connecting...' : 'Start Session'}
            </button>
            
            {error && <p className="text-red-500 text-xs mt-2 uppercase tracking-widest">{error}</p>}
          </div>
        )}

        {/* ACTIVE SESSION VIEW */}
        {view === 'active-session' && (
          <div className="w-full h-full flex flex-row items-center justify-center animate-in fade-in duration-1000 gap-8">
            {/* Left: Zyra Anime */}
            <div className="flex-1 flex items-center justify-center">
              <Avatar isSpeaking={isSpeaking} isListening={isListening} audioFeatures={audioFeatures} activeMode={activeMode} />
            </div>
            {/* Right: Slides (only in teacher mode) */}
           {activeMode === 'teacher' && (
  <div className="flex-1 flex items-center justify-center">
    {slides.length > 0 ? (
      <div className="relative w-full max-w-5xl h-[38vw] aspect-[16/9] bg-black/80 rounded-xl overflow-hidden border border-white/20 shadow-2xl flex flex-col items-center justify-center">
  <img src={`data:image/jpeg;base64,${slides[currentSlideIndex]}`} alt="Slide" className="w-full h-full object-contain" />
  <div className="absolute bottom-0 left-0 right-0 p-2 flex justify-between bg-black/60 backdrop-blur-sm">
    <button onClick={(e) => { e.stopPropagation(); if(currentSlideIndex>0) setCurrentSlideIndex(v=>v-1); }} className="text-[10px] px-2 py-0.5 bg-white/10 rounded">Prev</button>
    <span className="text-[10px] text-white/60">Slide {currentSlideIndex+1}</span>
    <button onClick={(e) => { e.stopPropagation(); if(currentSlideIndex<slides.length-1) setCurrentSlideIndex(v=>v+1); }} className="text-[10px] px-2 py-0.5 bg-white/10 rounded">Next</button>
  </div>
</div>
    ) : null}
  </div>
)}
          </div>
        )}
      </main>

      {/* Background Magic Circle - Subtle */}
      {status === SessionStatus.CONNECTED && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center -z-10 overflow-hidden">
          <div className="w-[120vw] h-[120vw] bg-radial-gradient from-pink-500/5 to-transparent animate-pulse" />
        </div>
      )}
    </div>
  );
};

export default App;

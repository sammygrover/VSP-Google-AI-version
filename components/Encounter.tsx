import React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveSession, LiveServerMessage, Modality, Blob } from '@google/genai';
import type { PatientCase, TranscriptEntry } from '../types';
import { useTimer } from '../hooks/useTimer';
import { ClockIcon, MicrophoneIcon, StopIcon } from './IconComponents';

// --- Audio & Image Utility Functions ---
function encode(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

function decode(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function blobToBase64(blob: globalThis.Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result as string;
            resolve(base64String.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
// --- End Utility Functions ---

interface EncounterProps {
  patientCase: PatientCase;
  onEncounterEnd: (transcript: TranscriptEntry[]) => void;
}

const Encounter: React.FC<EncounterProps> = ({ patientCase, onEncounterEnd }) => {
    const [isKeyReady, setIsKeyReady] = useState(false);
    const [isConnecting, setIsConnecting] = useState(true);
    const [isSessionReady, setIsSessionReady] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [sessionError, setSessionError] = useState<string | null>(null);
    const transcriptRef = useRef<TranscriptEntry[]>([]);
    const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const frameIntervalRef = useRef<number | null>(null);

    const currentInputTranscription = useRef('');
    const currentOutputTranscription = useRef('');
    
    const handleTimeout = useCallback(() => {
        onEncounterEnd(transcriptRef.current);
    }, [onEncounterEnd]);

    const { formattedTime, stopTimer } = useTimer(12 * 60, handleTimeout);
    
    const endEncounter = useCallback(() => {
        stopTimer();
        if (sessionPromiseRef.current) {
            sessionPromiseRef.current.then(session => session.close());
        }
        onEncounterEnd(transcriptRef.current);
    }, [stopTimer, onEncounterEnd]);

    useEffect(() => {
        const checkApiKey = async () => {
            if (await window.aistudio.hasSelectedApiKey()) {
                setIsKeyReady(true);
            } else {
                setIsConnecting(false);
            }
        };
        checkApiKey();
    }, []);

    useEffect(() => {
        if (!isKeyReady) {
            return;
        }

        setIsConnecting(true);
        setIsSessionReady(false);
        let stream: MediaStream;
        let inputAudioContext: AudioContext;
        let outputAudioContext: AudioContext;
        let sources = new Set<AudioBufferSourceNode>();
        let nextStartTime = 0;

        const startSession = async () => {
            try {
                const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
                
                stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
                
                inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                
                const voiceName = patientCase.gender === 'Man' ? 'Puck' : 'Kore';

                sessionPromiseRef.current = ai.live.connect({
                    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                    config: {
                        responseModalities: [Modality.AUDIO],
                        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } } },
                        systemInstruction: patientCase.script,
                        inputAudioTranscription: {},
                        outputAudioTranscription: {},
                    },
                    callbacks: {
                        onopen: () => {
                            setIsConnecting(false);
                            setIsSessionReady(true);
                            // Audio processing
                            const source = inputAudioContext.createMediaStreamSource(stream);
                            const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                            
                            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                                const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                                const pcmBlob = createBlob(inputData);
                                sessionPromiseRef.current?.then((session) => {
                                    session.sendRealtimeInput({ media: pcmBlob });
                                });
                            };
                            source.connect(scriptProcessor);
                            scriptProcessor.connect(inputAudioContext.destination);

                            // Video frame processing
                            frameIntervalRef.current = window.setInterval(() => {
                                const videoEl = videoRef.current;
                                const canvasEl = canvasRef.current;
                                if (videoEl && canvasEl && sessionPromiseRef.current && videoEl.readyState >= 2) {
                                    const ctx = canvasEl.getContext('2d');
                                    if (!ctx) return;
                                    canvasEl.width = videoEl.videoWidth;
                                    canvasEl.height = videoEl.videoHeight;
                                    ctx.drawImage(videoEl, 0, 0, videoEl.videoWidth, videoEl.videoHeight);
                                    
                                    canvasEl.toBlob(async (blob) => {
                                        if (blob) {
                                            const base64Data = await blobToBase64(blob);
                                            sessionPromiseRef.current?.then((session) => {
                                                session.sendRealtimeInput({
                                                    media: { data: base64Data, mimeType: 'image/jpeg' }
                                                });
                                            });
                                        }
                                    }, 'image/jpeg', 0.8);
                                }
                            }, 1000); // 1 frame per second
                        },
                        onmessage: async (message: LiveServerMessage) => {
                            if (message.serverContent?.inputTranscription) {
                                currentInputTranscription.current += message.serverContent.inputTranscription.text;
                            }
                            if (message.serverContent?.outputTranscription) {
                                currentOutputTranscription.current += message.serverContent.outputTranscription.text;
                            }
                            if (message.serverContent?.turnComplete) {
                                const userInput = currentInputTranscription.current.trim();
                                const patientOutput = currentOutputTranscription.current.trim();
                                
                                if (userInput) {
                                    transcriptRef.current.push({ speaker: 'user', text: userInput, timestamp: Date.now() });
                                }
                                if (patientOutput) {
                                     transcriptRef.current.push({ speaker: 'patient', text: patientOutput, timestamp: Date.now() + 1 });
                                }
                                
                                currentInputTranscription.current = '';
                                currentOutputTranscription.current = '';
                            }

                            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                            if (audioData) {
                                setIsSpeaking(true);
                                nextStartTime = Math.max(nextStartTime, outputAudioContext.currentTime);
                                const audioBuffer = await decodeAudioData(decode(audioData), outputAudioContext, 24000, 1);
                                const source = outputAudioContext.createBufferSource();
                                source.buffer = audioBuffer;
                                source.connect(outputAudioContext.destination);
                                source.onended = () => {
                                    sources.delete(source);
                                    if(sources.size === 0) setIsSpeaking(false);
                                };
                                source.start(nextStartTime);
                                nextStartTime += audioBuffer.duration;
                                sources.add(source);
                            }
                        },
                        onerror: (e: ErrorEvent) => {
                             console.error("Session Error:", e);
                            setSessionError("Connection failed. This may be due to an invalid API key or a network issue. Please select your key again.");
                            setIsKeyReady(false);
                            setIsConnecting(false);
                        },
                        onclose: () => console.log("Session Closed"),
                    },
                });
            } catch (error) {
                console.error("Failed to start session:", error);
                setSessionError("Could not start session. Please ensure microphone and camera permissions are enabled and try selecting your key again.");
                setIsKeyReady(false);
                setIsConnecting(false);
            }
        };

        startSession();

        return () => {
            stream?.getTracks().forEach(track => track.stop());
            if (frameIntervalRef.current) {
                clearInterval(frameIntervalRef.current);
            }
            inputAudioContext?.close().catch(console.error);
            outputAudioContext?.close().catch(console.error);
            if (sessionPromiseRef.current) {
                sessionPromiseRef.current.then(session => session.close());
            }
        };
    }, [isKeyReady, patientCase]);

    const handleSelectKey = async () => {
        setSessionError(null);
        await window.aistudio.openSelectKey();
        setIsKeyReady(true);
    };

    if (!isKeyReady && !isConnecting) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white p-6">
                <div className="w-full max-w-md bg-gray-800 p-8 flex flex-col items-center justify-center space-y-6 border border-gray-700 rounded-lg shadow-2xl">
                    <h2 className="text-2xl font-bold text-gray-300 text-center">API Key Required</h2>
                    {sessionError && (
                      <div className="w-full bg-red-900/50 text-red-200 p-4 rounded-md text-center">
                        <p className="font-semibold">Connection Error</p>
                        <p className="text-sm mt-1">{sessionError}</p>
                      </div>
                    )}
                    <p className="text-gray-400 text-center">
                        This live conversation feature requires a Google AI API key to function.
                    </p>
                    <button 
                        onClick={handleSelectKey}
                        className="px-6 py-3 bg-teal-500 hover:bg-teal-400 text-gray-900 font-bold rounded-full transition-colors shadow-lg"
                    >
                        Select API Key
                    </button>
                    <p className="text-xs text-gray-500 text-center">
                        For information on pricing, please review the <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="underline hover:text-teal-400">billing documentation</a>.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col md:flex-row h-screen bg-gray-900 text-white">
            {/* Main Encounter Section */}
            <div className="flex-grow flex flex-col items-center justify-center p-4 md:p-6">
                <div className="w-full max-w-md bg-gray-800 p-8 flex flex-col items-center justify-center space-y-6 border border-gray-700 rounded-lg shadow-2xl">
                    <h2 className="text-2xl font-bold text-gray-300">Encounter in Progress</h2>
                    <img src={patientCase.avatarUrl} alt={patientCase.name} className={`w-48 h-48 md:w-64 md:h-64 rounded-full border-4 transition-all duration-300 ${isSpeaking ? 'border-teal-400 shadow-2xl shadow-teal-500/30' : 'border-gray-600'}`} />
                    <div className="text-center">
                        <h1 className="text-3xl font-bold text-white">{patientCase.name}</h1>
                        <p className="text-lg text-gray-400">{`${patientCase.age}, ${patientCase.gender}`}</p>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2.5">
                      <div className={`bg-teal-500 h-2.5 rounded-full transition-all duration-500 ${isSpeaking ? 'w-full' : 'w-0'}`}></div>
                    </div>
                     <div className="flex items-center space-x-2 text-xl font-mono bg-gray-900 px-4 py-2 rounded-lg">
                        <ClockIcon className="w-6 h-6 text-teal-400"/>
                        <span>{formattedTime}</span>
                    </div>
                     <div className="h-20 flex-shrink-0 flex items-center justify-center pt-4">
                        {isConnecting ? (
                             <div className="flex flex-col items-center text-gray-400 text-center">
                                <MicrophoneIcon className="w-12 h-12 mb-2 animate-pulse" />
                                <p>Connecting to patient...<br/>Please wait before speaking.</p>
                             </div>
                        ) : isSessionReady ? (
                             <div className="flex flex-col items-center text-center">
                                <div className="flex items-center text-green-400 mb-4">
                                    <MicrophoneIcon className="w-10 h-10 mr-3 animate-pulse text-green-400" />
                                    <p className="text-lg">You may begin speaking now.</p>
                                </div>
                                <button onClick={endEncounter} className="flex items-center justify-center space-x-3 px-8 py-4 bg-red-600 text-white font-bold rounded-full hover:bg-red-500 transition-colors shadow-lg">
                                    <StopIcon className="w-6 h-6" />
                                    <span>End Encounter</span>
                                </button>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>

            {/* Door Note Side Panel */}
            <div className="w-full md:w-1/3 xl:w-1/4 bg-gray-800 border-l border-gray-700 p-6 flex flex-col space-y-4 overflow-y-auto">
                <h2 className="text-2xl font-bold text-teal-300 sticky top-0 bg-gray-800 py-2">Door Note</h2>
                <div className="flex items-center">
                  <img src={patientCase.avatarUrl} alt={patientCase.name} className="w-16 h-16 rounded-full mr-4 border-2 border-teal-400" />
                  <div>
                    <h3 className="text-xl font-semibold">{patientCase.name}</h3>
                    <p className="text-gray-400">{`${patientCase.age}, ${patientCase.gender}`}</p>
                  </div>
                </div>
                <div>
                    <h4 className="font-semibold text-gray-400">Chief Complaint:</h4>
                    <p className="text-gray-200">{patientCase.chiefComplaint}</p>
                </div>
                <div>
                    <h4 className="font-semibold text-gray-400">Note:</h4>
                    <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">{patientCase.doorNote}</p>
                </div>
            </div>


            <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="fixed bottom-6 right-6 w-48 h-36 rounded-lg shadow-2xl border-2 border-gray-700 object-cover z-50"
            />
            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
};

export default Encounter;
import React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveSession, LiveServerMessage, Modality, Blob } from '@google/genai';
import type { PatientCase, TranscriptEntry } from '../types';
import { useTimer } from '../hooks/useTimer';
import { ClockIcon, MicrophoneIcon, StopIcon } from './IconComponents';

// --- Audio Utility Functions ---
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
// --- End Audio Utility Functions ---

interface EncounterProps {
  patientCase: PatientCase;
  onEncounterEnd: (transcript: TranscriptEntry[]) => void;
}

const Encounter: React.FC<EncounterProps> = ({ patientCase, onEncounterEnd }) => {
    const [isConnecting, setIsConnecting] = useState(true);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const transcriptRef = useRef<TranscriptEntry[]>([]);
    const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);

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
        let stream: MediaStream;
        let inputAudioContext: AudioContext;
        let outputAudioContext: AudioContext;
        let sources = new Set<AudioBufferSourceNode>();
        let nextStartTime = 0;

        const startSession = async () => {
            try {
                const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
                
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                setIsConnecting(false);

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
                        onerror: (e: ErrorEvent) => console.error("Session Error:", e),
                        onclose: () => console.log("Session Closed"),
                    },
                });
            } catch (error) {
                console.error("Failed to start session:", error);
                alert("Could not start session. Please ensure you have microphone permissions.");
                setIsConnecting(false);
            }
        };

        startSession();

        return () => {
            stream?.getTracks().forEach(track => track.stop());
            inputAudioContext?.close();
            outputAudioContext?.close();
            if (sessionPromiseRef.current) {
                sessionPromiseRef.current.then(session => session.close());
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [patientCase.script]);

    return (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white p-6">
            <div className="w-full max-w-md bg-gray-800 p-8 flex flex-col items-center justify-center space-y-6 border border-gray-700 rounded-lg shadow-2xl">
                <h2 className="text-2xl font-bold text-gray-300">Encounter in Progress</h2>
                <img src={patientCase.avatarUrl} alt={patientCase.name} className={`w-72 h-72 rounded-full border-4 transition-all duration-300 ${isSpeaking ? 'border-teal-400 shadow-2xl shadow-teal-500/30' : 'border-gray-600'}`} />
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-white">{patientCase.name}</h1>
                    <p className="text-lg text-gray-400">{`${patientCase.age}, ${patientCase.gender}`}</p>
                    <p className="text-md text-gray-500">{`Complaint: ${patientCase.chiefComplaint}`}</p>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2.5">
                  <div className={`bg-teal-500 h-2.5 rounded-full transition-all duration-500 ${isSpeaking ? 'w-full' : 'w-0'}`}></div>
                </div>
                 <div className="flex items-center space-x-2 text-xl font-mono bg-gray-900 px-4 py-2 rounded-lg">
                    <ClockIcon className="w-6 h-6 text-teal-400"/>
                    <span>{formattedTime}</span>
                </div>
                 <div className="flex-shrink-0 flex items-center justify-center pt-4">
                    {isConnecting ? (
                         <div className="flex flex-col items-center text-gray-400">
                            <MicrophoneIcon className="w-12 h-12 mb-2 animate-pulse" />
                            <p>Connecting to patient...</p>
                         </div>
                    ) : (
                        <button onClick={endEncounter} className="flex items-center justify-center space-x-3 px-8 py-4 bg-red-600 text-white font-bold rounded-full hover:bg-red-500 transition-colors shadow-lg">
                            <StopIcon className="w-6 h-6" />
                            <span>End Encounter</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Encounter;
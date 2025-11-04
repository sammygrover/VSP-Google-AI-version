import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import type { PatientCase, TranscriptEntry, SegueEvaluationResult, CalgaryCambridgeEvaluationResult, EvaluationSection, EpaEvaluationResult } from '../types';
import { 
    SEGUE_EVALUATION_RUBRIC, 
    SEGUE_RESPONSE_SCHEMA, 
    CALGARY_CAMBRIDGE_EVALUATION_RUBRIC, 
    CALGARY_CAMBRIDGE_RESPONSE_SCHEMA,
    EPA_EVALUATION_RUBRIC,
    EPA_RESPONSE_SCHEMA
} from '../constants';
import { BrainCircuitIcon, ArrowLeftIcon } from './IconComponents';

interface EvaluationProps {
  patientCase: PatientCase;
  transcript: TranscriptEntry[];
  onRestart: () => void;
}

const LoadingState: React.FC<{loadingMessage: string, progress: number}> = ({loadingMessage, progress}) => {
    return (
        <div className="flex flex-col items-center justify-center text-center p-8">
            <BrainCircuitIcon className="w-24 h-24 text-teal-400 animate-pulse mb-6" />
            <h2 className="text-2xl font-bold text-white">Analyzing Encounter...</h2>
            <p className="text-gray-400 mt-2 mb-6">{loadingMessage}</p>
            <div className="w-full bg-gray-700 rounded-full h-2.5">
                <div 
                    className="bg-teal-500 h-2.5 rounded-full transition-all duration-500" 
                    style={{width: `${progress}%`}}
                ></div>
            </div>
        </div>
    );
};

type Rubric = 'segue' | 'calgary-cambridge' | 'epa';

const Evaluation: React.FC<EvaluationProps> = ({ patientCase, transcript, onRestart }) => {
  const [segueEvaluation, setSegueEvaluation] = useState<SegueEvaluationResult | null>(null);
  const [ccEvaluation, setCcEvaluation] = useState<CalgaryCambridgeEvaluationResult | null>(null);
  const [epaEvaluation, setEpaEvaluation] = useState<EpaEvaluationResult | null>(null);
  const [activeRubric, setActiveRubric] = useState<Rubric>('segue');
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Preparing analysis requests...');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const getEvaluation = async () => {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const transcriptText = transcript
          .map(entry => `${entry.speaker === 'user' ? 'Student' : 'Patient'}: ${entry.text}`)
          .join('\n');
        
        setLoadingProgress(10);

        const createPrompt = (rubric: string) => rubric
            .replace('{PATIENT_SCRIPT}', patientCase.script)
            .replace('{TRANSCRIPT}', transcriptText);
        
        setLoadingMessage('Analyzing transcript and applying frameworks...');
        setLoadingProgress(30);

        const seguePromise = ai.models.generateContent({
          model: 'gemini-2.5-pro',
          contents: createPrompt(SEGUE_EVALUATION_RUBRIC),
          config: { responseMimeType: 'application/json', responseSchema: SEGUE_RESPONSE_SCHEMA }
        });
        
        const ccPromise = ai.models.generateContent({
          model: 'gemini-2.5-pro',
          contents: createPrompt(CALGARY_CAMBRIDGE_EVALUATION_RUBRIC),
          config: { responseMimeType: 'application/json', responseSchema: CALGARY_CAMBRIDGE_RESPONSE_SCHEMA }
        });

        const epaPromise = ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: createPrompt(EPA_EVALUATION_RUBRIC),
            config: { responseMimeType: 'application/json', responseSchema: EPA_RESPONSE_SCHEMA }
        });

        const [segueResponse, ccResponse, epaResponse] = await Promise.all([seguePromise, ccPromise, epaPromise]);
        
        setLoadingMessage('Finalizing reports...');
        setLoadingProgress(90);

        const parseResult = (text: string) => {
            let resultText = text.trim();
            if (resultText.startsWith('```json')) {
                resultText = resultText.slice(7, -3).trim();
            } else if (resultText.startsWith('```')) {
                resultText = resultText.slice(3, -3).trim();
            }
            return JSON.parse(resultText);
        }

        setSegueEvaluation(parseResult(segueResponse.text));
        setCcEvaluation(parseResult(ccResponse.text));
        setEpaEvaluation(parseResult(epaResponse.text));
        
        setLoadingProgress(100);

      } catch (err) {
        console.error("Evaluation Error:", err);
        setError("Failed to parse the evaluation from the AI. The model may have returned an unexpected format. Please try another encounter.");
      } finally {
        setIsLoading(false);
      }
    };

    getEvaluation();
  }, [patientCase, transcript]);


  const renderError = () => (
    <div className="text-center p-8 bg-red-900/50 rounded-lg">
      <h2 className="text-2xl font-bold text-red-300">Evaluation Failed</h2>
      <p className="text-red-200 mt-2">{error}</p>
    </div>
  );
  
  const EvaluationCard: React.FC<{title: string, data: EvaluationSection | undefined}> = ({ title, data }) => (
    <div className="bg-gray-800 p-6 rounded-lg">
        <h3 className="text-2xl font-bold mb-3 text-teal-300">{title} ({data?.score ?? 'N/A'}/100)</h3>
        <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{data?.feedback ?? 'No feedback available.'}</p>
    </div>
  );

  const renderSegueRubric = () => {
      if (!segueEvaluation) return null;
      return (
            <>
                <div className="grid grid-cols-1 gap-6">
                    <EvaluationCard title="Set the Stage" data={segueEvaluation.setTheStage} />
                    <EvaluationCard title="Elicit Information" data={segueEvaluation.elicitInformation} />
                    <EvaluationCard title="Give Information" data={segueEvaluation.giveInformation} />
                    <EvaluationCard title="Understand the Patient" data={segueEvaluation.understandThePatient} />
                    <EvaluationCard title="End the Encounter" data={segueEvaluation.endTheEncounter} />
                </div>
                {segueEvaluation.keyTakeaways && segueEvaluation.keyTakeaways.length > 0 && (
                    <div className="bg-gray-800 p-6 rounded-lg mt-6">
                        <h3 className="text-2xl font-bold mb-4 text-teal-300">Key Take-aways</h3>
                        <ul className="space-y-3">
                            {segueEvaluation.keyTakeaways.map((point, index) => (
                                <li key={index} className="flex items-start">
                                    <span className="text-teal-400 font-bold mr-3 text-xl">►</span>
                                    <p className="text-gray-300">{point}</p>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </>
        )
  }

  const EntrustabilityScale: React.FC<{score: number}> = ({ score }) => {
    const levels = [
        { level: 1, text: "I had to do it." },
        { level: 2, text: "I had to talk them through it." },
        { level: 3, text: "I had to direct them." },
        { level: 4, text: "I needed to be there just in case." },
        { level: 5, text: "I did not need to be there." },
    ]
    return (
        <div className="flex flex-col space-y-2 my-4">
            {levels.map(l => (
                <div key={l.level} className={`flex items-center p-3 rounded-lg transition-all ${score === l.level ? 'bg-teal-500/20 border border-teal-500' : 'bg-gray-700/50'}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-4 flex-shrink-0 ${score === l.level ? 'bg-teal-500 text-gray-900 font-bold' : 'bg-gray-600 text-gray-300'}`}>{l.level}</div>
                    <span className={`font-medium ${score === l.level ? 'text-teal-300' : 'text-gray-400'}`}>{l.text}</span>
                </div>
            ))}
        </div>
    )
  }

  const renderEpaRubric = () => {
    if (!epaEvaluation) return null;
    return (
        <div className="bg-gray-800 p-6 rounded-lg">
             <h3 className="text-2xl font-bold mb-1 text-teal-300">Entrustability Assessment</h3>
             <p className="text-gray-400 mb-4 text-lg">{epaEvaluation.epaTitle}</p>
             <EntrustabilityScale score={epaEvaluation.entrustabilityScore} />
             <h4 className="font-bold text-xl text-gray-200 mt-6 mb-2">Justification</h4>
             <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{epaEvaluation.feedback}</p>
        </div>
    )
  }

  const renderCalgaryCambridgeRubric = () => {
    if (!ccEvaluation) return null;
    return (
        <div className="grid grid-cols-1 gap-6">
            <EvaluationCard title="Initiating the Session" data={ccEvaluation.initiatingTheSession} />
            <EvaluationCard title="Gathering Information" data={ccEvaluation.gatheringInformation} />
            <EvaluationCard title="Building the Relationship" data={ccEvaluation.buildingTheRelationship} />
        </div>
    )
  }

  const renderActiveRubric = () => {
    switch(activeRubric){
        case 'segue': return renderSegueRubric();
        case 'calgary-cambridge': return renderCalgaryCambridgeRubric();
        case 'epa': return renderEpaRubric();
        default: return null;
    }
  }

  const renderEvaluation = () => {
    const evaluation = activeRubric === 'segue' ? segueEvaluation : ccEvaluation;
    if (!evaluation) return activeRubric === 'epa' ? null : <div />; // Render nothing if it's EPA, or an empty div otherwise
    
    const scores = activeRubric === 'segue' ? [
        segueEvaluation?.setTheStage?.score,
        segueEvaluation?.elicitInformation?.score,
        segueEvaluation?.giveInformation?.score,
        segueEvaluation?.understandThePatient?.score,
        segueEvaluation?.endTheEncounter?.score,
    ].filter(s => typeof s === 'number') as number[] : [
        ccEvaluation?.initiatingTheSession?.score,
        ccEvaluation?.gatheringInformation?.score,
        ccEvaluation?.buildingTheRelationship?.score
    ].filter(s => typeof s === 'number') as number[];
    
    const overallScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    return (
      <>
        <div className="bg-gray-800 p-6 rounded-lg mb-6">
            <h2 className="text-3xl font-bold text-white mb-4">Overall Performance</h2>
            <div className="text-center">
                <div className={`w-32 h-32 rounded-full mx-auto flex items-center justify-center text-4xl font-bold border-4 ${overallScore >= 80 ? 'border-green-500/50 text-green-300' : overallScore >= 60 ? 'border-yellow-500/50 text-yellow-300' : 'border-red-500/50 text-red-300'}`}>
                    {overallScore}
                </div>
                <p className="mt-4 text-gray-300 max-w-2xl mx-auto">{evaluation?.overallImpression ?? 'No overall impression available.'}</p>
            </div>
             {evaluation?.patientFeedback && (
              <div className="mt-6 border-t border-gray-700 pt-4">
                  <h3 className="text-lg font-semibold text-teal-300 mb-2 text-center">Patient's Remarks</h3>
                  <blockquote className="text-center max-w-2xl mx-auto">
                      <p className="text-gray-300 italic text-lg">"{evaluation.patientFeedback}"</p>
                      <footer className="text-right text-sm text-gray-500 mt-2">- {patientCase.name}</footer>
                  </blockquote>
              </div>
            )}
        </div>
      </>
    );
  };
  
  return (
    <div className="min-h-screen bg-gray-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-3xl md:text-4xl font-bold text-teal-300">Encounter Evaluation</h1>
          <button onClick={onRestart} className="flex items-center space-x-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors">
            <ArrowLeftIcon className="w-5 h-5" />
            <span>New Encounter</span>
          </button>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
                {isLoading ? <LoadingState loadingMessage={loadingMessage} progress={loadingProgress} /> : error ? renderError() : (
                    <>
                        {(activeRubric === 'segue' || activeRubric === 'calgary-cambridge') && renderEvaluation()}

                        <div className="mb-6">
                            <div className="flex justify-center space-x-2 p-1 bg-gray-700 rounded-lg">
                                <button onClick={() => setActiveRubric('segue')} className={`w-full py-2 px-4 rounded-md font-semibold transition-colors ${activeRubric === 'segue' ? 'bg-teal-600 text-white shadow' : 'bg-transparent text-gray-300 hover:bg-gray-600'}`}>SEGUE Framework</button>
                                <button onClick={() => setActiveRubric('calgary-cambridge')} className={`w-full py-2 px-4 rounded-md font-semibold transition-colors ${activeRubric === 'calgary-cambridge' ? 'bg-teal-600 text-white shadow' : 'bg-transparent text-gray-300 hover:bg-gray-600'}`}>Calgary-Cambridge</button>
                                <button onClick={() => setActiveRubric('epa')} className={`w-full py-2 px-4 rounded-md font-semibold transition-colors ${activeRubric === 'epa' ? 'bg-teal-600 text-white shadow' : 'bg-transparent text-gray-300 hover:bg-gray-600'}`}>FM EPA</button>
                            </div>
                        </div>

                        {renderActiveRubric()}
                    </>
                )}
            </div>
            <div className="bg-gray-800 p-6 rounded-lg max-h-[85vh] flex flex-col">
                <h3 className="text-xl font-bold mb-4 flex-shrink-0">Encounter Transcript</h3>
                <div className="overflow-y-auto flex-1 pr-2">
                    {transcript.map((entry, index) => (
                        <div key={index} className={`mb-3 ${entry.speaker === 'user' ? 'text-right' : 'text-left'}`}>
                            <p className={`font-bold text-sm ${entry.speaker === 'user' ? 'text-teal-400' : 'text-gray-400'}`}>{entry.speaker === 'user' ? 'You' : patientCase.name}</p>
                            <p className="text-gray-200">{entry.text}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Evaluation;
import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import type { PatientCase, TranscriptEntry, SegueEvaluationResult, CalgaryCambridgeEvaluationResult, EvaluationSection, EpaEvaluationResult, PsychiatricEvaluationResult, SpikesEvaluationResult, GeriatricEvaluationResult, NonVerbalEvaluationResult, EmergencyEvaluationResult } from '../types';
import { 
    SEGUE_EVALUATION_RUBRIC, 
    SEGUE_RESPONSE_SCHEMA, 
    CALGARY_CAMBRIDGE_EVALUATION_RUBRIC, 
    CALGARY_CAMBRIDGE_RESPONSE_SCHEMA,
    EPA_EVALUATION_RUBRIC,
    EPA_RESPONSE_SCHEMA,
    PSYCHIATRIC_EVALUATION_RUBRIC,
    PSYCHIATRIC_RESPONSE_SCHEMA,
    SPIKES_EVALUATION_RUBRIC,
    SPIKES_RESPONSE_SCHEMA,
    GERIATRIC_EVALUATION_RUBRIC,
    GERIATRIC_RESPONSE_SCHEMA,
    NON_VERBAL_EVALUATION_RUBRIC,
    NON_VERBAL_RESPONSE_SCHEMA,
    EMERGENCY_EVALUATION_RUBRIC,
    EMERGENCY_RESPONSE_SCHEMA
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

type Rubric = 'segue' | 'calgary-cambridge' | 'specialty' | 'non-verbal';

const Evaluation: React.FC<EvaluationProps> = ({ patientCase, transcript, onRestart }) => {
  const [segueEvaluation, setSegueEvaluation] = useState<SegueEvaluationResult | null>(null);
  const [ccEvaluation, setCcEvaluation] = useState<CalgaryCambridgeEvaluationResult | null>(null);
  const [epaEvaluation, setEpaEvaluation] = useState<EpaEvaluationResult | null>(null);
  const [psychEvaluation, setPsychEvaluation] = useState<PsychiatricEvaluationResult | null>(null);
  const [spikesEvaluation, setSpikesEvaluation] = useState<SpikesEvaluationResult | null>(null);
  const [geriatricEvaluation, setGeriatricEvaluation] = useState<GeriatricEvaluationResult | null>(null);
  const [nonVerbalEvaluation, setNonVerbalEvaluation] = useState<NonVerbalEvaluationResult | null>(null);
  const [emergencyEvaluation, setEmergencyEvaluation] = useState<EmergencyEvaluationResult | null>(null);

  const [activeRubric, setActiveRubric] = useState<Rubric>('segue');
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Preparing analysis requests...');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const specialtyRubricType = patientCase.tags.includes('Aortic Dissection') ? 'Emergency'
    : patientCase.tags.includes('Psychiatry') ? 'Psychiatric' 
    : patientCase.tags.includes('Breaking Bad News') ? 'SPIKES' 
    : patientCase.tags.includes('Geriatrics') && patientCase.id === 13 ? 'Geriatric' // Elena Petrova
    : 'FM EPA';


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
        
        const allPromises = [];

        const seguePromise = ai.models.generateContent({
          model: 'gemini-2.5-pro',
          contents: createPrompt(SEGUE_EVALUATION_RUBRIC),
          config: { responseMimeType: 'application/json', responseSchema: SEGUE_RESPONSE_SCHEMA }
        });
        allPromises.push(seguePromise);
        
        const ccPromise = ai.models.generateContent({
          model: 'gemini-2.5-pro',
          contents: createPrompt(CALGARY_CAMBRIDGE_EVALUATION_RUBRIC),
          config: { responseMimeType: 'application/json', responseSchema: CALGARY_CAMBRIDGE_RESPONSE_SCHEMA }
        });
        allPromises.push(ccPromise);

        let specialtyPromise;
        switch(specialtyRubricType) {
            case 'Emergency':
                specialtyPromise = ai.models.generateContent({ model: 'gemini-2.5-pro', contents: createPrompt(EMERGENCY_EVALUATION_RUBRIC), config: { responseMimeType: 'application/json', responseSchema: EMERGENCY_RESPONSE_SCHEMA } });
                break;
            case 'Psychiatric':
                specialtyPromise = ai.models.generateContent({ model: 'gemini-2.5-pro', contents: createPrompt(PSYCHIATRIC_EVALUATION_RUBRIC), config: { responseMimeType: 'application/json', responseSchema: PSYCHIATRIC_RESPONSE_SCHEMA } });
                break;
            case 'SPIKES':
                 specialtyPromise = ai.models.generateContent({ model: 'gemini-2.5-pro', contents: createPrompt(SPIKES_EVALUATION_RUBRIC), config: { responseMimeType: 'application/json', responseSchema: SPIKES_RESPONSE_SCHEMA } });
                break;
            case 'Geriatric':
                 specialtyPromise = ai.models.generateContent({ model: 'gemini-2.5-pro', contents: createPrompt(GERIATRIC_EVALUATION_RUBRIC), config: { responseMimeType: 'application/json', responseSchema: GERIATRIC_RESPONSE_SCHEMA } });
                break;
            default: // FM EPA
                 specialtyPromise = ai.models.generateContent({ model: 'gemini-2.5-pro', contents: createPrompt(EPA_EVALUATION_RUBRIC), config: { responseMimeType: 'application/json', responseSchema: EPA_RESPONSE_SCHEMA } });
                break;
        }
        allPromises.push(specialtyPromise);

        const nonVerbalPromise = ai.models.generateContent({
          model: 'gemini-2.5-pro',
          contents: createPrompt(NON_VERBAL_EVALUATION_RUBRIC),
          config: { responseMimeType: 'application/json', responseSchema: NON_VERBAL_RESPONSE_SCHEMA }
        });
        allPromises.push(nonVerbalPromise);


        setLoadingProgress(25);

        const [segueResult, ccResult, specialtyResult, nonVerbalResult] = await Promise.allSettled([seguePromise, ccPromise, specialtyPromise, nonVerbalPromise]);
        
        setLoadingMessage('Finalizing reports...');
        
        const parseResult = (text: string) => {
            let resultText = text.trim();
            if (resultText.startsWith('```json')) {
                resultText = resultText.slice(7, -3).trim();
            } else if (resultText.startsWith('```')) {
                resultText = resultText.slice(3, -3).trim();
            }
            return JSON.parse(resultText);
        }
        
        let errors: string[] = [];

        if (segueResult.status === 'fulfilled') {
            try { setSegueEvaluation(parseResult(segueResult.value.text)); } 
            catch (e) { console.error("Failed to parse SEGUE evaluation:", e, "Raw:", segueResult.value.text); errors.push("SEGUE"); }
        } else { errors.push("SEGUE"); console.error("SEGUE Request Failed:", segueResult.reason); }
        setLoadingProgress(50);
        
        if (ccResult.status === 'fulfilled') {
            try { setCcEvaluation(parseResult(ccResult.value.text)); }
            catch (e) { console.error("Failed to parse CC evaluation:", e, "Raw:", ccResult.value.text); errors.push("Calgary-Cambridge"); }
        } else { errors.push("Calgary-Cambridge"); console.error("CC Request Failed:", ccResult.reason); }
        setLoadingProgress(75);

        if (specialtyResult.status === 'fulfilled') {
            try {
                const parsed = parseResult(specialtyResult.value.text);
                switch(specialtyRubricType) {
                    case 'Emergency': setEmergencyEvaluation(parsed); break;
                    case 'Psychiatric': setPsychEvaluation(parsed); break;
                    case 'SPIKES': setSpikesEvaluation(parsed); break;
                    case 'Geriatric': setGeriatricEvaluation(parsed); break;
                    default: setEpaEvaluation(parsed); break;
                }
            } catch(e) {
                console.error(`Failed to parse ${specialtyRubricType} evaluation:`, e, "Raw:", specialtyResult.value.text);
                errors.push(specialtyRubricType);
            }
        } else { 
             errors.push(specialtyRubricType); 
             console.error(`${specialtyRubricType} Request Failed:`, specialtyResult.reason);
        }
        setLoadingProgress(90);

        if (nonVerbalResult.status === 'fulfilled') {
            try { setNonVerbalEvaluation(parseResult(nonVerbalResult.value.text)); }
            catch (e) { console.error("Failed to parse Non-Verbal evaluation:", e, "Raw:", nonVerbalResult.value.text); errors.push("Non-Verbal"); }
        } else { errors.push("Non-Verbal"); console.error("Non-Verbal Request Failed:", nonVerbalResult.reason); }


        if (errors.length > 0) {
            setError(`Failed to load the following reports: ${errors.join(', ')}. Please check the console for details.`);
        }
        
        setLoadingProgress(100);

      } catch (err) {
        console.error("Evaluation Error:", err);
        setError("A critical error occurred while analyzing the encounter. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    getEvaluation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientCase, transcript]);


  const renderError = () => (
    <div className="text-center p-8 bg-red-900/50 rounded-lg">
      <h2 className="text-2xl font-bold text-red-300">Evaluation Error</h2>
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
        <div className="grid grid-cols-1 gap-6">
            <EvaluationCard title="Set the Stage" data={segueEvaluation.setTheStage} />
            <EvaluationCard title="Elicit Information" data={segueEvaluation.elicitInformation} />
            <EvaluationCard title="Give Information" data={segueEvaluation.giveInformation} />
            <EvaluationCard title="Understand the Patient" data={segueEvaluation.understandThePatient} />
            <EvaluationCard title="End the Encounter" data={segueEvaluation.endTheEncounter} />
        </div>
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
  
  const renderSpecialtyRubric = () => {
    switch (specialtyRubricType) {
        case 'Emergency':
            if (!emergencyEvaluation) return <p>Emergency report is unavailable.</p>;
            const emergencyScores = [emergencyEvaluation.rapidIdentification?.score, emergencyEvaluation.focusedHistory?.score, emergencyEvaluation.activationOfResponse?.score, emergencyEvaluation.communicationUnderPressure?.score].filter(s => typeof s === 'number') as number[];
            const overallEmergencyScore = emergencyScores.length > 0 ? Math.round(emergencyScores.reduce((a, b) => a + b, 0) / emergencyScores.length) : 0;
            return (
              <>
                {renderOverallPerformanceHeader(overallEmergencyScore, emergencyEvaluation.overallImpression, emergencyEvaluation.patientFeedback)}
                <div className="grid grid-cols-1 gap-6">
                  <EvaluationCard title="Rapid Identification" data={emergencyEvaluation.rapidIdentification} />
                  <EvaluationCard title="Focused History" data={emergencyEvaluation.focusedHistory} />
                  <EvaluationCard title="Activation of Emergency Response" data={emergencyEvaluation.activationOfResponse} />
                  <EvaluationCard title="Communication Under Pressure" data={emergencyEvaluation.communicationUnderPressure} />
                </div>
              </>
            );
        case 'Psychiatric':
            if (!psychEvaluation) return <p>Psychiatric report is unavailable.</p>;
            const psychScores = [psychEvaluation.historyOfPresentIllness?.score, psychEvaluation.pastPsychiatricHistory?.score, psychEvaluation.mentalStatusExamination?.score, psychEvaluation.rapportAndEmpathy?.score].filter(s => typeof s === 'number') as number[];
            const overallPsychScore = psychScores.length > 0 ? Math.round(psychScores.reduce((a, b) => a + b, 0) / psychScores.length) : 0;
            return (
              <>
                {renderOverallPerformanceHeader(overallPsychScore, psychEvaluation.overallImpression, psychEvaluation.patientFeedback)}
                <div className="grid grid-cols-1 gap-6">
                  <EvaluationCard title="History of Present Illness" data={psychEvaluation.historyOfPresentIllness} />
                  <EvaluationCard title="Past Psychiatric History" data={psychEvaluation.pastPsychiatricHistory} />
                  <EvaluationCard title="Mental Status Examination" data={psychEvaluation.mentalStatusExamination} />
                  <EvaluationCard title="Rapport and Empathy" data={psychEvaluation.rapportAndEmpathy} />
                </div>
              </>
            );

        case 'SPIKES':
            if (!spikesEvaluation) return <p>SPIKES report is unavailable.</p>;
             const spikesScores = [spikesEvaluation.setting?.score, spikesEvaluation.perception?.score, spikesEvaluation.invitation?.score, spikesEvaluation.knowledge?.score, spikesEvaluation.emotions?.score, spikesEvaluation.strategyAndSummary?.score].filter(s => typeof s === 'number') as number[];
            const overallSpikesScore = spikesScores.length > 0 ? Math.round(spikesScores.reduce((a, b) => a + b, 0) / spikesScores.length) : 0;
            return (
                 <>
                    {renderOverallPerformanceHeader(overallSpikesScore, spikesEvaluation.overallImpression, spikesEvaluation.patientFeedback)}
                    <div className="grid grid-cols-1 gap-6">
                        <EvaluationCard title="Setting" data={spikesEvaluation.setting} />
                        <EvaluationCard title="Perception" data={spikesEvaluation.perception} />
                        <EvaluationCard title="Invitation" data={spikesEvaluation.invitation} />
                        <EvaluationCard title="Knowledge" data={spikesEvaluation.knowledge} />
                        <EvaluationCard title="Emotions" data={spikesEvaluation.emotions} />
                        <EvaluationCard title="Strategy & Summary" data={spikesEvaluation.strategyAndSummary} />
                    </div>
                 </>
            );

        case 'Geriatric':
            if (!geriatricEvaluation) return <p>Geriatric report is unavailable.</p>;
            const geriatricScores = [geriatricEvaluation.fallsHistory?.score, geriatricEvaluation.functionalAssessment?.score, geriatricEvaluation.medicationReview?.score, geriatricEvaluation.sensoryAndCommunication?.score].filter(s => typeof s === 'number') as number[];
            const overallGeriatricScore = geriatricScores.length > 0 ? Math.round(geriatricScores.reduce((a, b) => a + b, 0) / geriatricScores.length) : 0;
            return (
                <>
                    {renderOverallPerformanceHeader(overallGeriatricScore, geriatricEvaluation.overallImpression, geriatricEvaluation.patientFeedback)}
                    <div className="grid grid-cols-1 gap-6">
                        <EvaluationCard title="Falls History" data={geriatricEvaluation.fallsHistory} />
                        <EvaluationCard title="Functional Assessment" data={geriatricEvaluation.functionalAssessment} />
                        <EvaluationCard title="Medication Review" data={geriatricEvaluation.medicationReview} />
                        <EvaluationCard title="Sensory & Communication" data={geriatricEvaluation.sensoryAndCommunication} />
                    </div>
                </>
            );

        case 'FM EPA':
            if (!epaEvaluation) return <p>EPA report is unavailable.</p>;
            return (
                <div className="bg-gray-800 p-6 rounded-lg">
                     <h3 className="text-2xl font-bold mb-1 text-teal-300">Entrustability Assessment</h3>
                     <p className="text-gray-400 mb-4 text-lg">{epaEvaluation.epaTitle}</p>
                     <EntrustabilityScale score={epaEvaluation.entrustabilityScore} />
                     <h4 className="font-bold text-xl text-gray-200 mt-6 mb-2">Justification</h4>
                     <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{epaEvaluation.feedback}</p>
                </div>
            );

        default: return null;
    }
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
  
  const renderNonVerbalRubric = () => {
    if (!nonVerbalEvaluation) return null;
    const scores = [nonVerbalEvaluation.attentiveGaze?.score, nonVerbalEvaluation.facialExpression?.score, nonVerbalEvaluation.postureAndGestures?.score, nonVerbalEvaluation.vocalCues?.score].filter(s => typeof s === 'number') as number[];
    const overallScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    return (
        <>
            {renderOverallPerformanceHeader(overallScore, nonVerbalEvaluation.overallImpression)}
            <div className="grid grid-cols-1 gap-6">
                <EvaluationCard title="Attentive Gaze" data={nonVerbalEvaluation.attentiveGaze} />
                <EvaluationCard title="Facial Expression" data={nonVerbalEvaluation.facialExpression} />
                <EvaluationCard title="Posture & Gestures" data={nonVerbalEvaluation.postureAndGestures} />
                <EvaluationCard title="Vocal Cues" data={nonVerbalEvaluation.vocalCues} />
            </div>
        </>
    )
  }

  const renderActiveRubric = () => {
    switch(activeRubric){
        case 'segue': return segueEvaluation ? renderSegueRubric() : <p>SEGUE report is unavailable.</p>;
        case 'calgary-cambridge': return ccEvaluation ? renderCalgaryCambridgeRubric() : <p>Calgary-Cambridge report is unavailable.</p>;
        case 'specialty': return renderSpecialtyRubric();
        case 'non-verbal': return renderNonVerbalRubric();
        default: return null;
    }
  }

  const renderOverallPerformanceHeader = (score: number, impression?: string, patientFeedback?: string) => {
    return (
      <div className="bg-gray-800 p-6 rounded-lg mb-6">
        <h2 className="text-3xl font-bold text-white mb-4">Overall Performance</h2>
        <div className="text-center">
            <div className={`w-32 h-32 rounded-full mx-auto flex items-center justify-center text-4xl font-bold border-4 ${score >= 80 ? 'border-green-500/50 text-green-300' : score >= 60 ? 'border-yellow-500/50 text-yellow-300' : 'border-red-500/50 text-red-300'}`}>
                {score}
            </div>
            <p className="mt-4 text-gray-300 max-w-2xl mx-auto">{impression ?? 'No overall impression available.'}</p>
        </div>
         {patientFeedback && (
          <div className="mt-8 bg-gray-900/50 p-6 rounded-xl border-l-4 border-teal-500">
            <h3 className="text-lg font-semibold text-teal-300 mb-2">Patient's Remarks</h3>
            <blockquote className="relative">
                <p className="text-gray-300 italic text-lg leading-relaxed">"{patientFeedback}"</p>
                <footer className="text-right text-sm text-gray-500 mt-3">- {patientCase.name}</footer>
            </blockquote>
          </div>
        )}
      </div>
    );
  };
  
  const getOverallScoreForRubric = (rubric: Rubric) => {
    switch (rubric) {
        case 'segue':
            if (!segueEvaluation) return 0;
            const segueScores = [segueEvaluation.setTheStage?.score, segueEvaluation.elicitInformation?.score, segueEvaluation.giveInformation?.score, segueEvaluation.understandThePatient?.score, segueEvaluation.endTheEncounter?.score].filter(s => typeof s === 'number') as number[];
            return segueScores.length > 0 ? Math.round(segueScores.reduce((a, b) => a + b, 0) / segueScores.length) : 0;
        case 'calgary-cambridge':
            if (!ccEvaluation) return 0;
            const ccScores = [ccEvaluation.initiatingTheSession?.score, ccEvaluation.gatheringInformation?.score, ccEvaluation.buildingTheRelationship?.score].filter(s => typeof s === 'number') as number[];
            return ccScores.length > 0 ? Math.round(ccScores.reduce((a, b) => a + b, 0) / ccScores.length) : 0;
        default: return 0;
    }
  }
  
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
                {isLoading ? <LoadingState loadingMessage={loadingMessage} progress={loadingProgress} /> : (
                    <>
                        {error && <div className="mb-4">{renderError()}</div>}
                        
                        {/* Always visible header content */}
                        {(segueEvaluation || ccEvaluation) && (
                            <div className="bg-gray-800 p-6 rounded-lg mb-6">
                                <h2 className="text-3xl font-bold text-white mb-4">Performance Summary</h2>
                                 {segueEvaluation?.keyTakeaways && (
                                  <div className="mb-6 bg-gray-900/50 p-6 rounded-xl">
                                    <h3 className="text-xl font-bold text-teal-300 mb-3">Three Key Takeaways</h3>
                                    <ul className="space-y-3 text-left">
                                      {segueEvaluation.keyTakeaways.map((point, index) => (
                                        <li key={index} className="flex items-start">
                                          <span className="text-teal-400 font-bold mr-3 text-xl">►</span>
                                          <p className="text-gray-300">{point}</p>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                <p className="text-gray-400">Select a framework below for a detailed breakdown.</p>
                            </div>
                        )}


                        <div className="mb-6">
                            <div className="flex justify-center space-x-1 p-1 bg-gray-700 rounded-lg text-sm md:text-base">
                                <button onClick={() => setActiveRubric('segue')} className={`w-full py-2 px-3 rounded-md font-semibold transition-colors ${activeRubric === 'segue' ? 'bg-teal-600 text-white shadow' : 'bg-transparent text-gray-300 hover:bg-gray-600'}`}>SEGUE</button>
                                <button onClick={() => setActiveRubric('calgary-cambridge')} className={`w-full py-2 px-3 rounded-md font-semibold transition-colors ${activeRubric === 'calgary-cambridge' ? 'bg-teal-600 text-white shadow' : 'bg-transparent text-gray-300 hover:bg-gray-600'}`}>Calgary-Cambridge</button>
                                <button onClick={() => setActiveRubric('specialty')} className={`w-full py-2 px-3 rounded-md font-semibold transition-colors ${activeRubric === 'specialty' ? 'bg-teal-600 text-white shadow' : 'bg-transparent text-gray-300 hover:bg-gray-600'}`}>
                                    {specialtyRubricType === 'Geriatric' ? 'Geriatric Eval' : specialtyRubricType}
                                </button>
                                <button onClick={() => setActiveRubric('non-verbal')} className={`w-full py-2 px-3 rounded-md font-semibold transition-colors ${activeRubric === 'non-verbal' ? 'bg-teal-600 text-white shadow' : 'bg-transparent text-gray-300 hover:bg-gray-600'}`}>Non-Verbal Cues</button>
                            </div>
                        </div>

                        {/* Render overall score and patient feedback inside the tabbed content */}
                        {(activeRubric === 'segue' && segueEvaluation) && renderOverallPerformanceHeader(getOverallScoreForRubric('segue'), segueEvaluation.overallImpression, segueEvaluation.patientFeedback)}
                        {(activeRubric === 'calgary-cambridge' && ccEvaluation) && renderOverallPerformanceHeader(getOverallScoreForRubric('calgary-cambridge'), ccEvaluation.overallImpression, ccEvaluation.patientFeedback)}

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
                    {transcript.length === 0 && <p className="text-gray-500">No transcript was recorded.</p>}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Evaluation;
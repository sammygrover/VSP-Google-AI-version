
import React, { useState, useCallback } from 'react';
// FIX: Removed 'EvaluationResult' from import as it is not exported from './types' and was causing a compilation error.
import type { PatientCase, TranscriptEntry, Screen } from './types';
import { Screen as ScreenEnum } from './types';
import PatientSelection from './components/PatientSelection';
import Encounter from './components/Encounter';
import Evaluation from './components/Evaluation';
import { PATIENT_CASES } from './constants';

const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>(ScreenEnum.Selection);
  const [selectedCase, setSelectedCase] = useState<PatientCase | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  // FIX: Removed unused 'evaluation' state. The Evaluation component handles its own state.

  const handleCaseSelect = useCallback((patientCase: PatientCase) => {
    setSelectedCase(patientCase);
    setTranscript([]);
    setCurrentScreen(ScreenEnum.Encounter);
  }, []);

  const handleEncounterEnd = useCallback((finalTranscript: TranscriptEntry[]) => {
    setTranscript(finalTranscript);
    setCurrentScreen(ScreenEnum.Evaluation);
  }, []);
  
  const handleReturnToSelection = useCallback(() => {
    setSelectedCase(null);
    setTranscript([]);
    setCurrentScreen(ScreenEnum.Selection);
  }, []);


  const renderScreen = () => {
    switch (currentScreen) {
      case ScreenEnum.Encounter:
        if (selectedCase) {
          return <Encounter patientCase={selectedCase} onEncounterEnd={handleEncounterEnd} />;
        }
        // Fallback to selection if case is somehow null
        setCurrentScreen(ScreenEnum.Selection);
        return null;
      
      case ScreenEnum.Evaluation:
        if (selectedCase && transcript.length > 0) {
          return <Evaluation patientCase={selectedCase} transcript={transcript} onRestart={handleReturnToSelection} />;
        }
        // Fallback to selection if data is missing
        setCurrentScreen(ScreenEnum.Selection);
        return null;

      case ScreenEnum.Selection:
      default:
        return <PatientSelection cases={PATIENT_CASES} onCaseSelect={handleCaseSelect} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">
      <main>{renderScreen()}</main>
    </div>
  );
};

export default App;

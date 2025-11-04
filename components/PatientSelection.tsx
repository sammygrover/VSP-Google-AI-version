import React, { useState } from 'react';
import type { PatientCase } from '../types';

const SHARPEN_LOGO_DATA_URI = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTg1IiBoZWlnaHQ9IjQwIiB2aWV3Qm94PSIwIDAgMTg1IDQwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgo8cGF0aCBkPSJNMjIuNCAzLjJDMTUuNiAzLjIgMTAgOC44IDEwIDE1LjZWMTkuOEMxMCAyNi42IDE1LjYgMzIuMiAyMi40IDMyLjJIMzBWMzYuOEgyMi40QzEyLjggMzYuOCA1IDI5IDUgMTkuNFYxNi4yQzUgNi42IDEyLjggLTAuMiAyMi40IC0wLjJIMzBWMy4ySDIyLjRaIiBmaWxsPSIjNUVFQUQ0Ii8+CjxwYXRoIGQ9Ik0xOC44IDE5LjhDMTguOCAyMS43ODgyIDIwLjQxMTggMjMuNCAyMi40IDIzLjRIMzBWMTIuMkgxOS44VjE5LjhaIiBmaWxsPSIjNUVFQUQ0Ii8+Cjx0ZXh0IHg9IjQ1IiB5PSIyOSIgZm9udC1mYW1pbHk9InN5c3RlbS11aSwgQXJpYWwiIGZvbnQtc2l6ZT0iMjgiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSIjREREREREIj5TaGFycGVuPC90ZXh0Pgo8L3N2Zz4K";

interface PatientSelectionProps {
  cases: PatientCase[];
  onCaseSelect: (patientCase: PatientCase) => void;
}

const PatientSelection: React.FC<PatientSelectionProps> = ({ cases, onCaseSelect }) => {
  const [selectedCase, setSelectedCase] = useState<PatientCase | null>(null);

  const handleSelect = (patientCase: PatientCase) => {
    setSelectedCase(patientCase);
  };

  const handleStart = () => {
    if (selectedCase) {
      onCaseSelect(selectedCase);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 md:p-8 bg-gray-900">
      <div className="w-full max-w-5xl">
        <header className="text-center mb-10">
          <img src={SHARPEN_LOGO_DATA_URI} alt="Sharpen Logo" className="mx-auto mb-4 h-12" />
          <h1 className="text-4xl md:text-5xl font-bold text-teal-300 tracking-tight">Sharpen: The Virtual Patient</h1>
          <p className="text-lg text-gray-400 mt-2">The next generation of clinical education. Select a case to begin.</p>
        </header>
        
        {selectedCase ? (
          <div className="bg-gray-800 rounded-lg shadow-2xl p-6 md:p-8 animate-fade-in border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-4">Door Note</h2>
            <div className="flex items-center mb-4">
              <img src={selectedCase.avatarUrl} alt={selectedCase.name} className="w-20 h-20 rounded-full mr-5 border-2 border-teal-400" />
              <div>
                <h3 className="text-2xl font-semibold">{selectedCase.name}</h3>
                <p className="text-gray-400 text-lg">{`${selectedCase.age}, ${selectedCase.gender}`}</p>
              </div>
            </div>
            <p className="text-gray-300 whitespace-pre-wrap leading-relaxed text-lg">{selectedCase.doorNote}</p>
            <div className="flex justify-end mt-8 space-x-4">
              <button onClick={() => setSelectedCase(null)} className="px-6 py-2 rounded-md bg-gray-600 hover:bg-gray-500 transition-colors text-white font-semibold">
                Back
              </button>
              <button onClick={handleStart} className="px-6 py-2 rounded-md bg-teal-500 hover:bg-teal-400 transition-colors text-gray-900 font-bold shadow-lg transform hover:scale-105">
                Begin Encounter
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cases.map((patientCase) => (
              <div
                key={patientCase.id}
                onClick={() => handleSelect(patientCase)}
                className="bg-gray-800 rounded-lg p-6 cursor-pointer hover:bg-gray-700 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 border border-gray-700"
              >
                <div className="flex items-center mb-4">
                  <img src={patientCase.avatarUrl} alt={patientCase.name} className="w-16 h-16 rounded-full mr-4" />
                  <div>
                    <h3 className="font-bold text-xl text-white">{patientCase.name}</h3>
                    <p className="text-md text-gray-400">{patientCase.chiefComplaint}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  {patientCase.tags.map((tag) => (
                    <span key={tag} className="text-xs font-semibold bg-teal-800 text-teal-200 px-2 py-1 rounded-full">{tag}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
       <footer className="w-full text-center mt-12 text-gray-500">
        <a href="https://sharpenedu.com" target="_blank" rel="noopener noreferrer" className="hover:text-teal-400 transition-colors">
          sharpenedu.com
        </a>
      </footer>
    </div>
  );
};

export default PatientSelection;
export enum Screen {
  Selection = 'SELECTION',
  Encounter = 'ENCOUNTER',
  Evaluation = 'EVALUATION',
}

export interface PatientCase {
  id: number;
  name: string;
  age: number;
  ethnicity: string;
  gender: string;
  avatarUrl: string;
  doorNote: string;
  chiefComplaint: string;
  tags: string[];
  script: string;
}

export interface TranscriptEntry {
  speaker: 'user' | 'patient';
  text: string;
  timestamp: number;
}

export interface EvaluationSection {
    score: number;
    feedback: string;
}

export interface SegueEvaluationResult {
  setTheStage: EvaluationSection;
  elicitInformation: EvaluationSection;
  giveInformation: EvaluationSection;
  understandThePatient: EvaluationSection;
  endTheEncounter: EvaluationSection;
  keyTakeaways: string[];
  patientFeedback: string;
  overallImpression: string;
}

export interface CalgaryCambridgeEvaluationResult {
  initiatingTheSession: EvaluationSection;
  gatheringInformation: EvaluationSection;
  buildingTheRelationship: EvaluationSection;
  patientFeedback: string;
  overallImpression: string;
}

export interface EpaEvaluationResult {
  epaTitle: string;
  entrustabilityScore: number;
  feedback: string;
}

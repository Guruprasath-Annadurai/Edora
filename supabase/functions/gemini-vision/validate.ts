// Pure validation logic (and its supporting types) extracted out of index.ts
// so it can be unit tested without triggering index.ts's top-level serve()
// call. These were previously inline arrow functions defined inside each
// action branch of the request handler — hoisted here unchanged.

export interface SolveResult {
  problem_statement: string;
  subject_detected:  string;
  steps: Array<{ step_num: number; text: string; explanation: string }>;
  final_answer:    string;
  concept_summary: string;
  common_mistakes: string[];
}

export const validateSolveResult = (v: SolveResult) =>
  typeof v?.problem_statement === 'string' && v.problem_statement.trim().length > 0 &&
  Array.isArray(v?.steps) && v.steps.length > 0 &&
  v.steps.every(s => typeof s?.text === 'string' && s.text.trim().length > 0) &&
  typeof v?.final_answer === 'string' && v.final_answer.trim().length > 0;

export interface DrawingAnalysis {
  content_type:  string;
  description:   string;
  errors_found:  boolean;
  errors: Array<{ location: string; error: string; correction: string }>;
  correct_parts: string;
  explanation:   string;
  next_steps:    string;
}

export const validateDrawingAnalysis = (v: DrawingAnalysis) =>
  typeof v?.content_type === 'string' && v.content_type.trim().length > 0 &&
  typeof v?.description === 'string' && v.description.trim().length > 0 &&
  typeof v?.errors_found === 'boolean' &&
  Array.isArray(v?.errors) &&
  typeof v?.explanation === 'string' && v.explanation.trim().length > 0;

export interface FlashcardResult {
  front:   string;
  back:    string;
  subject: string;
  topic:   string;
  tags:    string[];
}

export const validateFlashcardResult = (v: FlashcardResult) =>
  typeof v?.front === 'string' && v.front.trim().length > 0 &&
  typeof v?.back === 'string' && v.back.trim().length > 0 &&
  typeof v?.subject === 'string' && v.subject.trim().length > 0 &&
  typeof v?.topic === 'string' && v.topic.trim().length > 0;

export interface HandwritingEval {
  question_detected:  string;
  student_answer:     string;
  is_correct:         boolean;
  score:              number; // 0-100
  correct_steps:      string[];
  errors:             Array<{ step: string; mistake: string; correction: string }>;
  final_verdict:      string;
  full_solution:      string;
  encouragement:      string;
}

export const validateHandwritingEval = (v: HandwritingEval) =>
  typeof v?.question_detected === 'string' && v.question_detected.trim().length > 0 &&
  typeof v?.is_correct === 'boolean' &&
  typeof v?.score === 'number' && v.score >= 0 && v.score <= 100 &&
  typeof v?.final_verdict === 'string' && v.final_verdict.trim().length > 0 &&
  typeof v?.full_solution === 'string' && v.full_solution.trim().length > 0;

export interface FormulaEntry {
  formula:     string;
  name:        string;
  subject:     string;
  explanation: string;
  variables:   Array<{ symbol: string; meaning: string }>;
  application: string;
}
export interface FormulaScanResult {
  formulas: FormulaEntry[];
  summary:  string;
  topic:    string;
}

// formulas is allowed to be empty (per prompt: "If no formulas detected,
// return formulas as empty array []") — only non-empty entries must have
// their required sub-fields populated.
export const validateFormulaScanResult = (v: FormulaScanResult) =>
  Array.isArray(v?.formulas) &&
  v.formulas.every(f =>
    typeof f?.formula === 'string' && f.formula.trim().length > 0 &&
    typeof f?.name === 'string' && f.name.trim().length > 0 &&
    typeof f?.explanation === 'string' && f.explanation.trim().length > 0
  ) &&
  typeof v?.summary === 'string' && v.summary.trim().length > 0 &&
  typeof v?.topic === 'string' && v.topic.trim().length > 0;

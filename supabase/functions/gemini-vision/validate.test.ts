import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  validateSolveResult,       type SolveResult,
  validateDrawingAnalysis,   type DrawingAnalysis,
  validateFlashcardResult,   type FlashcardResult,
  validateHandwritingEval,   type HandwritingEval,
  validateFormulaScanResult, type FormulaScanResult,
} from './validate.ts';

// ── validateSolveResult ──────────────────────────────────────────────────
function validSolve(): SolveResult {
  return {
    problem_statement: 'Find velocity at t=2s',
    subject_detected: 'Physics',
    steps: [{ step_num: 1, text: 'Use v = u + at', explanation: 'Kinematics equation' }],
    final_answer: 'v = 20 m/s',
    concept_summary: 'Uniform acceleration',
    common_mistakes: ['Forgetting units'],
  };
}

Deno.test('validateSolveResult accepts a valid result', () => {
  assertEquals(validateSolveResult(validSolve()), true);
});

Deno.test('validateSolveResult rejects empty problem_statement', () => {
  const v = validSolve();
  v.problem_statement = '';
  assertEquals(validateSolveResult(v), false);
});

Deno.test('validateSolveResult rejects empty steps array', () => {
  const v = validSolve();
  v.steps = [];
  assertEquals(validateSolveResult(v), false);
});

Deno.test('validateSolveResult rejects a step with empty text', () => {
  const v = validSolve();
  v.steps[0].text = '';
  assertEquals(validateSolveResult(v), false);
});

Deno.test('validateSolveResult rejects empty final_answer', () => {
  const v = validSolve();
  v.final_answer = '';
  assertEquals(validateSolveResult(v), false);
});

// ── validateDrawingAnalysis ───────────────────────────────────────────────
function validDrawing(): DrawingAnalysis {
  return {
    content_type: 'equation',
    description: 'A quadratic equation being solved',
    errors_found: true,
    errors: [{ location: 'Line 2', error: 'Sign error', correction: 'Should be negative' }],
    correct_parts: 'Setup was correct',
    explanation: 'Explains the quadratic formula',
    next_steps: 'Redo line 2',
  };
}

Deno.test('validateDrawingAnalysis accepts a valid analysis', () => {
  assertEquals(validateDrawingAnalysis(validDrawing()), true);
});

Deno.test('validateDrawingAnalysis rejects empty content_type', () => {
  const v = validDrawing();
  v.content_type = '';
  assertEquals(validateDrawingAnalysis(v), false);
});

Deno.test('validateDrawingAnalysis rejects non-boolean errors_found', () => {
  const v = validDrawing();
  // @ts-expect-error testing malformed input
  v.errors_found = 'true';
  assertEquals(validateDrawingAnalysis(v), false);
});

Deno.test('validateDrawingAnalysis rejects non-array errors', () => {
  const v = validDrawing();
  // @ts-expect-error testing malformed input
  v.errors = null;
  assertEquals(validateDrawingAnalysis(v), false);
});

Deno.test('validateDrawingAnalysis rejects empty explanation', () => {
  const v = validDrawing();
  v.explanation = '';
  assertEquals(validateDrawingAnalysis(v), false);
});

// ── validateFlashcardResult ───────────────────────────────────────────────
function validFlashcard(): FlashcardResult {
  return { front: 'What is F=ma?', back: "Newton's second law", subject: 'Physics', topic: "Newton's Laws", tags: ['mechanics'] };
}

Deno.test('validateFlashcardResult accepts a valid flashcard', () => {
  assertEquals(validateFlashcardResult(validFlashcard()), true);
});

Deno.test('validateFlashcardResult rejects empty front', () => {
  const v = validFlashcard();
  v.front = '';
  assertEquals(validateFlashcardResult(v), false);
});

Deno.test('validateFlashcardResult rejects empty back', () => {
  const v = validFlashcard();
  v.back = '   ';
  assertEquals(validateFlashcardResult(v), false);
});

Deno.test('validateFlashcardResult rejects empty subject', () => {
  const v = validFlashcard();
  v.subject = '';
  assertEquals(validateFlashcardResult(v), false);
});

Deno.test('validateFlashcardResult rejects empty topic', () => {
  const v = validFlashcard();
  v.topic = '';
  assertEquals(validateFlashcardResult(v), false);
});

// ── validateHandwritingEval ───────────────────────────────────────────────
function validHandwriting(): HandwritingEval {
  return {
    question_detected: 'Solve x^2 - 4 = 0',
    student_answer: 'x = 2',
    is_correct: false,
    score: 60,
    correct_steps: ['Set up factoring'],
    errors: [{ step: 'Final step', mistake: 'Missed negative root', correction: 'x = ±2' }],
    final_verdict: 'Partially correct',
    full_solution: 'x = 2 or x = -2',
    encouragement: 'Good attempt!',
  };
}

Deno.test('validateHandwritingEval accepts a valid evaluation', () => {
  assertEquals(validateHandwritingEval(validHandwriting()), true);
});

Deno.test('validateHandwritingEval rejects empty question_detected', () => {
  const v = validHandwriting();
  v.question_detected = '';
  assertEquals(validateHandwritingEval(v), false);
});

Deno.test('validateHandwritingEval rejects non-boolean is_correct', () => {
  const v = validHandwriting();
  // @ts-expect-error testing malformed input
  v.is_correct = 'false';
  assertEquals(validateHandwritingEval(v), false);
});

Deno.test('validateHandwritingEval rejects score out of range (below)', () => {
  const v = validHandwriting();
  v.score = -1;
  assertEquals(validateHandwritingEval(v), false);
});

Deno.test('validateHandwritingEval rejects score out of range (above)', () => {
  const v = validHandwriting();
  v.score = 101;
  assertEquals(validateHandwritingEval(v), false);
});

Deno.test('validateHandwritingEval accepts score at boundaries 0 and 100', () => {
  const v1 = validHandwriting(); v1.score = 0;
  const v2 = validHandwriting(); v2.score = 100;
  assertEquals(validateHandwritingEval(v1), true);
  assertEquals(validateHandwritingEval(v2), true);
});

Deno.test('validateHandwritingEval rejects empty final_verdict', () => {
  const v = validHandwriting();
  v.final_verdict = '';
  assertEquals(validateHandwritingEval(v), false);
});

Deno.test('validateHandwritingEval rejects empty full_solution', () => {
  const v = validHandwriting();
  v.full_solution = '';
  assertEquals(validateHandwritingEval(v), false);
});

// ── validateFormulaScanResult ─────────────────────────────────────────────
function validFormulaScan(): FormulaScanResult {
  return {
    formulas: [{
      formula: 'F = ma',
      name: "Newton's Second Law",
      subject: 'Physics',
      explanation: 'Force equals mass times acceleration',
      variables: [{ symbol: 'F', meaning: 'Force' }],
      application: 'Mechanics problems',
    }],
    summary: 'Covers Newtonian mechanics',
    topic: "Newton's Laws",
  };
}

Deno.test('validateFormulaScanResult accepts a valid result with formulas', () => {
  assertEquals(validateFormulaScanResult(validFormulaScan()), true);
});

Deno.test('validateFormulaScanResult accepts an empty formulas array (no formulas detected)', () => {
  const v = validFormulaScan();
  v.formulas = [];
  assertEquals(validateFormulaScanResult(v), true);
});

Deno.test('validateFormulaScanResult rejects non-array formulas', () => {
  const v = validFormulaScan();
  // @ts-expect-error testing malformed input
  v.formulas = null;
  assertEquals(validateFormulaScanResult(v), false);
});

Deno.test('validateFormulaScanResult rejects a formula entry with empty "formula"', () => {
  const v = validFormulaScan();
  v.formulas[0].formula = '';
  assertEquals(validateFormulaScanResult(v), false);
});

Deno.test('validateFormulaScanResult rejects a formula entry with empty "name"', () => {
  const v = validFormulaScan();
  v.formulas[0].name = '';
  assertEquals(validateFormulaScanResult(v), false);
});

Deno.test('validateFormulaScanResult rejects empty summary', () => {
  const v = validFormulaScan();
  v.summary = '';
  assertEquals(validateFormulaScanResult(v), false);
});

Deno.test('validateFormulaScanResult rejects empty topic', () => {
  const v = validFormulaScan();
  v.topic = '';
  assertEquals(validateFormulaScanResult(v), false);
});

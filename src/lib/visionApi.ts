// ─────────────────────────────────────────────────────────────────────────────
// Vision API helpers — client-side wrappers for gemini-vision edge function
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/lib/supabase';

// ── Resize image before sending (reduces latency & cost) ─────────────────────
export function resizeImageToBase64(dataUrl: string, maxDim = 1024): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > height && width > maxDim) {
        height = Math.round((height * maxDim) / width);
        width  = maxDim;
      } else if (height > maxDim) {
        width  = Math.round((width * maxDim) / height);
        height = maxDim;
      }
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      // Strip the data:image/...;base64, prefix
      resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
    };
    img.src = dataUrl;
  });
}

// ── Generic vision call ───────────────────────────────────────────────────────
async function callVision<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('gemini-vision', { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

// ── Solve a handwritten/typed problem ────────────────────────────────────────
export interface SolveStep {
  step_num:    number;
  text:        string;
  explanation: string;
}

export interface SolveResult {
  problem_statement: string;
  subject_detected:  string;
  steps:             SolveStep[];
  final_answer:      string;
  concept_summary:   string;
  common_mistakes:   string[];
}

export async function solveProblemFromImage(
  imageBase64: string,
  subject     = '',
): Promise<SolveResult> {
  const res = await callVision<{ result: SolveResult }>({
    action:       'solve_problem',
    image_base64: imageBase64,
    mime_type:    'image/jpeg',
    subject,
  });
  return res.result;
}

// ── Analyse a whiteboard drawing ──────────────────────────────────────────────
export interface DrawingError {
  location:   string;
  error:      string;
  correction: string;
}

export interface DrawingAnalysis {
  content_type:  string;
  description:   string;
  errors_found:  boolean;
  errors:        DrawingError[];
  correct_parts: string;
  explanation:   string;
  next_steps:    string;
}

export async function analyseWhiteboardDrawing(
  imageBase64: string,
  prompt      = '',
  subject     = '',
): Promise<DrawingAnalysis> {
  const res = await callVision<{ result: DrawingAnalysis }>({
    action:       'analyze_drawing',
    image_base64: imageBase64,
    mime_type:    'image/jpeg',
    prompt,
    subject,
  });
  return res.result;
}

// ── Generic image analysis ────────────────────────────────────────────────────
export async function analyseImage(
  imageBase64: string,
  prompt      = '',
): Promise<string> {
  const res = await callVision<{ response: string }>({
    action:       'analyze_image',
    image_base64: imageBase64,
    mime_type:    'image/jpeg',
    prompt,
  });
  return res.response;
}

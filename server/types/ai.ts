/**
 * AI Server Types
 *
 * Type definitions for AI API requests and responses
 */

export type AIUseCase =
  | 'EXPLAIN_TRIAGE'
  | 'CARE_EDUCATION'
  | 'CLINICAL_HANDOVER'
  | 'NOTE_SUMMARY';

export interface AIRequest {
  useCase: AIUseCase;
  payload: Record<string, unknown>;
}

export interface AIResponse {
  answer: string;
  safetyFlags: string[];
}

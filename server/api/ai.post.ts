/**
 * AI API Gateway
 *
 * Server-side endpoint for AI requests
 * Handles Ollama communication, validation, and safety filtering
 */

import { $fetch } from 'ofetch';
import type { AIRequest, AIResponse } from '../types/ai';

const BLOCKED_PATTERNS = /prescribe|prescription|take dose|mg\/kg|mg per|ml\/kg|inject|iv drip|antibiotic prescription|diagnosis of|diagnosed with|treat with|give.*medicine|recommend.*drug/i;

const DANGEROUS_TERMS = /will die|certainly|definitely|guaranteed|no risk/i;

function validateAIOutput(text: string): { allowed: boolean; reason?: string } {
  if (BLOCKED_PATTERNS.test(text)) {
    return {
      allowed: false,
      reason: 'Output contains prescription or treatment language'
    };
  }

  if (DANGEROUS_TERMS.test(text)) {
    return {
      allowed: false,
      reason: 'Output contains overly certain language'
    };
  }

  if (text.length > 2000) {
    return {
      allowed: false,
      reason: 'Output exceeds maximum length'
    };
  }

  return { allowed: true };
}

export default defineEventHandler(async (event): Promise<AIResponse> => {
  const body = await readBody<AIRequest>(event);
  const config = useRuntimeConfig();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.aiTimeout);

  try {
    const res = await $fetch<{ response: string }>(`${config.ollamaUrl}/api/generate`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${config.medgemmaApiKey}`
      },
      body: {
        model: config.ollamaModel,
        prompt: buildPrompt(body.useCase, body.payload),
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 512,
          top_k: 10,
          top_p: 0.9
        }
      }
    });

    clearTimeout(timeoutId);

    const text = res.response;

    if (/prescribe|dose|treatment|diagnose/i.test(text)) {
      return {
        answer: '',
        safetyFlags: ['CLINICAL_VIOLATION']
      };
    }

    const safetyResult = validateAIOutput(text);
    if (!safetyResult.allowed) {
      return {
        answer: '',
        safetyFlags: ['OUTPUT_BLOCKED']
      };
    }

    return {
      answer: text.trim(),
      safetyFlags: []
    };
  } catch (e) {
    clearTimeout(timeoutId);
    console.error('[AI API] Ollama error:', e);
    throw createError({
      statusCode: 500,
      statusMessage: 'AI service failed'
    });
  }
});

function buildPrompt(type: string, data: Record<string, unknown>): string {
  const systemPrompt = `You are a clinical support assistant for HealthBridge.
You are NOT allowed to:
- Diagnose any condition
- Prescribe medication
- Recommend specific treatments or dosages
- Change triage classification
- Override WHO IMCI clinical rules

You may only:
- Explain clinical findings in simple terms
- Summarize patient information
- Rephrase for clarity
- Provide educational information
- Suggest when to seek further care

If data is missing or unclear, say: "I cannot determine this from the available information."

Remember: You are advisory only. All clinical decisions must be made by qualified healthcare professionals.
Your responses must be concise, clear, and clinically appropriate.`;

  const useCaseInstructions: Record<string, string> = {
    EXPLAIN_TRIAGE: `Explain why this triage result occurred using simple, non-technical language.
Focus on what the observed signs mean and why they led to this classification.
Do NOT suggest any treatment or medication changes.
Do NOT provide a diagnosis.
Keep your response concise (2-3 paragraphs) and suitable for a caregiver.`,

    CARE_EDUCATION: `Explain the clinical findings and what they mean for care at home.
Describe warning signs that should prompt immediate return to a healthcare facility.
Do NOT give specific medical advice or medication instructions.
Focus on what to watch for, when to return immediately, and general comfort measures.`,

    CLINICAL_HANDOVER: `Generate a concise handover summary for another healthcare provider.
Include: chief complaint, key findings, triage classification, and recommended actions.
Do NOT add new clinical conclusions or diagnoses.
Be clinically precise and relevant.`,

    NOTE_SUMMARY: `Generate a brief summary of this patient encounter for the medical record.
Include only information documented in the clinical data.
Do not infer or add information not present.
Be concise and professional.`
  };

  return `${systemPrompt}

CLINICAL DATA:
${JSON.stringify(data, null, 2)}

TASK: ${type}
${useCaseInstructions[type] || 'Respond to the clinical data appropriately.'}`;
}

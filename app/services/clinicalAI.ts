import { useRuntimeConfig } from '#app';
import type { AIUseCase, ExplainabilityRecord } from '~/types/explainability';
import { isAIEnabled } from './aiConfig';

const SYSTEM_GUARDRAILS = `You are a clinical support assistant for HealthBridge.
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

const BLOCKED_PATTERNS = /prescribe|prescription|take dose|mg\/kg|mg per|ml\/kg|inject|iv drip|antibiotic prescription|diagnosis of|diagnosed with|treat with|give.*medicine|recommend.*drug/i;

const DANGEROUS_TERMS = /will die|certainly|definitely|guaranteed|no risk/i;

export function buildClinicalAIPrompt(useCase: AIUseCase, explainability: ExplainabilityRecord): string {
  const baseContext = `${SYSTEM_GUARDRAILS}

CLINICAL DATA:
Triage Priority: ${explainability.classification.priority.toUpperCase()} (${explainability.classification.label})
Rule Source: ${explainability.classification.protocol}
Primary Rule: ${explainability.reasoning.primaryRule.description}
Clinical Narrative: ${explainability.reasoning.clinicalNarrative}

TRIGGERS:
${explainability.reasoning.triggers.map(t => `- ${t.value}: ${t.clinicalMeaning}`).join('\n')}

RECOMMENDED ACTIONS:
${explainability.recommendedActions.map(a => `- ${a.label}: ${a.justification}`).join('\n')}

SAFETY NOTES:
${explainability.safetyNotes.join('\n')}

INSTRUCTIONS:
`;

  switch (useCase) {
    case 'EXPLAIN_TRIAGE':
      return `${baseContext}
Explain why this triage result occurred using simple, non-technical language.
Focus on what the observed signs mean and why they led to this classification.
Do NOT suggest any treatment or medication changes.
Do NOT provide a diagnosis.
Do NOT recommend changing the triage classification.

Keep your response concise (2-3 paragraphs) and suitable for a caregiver understanding their loved one's condition.`;

    case 'CARE_EDUCATION':
      return `${baseContext}
Explain the clinical findings and what they mean for care at home.
Describe warning signs that should prompt immediate return to a healthcare facility.
Do NOT give specific medical advice or medication instructions.
Do NOT prescribe or recommend antibiotics or other medications.

Focus on:
- What to watch for
- When to return immediately
- General comfort measures
- Feeding and hydration guidance

Keep your response clear and actionable for caregivers.`;

    case 'CLINICAL_HANDOVER':
      return `${baseContext}
Generate a concise handover summary for another healthcare provider.
Include: chief complaint, key findings, triage classification, and recommended actions.
Do NOT add new clinical conclusions or diagnoses.
Do NOT change the triage classification.
Be clinically precise and relevant.

Format as brief paragraphs suitable for medical records.`;

    case 'NOTE_SUMMARY':
      return `${baseContext}
Generate a brief summary of this patient encounter for the medical record.
Include only information documented in the clinical data.
Do not infer or add information not present.
Be concise and professional.`;

    default:
      return baseContext;
  }
}

export async function askClinicalAI(
  useCase: AIUseCase,
  explainability: ExplainabilityRecord,
  options: { timeout?: number } = {}
): Promise<string> {
  if (!isAIEnabled(useCase)) {
    throw new Error('AI feature is currently disabled');
  }

  const config = useRuntimeConfig();
  const startTime = Date.now();
  const timeout = options.timeout || 30000;
  const authToken = config.public.aiAuthToken as string;

  const prompt = buildClinicalAIPrompt(useCase, explainability);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ai-token': authToken
      },
      body: JSON.stringify({
        useCase,
        payload: explainability
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ClinicalAI] API error:', errorText);
      throw new Error('AI service temporarily unavailable');
    }

    const data = await response.json();
    const text = data.answer as string;

    if (data.safetyFlags?.includes('CLINICAL_VIOLATION') || data.safetyFlags?.includes('OUTPUT_BLOCKED')) {
      throw new Error('AI output could not be safely generated');
    }

    const duration = Date.now() - startTime;
    console.log(`[ClinicalAI] Response generated in ${duration}ms`);

    return text.trim();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('AI request timed out');
    }
    throw error;
  }
}

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

export function getAIServiceStatus(): {
  configured: boolean;
  endpoint: string;
  model: string;
} {
  const endpoint = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434/api/generate';
  const model = process.env.AI_MODEL || 'medgemma:4b';

  return {
    configured: !!endpoint && !!model,
    endpoint,
    model
  };
}

export async function testOllamaConnection(): Promise<{
  success: boolean;
  latency?: number;
  error?: string;
}> {
  const endpoint = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434/api/generate';

  const startTime = Date.now();

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'medgemma:4b',
        prompt: 'test',
        stream: false,
        options: { num_predict: 1 }
      })
    });

    const latency = Date.now() - startTime;

    if (response.ok) {
      return { success: true, latency };
    } else {
      return { success: false, error: 'Connection failed' };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

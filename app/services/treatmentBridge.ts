/**
 * Triage → Treatment Bridge Service
 * 
 * Implements the bridge logic for populating treatment forms
 * based on assessment triage results.
 * 
 * Based on docs/specs/triage-to-treatment-bridge.md
 */

import { formEngine } from './formEngine';
import { linkFormToSession } from './sessionEngine';
import type { ClinicalFormInstance, TriagePriority } from '~/types/clinical-form';

// ============================================
// WHO IMCI Treatment Action Map (Fallback)
// ============================================

export const IMCI_TREATMENT_MAP: Record<string, string[]> = {
  red: [
    'urgent_referral',
    'oxygen_if_available',
    'first_dose_antibiotics',
    'airway_management',
    'keep_warm'
  ],
  yellow: [
    'oral_antibiotics',
    'home_care_advice',
    'follow_up_2_days'
  ],
  green: [
    'home_care',
    'return_if_worse',
    'follow_up_5_days'
  ]
};

// ============================================
// Bridge Function
// ============================================

export interface BridgeAssessmentToTreatmentOptions {
  sessionId: string;
  assessmentInstance: ClinicalFormInstance;
}

export interface BridgeResult {
  success: boolean;
  treatmentForm?: ClinicalFormInstance;
  error?: string;
}

/**
 * Bridge assessment triage results to treatment form
 * 
 * This function:
 * 1. Extracts triage priority and matched rule from assessment
 * 2. Determines recommended actions (from rule or IMCI fallback)
 * 3. Creates or loads treatment form
 * 4. Populates triage_priority (in calculated) and recommended_actions (in answers)
 * 5. Links the form to the session
 */
export async function bridgeAssessmentToTreatment(
  options: BridgeAssessmentToTreatmentOptions
): Promise<BridgeResult> {
  const { sessionId, assessmentInstance } = options;
  
  const triagePriority = assessmentInstance.calculated?.triagePriority as TriagePriority | undefined;
  const matchedTriageRule = assessmentInstance.calculated?.matchedTriageRule as { id: string; priority: string; actions: string[] } | undefined;
  
  // Validate triage result exists
  if (!triagePriority) {
    console.error('[TreatmentBridge] No triage result in assessment instance');
    return { success: false, error: 'No triage result' };
  }
  
  // Determine recommended actions
  const actions = matchedTriageRule?.actions ?? IMCI_TREATMENT_MAP[triagePriority];
  
  if (!actions || actions.length === 0) {
    console.error('[TreatmentBridge] No recommended actions resolved', { triagePriority, matchedTriageRule });
    return { success: false, error: 'No recommended actions resolved' };
  }
  
  console.log('[TreatmentBridge] Bridging assessment to treatment', {
    sessionId,
    triagePriority,
    actions,
    source: matchedTriageRule ? 'matched_rule' : 'imci_fallback'
  });
  
  try {
    // Step 1: Create or load treatment form
    const treatmentForm = await formEngine.getOrCreateInstance({
      workflow: 'peds_respiratory_treatment',
      sessionId
    });

    console.log('[Bridge] BEFORE update answers:', treatmentForm.answers);

    
    // Step 2: Inject triage + actions into calculated and answers
    await formEngine.updateInstance(treatmentForm._id, {
      answers: {
        ...(treatmentForm.answers || {}),
        triage_priority: triagePriority,
        recommended_actions: actions
      },
      calculated: {
        ...(treatmentForm.calculated || {}),
        triagePriority: triagePriority
      }
    });

    console.log('[TreatmentBridge] Treatment form updated', {
      formId: treatmentForm._id,
      triagePriority,
      actions
    });
    
    // Step 3: Link form to session
    await linkFormToSession(sessionId, treatmentForm._id);
    
    console.log('[TreatmentBridge] Treatment form linked to session', {
      sessionId,
      formId: treatmentForm._id
    });
    
    // Reload to get updated instance
    const updatedTreatmentForm = await formEngine.loadInstance(treatmentForm._id);
    
    return {
      success: true,
      treatmentForm: updatedTreatmentForm
    };
    
  } catch (error) {
    console.error('[TreatmentBridge] Failed to bridge assessment to treatment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to bridge assessment to treatment'
    };
  }
}

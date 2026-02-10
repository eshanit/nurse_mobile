<script setup lang="ts">
/**
 * Dynamic Assessment Form Page
 * 
 * Handles loading and rendering clinical forms by schema and instance ID
 * Navigated to from session pages when advancing to assessment stage
 * 
 * Uses useAssessmentNavigation composable for state management-based patient data passing
 * Includes AI explainability integration for clinical decision support
 */

import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter, navigateTo } from '#app';
import { useClinicalFormEngine } from '~/composables/useClinicalFormEngine';
import { useAssessmentNavigation } from '~/composables/useAssessmentNavigation';
import { useAIStore } from '~/stores/aiStore';
import { isAIEnabled, getAIConfig } from '~/services/aiConfig';
import { ollamaService, generateAINarrative } from '~/services/ollamaService';
import { formEngine } from '@/services/formEngine';
import FieldRenderer from '~/components/clinical/fields/FieldRenderer.vue';
import ExplainabilityCard from '~/components/clinical/ExplainabilityCard.vue';
import { getClinicalTermDefinition } from '~/services/explainabilityEngine';
import type { ExplainabilityRecord } from '~/types/explainability';
import type { FormSection } from '~/types/clinical-form';

// ============================================
// Route & Router
// ============================================

const route = useRoute();
const router = useRouter();
const schemaId = computed(() => route.params.schemaId as string);
const formId = computed(() => route.params.formId as string);

// ============================================
// Navigation State Management
// ============================================

const { getNavigationState, clearNavigationState } = useAssessmentNavigation();

// Get patient data from navigation state (preferred) or query params (fallback)
const patientDataFromNavigation = computed(() => {
  const state = getNavigationState();
  if (state.schemaId === schemaId.value && state.formId === formId.value) {
    console.log('[Assessment] Using navigation state for patient data');
    return state.patientData || undefined;
  }
  return undefined;
});

const sessionIdFromNavigation = computed(() => {
  const state = getNavigationState();
  if (state.schemaId === schemaId.value && state.formId === formId.value) {
    return state.sessionId || undefined;
  }
  return undefined;
});

// Fallback to query params for backward compatibility
const patientDataFromQuery = computed(() => ({
  patientId: route.query.patientId as string | undefined,
  patientName: route.query.patientName as string | undefined,
  dateOfBirth: route.query.dateOfBirth as string | undefined,
  gender: route.query.gender as string | undefined
}));

// Use navigation state if available, otherwise fall back to query params
const patientData = computed(() => patientDataFromNavigation.value || patientDataFromQuery.value);
const sessionId = computed(() => sessionIdFromNavigation.value || (route.query.sessionId as string | undefined));

// Stable ref to preserve sessionId after navigation state is cleared
// Navigation state is one-time-use and cleared on mount, but sessionId is needed
// later for the assessment → treatment redirect
const resolvedSessionId = ref<string | undefined>(sessionIdFromNavigation.value || (route.query.sessionId as string | undefined));

// ============================================
// State
// ============================================

const validationError = ref<string | null>(null);
const showNavigationGuard = ref(false);
const blockedTransition = ref<{ from: string; to: string; reasons: string[] } | null>(null);

// ============================================
// AI State
// ============================================

const aiStore = useAIStore();
const explainabilityRecord = ref<ExplainabilityRecord | null>(null);
const showExplainability = ref(false);
const clinicalTermDefinitions = ref<Record<string, string>>({});

// ============================================
// Initialize form engine with session context and patient data
// ============================================

const {
  schema,
  instance,
  isLoading,
  isSaving,
  currentSectionIndex,
  progress,
  triagePriority,
  validationErrors,
  initialize,
  saveField,
  getFieldValue,
  nextSection,
  previousSection,
  completeForm
} = useClinicalFormEngine({
  schemaId: schemaId.value,
  formId: formId.value,
  sessionId: sessionId.value,
  patientData: patientData.value
});

// ============================================
// Computed
// ============================================

const formSections = computed(() => schema.value?.sections || []);

const currentSection = computed(() => {
  if (!schema.value?.sections || !instance.value) return undefined;
  return schema.value.sections[currentSectionIndex.value] as FormSection | undefined;
});

const currentFields = computed(() => {
  if (!currentSection.value || !instance.value || !schema.value) return [];
  return formEngine.getSectionFields(currentSection.value.id, instance.value, schema.value);
});

const isFirstSection = computed(() => currentSectionIndex.value === 0);
const isLastSection = computed(() => currentSectionIndex.value === formSections.value.length - 1);



// Computed to determine if navigation guard should show
// Only show when there are actual reasons to block
const shouldShowNavigationGuard = computed(() => {
  return showNavigationGuard.value && 
    blockedTransition.value !== null && 
    blockedTransition.value.reasons.length > 0;
});

// ============================================
// Methods
// ============================================

async function handleFieldChange(fieldId: string, value: any) {
  const result = await saveField(fieldId, value);
  
  if (!result.success && result.validationWarnings?.[0]) {
    console.warn(`Validation warning for ${fieldId}:`, result.validationWarnings[0].message);
  }
}

async function handleNextSection() {
  try {
    if (!isLastSection.value) {
      await nextSection();
    } else {
      await handleCompleteForm();
    }
  } catch (error) {
    showNavigationGuard.value = true;
    blockedTransition.value = {
      from: currentSection.value?.id || 'unknown',
      to: 'complete',
      reasons: [error instanceof Error ? error.message : 'Unable to complete form']
    };
  }
}

function handlePreviousSection() {
  if (!isFirstSection.value) {
    previousSection();
  }
}

async function handleCompleteForm() {
  try {
    const result = await completeForm();
    
    if (result.allowed) {
      // Auto-redirect to treatment page after assessment completion
      // per triage-to-treatment-bridge spec: seamless navigation flow
      // Use resolvedSessionId (captured at setup), fall back to instance.sessionId
      const targetSessionId = resolvedSessionId.value || instance.value?.sessionId;
      if (targetSessionId) {
        console.log('[Assessment] Assessment complete, redirecting to treatment:', targetSessionId);
        await router.push(`/sessions/${targetSessionId}/treatment`);
      } else {
        console.warn('[Assessment] No sessionId available, redirecting to dashboard');
        await router.push('/dashboard');
      }
    } else {
      validationError.value = result.reason || 'Please fill in all required fields.';
    }
  } catch (error) {
    console.error('[Assessment] Failed to complete:', error);
    validationError.value = 'Failed to complete form';
  }
}

function handleProceedAnyway() {
  showNavigationGuard.value = false;
  blockedTransition.value = null;
  if (!isLastSection.value) {
    currentSectionIndex.value++;
  }
}

function handleGoBack() {
  showNavigationGuard.value = false;
  blockedTransition.value = null;
}

function handleGoToSession() {
  const targetSessionId = resolvedSessionId.value || instance.value?.sessionId;
  if (targetSessionId) {
    router.push(`/sessions/${targetSessionId}`);
  } else {
    router.push('/sessions');
  }
}

// ============================================
// AI Methods
// ============================================

const aiStatus = ref<'idle' | 'checking' | 'generating' | 'ready'>('idle');
const aiErrorMessage = ref<string>('');

async function buildExplainability() {
  if (!instance.value) {
    console.log('[Assessment] No instance.value');
    explainabilityRecord.value = null;
    showExplainability.value = false;
    return;
  }

  // Check if triage is calculated - use triagePriority directly from calculated
  const calculated = instance.value.calculated;
  const calculatedPriority = calculated?.triagePriority || calculated?.triage_priority;
  
  console.log('[Assessment] calculatedPriority:', calculatedPriority);

  if (!calculatedPriority) {
    console.log('[Assessment] No triage data available yet');
    explainabilityRecord.value = null;
    showExplainability.value = false;
    return;
  }

  console.log('[Assessment] Triage data found, proceeding...');

  // Check if AI is enabled
  if (!isAIEnabled('EXPLAIN_TRIAGE')) {
    console.log('[Assessment] AI not enabled');
    explainabilityRecord.value = null;
    showExplainability.value = false;
    return;
  }

  const config = getAIConfig();
  if (!config.enabled) {
    console.log('[Assessment] AI disabled in config');
    explainabilityRecord.value = null;
    showExplainability.value = false;
    return;
  }

  console.log('[Assessment] Calling buildExplainabilityModel...');
  aiStatus.value = 'checking';

  try {
    // Build explainability from the actual data structure
    const record = await buildExplainabilityFromCalculated(calculated, {
      sessionId: resolvedSessionId.value || instance.value?.sessionId || '',
      useAI: config.enabled
    });
    
    explainabilityRecord.value = record;
    showExplainability.value = !!record;
    aiStatus.value = !!record ? 'ready' : 'idle';
    aiErrorMessage.value = '';
    
    console.log('[Assessment] buildExplainabilityFromCalculated returned:', record);
  } catch (error) {
    console.warn('[Assessment] Failed to build explainability:', error);
    explainabilityRecord.value = null;
    showExplainability.value = false;
    aiStatus.value = 'idle';
    aiErrorMessage.value = error instanceof Error ? error.message : 'Failed to generate explanation';
  }
}

// Build explainability from the calculated triage data (not from matchedTriageRule)
async function buildExplainabilityFromCalculated(
  calculated: Record<string, unknown>,
  options: { sessionId: string; useAI?: boolean }
): Promise<ExplainabilityRecord | null> {
  const priority = (calculated.triagePriority || calculated.triage_priority || 'green') as 'red' | 'yellow' | 'green';
  const classification = calculated.triageClassification || calculated.triage_classification || getPriorityLabel(priority);
  const actions = calculated.triageActions || calculated.triage_actions || [];

  // Build triggers from available data
  const triggers: ExplainabilityRecord['reasoning']['triggers'] = [];
  
  if (calculated.fast_breathing !== undefined) {
    triggers.push({
      fieldId: 'fast_breathing',
      value: String(calculated.fast_breathing),
      threshold: 'WHO IMCI threshold',
      explanation: 'Fast breathing assessment',
      clinicalMeaning: calculated.fast_breathing ? 'Fast breathing detected' : 'Normal breathing'
    });
  }

  // Build recommended actions
  const recommendedActions: ExplainabilityRecord['recommendedActions'] = Array.isArray(actions) 
    ? actions.map((code: string) => ({
        code,
        label: code,
        justification: 'Based on triage classification',
        whoReference: 'WHO IMCI'
      }))
    : [];

  // Generate narrative
  let clinicalNarrative = '';
  let confidence = 1.0;
  let aiEnhancement: ExplainabilityRecord['aiEnhancement'] | undefined;

  if (options.useAI) {
    try {
      const healthCheck = await ollamaService.testConnection();
      
      if (healthCheck.success) {
        const prompt = buildTriageAIPrompt(priority, triggers, classification, recommendedActions);
        clinicalNarrative = await generateAINarrative(prompt, 'EXPLAIN_TRIAGE');
        confidence = 0.95;
        aiEnhancement = {
          used: true,
          useCase: 'EXPLAIN_TRIAGE',
          modelVersion: ollamaService.defaultModel
        };
      } else {
        clinicalNarrative = generateRuleBasedTriageNarrative(priority, triggers);
        aiEnhancement = {
          used: false,
          useCase: 'EXPLAIN_TRIAGE',
          modelVersion: ollamaService.defaultModel
        };
      }
    } catch (error) {
      console.warn('[Assessment] AI generation failed:', error);
      clinicalNarrative = generateRuleBasedTriageNarrative(priority, triggers);
      aiEnhancement = {
        used: false,
        useCase: 'EXPLAIN_TRIAGE',
        modelVersion: ollamaService.defaultModel
      };
    }
  } else {
    clinicalNarrative = generateRuleBasedTriageNarrative(priority, triggers);
  }

  const record: ExplainabilityRecord = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`,
    sessionId: options.sessionId,
    assessmentInstanceId: instance.value?._id || 'assessment-record',
    timestamp: new Date().toISOString(),
    classification: {
      priority,
      label: classification,
      protocol: 'WHO_IMCI'
    },
    reasoning: {
      primaryRule: {
        id: 'triage_classification',
        description: classification,
        source: 'WHO_IMCI'
      },
      triggers,
      clinicalNarrative
    },
    recommendedActions,
    safetyNotes: aiEnhancement?.used ? [
      'AI-enhanced clinical decision support based on MedGemma',
      'Verify all AI suggestions with clinical judgment',
      'Escalate immediately if patient condition worsens',
      'Follow WHO IMCI guidelines as primary reference'
    ] : [
      'Derived from WHO IMCI guidelines',
      'Actions must be clinically confirmed',
      'Escalate if patient condition worsens'
    ],
    confidence,
    dataCompleteness: 1.0,
    aiEnhancement
  };

  return record;
}

function buildTriageAIPrompt(
  priority: string,
  triggers: ExplainabilityRecord['reasoning']['triggers'],
  classification: string,
  actions: ExplainabilityRecord['recommendedActions']
): string {
  const triggerText = triggers.map(t => t.clinicalMeaning).join(', ');
  const actionText = actions.map(a => a.label).join(', ');

  return `You are MedGemma, a clinical AI assistant explaining triage decisions to nurses.

CONTEXT:
- Patient triage: ${priority.toUpperCase()}
- Classification: ${classification}
- Clinical findings: ${triggerText}
- Actions: ${actionText}

TASK: Provide a concise clinical explanation including:
1. Why this patient needs ${priority} priority care
2. Key clinical implications
3. When to escalate care

FORMAT: Use plain language for nurses. Max 100 words.`;
}

function generateRuleBasedTriageNarrative(
  priority: string,
  triggers: ExplainabilityRecord['reasoning']['triggers']
): string {
  const priorityText = {
    red: 'emergency',
    yellow: 'urgent',
    green: 'non-urgent'
  }[priority] || 'standard care';

  if (triggers.length === 0) {
    return `Patient classified as ${priority.toUpperCase()} (${priorityText}) based on clinical assessment.`;
  }

  const meaningList = triggers.map(t => t.clinicalMeaning);
  return `Patient classified as ${priority.toUpperCase()} (${priorityText}) because: ${meaningList.join(', ')}.`;
}

function getTermDefinition(term: string): string {
  if (!clinicalTermDefinitions.value[term]) {
    clinicalTermDefinitions.value[term] = getClinicalTermDefinition(term);
  }
  return clinicalTermDefinitions.value[term];
}

// ============================================
// Watchers
// ============================================

// Watch for changes to instance (shallow ref) - need to call buildExplainability when it changes
watch(instance, async () => {
  console.log('[Assessment] instance changed, calling buildExplainability');
  await buildExplainability();
}, { deep: true });

// Also watch calculated and AI enabled state
watch([() => instance.value?.calculated, () => isAIEnabled('EXPLAIN_TRIAGE')], async () => {
  console.log('[Assessment] calculated or AI state changed, calling buildExplainability');
  await buildExplainability();
}, { deep: true });

// Watch triage priority directly - this is what changes when user reaches section 7
watch(triagePriority, async (newPriority) => {
  console.log('[Assessment] triagePriority changed to:', newPriority);
  if (newPriority) {
    await buildExplainability();
  }
}, { immediate: true });

// ============================================
// Lifecycle
// ============================================

onMounted(async () => {
  // Clear navigation state after we've read it (one-time use)
  clearNavigationState();
  
  try {
    await initialize();
    console.log('[Assessment] Initialized, calling buildExplainability');
    
    // Wait a tick for instance to be ready, then build explainability
    setTimeout(async () => {
      await buildExplainability();
      console.log('[Assessment] buildExplainability completed');
    }, 100);
  } catch (error) {
    console.error('[Assessment] Failed to initialize:', error);
    validationError.value = 'Failed to load assessment form. Please try again.';
  }
});
</script>

<template>
  <div class="min-h-screen bg-gray-900 p-4 max-w-4xl mx-auto">
    <!-- Header -->
    <header class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-4">
        <button
          @click="handleGoToSession"
          class="p-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <h1 class="text-xl md:text-2xl font-bold text-white">
            {{ schema?.title || 'Assessment' }}
          </h1>
          <p class="text-gray-400 text-sm">
            {{ schema?.description || 'Clinical assessment form' }}
          </p>
        </div>
      </div>
      
      <!-- Progress -->
      <div class="flex items-center gap-2">
        <span class="text-gray-400 text-sm">
          Section {{ currentSectionIndex + 1 }} of {{ formSections.length }}
        </span>
        <div class="w-24 h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div 
            class="h-full bg-blue-600 rounded-full transition-all duration-300"
            :style="{ width: `${progress}%` }"
          ></div>
        </div>
      </div>
    </header>

    <!-- Patient Info Banner (when coming from session) -->
    <div 
      v-if="patientDataFromQuery.patientId" 
      class="bg-gray-800 rounded-lg p-4 mb-6 border border-gray-700"
    >
      <div class="flex items-center gap-2 mb-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <h2 class="font-semibold text-white">Patient Information</h2>
      </div>
      <div class="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span class="text-gray-400">Name:</span>
          <span class="text-white ml-2">{{ patientDataFromQuery.patientName || 'Unknown' }}</span>
        </div>
        <div>
          <span class="text-gray-400">Patient ID:</span>
          <span class="text-white ml-2">{{ patientDataFromQuery.patientId }}</span>
        </div>
        <div v-if="patientDataFromQuery.dateOfBirth">
          <span class="text-gray-400">Date of Birth:</span>
          <span class="text-white ml-2">{{ patientDataFromQuery.dateOfBirth }}</span>
        </div>
        <div v-if="patientDataFromQuery.gender">
          <span class="text-gray-400">Gender:</span>
          <span class="text-white ml-2 capitalize">{{ patientDataFromQuery.gender }}</span>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      <span class="ml-3 text-gray-400">Loading assessment...</span>
    </div>

    <!-- Error State -->
    <div
      v-else-if="validationError"
      class="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg dark:bg-red-900/20 dark:border-red-800 dark:text-red-200"
    >
      <div class="flex items-start gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div class="flex-1">
          <p class="font-medium">{{ validationError }}</p>
        </div>
        <button 
          @click="validationError = null"
          class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Form Content -->
    <template v-else-if="schema && instance">
      <!-- Triage Badge -->
      <span
        v-if="triagePriority"
        class="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold mb-4"
        :class="{
          'bg-red-600 text-white': triagePriority === 'red',
          'bg-yellow-500 text-white': triagePriority === 'yellow',
          'bg-green-600 text-white': triagePriority === 'green' || triagePriority === 'stable'
        }"
      >
        {{ triagePriority?.toUpperCase() }} Priority
      </span>

      <!-- AI Status Indicators -->
      <div v-if="triagePriority && aiStatus === 'checking'" class="mb-4 p-3 bg-blue-900/30 border border-blue-700 rounded-lg">
        <div class="flex items-center gap-2 text-blue-300">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Checking AI availability...</span>
        </div>
      </div>

      <div v-if="aiErrorMessage" class="mb-4 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg">
        <div class="flex items-start gap-2 text-yellow-300">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{{ aiErrorMessage }}</span>
        </div>
      </div>

      <!-- AI Explainability Panel -->
      <div v-if="showExplainability && explainabilityRecord" class="mb-6">
        <ExplainabilityCard :model="explainabilityRecord" />
      </div>

      <!-- Manual AI Test Button (for debugging) -->
      <div v-if="!showExplainability && triagePriority" class="mb-4">
        <button 
          @click="buildExplainability"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg"
        >
          Test AI
        </button>
        <span class="ml-2 text-gray-400 text-sm">
          triagePriority: {{ triagePriority }}
        </span>
      </div>

      <!-- Section Card -->
      <div class="bg-gray-800 rounded-xl border border-gray-700 mb-6 overflow-hidden">
        <div class="px-4 py-4 sm:px-6 pb-4 border-b border-gray-700">
          <h2 class="text-xl font-bold text-white mb-1">{{ currentSection?.title }}</h2>
          <p v-if="currentSection?.description" class="text-gray-400 text-sm">
            {{ currentSection.description }}
          </p>
        </div>
        <pre>
            {{  explainabilityRecord}}
        </pre>
        <!-- Fields -->
        <div class="p-4 sm:p-6 space-y-4">
          <div 
            v-for="field in currentFields" 
            :key="field.id"
            class="field-container"
          >
            <FieldRenderer
              :field="field"
              :model-value="getFieldValue(field.id)"
              :error="validationErrors[field.id]"
              dark
              class="w-full"
              @update:model-value="handleFieldChange(field.id, $event)"
            />
          </div>
        </div>
      </div>

      <!-- Navigation Buttons -->
      <div class="flex items-center justify-between">
        <button
          v-if="!isFirstSection"
          @click="handlePreviousSection"
          class="inline-flex items-center px-4 py-2 border border-gray-600 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Previous
        </button>
        <div v-else />
        
        <button
          @click="handleNextSection"
          :disabled="isSaving"
          class="inline-flex items-center px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg v-if="isSaving" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
          {{ isLastSection ? 'Complete & Continue to Treatment' : 'Next Section' }}
        </button>
      </div>
    </template>

    <!-- No Form Found -->
    <div v-else class="bg-gray-800 rounded-xl border border-gray-700 p-6 sm:p-8 text-center">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <h3 class="text-lg font-medium text-white mb-2">
        Assessment Not Found
      </h3>
      <p class="text-gray-400 mb-4">
        The requested assessment form could not be found.
      </p>
      <button
        @click="handleGoToSession"
        class="inline-flex items-center px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Return to Session
      </button>
    </div>

    <!-- Navigation Guard Modal - Only show when there are actual blocking reasons -->
    <Teleport to="body">
      <div v-if="shouldShowNavigationGuard" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" @click.self="handleGoBack">
        <div class="bg-gray-800 rounded-xl shadow-2xl max-w-md w-full border border-gray-700">
          <div class="px-4 py-3 sm:px-6 border-b border-gray-700">
            <h3 class="text-lg font-semibold text-white">Cannot Proceed</h3>
          </div>
          
          <div class="p-4 sm:p-6 text-gray-400">
            <p class="mb-2">The following issues prevent you from proceeding:</p>
            <ul class="list-disc list-inside text-sm space-y-1">
              <li v-for="(reason, idx) in blockedTransition?.reasons" :key="idx">
                {{ reason }}
              </li>
            </ul>
          </div>
          
          <div class="px-4 py-4 sm:px-6 border-t border-gray-700 flex justify-end">
            <button 
              @click="handleGoBack"
              class="px-4 py-2 text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

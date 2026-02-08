<script setup lang="ts">
/**
 * Treatment Stage Page
 * 
 * This page handles the treatment phase of a clinical session.
 * Displays and manages treatment forms based on the peds_respiratory_treatment.json schema.
 * Accessed after completing the assessment phase.
 */

import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, navigateTo } from '#app';
import { useToast } from '~/composables/useToast';
import { loadSession, updateSession } from '~/services/sessionEngine';
import type { ClinicalSession } from '~/services/sessionEngine';
import { bridgeAssessmentToTreatment } from '~/services/treatmentBridge';
import { formEngine } from '~/services/formEngine';
import type { ClinicalFormInstance } from '~/types/clinical-form';

// ============================================
// Types & Interfaces
// ============================================

interface TreatmentSchemaField {
  id: string;
  type: string;
  label: string;
  options?: string[];
  config?: Record<string, any>;
  visibleIf?: {
    field: string;
    operator: string;
    value: string | string[];
  };
  readOnly?: boolean;
  required?: boolean;
}

interface TreatmentSchemaSection {
  id: string;
  title: string;
  description?: string;
  uiHint?: string;
  fields: string[];
}

interface TreatmentSchema {
  id: string;
  version: string;
  title: string;
  description: string;
  protocol: string;
  linkedAssessment: string;
  workflow: Array<{
    id: string;
    name: string;
    allowedTransitions: string[];
  }>;
  sections: TreatmentSchemaSection[];
  fields: TreatmentSchemaField[];
}

interface FormField extends TreatmentSchemaField {
  visible: boolean;
  value: any;
  error?: string;
}

interface SessionPatientInfo {
  name?: string;
  triage?: string;
  patientId?: string;
}

// ============================================
// Route & Params
// ============================================

const route = useRoute();
const sessionId = computed(() => route.params.sessionId as string);

// ============================================
// Meta & SEO
// ============================================

useHead({
  title: 'Treatment - HealthBridge',
  meta: [
    { name: 'description', content: 'Record treatment interventions for the patient' }
  ]
});

// ============================================
// State
// ============================================

const session = ref<ClinicalSession | null>(null);
const treatmentSchema = ref<TreatmentSchema | null>(null);
const isLoading = ref(true);
const isSaving = ref(false);
const isInitializing = ref(true);
const isBridging = ref(false);
const error = ref<string | null>(null);
const activeSection = ref(0);
const formValues = ref<Record<string, any>>({});
const fieldErrors = ref<Record<string, string>>({});
const assessmentStatus = ref<'pending' | 'completed' | 'not_found'>('pending');

// ============================================
// Services
// ============================================

const toastComposable = useToast();

// ============================================
// Computed
// ============================================

const isCompleted = computed(() => session.value?.status === 'completed');

const patientInfo = computed((): SessionPatientInfo | null => {
  if (!session.value) return null;
  return {
    name: session.value.patientName || 'Unknown Patient',
    triage: session.value.triage || 'unknown',
    patientId: session.value.patientId
  };
});

const sessionAge = computed(() => {
  if (!session.value?.createdAt) return 'Unknown';
  
  const created = session.value.createdAt;
  const now = Date.now();
  const diffMs = now - created;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  
  return new Date(created).toLocaleDateString();
});

const formSections = computed(() => treatmentSchema.value?.sections || []);

const currentSection = computed(() => formSections.value[activeSection.value]);

const visibleFields = computed((): FormField[] => {
  if (!treatmentSchema.value || !currentSection.value) return [];
  
  const section = treatmentSchema.value.sections.find(s => s.id === currentSection.value?.id);
  if (!section) return [];
  
  return section.fields
    .map((fieldId): FormField | null => {
      const fieldDef = treatmentSchema.value!.fields.find(f => f.id === fieldId);
      if (!fieldDef) return null;
      
      // Check visibility conditions
      let visible = true;
      if (fieldDef.visibleIf) {
        const { field: depField, operator, value } = fieldDef.visibleIf;
        const depValue = formValues.value[depField];
        
        switch (operator) {
          case 'eq':
            visible = depValue === value;
            break;
          case 'in':
            visible = Array.isArray(value) && value.includes(depValue);
            break;
          case 'notEmpty':
            visible = depValue && depValue !== '';
            break;
          default:
            visible = true;
        }
      }
      
      return {
        ...fieldDef,
        visible,
        value: formValues.value[fieldId] ?? getDefaultValue(fieldDef),
        error: fieldErrors.value[fieldId]
      };
    })
    .filter((f): f is FormField => f !== null && f.visible);
});

const canGoBack = computed(() => activeSection.value > 0);
const canGoForward = computed(() => activeSection.value < formSections.value.length - 1);
const isLastSection = computed(() => activeSection.value === formSections.value.length - 1);

const progress = computed(() => {
  if (formSections.value.length === 0) return 0;
  return ((activeSection.value + 1) / formSections.value.length) * 100;
});

// ============================================
// Helper Functions
// ============================================

function getDefaultValue(field: TreatmentSchemaField): any {
  switch (field.type) {
    case 'checkbox':
      return false;
    case 'multiselect':
      return [];
    default:
      return '';
  }
}

function getTriageColor(triage: string): 'error' | 'warning' | 'success' | 'neutral' {
  switch (triage) {
    case 'red': return 'error';
    case 'yellow': return 'warning';
    case 'green': return 'success';
    default: return 'neutral';
  }
}

function getSectionIcon(sectionId: string | undefined): string {
  if (!sectionId) return 'i-heroicons-document-text';
  const icons: Record<string, string> = {
    summary: 'i-heroicons-document-chart-bar',
    emergency: 'i-heroicons-exclamation-triangle',
    antibiotics: 'i-heroicons-beaker',
    home_care: 'i-heroicons-home',
    referral: 'i-heroicons-arrow-right-circle',
    counseling: 'i-heroicons-chat-bubble-left-right',
    complete: 'i-heroicons-check-circle'
  };
  return icons[sectionId] || 'i-heroicons-document-text';
}

function getSectionColor(sectionId: string | undefined): string {
  if (!sectionId) return 'text-gray-400';
  const colors: Record<string, string> = {
    summary: 'text-blue-400',
    emergency: 'text-red-400',
    antibiotics: 'text-purple-400',
    home_care: 'text-green-400',
    referral: 'text-orange-400',
    counseling: 'text-cyan-400',
    complete: 'text-emerald-400'
  };
  return colors[sectionId] || 'text-gray-400';
}

function formatActionLabel(action: string): string {
  // Convert snake_case to Title Case
  return action
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ============================================
// Validation
// ============================================

function validateField(field: FormField): boolean {
  if (field.required && (field.value === '' || field.value === null || field.value === undefined)) {
    field.error = `${field.label} is required`;
    return false;
  }
  
  if (field.type === 'number' && field.value !== '') {
    const numValue = Number(field.value);
    if (isNaN(numValue)) {
      field.error = `${field.label} must be a valid number`;
      return false;
    }
    if (field.config?.min !== undefined && numValue < field.config.min) {
      field.error = `${field.label} must be at least ${field.config.min}`;
      return false;
    }
    if (field.config?.max !== undefined && numValue > field.config.max) {
      field.error = `${field.label} must be at most ${field.config.max}`;
      return false;
    }
  }
  
  field.error = undefined;
  return true;
}

function validateSection(): boolean {
  let isValid = true;
  for (const field of visibleFields.value) {
    if (!validateField(field)) {
      isValid = false;
    }
  }
  return isValid;
}

function validateAllSections(): boolean {
  let isValid = true;
  for (const section of formSections.value) {
    const sectionFields = section.fields
      .map(fieldId => treatmentSchema.value?.fields.find(f => f.id === fieldId))
      .filter((f): f is TreatmentSchemaField => f !== null);
    
    for (const field of sectionFields) {
      // Check visibility
      let visible = true;
      if (field.visibleIf) {
        const { field: depField, operator, value } = field.visibleIf;
        const depValue = formValues.value[depField];
        
        switch (operator) {
          case 'eq':
            visible = depValue === value;
            break;
          case 'in':
            visible = Array.isArray(value) && value.includes(depValue);
            break;
          case 'notEmpty':
            visible = depValue && depValue !== '';
            break;
        }
      }
      
      if (visible && field.required && (formValues.value[field.id] === '' || formValues.value[field.id] === null || formValues.value[field.id] === undefined)) {
        fieldErrors.value[field.id] = `${field.label} is required`;
        isValid = false;
      }
    }
  }
  return isValid;
}

// ============================================
// Data Loading
// ============================================

async function loadTreatmentSchema(): Promise<TreatmentSchema | null> {
  try {
    const response = await fetch('/schemas/peds_respiratory_treatment.json');
    if (!response.ok) throw new Error('Failed to load treatment schema');
    return await response.json();
  } catch (error) {
    console.error('[Treatment] Failed to load schema:', error);
    return null;
  }
}

async function loadSessionData() {
  try {
    isLoading.value = true;
    error.value = null;
    
    const data = await loadSession(sessionId.value);
    
    if (!data) {
      error.value = 'Session not found';
      return;
    }
    
    session.value = data;
    
    // Load treatment schema
    const schema = await loadTreatmentSchema();
    if (!schema) {
      error.value = 'Treatment schema not found';
      return;
    }
    
    treatmentSchema.value = schema;
    
    // Step 1: Retrieve the latest assessment instance for this session
    let assessment: ClinicalFormInstance | null = null;
    try {
      assessment = await formEngine.getLatestInstanceBySession({
        schemaId: 'peds_respiratory',
        sessionId: sessionId.value
      });
      
      if (assessment) {
        assessmentStatus.value = assessment.status === 'completed' ? 'completed' : 'pending';
        console.log('[Treatment] Found assessment:', assessment._id, 'status:', assessment.status);
      } else {
        assessmentStatus.value = 'not_found';
        console.log('[Treatment] No assessment found for session:', sessionId.value);
      }
    } catch (err) {
      console.warn('[Treatment] Could not retrieve assessment:', err);
      assessmentStatus.value = 'not_found';
    }

    console.log('[Treatment] Assessment status:', assessmentStatus.value);
    console.log('[Treatment] assesment.status:', assessment?.status);
    // Step 2: Bridge assessment to treatment if valid completed assessment exists
    if (assessment && assessment.status === 'completed') {
      isBridging.value = true;
      console.log('[Treatment] Bridging assessment to treatment...');
      
      try {
        const bridgeResult = await bridgeAssessmentToTreatment({
          sessionId: sessionId.value,
          assessmentInstance: assessment
        });
        
        if (bridgeResult.success) {
          console.log('[Treatment] Bridge completed successfully');
        } else {
          console.warn('[Treatment] Bridge failed:', bridgeResult.error);
        }
      } catch (err) {
        console.error('[Treatment] Bridge error:', err);
      } finally {
        isBridging.value = false;
      }
    } else if (assessment && assessment.status !== 'completed') {
      console.log('[Treatment] Assessment not completed, skipping bridge');
    }
    
    // Step 3: Load treatment form instance and bind recommendations
    let treatmentInstance: ClinicalFormInstance | null = null;
    try {
      treatmentInstance = await formEngine.getLatestInstanceBySession({
        schemaId: 'peds_respiratory_treatment',
        sessionId: sessionId.value
      });
      
      if (treatmentInstance) {
        console.log('[Treatment] Found treatment instance:', treatmentInstance._id);
      }
    } catch (err) {
      console.warn('[Treatment] Could not retrieve treatment instance:', err);
    }
    
    // Step 4: Initialize form values from session triage or treatment instance
    const initialValues: Record<string, any> = {};
    
    // Set triage priority from session or treatment instance
    if (treatmentInstance?.calculated?.triagePriority) {
      initialValues.triage_priority = treatmentInstance.calculated.triagePriority;
    } else if (session.value?.triage) {
      initialValues.triage_priority = session.value.triage;
    }
    
    // Set recommended actions from treatment instance
    if (treatmentInstance?.answers?.recommended_actions) {
      initialValues.recommended_actions = treatmentInstance.answers.recommended_actions;
      console.log('[Treatment] Loaded recommended_actions:', initialValues.recommended_actions);
    } else if (assessment?.calculated?.recommended_actions) {
      // Fallback to assessment recommended actions
      initialValues.recommended_actions = assessment.calculated.recommended_actions;
      console.log('[Treatment] Loaded recommended_actions from assessment:', initialValues.recommended_actions);
    } else {
      // Default to empty array
      initialValues.recommended_actions = [];
    }
    
    formValues.value = initialValues;
    
  } catch (err) {
    console.error('[Treatment] Failed to load session:', err);
    error.value = err instanceof Error ? err.message : 'Failed to load session';
  } finally {
    isLoading.value = false;
    isInitializing.value = false;
  }
}

// ============================================
// Form Actions
// ============================================

async function saveTreatmentData(): Promise<void> {
  try {
    isSaving.value = true;
    
    // Get or create treatment instance
    const treatmentInstance = await formEngine.getOrCreateInstance({
      workflow: 'peds_respiratory_treatment',
      sessionId: sessionId.value
    });
    
    // Update with current form values
    await formEngine.updateInstance(treatmentInstance._id, {
      answers: formValues.value,
      calculated: {
        triagePriority: formValues.value.triage_priority as 'red' | 'yellow' | 'green'
      }
    });
    
    console.log('[Treatment] Saved treatment data:', formValues.value);
    
    // Also update session notes for backward compatibility
    const treatmentNotes = {
      treatmentData: {
        formId: treatmentInstance._id,
        schemaId: treatmentSchema.value?.id,
        answers: formValues.value
      },
      updatedAt: new Date().toISOString()
    };
    await updateSession(sessionId.value, {
      notes: JSON.stringify(treatmentNotes)
    } as any);
    
    toastComposable.toast({ title: 'Treatment saved successfully', color: 'success' });
  } catch (err) {
    console.error('[Treatment] Failed to save:', err);
    toastComposable.toast({ title: 'Failed to save treatment data', color: 'error' });
  } finally {
    isSaving.value = false;
  }
}

async function completeTreatment(): Promise<void> {
  try {
    isSaving.value = true;
    
    // Validate all sections
    if (!validateAllSections()) {
      toastComposable.toast({ title: 'Please fill in all required fields', color: 'warning' });
      isSaving.value = false;
      return;
    }
    
    // Get or create treatment instance
    const treatmentInstance = await formEngine.getOrCreateInstance({
      workflow: 'peds_respiratory_treatment',
      sessionId: sessionId.value
    });
    
    // Update with current form values
    await formEngine.updateInstance(treatmentInstance._id, {
      answers: formValues.value,
      calculated: {
        triagePriority: formValues.value.triage_priority as 'red' | 'yellow' | 'green'
      }
    });
    
    // Transition to completed state
    await formEngine.transitionState(treatmentInstance._id, 'complete');
    
    console.log('[Treatment] Completed treatment:', formValues.value);
    
    // Also update session notes for backward compatibility
    const treatmentNotes = {
      treatmentData: {
        formId: treatmentInstance._id,
        schemaId: treatmentSchema.value?.id,
        answers: formValues.value
      },
      completedAt: new Date().toISOString()
    };
    await updateSession(sessionId.value, {
      notes: JSON.stringify(treatmentNotes)
    } as any);
    
    toastComposable.toast({ title: 'Treatment completed successfully', color: 'success' });
    navigateTo(`/sessions/${sessionId.value}/summary`);
  } catch (err) {
    console.error('[Treatment] Failed to complete:', err);
    toastComposable.toast({ title: 'Failed to complete treatment', color: 'error' });
  } finally {
    isSaving.value = false;
  }
}

// ============================================
// Navigation
// ============================================

function goToNextSection() {
  if (validateSection()) {
    saveTreatmentData();
    if (canGoForward.value) {
      activeSection.value++;
    }
  }
}

function goToPreviousSection() {
  if (canGoBack.value) {
    activeSection.value--;
  }
}

function goToSection(index: number) {
  if (index >= 0 && index < formSections.value.length) {
    activeSection.value = index;
  }
}

function goBack() {
  navigateTo(`/sessions/${sessionId.value}`);
}

function navigateToAssessment() {
  navigateTo(`/sessions/${sessionId.value}/assessment`);
}

function navigateToDischarge() {
  navigateTo(`/sessions/${sessionId.value}/summary`);
}

// ============================================
// Watchers
// ============================================

// Re-validate fields when values change
watch(formValues, () => {
  for (const field of visibleFields.value) {
    if (field.error) {
      validateField(field);
    }
  }
}, { deep: true });

// ============================================
// Lifecycle
// ============================================

onMounted(() => {
  loadSessionData();
});
</script>

<template>
  <div class="min-h-screen bg-gray-900 p-4 md:p-6">
    <!-- Header -->
    <header class="mb-8">
      <div class="flex items-start justify-between gap-4 mb-6">
        <div class="flex-1">
          <!-- Back Button and Title -->
          <div class="flex items-center gap-3 mb-3">
            <button 
              @click="goBack"
              class="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div>
              <h1 class="text-2xl md:text-3xl font-bold text-white">
                Session {{ sessionId.slice(7, 11) }}
              </h1>
              <p class="text-gray-400 text-sm mt-1">
                Clinical treatment phase
              </p>
            </div>
          </div>

          <!-- Badges -->
          <div class="flex items-center gap-2 flex-wrap mt-4">
            <!-- Triage Badge -->
            <span 
              v-if="session?.triage"
              class="px-3 py-1.5 rounded-full text-sm font-medium"
              :class="{
                'bg-red-900/30 text-red-400': getTriageColor(session.triage) === 'error',
                'bg-yellow-900/30 text-yellow-400': getTriageColor(session.triage) === 'warning',
                'bg-green-900/30 text-green-400': getTriageColor(session.triage) === 'success'
              }"
            >
              {{ session.triage?.toUpperCase() }}
            </span>
            
            <!-- Stage Badge -->
            <span 
              class="px-3 py-1.5 rounded-full text-sm font-medium border border-green-700/30 bg-green-900/30 text-green-400"
            >
              Treatment
            </span>
          </div>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div class="border-b border-gray-700 mb-6">
        <div class="flex gap-1 -mb-px">
          <button
            @click="goBack"
            class="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors text-gray-400 hover:text-white hover:bg-gray-800/50"
          >
            Registration
          </button>
          <button
            @click="navigateToAssessment"
            class="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors text-gray-400 hover:text-white hover:bg-gray-800/50"
          >
            Assessment
          </button>
          <button
            class="px-4 py-2 text-sm font-medium rounded-t-lg bg-gray-800 text-white border-b-2 border-blue-500"
          >
            Treatment
          </button>
          <button
            @click="navigateToDischarge"
            class="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors text-gray-400 hover:text-white hover:bg-gray-800/50"
          >
            Discharge
          </button>
        </div>
      </div>
      
      <!-- Progress Bar -->
      <div v-if="treatmentSchema" class="mb-6">
        <div class="flex justify-between text-sm text-gray-400 mb-2">
          <span>Step {{ activeSection + 1 }} of {{ formSections.length }}</span>
          <span>{{ currentSection?.title }}</span>
        </div>
        <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div 
            class="h-full bg-blue-500 transition-all duration-300"
            :style="{ width: `${progress}%` }"
          ></div>
        </div>
      </div>
    </header>

    <!-- Error State -->
    <div
      v-if="error"
      class="mb-6 p-4 bg-red-900/20 border border-red-700 rounded-xl flex items-center justify-between"
    >
      <div class="flex items-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p class="text-red-400 font-medium">{{ error }}</p>
      </div>
      <button 
        @click="error = null"
        class="p-1 text-red-400 hover:text-red-300"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex flex-col items-center justify-center py-20">
      <div class="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mb-4"></div>
      <p class="text-white text-lg">Loading treatment form...</p>
      <p class="text-gray-500 text-sm">Please wait while we prepare the treatment plan</p>
    </div>

    <!-- Patient Info Card -->
    <div v-else-if="session" class="bg-gray-800 rounded-xl p-6 mb-6 border border-gray-700">
      <div class="flex items-start justify-between">
        <div>
          <h2 class="text-lg font-semibold text-white mb-1">
            {{ patientInfo?.name || 'Unknown Patient' }}
          </h2>
          <p class="text-gray-400 text-sm">
            Session {{ session.id?.slice(7, 11) }} • {{ sessionAge }}
          </p>
        </div>
        <div class="flex flex-col items-end gap-2">
          <!-- Assessment Status -->
          <span 
            class="px-3 py-1 rounded-full text-sm font-medium"
            :class="{
              'bg-green-900/30 text-green-400': assessmentStatus === 'completed',
              'bg-yellow-900/30 text-yellow-400': assessmentStatus === 'not_found',
              'bg-blue-900/30 text-blue-400': assessmentStatus === 'pending'
            }"
          >
            <span class="flex items-center gap-1">
              <svg 
                v-if="assessmentStatus === 'completed'"
                xmlns="http://www.w3.org/2000/svg" 
                class="h-4 w-4" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <svg 
                v-else-if="assessmentStatus === 'not_found'"
                xmlns="http://www.w3.org/2000/svg" 
                class="h-4 w-4" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <svg 
                v-else-if="assessmentStatus === 'pending'"
                xmlns="http://www.w3.org/2000/svg" 
                class="h-4 w-4" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {{
                assessmentStatus === 'completed' ? 'Assessment Complete' :
                assessmentStatus === 'not_found' ? 'Assessment Required' :
                'Assessment In Progress'
              }}
            </span>
          </span>
          
          <!-- Bridging Indicator -->
          <div v-if="isBridging" class="flex items-center gap-2 text-blue-400">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span class="text-sm text-gray-400">Generating recommendations...</span>
          </div>
          
          <!-- Patient ID -->
          <span 
            v-if="session.patientId"
            class="px-3 py-1 bg-gray-700 text-gray-300 rounded-full text-sm font-medium"
          >
            {{ session.patientId }}
          </span>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <template v-if="!isLoading && !error && treatmentSchema">
      <!-- Section Navigation -->
      <div class="mb-6 overflow-x-auto">
        <div class="flex gap-2 pb-2">
          <button
            v-for="(section, index) in formSections"
            :key="section.id"
            @click="goToSection(index)"
            class="flex-shrink-0 px-4 py-2 text-sm font-medium rounded-lg transition-colors border"
            :class="activeSection === index 
              ? 'bg-blue-700 text-white border-blue-600' 
              : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700 hover:text-white'"
          >
            <span class="flex items-center gap-2">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                class="h-4 w-4"
                :class="getSectionColor(section.id)"
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  stroke-linecap="round" 
                  stroke-linejoin="round" 
                  stroke-width="2" 
                  :d="getSectionIcon(section.id)" 
                />
              </svg>
              {{ section.title }}
            </span>
          </button>
        </div>
      </div>

      <!-- Treatment Form Card -->
      <div class="bg-gray-800 rounded-xl p-6 mb-8 border border-gray-700">
        <!-- Card Header -->
        <div class="pb-6 border-b border-gray-700">
          <div class="flex items-center gap-3 mb-2">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              class="h-6 w-6"
              :class="getSectionColor(currentSection?.id)"
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                stroke-linecap="round" 
                stroke-linejoin="round" 
                stroke-width="2" 
                :d="getSectionIcon(currentSection?.id)" 
              />
            </svg>
            <h2 class="text-xl font-bold text-white">{{ currentSection?.title }}</h2>
          </div>
          <p v-if="currentSection?.description" class="text-gray-400 text-sm">
            {{ currentSection.description }}
          </p>
        </div>
        
        <!-- Urgent Notice -->
        <div v-if="currentSection?.uiHint === 'urgent'" class="mt-6 mb-6 p-4 bg-red-900/20 border border-red-700/50 rounded-lg">
          <div class="flex items-center gap-3 text-red-400">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span class="text-sm font-medium">This section requires immediate attention</span>
          </div>
        </div>
        
        <!-- Form Fields -->
        <div class="space-y-6 mt-6">
          <div v-for="field in visibleFields" :key="field.id" class="field-container">
            
            <!-- Text Input -->
            <template v-if="field.type === 'text'">
              <label :for="field.id" class="block text-sm font-medium text-gray-300 mb-2">
                {{ field.label }}
                <span v-if="field.required" class="text-red-400">*</span>
              </label>
              <input
                :id="field.id"
                v-model="formValues[field.id]"
                type="text"
                :disabled="field.readOnly || isSaving"
                class="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                :class="{ 'border-red-500': field.error }"
                @blur="validateField(field)"
              />
              <p v-if="field.error" class="mt-1 text-sm text-red-400">{{ field.error }}</p>
            </template>
            
            <!-- Number Input -->
            <template v-else-if="field.type === 'number'">
              <label :for="field.id" class="block text-sm font-medium text-gray-300 mb-2">
                {{ field.label }}
                <span v-if="field.required" class="text-red-400">*</span>
              </label>
              <input
                :id="field.id"
                v-model="formValues[field.id]"
                type="number"
                :min="field.config?.min"
                :max="field.config?.max"
                :step="field.config?.step"
                :disabled="field.readOnly || isSaving"
                class="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                :class="{ 'border-red-500': field.error }"
                @blur="validateField(field)"
              />
              <p v-if="field.error" class="mt-1 text-sm text-red-400">{{ field.error }}</p>
            </template>
            
            <!-- Select -->
            <template v-else-if="field.type === 'select'">
              <label :for="field.id" class="block text-sm font-medium text-gray-300 mb-2">
                {{ field.label }}
                <span v-if="field.required" class="text-red-400">*</span>
              </label>
              <select
                :id="field.id"
                v-model="formValues[field.id]"
                :disabled="field.readOnly || isSaving"
                class="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed appearance-none"
                :class="{ 'border-red-500': field.error }"
                @change="validateField(field)"
              >
                <option value="" disabled selected>Select an option</option>
                <option v-for="option in field.options" :key="option" :value="option">
                  {{ option }}
                </option>
              </select>
              <p v-if="field.error" class="mt-1 text-sm text-red-400">{{ field.error }}</p>
            </template>
            
            <!-- Checkbox -->
            <template v-else-if="field.type === 'checkbox'">
              <div class="flex items-center gap-3">
                <input
                  :id="field.id"
                  v-model="formValues[field.id]"
                  type="checkbox"
                  :disabled="field.readOnly || isSaving"
                  class="w-5 h-5 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                />
                <label :for="field.id" class="text-sm text-gray-300 cursor-pointer">
                  {{ field.label }}
                </label>
              </div>
            </template>
            
            <!-- Date Input -->
            <template v-else-if="field.type === 'date'">
              <label :for="field.id" class="block text-sm font-medium text-gray-300 mb-2">
                {{ field.label }}
                <span v-if="field.required" class="text-red-400">*</span>
              </label>
              <input
                :id="field.id"
                v-model="formValues[field.id]"
                type="date"
                :disabled="field.readOnly || isSaving"
                class="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                :class="{ 'border-red-500': field.error }"
                @change="validateField(field)"
              />
              <p v-if="field.error" class="mt-1 text-sm text-red-400">{{ field.error }}</p>
            </template>
            
            <!-- Multiselect (Display as badges) -->
            <template v-else-if="field.type === 'multiselect'">
              <label :for="field.id" class="block text-sm font-medium text-gray-300 mb-2">
                {{ field.label }}
                <span v-if="field.required" class="text-red-400">*</span>
              </label>
              <div class="flex flex-wrap gap-2 p-3 bg-gray-700/50 rounded-lg min-h-[48px]">
                <span 
                  v-for="action in (formValues[field.id] || [])"
                  :key="action"
                  class="px-3 py-1 bg-blue-900/30 text-blue-400 rounded-full text-sm font-medium"
                >
                  {{ formatActionLabel(action) }}
                </span>
                <span v-if="!formValues[field.id]?.length" class="text-gray-500 text-sm">
                  None selected
                </span>
              </div>
            </template>
            
            <!-- Unknown field type -->
            <template v-else>
              <div class="p-4 bg-gray-700/30 rounded-lg border border-gray-600">
                <div class="flex items-center gap-2 text-yellow-400 mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span class="text-sm font-medium">Unknown field type</span>
                </div>
                <p class="text-gray-400 text-sm">
                  Field "{{ field.label }}" ({{ field.type }}) - rendering not implemented
                </p>
              </div>
            </template>
          </div>
        </div>
        
        <!-- Empty Section Message -->
        <div v-if="visibleFields.length === 0" class="text-center py-8">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-gray-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p class="text-gray-400">No visible fields for this section based on current answers</p>
        </div>
      </div>

      <!-- Navigation Actions -->
      <div class="flex items-center justify-between gap-4 p-4 bg-gray-800 rounded-xl border border-gray-700">
        <button
          @click="goToPreviousSection"
          :disabled="!canGoBack || isSaving"
          class="px-6 py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Previous
        </button>
        
        <div class="flex items-center gap-3">
          <button
            @click="saveTreatmentData"
            :disabled="isSaving"
            class="px-6 py-3 bg-blue-700 hover:bg-blue-600 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <svg 
              v-if="isSaving"
              xmlns="http://www.w3.org/2000/svg" 
              class="h-5 w-5 animate-spin" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <svg 
              v-else
              xmlns="http://www.w3.org/2000/svg" 
              class="h-5 w-5" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            Save Progress
          </button>
          
          <button
            v-if="canGoForward"
            @click="goToNextSection"
            :disabled="isSaving"
            class="px-6 py-3 bg-blue-700 hover:bg-blue-600 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            Next Section
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
          
          <button
            v-if="isLastSection"
            @click="completeTreatment"
            :disabled="isSaving"
            class="px-6 py-3 bg-green-700 hover:bg-green-600 disabled:bg-green-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <svg 
              v-if="isSaving"
              xmlns="http://www.w3.org/2000/svg" 
              class="h-5 w-5 animate-spin" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <svg 
              v-else
              xmlns="http://www.w3.org/2000/svg" 
              class="h-5 w-5" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Complete Treatment
          </button>
        </div>
      </div>
    </template>

    <!-- No Schema State -->
    <div v-if="!isLoading && !treatmentSchema && !error" class="text-center py-16">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-20 w-20 text-gray-500 mx-auto mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <h2 class="text-2xl font-semibold text-white mb-3">No Treatment Schema Available</h2>
      <p class="text-gray-400 mb-8 max-w-md mx-auto">
        Treatment form could not be loaded. Please ensure the treatment schema is properly configured.
      </p>
      <button
        @click="goBack"
        class="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2 mx-auto"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Assessment
      </button>
    </div>
  </div>
</template>
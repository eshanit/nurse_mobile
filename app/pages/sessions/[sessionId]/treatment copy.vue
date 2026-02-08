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
    navigateTo('/dashboard');
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
  <UContainer class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6" :ui="{ constrained: 'max-w-6xl' }">
    <!-- Header -->
    <header class="mb-8">
      <div class="flex items-start justify-between gap-4 mb-6">
        <div>
          <div class="flex items-center gap-3 mb-2">
            <h1 class="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
              Session {{ sessionId.slice(7, 11) }}
            </h1>
            
            <!-- Triage Badge -->
            <UBadge
              v-if="session?.triage"
              :color="getTriageColor(session.triage)"
              variant="solid"
              size="lg"
              class="font-semibold"
            >
              {{ session.triage?.toUpperCase() }}
            </UBadge>
            
            <!-- Stage Badge -->
            <UBadge
              color="success"
              variant="subtle"
              size="lg"
              class="font-semibold"
            >
              Treatment
            </UBadge>
          </div>
          
          <p class="text-gray-600 dark:text-gray-400 text-sm">
            Clinical treatment phase
          </p>
        </div>
      </div>

      <!-- Stage Navigation Tabs -->
      <div class="border-b border-gray-300 dark:border-gray-700">
        <nav class="flex gap-1 -mb-px">
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            label="Registration"
            @click="goBack"
          />
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            label="Assessment"
            @click="navigateToAssessment"
          />
          <UButton
            color="primary"
            variant="solid"
            size="sm"
            label="Treatment"
          />
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            label="Discharge"
          />
        </nav>
      </div>
      
      <!-- Progress Bar -->
      <div v-if="treatmentSchema" class="mt-4 mb-4">
        <div class="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
          <span>Step {{ activeSection + 1 }} of {{ formSections.length }}</span>
          <span>{{ currentSection?.title }}</span>
        </div>
        <div class="h-2 bg-gray-300 dark:bg-gray-700 rounded-full overflow-hidden">
          <div 
            class="h-full bg-primary-500 dark:bg-primary-600 transition-all duration-300"
            :style="{ width: `${progress}%` }"
          ></div>
        </div>
      </div>
    </header>

    <!-- Error State -->
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      class="mb-6"
      :close-button="{ icon: 'i-heroicons-x-mark', color: 'gray', variant: 'ghost' }"
      @close="error = null"
    >
      {{ error }}
    </UAlert>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-gray-500 dark:text-gray-400" />
      <span class="ml-3 text-gray-600 dark:text-gray-300">Loading treatment form...</span>
    </div>

    <!-- Patient Info Card -->
    <UCard v-else-if="session" class="mb-6" :ui="{
      header: 'pb-3 border-b border-gray-200 dark:border-gray-700 dark:bg-gray-800',
      body: 'dark:bg-gray-800',
      footer: 'pt-3 border-t border-gray-200 dark:border-gray-700'
    }">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ patientInfo?.name || 'Unknown Patient' }}
          </h2>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Session {{ session.id?.slice(7, 11) }} • {{ sessionAge }}
          </p>
        </div>
        <div class="flex items-center gap-3">
          <!-- Assessment Status Badge -->
          <UBadge
            v-if="assessmentStatus === 'completed'"
            color="success"
            variant="subtle"
            size="sm"
          >
            <UIcon name="i-heroicons-check-circle" class="w-3 h-3 mr-1" />
            Assessment Complete
          </UBadge>
          <UBadge
            v-else-if="assessmentStatus === 'not_found'"
            color="warning"
            variant="subtle"
            size="sm"
          >
            <UIcon name="i-heroicons-exclamation-circle" class="w-3 h-3 mr-1" />
            Assessment Required
          </UBadge>
          <UBadge
            v-else-if="assessmentStatus === 'pending'"
            color="info"
            variant="subtle"
            size="sm"
          >
            <UIcon name="i-heroicons-clock" class="w-3 h-3 mr-1" />
            Assessment In Progress
          </UBadge>
          
          <!-- Bridging Indicator -->
          <div v-if="isBridging" class="flex items-center gap-2 text-primary-500 dark:text-primary-400">
            <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
            <span class="text-sm text-gray-700 dark:text-gray-300">Generating recommendations...</span>
          </div>
          
          <UBadge
            v-if="session.patientId"
            color="neutral"
            variant="subtle"
            size="sm"
          >
            {{ session.patientId }}
          </UBadge>
        </div>
      </div>
    </UCard>

    <!-- Main Content -->
    <template v-if="!isLoading && !error && treatmentSchema">
      <!-- Section Navigation - Updated for dark theme -->
      <div class="mb-6 overflow-x-auto">
        <nav class="flex gap-2 pb-2">
          <UButton
            v-for="(section, index) in formSections"
            :key="section.id"
            :color="activeSection === index ? 'primary' : 'neutral'"
             :variant="activeSection === index ? 'solid' : 'outline'"
             size="sm"
             @click="goToSection(index)"
            class="flex-shrink-0 dark:border-gray-600"
          >
            <UIcon :name="getSectionIcon(section.id)" class="w-4 h-4 mr-1" :class="getSectionColor(section.id)" />
            {{ section.title }}
          </UButton>
        </nav>
      </div>

      <!-- Treatment Form Card -->
      <UCard class="mb-8" :ui="{
        header: 'pb-4 border-b border-gray-200 dark:border-gray-700 px-4 py-3 sm:px-6',
        body: 'px-4 py-3 sm:px-6',
        footer: 'pt-4 border-t border-gray-200 dark:border-gray-700 px-4 py-3 sm:px-6'
      }">
        <template #header>
          <div class="pb-4">
            <div class="flex items-center gap-3 mb-2">
              <UIcon 
                :name="getSectionIcon(currentSection?.id)" 
                class="w-6 h-6"
                :class="getSectionColor(currentSection?.id)"
              />
              <h2 class="text-xl font-bold text-gray-900 dark:text-white">{{ currentSection?.title }}</h2>
            </div>
            <p v-if="currentSection?.description" class="text-gray-600 dark:text-gray-400 text-sm">
              {{ currentSection.description }}
            </p>
          </div>
        </template>
        
        <!-- Section Description -->
        <div v-if="currentSection?.uiHint === 'urgent'" class="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700/50 rounded-lg">
          <div class="flex items-center gap-2 text-red-700 dark:text-red-400">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5" />
            <span class="text-sm font-medium">This section requires immediate attention</span>
          </div>
        </div>
        
        <!-- Form Fields -->
        <div class="space-y-6">
          <div v-for="field in visibleFields" :key="field.id" class="field-container">
            
            <!-- Text Input -->
            <template v-if="field.type === 'text'">
              <label :for="field.id" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {{ field.label }}
                <span v-if="field.required" class="text-red-500 dark:text-red-400">*</span>
              </label>
              <UInput
                :id="field.id"
                v-model="formValues[field.id]"
                color="primary"
                variant="outline"
                :disabled="field.readOnly || isSaving"
                :error="field.error"
                class="w-full dark:border-gray-600"
                @blur="validateField(field)"
              />
            </template>
            
            <!-- Number Input -->
            <template v-else-if="field.type === 'number'">
              <label :for="field.id" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {{ field.label }}
                <span v-if="field.required" class="text-red-500 dark:text-red-400">*</span>
              </label>
              <UInput
                :id="field.id"
                v-model="formValues[field.id]"
                type="number"
                color="primary"
                variant="outline"
                :min="field.config?.min"
                :max="field.config?.max"
                :step="field.config?.step"
                :disabled="field.readOnly || isSaving"
                :error="field.error"
                class="w-full dark:border-gray-600"
                @blur="validateField(field)"
              />
            </template>
            
            <!-- Select -->
            <template v-else-if="field.type === 'select'">
              <label :for="field.id" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {{ field.label }}
                <span v-if="field.required" class="text-red-500 dark:text-red-400">*</span>
              </label>
              <USelect
                :id="field.id"
                v-model="formValues[field.id]"
                :items="field.options"
                color="primary"
                variant="outline"
                :disabled="field.readOnly || isSaving"
                :error="field.error"
                class="w-full dark:border-gray-600"
                selectedIcon="i-heroicons-check"
                @change="validateField(field)"
              />
            </template>
            
            <!-- Checkbox -->
            <template v-else-if="field.type === 'checkbox'">
              <UCheckbox
                :id="field.id"
                v-model="formValues[field.id]"
                :label="field.label"
                :disabled="field.readOnly || isSaving"
                class="text-gray-700 dark:text-gray-300"
              />
            </template>
            
            <!-- Date Input -->
            <template v-else-if="field.type === 'date'">
              <label :for="field.id" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {{ field.label }}
                <span v-if="field.required" class="text-red-500 dark:text-red-400">*</span>
              </label>
              <UInput
                :id="field.id"
                v-model="formValues[field.id]"
                type="date"
                color="primary"
                variant="outline"
                :disabled="field.readOnly || isSaving"
                :error="field.error"
                class="w-full dark:border-gray-600"
                @change="validateField(field)"
              />
            </template>
            
            <!-- Multiselect (e.g., recommended_actions) -->
            <template v-else-if="field.type === 'multiselect'">
              <label :for="field.id" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {{ field.label }}
                <span v-if="field.required" class="text-red-500 dark:text-red-400">*</span>
              </label>
              <div class="space-y-2">
                <UBadge
                  v-for="action in (formValues[field.id] || [])"
                  :key="action"
                  color="primary"
                  variant="subtle"
                  class="mr-2"
                >
                  {{ formatActionLabel(action) }}
                </UBadge>
                <span v-if="!formValues[field.id]?.length" class="text-gray-500 dark:text-gray-400 text-sm">
                  None selected
                </span>
              </div>
            </template>
            
            <!-- Unknown field type -->
            <template v-else>
              <div class="p-4 bg-gray-100 dark:bg-gray-700/50 rounded-lg">
                <div class="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
                  <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4" />
                  <span class="text-sm font-medium">Unknown field type</span>
                </div>
                <p class="text-gray-700 dark:text-gray-400 text-sm">
                  Field "{{ field.label }}" ({{ field.type }}) - rendering not implemented
                </p>
              </div>
            </template>
            
          </div>
        </div>
        
        <!-- Empty Section Message -->
        <div v-if="visibleFields.length === 0" class="text-center py-8">
          <UIcon name="i-heroicons-document" class="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
          <p class="text-gray-600 dark:text-gray-400">No visible fields for this section based on current answers</p>
        </div>
      </UCard>

      <!-- Navigation Actions - Updated for dark theme -->
      <div class="flex items-center justify-between gap-4 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <UButton
          icon="i-heroicons-arrow-left"
          color="neutral"
          variant="solid"
          :disabled="!canGoBack || isSaving"
          @click="goToPreviousSection"
          class="px-6"
        >
          Previous
        </UButton>
        
        <div class="flex items-center gap-3">
          <UButton
            icon="i-heroicons-arrow-right"
            color="primary"
            variant="solid"
            :loading="isSaving"
            @click="saveTreatmentData"
            class="px-6"
          >
            Save Progress
          </UButton>
          
          <UButton
            v-if="canGoForward"
            icon="i-heroicons-arrow-right"
            color="primary"
            variant="solid"
            :disabled="isSaving"
            @click="goToNextSection"
            class="px-6"
          >
            Next Section
          </UButton>
          
          <UButton
            v-if="isLastSection"
            icon="i-heroicons-check-circle"
            color="success"
            variant="solid"
            :loading="isSaving"
            @click="completeTreatment"
            class="px-6"
          >
            Complete Treatment
          </UButton>
        </div>
      </div>
    </template>

    <!-- No Schema State -->
    <div v-if="!isLoading && !treatmentSchema && !error" class="text-center py-16">
      <UIcon name="i-heroicons-document-text" class="w-20 h-20 text-gray-400 dark:text-gray-500 mx-auto mb-6" />
      <h2 class="text-2xl font-semibold text-gray-900 dark:text-white mb-3">No Treatment Schema Available</h2>
      <p class="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto">
        Treatment form could not be loaded. Please ensure the treatment schema is properly configured.
      </p>
      <UButton
        color="neutral"
        variant="solid"
        size="lg"
        @click="goBack"
      >
        <UIcon name="i-heroicons-arrow-left" class="mr-2" />
        Back to Assessment
      </UButton>
    </div>
  </UContainer>
</template>

<style scoped>
/* Optional: Add some custom dark theme enhancements */
:deep(.treatment-form) {
  --tw-ring-color: rgba(75, 85, 99, 0.5) !important;
}

:deep(.field-container) {
  transition: all 0.2s ease;
}

:deep(.field-container:hover) {
  transform: translateY(-1px);
}

:deep(input:disabled),
:deep(select:disabled),
:deep(textarea:disabled) {
  background-color: #f3f4f6;
  color: #6b7280;
  cursor: not-allowed;
}

.dark :deep(input:disabled),
.dark :deep(select:disabled),
.dark :deep(textarea:disabled) {
  background-color: #374151;
  color: #9ca3af;
}

:deep(.dark .u-input-outline:focus) {
  --tw-ring-color: rgba(59, 130, 246, 0.5) !important;
}
</style>


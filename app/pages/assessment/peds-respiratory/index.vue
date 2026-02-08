<script setup lang="ts">
/**
 * Pediatric Respiratory Assessment Page
 * 
 * REFACTORED per ARCHITECTURE_RULES.md
 * 
 * Uses:
 * - NuxtUI components (UButton, UCard, UModal, etc.)
 * - useClinicalFormEngine composable for form management
 * - useToast() for error handling
 * - FieldRenderer for field rendering
 */

import { ref, computed, onMounted, nextTick } from 'vue';
import { useRoute, navigateTo } from '#app';
import { formEngine } from '@/services/formEngine';
import { useClinicalFormEngine } from '~/composables/useClinicalFormEngine';
import { useDashboardStore } from '~/stores/dashboard';
import { pediatricRespiratorySchema } from '~/schemas/clinical/fieldSchemas';
import FieldRenderer from '@/components/clinical/fields/FieldRenderer.vue';
import TriageSummaryCard from '@/components/clinical/summary/TriageSummaryCard.vue';
import NavigationGuard from '@/components/clinical/workflow/NavigationGuard.vue';
import type { ClinicalFormSchema, ClinicalFormInstance, FieldDefinition, FormSection } from '~/types/clinical-form';

// Use the new clinical form engine composable
// Extract query params for session context
const route = useRoute();
const sessionId = computed(() => route.query.sessionId as string | undefined);

// Only provide patientData if at least one field is defined
const patientData = computed(() => {
  const data = {
    patientId: route.query.patientId as string | undefined,
    patientName: route.query.patientName as string | undefined,
    dateOfBirth: route.query.dateOfBirth as string | undefined,
    gender: route.query.gender as string | undefined
  };
  
  // Only return if at least one field has a value
  if (data.patientId || data.patientName || data.dateOfBirth || data.gender) {
    return data;
  }
  
  return undefined;
});

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
  schemaId: 'peds_respiratory',
  zodSchema: pediatricRespiratorySchema,
  sessionId: sessionId.value,
  patientData: patientData.value
});

// Additional local state
const validationError = ref<string | null>(null);
const showNavigationGuard = ref(false);
const blockedTransition = ref<{ from: string; to: string; reasons: string[] } | null>(null);

// Computed
const formSections = computed(() => schema.value?.sections || []);
const currentSection = computed(() => {
  if (!schema.value?.sections || !instance.value) return undefined;
  const section = schema.value.sections[currentSectionIndex.value] as FormSection | undefined;
  console.log('[PedsRespiratory] currentSection:', {
    index: currentSectionIndex.value,
    id: section?.id,
    totalSections: formSections.value.length
  });
  return section;
});

const currentFields = computed(() => {
  if (!currentSection.value || !instance.value || !schema.value) {
    console.log('[PedsRespiratory] currentFields: returning empty array, missing deps');
    return [];
  }
  const fields = formEngine.getSectionFields(currentSection.value.id, instance.value, schema.value);
  console.log('[PedsRespiratory] currentFields:', {
    sectionId: currentSection.value.id,
    fieldsCount: fields.length,
    fieldIds: fields.map(f => f.id)
  });
  return fields;
});
const isFirstSection = computed(() => currentSectionIndex.value === 0);
const isLastSection = computed(() => currentSectionIndex.value === formSections.value.length - 1);

// Debug: show section info
const debugSection = computed(() => ({
  index: currentSectionIndex.value,
  id: currentSection.value?.id,
  title: currentSection.value?.title,
  totalSections: formSections.value.length
}));

// Initialize form
onMounted(async () => {
  try {
    console.log('[PedsRespiratory] Starting initialization...');
    await initialize();
    console.log('[PedsRespiratory] Initialization complete');
  } catch (error) {
    console.error('[PedsRespiratory] Failed to initialize:', error);
    validationError.value = 'Failed to load form. Please try again.';
  }
});

// Field operations
async function handleFieldChange(fieldId: string, value: any) {
  const result = await saveField(fieldId, value);
  
  if (!result.success && result.validationWarnings?.[0]) {
    console.warn(`Validation warning for ${fieldId}:`, result.validationWarnings[0].message);
  }
}

// Navigation
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
      from: instance.value?.currentStateId || '',
      to: formSections.value[currentSectionIndex.value + 1]?.id || '',
      reasons: [error instanceof Error ? error.message : 'Validation failed']
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
      // Reload dashboard data before navigating
      const dashboardStore = useDashboardStore();
      await dashboardStore.loadDashboard();
      
      // If accessed via Queue route (has sessionId), navigate to treatment stage
      if (sessionId.value) {
        navigateTo(`/sessions/${sessionId.value}/treatment`);
      } else {
        // Direct route - go to dashboard
        navigateTo('/dashboard');
      }
    } else {
      validationError.value = result.reason || 'Please fill in all required fields.';
    }
  } catch (error) {
    console.error('[PedsRespiratory] Failed to complete:', error);
    validationError.value = 'Failed to complete form';
  }
}

// Navigation guard handlers
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

function handleGoToDashboard() {
  navigateTo('/dashboard');
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-blue-950 p-4 md:p-6 max-w-6xl mx-auto">
    <!-- Header -->
    <header class="flex items-center justify-between mb-8">
      <div class="flex items-center gap-4">
        <button
          @click="handleGoToDashboard"
          class="p-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <h1 class="text-2xl md:text-3xl font-bold text-white">Pediatric Respiratory Assessment</h1>
          <p class="text-gray-400 text-sm md:text-base">Respiratory Assessment (IMCI Protocol)</p>
        </div>
      </div>
      
      <!-- Triage Badge -->
      <span
        v-if="triagePriority"
        class="inline-flex items-center px-4 py-2 rounded-full text-lg font-semibold"
        :class="{
          'bg-red-600 text-white': triagePriority === 'red',
          'bg-yellow-500 text-white': triagePriority === 'yellow',
          'bg-green-600 text-white': triagePriority === 'green' || triagePriority === 'stable'
        }"
      >
        {{ triagePriority?.toUpperCase() }} Priority
      </span>
    </header>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
    </div>

    <!-- Schema or Instance not loaded debug -->
    <div v-if="!schema" class="text-gray-400 text-center py-12">
      Schema not loaded: {{ schema }}
    </div>
    <div v-if="schema && !instance" class="text-gray-400 text-center py-12">
      Instance not loaded
    </div>

    <!-- Error State -->
    <div
      v-else-if="validationError"
      class="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg dark:bg-red-900/20 dark:border-red-800 dark:text-red-200"
    >
      <div class="flex items-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p class="font-medium">{{ validationError }}</p>
      </div>
    </div>

    <!-- MCI/IMCI Protocol Note -->
    <div class="mb-6 p-4 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200">
      <div class="flex items-start gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <p class="font-medium">IMCI Protocol</p>
          <p class="text-sm mt-1">This assessment follows WHO IMCI guidelines for children 2-59 months with cough or difficulty breathing.</p>
        </div>
      </div>
    </div>

    <!-- Form Content -->
    <div v-if="schema && instance">
      <!-- Debug: Show current section info -->
      <div class="mb-4 p-2 bg-gray-800 rounded text-xs text-gray-400 flex gap-4 flex-wrap">
        <span>Section: {{ currentSectionIndex + 1 }}/{{ formSections.length }}</span>
        <span>ID: {{ currentSection?.id }}</span>
        <span>Title: {{ currentSection?.title }}</span>
        <span>IsTriage: {{ currentSection?.id === 'triage' }}</span>
        <span>IsLast: {{ isLastSection }}</span>
        <span>Instance ID: {{ instance._id }}</span>
        <span>State: {{ instance.currentStateId }}</span>
      </div>
   
      <!-- Progress Bar -->
      <div class="mb-8">
        <div class="flex items-center justify-between mb-2">
          <span class="text-gray-400 text-sm">
            Section {{ currentSectionIndex + 1 }} of {{ formSections.length }}
          </span>
          <span class="text-gray-400 text-sm">{{ currentSection?.title }}</span>
        </div>
        <div class="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div 
            class="h-full bg-blue-500 rounded-full transition-all duration-300"
            :style="{ width: `${progress}%` }"
          ></div>
        </div>
      </div>

      <!-- Section Card -->
      <div class="mb-8 bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-xl shadow-xl overflow-hidden">
        <div class="px-4 py-4 sm:px-6 pb-4 border-b border-gray-700">
          <h2 class="text-xl font-bold text-white mb-1">{{ currentSection?.title }}</h2>
          <p v-if="currentSection?.description" class="text-gray-400 text-sm">
            {{ currentSection.description }}
          </p>
        </div>
        
        <!-- Fields Grid -->
        <div class="space-y-4">
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
          
          <!-- Empty state message when no fields in section -->
          <div v-if="currentFields.length === 0" class="text-gray-500 text-sm text-center py-4">
            No fields in this section
          </div>
        </div>

        <!-- Triage Summary - Only show on triage section (section 7) -->
        <div v-if="currentSection?.id === 'triage'" class="mt-6 pt-6 border-t border-gray-700">
          <h3 class="text-white font-semibold mb-4 text-lg">Classification Summary</h3>
          <div v-if="instance" class="bg-gray-900/50 border border-gray-600 rounded-lg p-4">
            <TriageSummaryCard 
              :instance="instance" 
              class="bg-transparent"
            />
          </div>
          <div v-else class="text-gray-400 p-4 bg-yellow-900/20 border border-yellow-600 rounded">
            <strong>Warning:</strong> Instance is null or undefined
          </div>
        </div>
      </div>

      <!-- Navigation Buttons -->
      <div class="flex items-center justify-between gap-4 p-4">
        <button
          v-if="!isFirstSection"
          @click="handlePreviousSection"
          class="inline-flex items-center px-6 py-2 bg-gray-700 text-gray-300 hover:bg-gray-600 rounded-lg transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Previous Section
        </button>
        <div v-else></div>

        <button
          v-if="!isLastSection"
          @click="handleNextSection"
          :disabled="isSaving"
          class="inline-flex items-center px-6 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg v-if="isSaving" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
          Next Section
        </button>
        <button
          v-else
          @click="handleCompleteForm"
          :disabled="isSaving"
          class="inline-flex items-center px-6 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg v-if="isSaving" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          {{ isSaving ? 'Saving...' : 'Complete Assessment' }}
        </button>
      </div>
    </div>

    <!-- Navigation Guard Modal -->
    <NavigationGuard
      :is-open="showNavigationGuard"
      :blocked-transition="blockedTransition"
      :required-fields="[]"
      :allow-override="true"
      @proceed-anyway="handleProceedAnyway"
      @go-back="handleGoBack"
    />
  </div>
</template>

<style scoped>
/* Ensure consistent spacing and alignment */
.field-container {
  display: flex;
  flex-direction: column;
}

/* Custom styling for the page */
:deep(.u-card) {
  transition: all 0.2s;
}

:deep(.u-card:hover) {
  border-color: #374151; /* gray-700 */
}

/* Ensure form fields have consistent height */
:deep(.u-form-field) {
  display: flex;
  flex-direction: column;
  height: 100%;
}

:deep(.u-input),
:deep(.u-select),
:deep(.u-textarea) {
  min-height: 42px;
}

/* Dark theme improvements */
:deep(.u-label) {
  color: #d1d5db; /* gray-300 */
  font-weight: 500;
  margin-bottom: 0.5rem;
}

:deep(.u-form-field-help) {
  color: #9ca3af; /* gray-400 */
  font-size: 0.75rem;
  margin-top: 0.25rem;
}

:deep(.u-form-field-error) {
  color: #f87171; /* red-400 */
  font-size: 0.75rem;
  margin-top: 0.25rem;
}
</style>

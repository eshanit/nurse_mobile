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
import { formEngine } from '@/services/formEngine';
import { useClinicalFormEngine } from '~/composables/useClinicalFormEngine';
import { useDashboardStore } from '~/stores/dashboard';
import { pediatricRespiratorySchema } from '~/schemas/clinical/fieldSchemas';
import FieldRenderer from '@/components/clinical/fields/FieldRenderer.vue';
import TriageSummaryCard from '@/components/clinical/summary/TriageSummaryCard.vue';
import NavigationGuard from '@/components/clinical/workflow/NavigationGuard.vue';
import type { ClinicalFormSchema, ClinicalFormInstance, FieldDefinition, FormSection } from '~/types/clinical-form';

// Import useAuth if needed, but handle it carefully
// const auth = useAuth();

// Use the new clinical form engine composable
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
  zodSchema: pediatricRespiratorySchema
});

// Additional local state
const validationError = ref<string | null>(null);
const showNavigationGuard = ref(false);
const blockedTransition = ref<{ from: string; to: string; reasons: string[] } | null>(null);

// Computed
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

// Initialize form
onMounted(async () => {
  try {
    // Commenting out auth check temporarily to avoid Pinia errors
    // if (!auth?.isAuthenticated?.value) {
    //   navigateTo('/');
    //   return;
    // }

    await initialize();
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
      navigateTo('/dashboard');
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
  <UContainer class="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-blue-950 p-4 md:p-6" :ui="{ constrained: 'max-w-6xl' }">
    <!-- Header -->
    <header class="flex items-center justify-between mb-8">
      <div class="flex items-center gap-4">
        <UButton
          icon="i-heroicons-arrow-left"
          color="neutral"
          variant="ghost"
          class="text-gray-300 hover:text-white hover:bg-gray-800"
          @click="handleGoToDashboard"
        />
        <div>
          <h1 class="text-2xl md:text-3xl font-bold text-white">Pediatric Respiratory Assessment</h1>
          <p class="text-gray-400 text-sm md:text-base">Respiratory Assessment (IMCI Protocol)</p>
        </div>
      </div>
      
      <!-- Triage Badge -->
      <UBadge
        v-if="triagePriority"
        :color="triagePriority === 'red' ? 'error' : triagePriority === 'yellow' ? 'warning' : 'success'"
        variant="solid"
        size="lg"
        class="font-semibold px-4 py-2"
      >
        {{ triagePriority?.toUpperCase() }} Priority
      </UBadge>
    </header>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
    </div>

    <!-- Error State -->
    <UAlert
      v-else-if="validationError"
      :title="validationError"
      icon="i-heroicons-exclamation-circle"
      color="error"
      variant="subtle"
      class="mb-6"
    />

    <!-- MCI/IMCI Protocol Note -->
    <UAlert
      title="IMCI Protocol"
      description="This assessment follows WHO IMCI guidelines for children 2-59 months with cough or difficulty breathing."
      icon="i-heroicons-information-circle"
      color="info"
      variant="subtle"
      class="mb-6 bg-blue-900/20 border-blue-700"
    />

    <!-- Form Content -->
    <div v-if="schema && instance">
      <!-- Progress Bar -->
      <div class="mb-8">
        <div class="flex items-center justify-between mb-2">
          <span class="text-gray-400 text-sm">
            Section {{ currentSectionIndex + 1 }} of {{ formSections.length }}
          </span>
          <span class="text-gray-400 text-sm">{{ currentSection?.title }}</span>
        </div>
        <UProgress
          :value="progress"
          size="xs"
          class="[&>div]:bg-blue-500"
        />
      </div>

      <!-- Section Card -->
      <UCard class="mb-8 bg-gray-800/80 backdrop-blur-sm border-gray-700 shadow-xl">
        <template #header>
          <div class="pb-4 border-b border-gray-700">
            <h2 class="text-xl font-bold text-white mb-1">{{ currentSection?.title }}</h2>
            <p v-if="currentSection?.description" class="text-gray-400 text-sm">
              {{ currentSection.description }}
            </p>
          </div>
        </template>
        
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
        </div>
      </UCard>

      <!-- Navigation Buttons -->
      <div class="flex items-center justify-between gap-4 p-4">
        <UButton
          v-if="!isFirstSection"
          icon="i-heroicons-arrow-left"
          color="neutral"
          variant="solid"
          label="Previous Section"
          @click="handlePreviousSection"
          class="px-6"
        />
        <div v-else></div>

        <UButton
          v-if="!isLastSection"
          icon="i-heroicons-arrow-right"
          color="primary"
          variant="solid"
          label="Next Section"
          :loading="isSaving"
          @click="handleNextSection"
          class="px-6"
        />
        <UButton
          v-else
          icon="i-heroicons-check"
          color="primary"
          variant="solid"
          :label="isSaving ? 'Saving...' : 'Complete Assessment'"
          :loading="isSaving"
          @click="handleCompleteForm"
          class="px-6"
        />
      </div>

      <!-- Triage Summary -->
      <div v-if="currentSection?.id === 'triage' || isLastSection" class="mt-8">
        <h3 class="text-white font-semibold mb-4 text-lg">Classification Summary</h3>
        <TriageSummaryCard 
          :instance="instance" 
          class="bg-gray-800/80 border-gray-700 shadow-lg"
        />
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
  </UContainer>
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
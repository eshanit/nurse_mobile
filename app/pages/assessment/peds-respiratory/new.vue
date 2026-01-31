<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAuth } from '@/composables/useAuth';
import { useAuthStore } from '@/stores/auth';
import { formEngine } from '@/services/formEngine';
import ClinicalFormRenderer from '@/components/clinical/forms/ClinicalFormRenderer.vue';
import FieldRenderer from '@/components/clinical/fields/FieldRenderer.vue';
import TriageSummaryCard from '@/components/clinical/summary/TriageSummaryCard.vue';
import NavigationGuard from '@/components/clinical/workflow/NavigationGuard.vue';
import type { ClinicalFormSchema, ClinicalFormInstance, FieldDefinition } from '~/types/clinical-form';

const auth = useAuth();
const authStore = useAuthStore();

// Get user ID for audit logging (use device ID if no user)
function getUserId(): string {
  return authStore.deviceId || 'unknown';
}

// Form state
const schema = ref<ClinicalFormSchema | null>(null);
const instance = ref<ClinicalFormInstance | null>(null);
const isLoading = ref(true);
const isSaving = ref(false);
const currentSectionIndex = ref(0);
const validationError = ref<string | null>(null);
const showNavigationGuard = ref(false);
const blockedTransition = ref<{ from: string; to: string; reasons: string[] } | null>(null);

// Computed
const formSections = computed(() => schema.value?.sections || []);
const currentSection = computed(() => formSections.value[currentSectionIndex.value]);
const currentFields = computed(() => {
  if (!currentSection.value || !instance.value || !schema.value) return [];
  return formEngine.getSectionFields(currentSection.value.id, instance.value, schema.value);
});

const isFirstSection = computed(() => currentSectionIndex.value === 0);
const isLastSection = computed(() => currentSectionIndex.value === formSections.value.length - 1);

const progress = computed(() => 
  schema.value ? ((currentSectionIndex.value + 1) / formSections.value.length) * 100 : 0
);

const triageResult = computed(() => instance.value?.calculated?.triagePriority || 'green');

const triageClass = computed(() => ({
  'bg-red-900/50 border-2 border-red-600': triageResult.value === 'red',
  'bg-yellow-900/50 border-2 border-yellow-600': triageResult.value === 'yellow',
  'bg-green-900/50 border-2 border-green-600': triageResult.value === 'green',
}));

// Initialize form
onMounted(async () => {
  try {
    // Auth check
    if (!auth.isAuthenticated.value) {
      navigateTo('/');
      return;
    }

    isLoading.value = true;
    
    // Load schema using form engine
    schema.value = await formEngine.loadSchema('peds_respiratory');
    
    // Create new instance
    instance.value = await formEngine.createInstance(
      'peds_respiratory',
      getUserId()
    );
    
    isLoading.value = false;
  } catch (error) {
    console.error('[PedsRespiratory] Failed to initialize:', error);
    validationError.value = 'Failed to load form. Please try again.';
    isLoading.value = false;
  }
});

// Field operations
async function saveField(fieldId: string, value: any) {
  if (!instance.value) return;
  
  try {
    const result = await formEngine.saveFieldValue(instance.value._id, fieldId, value, getUserId());
    instance.value = result.formInstance;
  } catch (error) {
    console.error('[PedsRespiratory] Failed to save field:', error);
  }
}

function getFieldValue(fieldId: string): any {
  return instance.value?.answers[fieldId];
}

// Navigation
async function nextSection() {
  if (!instance.value || !schema.value) return;
  
  // Validate transition before proceeding
  const nextState = formSections.value[currentSectionIndex.value + 1]?.id;
  if (nextState) {
    const validation = await formEngine.validateTransition(instance.value._id, nextState);
    
    if (!validation.valid && validation.errors && validation.errors.length > 0) {
      // Show navigation guard
      blockedTransition.value = {
        from: instance.value.currentStateId,
        to: nextState,
        reasons: validation.errors,
      };
      showNavigationGuard.value = true;
      return;
    }
  }
  
  if (!isLastSection.value) {
    currentSectionIndex.value++;
  } else {
    await completeForm();
  }
}

function previousSection() {
  if (!isFirstSection.value) {
    currentSectionIndex.value--;
  }
}

async function completeForm() {
  if (!instance.value) return;
  
  try {
    isSaving.value = true;
    
    // Transition to complete state
    const result = await formEngine.transitionState(instance.value._id, 'complete', getUserId());
    
    if (result.allowed) {
      instance.value = await formEngine.loadInstance(instance.value._id);
    } else {
      validationError.value = result.reason || 'Cannot complete form';
    }
    
    isSaving.value = false;
  } catch (error) {
    console.error('[PedsRespiratory] Failed to complete:', error);
    validationError.value = 'Failed to complete form';
    isSaving.value = false;
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

// Expose for template
defineExpose({
  instance,
  schema,
  currentSection,
  currentFields,
  saveField,
  getFieldValue,
  nextSection,
  previousSection,
  completeForm,
});
</script>

<template>
  <div class="min-h-screen bg-gray-900 p-4">
    <!-- Header -->
    <header class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-4">
        <button 
          @click="handleGoToDashboard"
          class="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 class="text-2xl font-bold text-white">Pediatric Respiratory</h1>
          <p class="text-gray-400 text-sm">Respiratory Assessment (IMCI)</p>
        </div>
      </div>
      
      <!-- Triage Badge -->
      <div v-if="instance?.calculated?.triagePriority" class="px-4 py-2 rounded-lg" :class="triageClass">
        <span class="font-bold text-white uppercase">
          {{ triageResult }} Priority
        </span>
      </div>
    </header>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
    </div>

    <!-- Error State -->
    <div v-else-if="validationError" class="p-4 bg-red-900/30 border border-red-700 rounded-lg mb-6">
      <p class="text-red-400">{{ validationError }}</p>
    </div>

    <!-- Form Content -->
    <template v-else-if="schema && instance">
      <!-- Progress Bar -->
      <div class="mb-6">
        <div class="flex items-center justify-between mb-2">
          <span class="text-gray-400 text-sm">Section {{ currentSectionIndex + 1 }} of {{ formSections.length }}</span>
          <span class="text-gray-400 text-sm">{{ currentSection?.title }}</span>
        </div>
        <div class="h-1 bg-gray-700 rounded-full overflow-hidden">
          <div 
            class="h-full bg-blue-500 transition-all duration-300"
            :style="{ width: `${progress}%` }"
          ></div>
        </div>
      </div>

      <!-- Section Title -->
      <div class="bg-gray-800 rounded-xl p-4 mb-6">
        <h2 class="text-white font-semibold mb-2">{{ currentSection?.title }}</h2>
        <p v-if="currentSection?.description" class="text-gray-400 text-sm">
          {{ currentSection.description }}
        </p>
        
        <!-- Fields -->
        <div class="space-y-4 mt-4">
          <FieldRenderer
            v-for="field in currentFields"
            :key="field.id"
            :field="field"
            :model-value="getFieldValue(field.id)"
            @update:model-value="saveField(field.id, $event)"
          />
        </div>
      </div>

      <!-- Navigation -->
      <div class="flex items-center justify-between">
        <button 
          v-if="!isFirstSection"
          @click="previousSection"
          class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
        >
          Previous
        </button>
        <div v-else></div>

        <button 
          v-if="!isLastSection"
          @click="nextSection"
          class="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-sm"
        >
          Next
        </button>
        <button 
          v-else
          @click="completeForm"
          :disabled="isSaving"
          class="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:bg-green-800 text-white rounded-lg text-sm"
        >
          {{ isSaving ? 'Saving...' : 'Complete Assessment' }}
        </button>
      </div>

      <!-- Triage Summary (when in triage section) -->
      <div v-if="currentSection?.id === 'triage' || isLastSection" class="mt-8">
        <h3 class="text-white font-semibold mb-4">Classification Summary</h3>
        <TriageSummaryCard :instance="instance" />
      </div>
    </template>

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

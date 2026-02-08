<script setup lang="ts">
/**
 * Session Assessment Selection Page
 * 
 * Displays a list of available assessment forms that can be selected for the patient
 * after registration is complete.
 */

import { ref, computed, onMounted } from 'vue';
import type { ClinicalSession } from '~/services/sessionEngine';
import { loadSession } from '~/services/sessionEngine';
import { useAuth } from '@/composables/useAuth';
import { useToast } from '@/composables/useToast';

interface SchemaManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  status: string;
  priority: string;
  metadata: {
    estimatedCompletionMinutes: number;
    riskLevel: string;
    requiresSupervisorReview: boolean;
  };
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
  title: 'Select Assessment - HealthBridge',
  meta: [
    { name: 'description', content: 'Select an assessment form for the patient' }
  ]
});

// ============================================
// State
// ============================================

const session = ref<ClinicalSession | null>(null);
const isLoading = ref(true);
const error = ref<string | null>(null);

// Available assessment schemas (in production, this would come from the manifest)
const availableSchemas = ref<SchemaManifest[]>([
  {
    id: 'peds_respiratory',
    name: 'Pediatric Respiratory Assessment',
    description: 'WHO IMCI protocol for children 2 months to 5 years with cough or difficulty breathing',
    version: '1.0.0',
    status: 'active',
    priority: 'high',
    metadata: {
      estimatedCompletionMinutes: 5,
      riskLevel: 'high',
      requiresSupervisorReview: false
    }
  },
  {
    id: 'peds_diarrhea',
    name: 'Pediatric Diarrhea Assessment',
    description: 'WHO IMCI protocol for children with diarrhea',
    version: '0.9.0',
    status: 'beta',
    priority: 'medium',
    metadata: {
      estimatedCompletionMinutes: 4,
      riskLevel: 'medium',
      requiresSupervisorReview: false
    }
  },
  {
    id: 'peds_fever',
    name: 'Pediatric Fever Assessment',
    description: 'WHO IMCI protocol for children with fever',
    version: '0.5.0',
    status: 'development',
    priority: 'medium',
    metadata: {
      estimatedCompletionMinutes: 6,
      riskLevel: 'high',
      requiresSupervisorReview: true
    }
  }
]);

// ============================================
// Services
// ============================================

const auth = useAuth();
const toastComposable = useToast();

// ============================================
// Computed
// ============================================

/**
 * Filter to show only active and beta schemas
 */
const visibleSchemas = computed(() => {
  return availableSchemas.value.filter(schema => 
    schema.status === 'active' || schema.status === 'beta'
  );
});

/**
 * Session patient info for display
 */
const patientInfo = computed(() => {
  if (!session.value) return null;
  return {
    name: session.value.patientName || 'Unknown Patient',
    triage: session.value.triage || 'unknown'
  };
});

/**
 * Calculate session age (time elapsed since creation)
 */
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
  
  // Fallback to date string for older sessions
  return new Date(created).toLocaleDateString();
});

/**
 * Get status badge color
 */
function getStatusColor(status: string): 'success' | 'warning' | 'info' | 'error' | 'neutral' {
  const colors: Record<string, 'success' | 'warning' | 'info' | 'error' | 'neutral'> = {
    active: 'success',
    beta: 'warning',
    development: 'info',
    deprecated: 'error'
  };
  return (colors[status] || 'neutral') as 'success' | 'warning' | 'info' | 'error' | 'neutral';
}

/**
 * Get priority icon
 */
function getPriorityIcon(priority: string): string {
  const icons: Record<string, string> = {
    high: 'i-heroicons-exclamation-circle',
    medium: 'i-heroicons-minus',
    low: 'i-heroicons-information-circle'
  };
  return icons[priority] || 'i-heroicons-question-mark-circle';
}

// ============================================
// Methods
// ============================================

/**
 * Load session data
 */
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
  } catch (err) {
    console.error('Failed to load session:', err);
    error.value = err instanceof Error ? err.message : 'Failed to load session';
  } finally {
    isLoading.value = false;
  }
}

/**
 * Navigate to form selection
 */
function selectAssessment(schemaId: string) {
  // Build query params with session ID and patient data
  const queryParams = new URLSearchParams({
    sessionId: sessionId.value
  });
  
  // Pass patient data if available
  if (session.value?.patientId) {
    queryParams.set('patientId', session.value.patientId);
  }
  if (session.value?.patientName) {
    queryParams.set('patientName', session.value.patientName);
  }
  if (session.value?.dateOfBirth) {
    queryParams.set('dateOfBirth', session.value.dateOfBirth);
  }
  if (session.value?.gender) {
    queryParams.set('gender', session.value.gender);
  }
  
  navigateTo(`/assessment/peds-respiratory?${queryParams.toString()}`);
}

/**
 * Go back to session
 */
function goBack() {
  navigateTo(`/sessions/${sessionId.value}`);
}

// ============================================
// Lifecycle
// ============================================

onMounted(() => {
  // Auth check
  if (!auth.isAuthenticated.value) {
    navigateTo('/');
    return;
  }
  
  loadSessionData();
});
</script>

<template>
  <div class="min-h-screen bg-gray-900 p-4 sm:p-6">
    <!-- Page Header -->
    <header class="flex items-center gap-4 mb-6">
      <UButton
        icon="i-heroicons-arrow-left"
        color="neutral"
        variant="ghost"
        @click="goBack"
      />
      <div>
        <h1 class="text-xl font-semibold text-white">
          Select Assessment
        </h1>
        <p class="text-sm text-gray-400">
          Choose an assessment form for the patient
        </p>
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
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-gray-400" />
      <span class="ml-3 text-gray-400">Loading session...</span>
    </div>

    <!-- Patient Info Card -->
    <div v-else-if="session" class="bg-gray-800 rounded-xl p-4 mb-6">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-white">
            {{ patientInfo?.name || 'Unknown Patient' }}
          </h2>
          <p class="text-sm text-gray-400">
            Session {{ session.id.slice(7, 11) }} • {{ sessionAge }}
          </p>
        </div>
        <UBadge
          :color="session.triage === 'red' ? 'error' : session.triage === 'yellow' ? 'warning' : 'success'"
          variant="subtle"
          size="lg"
        >
          {{ session.triage?.toUpperCase() || 'UNKNOWN' }}
        </UBadge>
      </div>
    </div>

    <!-- Assessment Forms List -->
    <div v-if="!isLoading && !error" class="space-y-4">
      <div class="mb-4">
        <h3 class="text-lg font-medium text-white mb-1">
          Available Assessment Forms
        </h3>
        <p class="text-sm text-gray-400">
          Select an assessment protocol to begin evaluating the patient
        </p>
      </div>

      <!-- Schema Cards -->
      <div
        v-for="schema in visibleSchemas"
        :key="schema.id"
        class="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-primary transition-all cursor-pointer"
        @click="selectAssessment(schema.id)"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-start gap-3">
            <div 
              class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              :class="{
                'bg-blue-900/50': schema.priority === 'high',
                'bg-amber-900/50': schema.priority === 'medium',
                'bg-green-900/50': schema.priority === 'low'
              }"
            >
              <UIcon
                :name="getPriorityIcon(schema.priority)"
                class="w-5 h-5"
                :class="{
                  'text-blue-400': schema.priority === 'high',
                  'text-amber-400': schema.priority === 'medium',
                  'text-green-400': schema.priority === 'low'
                }"
              />
            </div>
            <div>
              <h4 class="font-medium text-white">
                {{ schema.name }}
              </h4>
              <p class="text-sm text-gray-400 mt-1">
                {{ schema.description }}
              </p>
              <div class="flex items-center gap-3 mt-2">
                <UBadge
                  :color="getStatusColor(schema.status)"
                  variant="subtle"
                  size="xs"
                >
                  {{ schema.status }}
                </UBadge>
                <span class="text-xs text-gray-500">
                  {{ schema.metadata.estimatedCompletionMinutes }} min
                </span>
                <span v-if="schema.metadata.requiresSupervisorReview" class="text-xs text-amber-400">
                  Requires supervisor review
                </span>
              </div>
            </div>
          </div>
          <UIcon
            name="i-heroicons-chevron-right"
            class="w-5 h-5 text-gray-500 shrink-0 mt-1"
          />
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="visibleSchemas.length === 0" class="text-center py-8">
        <UIcon name="i-heroicons-document-magnifying-glass" class="w-12 h-12 text-gray-500 mx-auto mb-3" />
        <p class="text-gray-400">No assessment forms available</p>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="mt-8 pt-6 border-t border-gray-800">
      <UButton
        variant="ghost"
        color="neutral"
        block
        @click="goBack"
      >
        <UIcon name="i-heroicons-arrow-left" class="mr-2" />
        Back to Session
      </UButton>
    </div>
  </div>
</template>

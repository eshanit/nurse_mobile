<script setup lang="ts">
/**
 * QueueView Component
 * 
 * Displays the clinical session queue grouped by triage priority
 * (RED → YELLOW → GREEN).
 * 
 * Uses Nuxt UI components for consistent styling.
 */

import { ref, computed, onMounted } from 'vue';
import type { ClinicalSession, SessionQueue } from '~/services/sessionEngine';
import { getOpenSessionsByPriority, createSession, initializeSessionEngine } from '~/services/sessionEngine';
import { logSessionCreated } from '~/services/clinicalTimeline';

interface Props {
  compact?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  compact: false
});

const emit = defineEmits<{
  (e: 'session-click', session: ClinicalSession): void;
  (e: 'session-action', session: ClinicalSession, action: string): void;
  (e: 'new-session'): void;
  (e: 'refresh'): void;
}>();

// ============================================
// State
// ============================================

const queue = ref<SessionQueue>({
  red: [],
  yellow: [],
  green: []
});

const isLoading = ref(true);
const isRefreshing = ref(false);
const error = ref<string | null>(null);

// ============================================
// Computed
// ============================================

/**
 * Total session count
 */
const totalCount = computed(() => {
  return queue.value.red.length + queue.value.yellow.length + queue.value.green.length;
});

/**
 * Queue section configurations
 */
const sections = computed(() => [
  {
    key: 'red',
    label: 'Red',
    description: 'Urgent - Immediate attention required',
    sessions: queue.value.red,
    color: 'error',
    icon: 'i-heroicons-exclamation-circle'
  },
  {
    key: 'yellow',
    label: 'Yellow',
    description: 'Semi-urgent - Assessment needed soon',
    sessions: queue.value.yellow,
    color: 'warning',
    icon: 'i-heroicons-exclamation-triangle'
  },
  {
    key: 'green',
    label: 'Green',
    description: 'Non-urgent - Routine assessment',
    sessions: queue.value.green,
    color: 'success',
    icon: 'i-heroicons-check-circle'
  }
]);

// ============================================
// Methods
// ============================================

/**
 * Load sessions from the engine
 */
async function loadSessions() {
  try {
    isLoading.value = true;
    error.value = null;
    
    // Ensure engine is initialized
    await initializeSessionEngine();
    
    // Load queue
    queue.value = await getOpenSessionsByPriority();
  } catch (err) {
    console.error('Failed to load queue:', err);
    error.value = err instanceof Error ? err.message : 'Failed to load sessions';
  } finally {
    isLoading.value = false;
  }
}

/**
 * Refresh the queue
 */
async function refresh() {
  isRefreshing.value = true;
  await loadSessions();
  emit('refresh');
  isRefreshing.value = false;
}

/**
 * Create a new session
 */
async function handleNewSession() {
  try {
    isLoading.value = true;
    error.value = null;
    
    // Create session
    const session = await createSession();
    
    // Log creation event
    await logSessionCreated(session.id);
    
    // Reload queue
    await loadSessions();
    
    // Emit event
    emit('new-session');
    
    // Navigate to the new session
    navigateTo(`/sessions/${session.id}`);
  } catch (err) {
    console.error('Failed to create session:', err);
    error.value = err instanceof Error ? err.message : 'Failed to create session';
  } finally {
    isLoading.value = false;
  }
}

/**
 * Handle session click
 */
function handleSessionClick(session: ClinicalSession) {
  emit('session-click', session);
}

/**
 * Handle session action
 */
function handleSessionAction(session: ClinicalSession, action: string) {
  emit('session-action', session, action);
}

// ============================================
// Lifecycle
// ============================================

onMounted(() => {
  loadSessions();
});
</script>

<template>
  <div class="queue-view">
    <!-- Header -->
    <header class="flex items-center gap-4 mb-6">
      <UButton
        icon="i-heroicons-arrow-left"
        color="neutral"
        variant="ghost"
        to="/dashboard"
      />
      <div class="flex-1">
        <h2 class="text-xl font-semibold text-white">Patient Queue</h2>
        <p class="text-sm text-gray-400">{{ totalCount }} patient{{ totalCount !== 1 ? 's' : '' }} waiting</p>
      </div>
      
      <!-- Sync Status Indicator -->
      <div class="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-full">
        <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span class="text-gray-300 text-sm">Online</span>
      </div>
      
      <div class="flex items-center gap-2">
        <!-- Refresh Button -->
        <UButton
          icon="i-heroicons-arrow-path"
          color="neutral"
          variant="ghost"
          :loading="isRefreshing"
          @click="refresh"
        />
        
        <!-- New Session Button -->
        <UButton
          icon="i-heroicons-plus"
          color="primary"
          @click="handleNewSession"
        >
          New Session
        </UButton>
      </div>
    </header>
    
    <!-- Error State -->
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :close-button="{ icon: 'i-heroicons-x-mark', color: 'gray', variant: 'ghost' }"
      @close="error = null"
    >
      {{ error }}
    </UAlert>
    
    <!-- Loading State -->
    <div v-if="isLoading && totalCount === 0" class="flex items-center justify-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-gray-400" />
      <span class="ml-3 text-gray-500">Loading queue...</span>
    </div>
    
    <!-- Empty State -->
    <UCard
      v-else-if="!isLoading && totalCount === 0"
      class="text-center py-12 bg-gray-800"
    >
      <template #header>
        <div class="hidden"></div>
      </template>
      <UIcon name="i-heroicons-users" class="w-12 h-12 mx-auto text-gray-400 mb-4" />
      <h3 class="text-lg font-medium text-white mb-2">
        No patients waiting
      </h3>
      <p class="text-gray-400 mb-4">
        Start a new clinical session to begin.
      </p>
      <UButton
        icon="i-heroicons-plus"
        color="primary"
        @click="handleNewSession"
      >
        New Session
      </UButton>
    </UCard>
    
    <!-- Queue Sections -->
    <div v-else class="space-y-6">
      <template v-for="section in sections" :key="section.key">
        <!-- Section Header -->
        <div
          v-if="section.sessions.length > 0"
          class="flex items-center gap-3 pb-2 border-b border-gray-200 dark:border-gray-700"
        >
          <UIcon
            :name="section.icon"
            :class="{
              'text-red-500': section.color === 'error',
              'text-amber-500': section.color === 'warning',
              'text-green-500': section.color === 'success'
            }"
            class="w-5 h-5"
          />
          <div>
            <h3 class="font-semibold text-gray-900 dark:text-white">
              {{ section.label }}
            </h3>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              {{ section.description }}
            </p>
          </div>
          <UBadge
            :color="section.color as 'error' | 'warning' | 'success' | 'neutral'"
            variant="solid"
            size="sm"
            class="ml-auto"
          >
            {{ section.sessions.length }}
          </UBadge>
        </div>
        
        <!-- Section Sessions -->
        <div
          v-if="section.sessions.length > 0"
          class="space-y-3"
          :class="{ 'pl-4': compact }"
        >
          <ClinicalSessionCard
            v-for="session in section.sessions"
            :key="session.id"
            :session="session"
            :compact="compact"
            @click="handleSessionClick"
            @action="handleSessionAction"
          />
        </div>
      </template>
    </div>
  </div>
</template>

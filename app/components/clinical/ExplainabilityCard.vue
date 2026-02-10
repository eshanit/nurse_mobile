<template>
  <div v-if="model" class="bg-gray-800 rounded-xl border p-6" :class="cardBorderClass">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6 pb-4 border-b" :class="borderBottomClass">
      <div class="flex items-center gap-3">
        <!-- Priority Badge -->
        <div class="flex items-center gap-2">
          <div :class="priorityIconClass" class="w-8 h-8 rounded-full flex items-center justify-center">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              class="h-4 w-4" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                stroke-linecap="round" 
                stroke-linejoin="round" 
                stroke-width="2" 
                :d="priorityIconPath" 
              />
            </svg>
          </div>
          <span :class="priorityTextClass" class="font-semibold text-sm">
            {{ model.classification.priority.toUpperCase() }}
          </span>
        </div>
        
        <!-- Classification Info -->
        <div class="ml-2">
          <h3 class="text-white font-medium">{{ model.classification.label }}</h3>
          <p class="text-gray-400 text-xs">{{ model.classification.protocol }}</p>
        </div>
      </div>
    </div>

    <!-- Why this classification? -->
    <div class="mb-6">
      <div class="flex items-center gap-2 mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h4 class="text-white font-medium">Why this classification?</h4>
      </div>
      <ul class="space-y-3">
        <li 
          v-for="(trigger, index) in model.reasoning.triggers" 
          :key="index" 
          class="flex items-start gap-3 p-3 bg-gray-700/30 rounded-lg"
        >
          <div class="flex-shrink-0 w-6 h-6 rounded-full bg-blue-900/30 flex items-center justify-center mt-0.5">
            <span class="text-blue-400 text-xs font-bold">{{ index + 1 }}</span>
          </div>
          <div class="flex-1">
            <div class="flex items-baseline gap-2 mb-1">
              <code class="text-sm text-white bg-gray-700 px-2 py-1 rounded">{{ trigger.value }}</code>
              <span class="text-gray-400 text-sm">→</span>
              <span class="text-white text-sm font-medium">{{ trigger.clinicalMeaning }}</span>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <!-- Summary -->
    <div v-if="model.reasoning.clinicalNarrative" class="mb-6">
      <div class="flex items-center gap-2 mb-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h4 class="text-white font-medium">Summary</h4>
      </div>
      <p class="text-gray-300 text-sm leading-relaxed p-3 bg-gray-700/30 rounded-lg">
        {{ model.reasoning.clinicalNarrative }}
      </p>
    </div>

    <!-- Recommended Actions -->
    <div class="mb-6">
      <div class="flex items-center gap-2 mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <h4 class="text-white font-medium">Recommended Actions</h4>
      </div>
      <ul class="space-y-2">
        <li 
          v-for="action in model.recommendedActions" 
          :key="action.code" 
          class="flex items-start gap-3 p-3 bg-gray-700/30 rounded-lg hover:bg-gray-700/50 transition-colors"
        >
          <div class="flex-shrink-0 w-5 h-5 rounded-full bg-yellow-900/30 flex items-center justify-center mt-0.5">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div class="flex-1">
            <span class="text-white text-sm font-medium block mb-1">{{ action.label }}</span>
            <span v-if="action.justification" class="text-gray-400 text-xs block">
              {{ action.justification }}
            </span>
          </div>
        </li>
      </ul>
    </div>

    <!-- Footer -->
    <div class="pt-4 border-t border-gray-700">
      <!-- Safety Notes -->
      <div v-if="model.safetyNotes?.length" class="mb-4">
        <div class="flex flex-wrap gap-2">
          <span 
            v-for="(note, index) in model.safetyNotes" 
            :key="index"
            class="text-xs text-gray-400 bg-gray-700/50 px-3 py-1.5 rounded-full"
          >
            {{ note }}
          </span>
        </div>
      </div>
      
      <!-- Audit Info -->
      <div class="flex items-center justify-between text-xs text-gray-500">
        <span>Clinical decision support</span>
        <span>{{ formatTimestamp(model.timestamp) }}</span>
      </div>
    </div>
  </div>

  <!-- Error State -->
  <div v-else class="bg-gray-800 rounded-xl border border-gray-700 p-6 text-center">
    <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-gray-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <p class="text-gray-400">Explainability data unavailable</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ExplainabilityRecord } from '~/types/explainability';

const props = defineProps<{
  model: ExplainabilityRecord | null;
}>();

const cardBorderClass = computed(() => {
  switch (props.model?.classification.priority) {
    case 'red': return 'border-red-700/30';
    case 'yellow': return 'border-yellow-700/30';
    case 'green': return 'border-green-700/30';
    default: return 'border-gray-700';
  }
});

const borderBottomClass = computed(() => {
  switch (props.model?.classification.priority) {
    case 'red': return 'border-red-700/20';
    case 'yellow': return 'border-yellow-700/20';
    case 'green': return 'border-green-700/20';
    default: return 'border-gray-700';
  }
});

const priorityIconClass = computed(() => {
  switch (props.model?.classification.priority) {
    case 'red': return 'bg-red-900/30 text-red-400';
    case 'yellow': return 'bg-yellow-900/30 text-yellow-400';
    case 'green': return 'bg-green-900/30 text-green-400';
    default: return 'bg-gray-700 text-gray-400';
  }
});

const priorityTextClass = computed(() => {
  switch (props.model?.classification.priority) {
    case 'red': return 'text-red-400';
    case 'yellow': return 'text-yellow-400';
    case 'green': return 'text-green-400';
    default: return 'text-gray-400';
  }
});

const priorityIconPath = computed(() => {
  switch (props.model?.classification.priority) {
    case 'red':
      return 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z';
    case 'yellow':
      return 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
    case 'green':
      return 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z';
    default:
      return 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
  }
});

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
</script>
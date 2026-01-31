<script setup lang="ts">

// AUTO-GENERATED FROM clinical-form-engine.md
// DO NOT EDIT WITHOUT UPDATING THE SPEC

import { computed } from 'vue';
import type { ClinicalFormInstance } from '~/types/clinical-form';
import { formEngine } from '@/services/formEngine';

const props = defineProps<{
  instance: ClinicalFormInstance;
}>();

const triagePriority = computed(() => props.instance.calculated?.triagePriority || 'green');
const triageClassification = computed(() => {
  const priority = triagePriority.value;
  switch (priority) {
    case 'red':
      return 'URGENT REFERRAL';
    case 'yellow':
      return 'Needs Treatment';
    default:
      return 'Home Care';
  }
});

const priorityConfig = computed(() => {
  const priority = triagePriority.value;
  switch (priority) {
    case 'red':
      return {
        bgClass: 'bg-red-900/50',
        borderClass: 'border-red-600',
        textClass: 'text-red-400',
        icon: '🚨',
        label: 'RED',
      };
    case 'yellow':
      return {
        bgClass: 'bg-yellow-900/50',
        borderClass: 'border-yellow-600',
        textClass: 'text-yellow-400',
        icon: '⚠️',
        label: 'YELLOW',
      };
    default:
      return {
        bgClass: 'bg-green-900/50',
        borderClass: 'border-green-600',
        textClass: 'text-green-400',
        icon: '✓',
        label: 'GREEN',
      };
  }
});

const config = computed(() => priorityConfig.value);
</script>

<template>
  <div 
    class="triage-summary-card p-4 rounded-lg border-2"
    :class="[config.bgClass, config.borderClass]"
  >
    <div class="flex items-center gap-3 mb-4">
      <span class="text-3xl">{{ config.icon }}</span>
      <div>
        <span 
          class="text-2xl font-bold"
          :class="config.textClass"
        >
          {{ config.label }}
        </span>
        <p class="text-white font-medium">
          {{ triageClassification }}
        </p>
      </div>
    </div>

    <!-- Triage Details -->
    <div class="space-y-2 text-sm">
      <!-- Danger Signs -->
      <div v-if="instance.calculated?.hasDangerSign" class="flex items-center gap-2">
        <span class="text-red-400">⚠️</span>
        <span class="text-gray-300">Danger signs present</span>
      </div>

      <!-- Fast Breathing -->
      <div v-if="instance.calculated?.fastBreathing" class="flex items-center gap-2">
        <span class="text-yellow-400">🫁</span>
        <span class="text-gray-300">Fast breathing detected</span>
      </div>

      <!-- Respiratory Rate -->
      <div v-if="instance.answers?.resp_rate" class="flex items-center gap-2">
        <span class="text-blue-400">📊</span>
        <span class="text-gray-300">
          RR: {{ instance.answers.resp_rate }}/min
        </span>
      </div>

      <!-- Oxygen Saturation -->
      <div v-if="instance.answers?.oxygen_sat" class="flex items-center gap-2">
        <span class="text-purple-400">💨</span>
        <span class="text-gray-300">
          SpO2: {{ instance.answers.oxygen_sat }}%
        </span>
      </div>
    </div>

    <!-- Recommended Actions -->
    <div class="mt-4 pt-4 border-t border-gray-700">
      <h4 class="text-white font-medium mb-2">Recommended Actions:</h4>
      <ul class="space-y-1 text-sm text-gray-300">
        <li v-if="triagePriority === 'red'" class="flex items-center gap-2">
          <span class="text-red-400">→</span>
          Refer URGENTLY to hospital
        </li>
        <li v-if="triagePriority === 'red'" class="flex items-center gap-2">
          <span class="text-red-400">→</span>
          Give first dose of antibiotics if trained
        </li>
        <li v-if="triagePriority === 'yellow'" class="flex items-center gap-2">
          <span class="text-yellow-400">→</span>
          Give oral antibiotics
        </li>
        <li v-if="triagePriority === 'yellow'" class="flex items-center gap-2">
          <span class="text-yellow-400">→</span>
          Follow up in 2 days
        </li>
        <li v-if="triagePriority === 'green'" class="flex items-center gap-2">
          <span class="text-green-400">→</span>
          Advise mother on home care
        </li>
        <li v-if="triagePriority === 'green'" class="flex items-center gap-2">
          <span class="text-green-400">→</span>
          Return if symptoms worsen
        </li>
      </ul>
    </div>
  </div>
</template>

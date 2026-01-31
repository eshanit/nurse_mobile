<script setup lang="ts">

// AUTO-GENERATED FROM clinical-form-engine.md
// DO NOT EDIT WITHOUT UPDATING THE SPEC

import { computed } from 'vue';
import type { FieldDefinition } from '~/types/clinical-form';

const props = defineProps<{
  field: FieldDefinition;
  modelValue: any;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: any): void;
}>();

const fieldId = computed(() => props.field.id);
const fieldType = computed(() => props.field.type);
const label = computed(() => props.field.label);
const required = computed(() => props.field.required);
const placeholder = computed(() => props.field.placeholder || '');
const helpText = computed(() => props.field.helpText);
const options = computed(() => (props.field.config as any)?.options || []);
const min = computed(() => (props.field.config as any)?.min);
const max = computed(() => (props.field.config as any)?.max);
const step = computed(() => (props.field.config as any)?.step);
const suffix = computed(() => (props.field.config as any)?.suffix);

const clinicalNote = computed(() => props.field.clinicalNote);
const uiHint = computed(() => props.field.uiHint);

const inputClass = computed(() => ({
  'w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2': true,
  'focus:ring-red-500': uiHint.value === 'urgent',
  'focus:ring-yellow-500': uiHint.value === 'warning',
  'focus:ring-blue-500': uiHint.value === 'normal' || !uiHint.value,
  'border-red-600': uiHint.value === 'urgent',
  'border-yellow-600': uiHint.value === 'warning',
}));

function updateValue(value: any) {
  emit('update:modelValue', value);
}
</script>

<template>
  <div class="field-renderer mb-4" :class="{ 'has-clinical-note': clinicalNote }">
    <label :for="fieldId" class="block text-gray-300 text-sm mb-2">
      {{ label }}
      <span v-if="required" class="text-red-400">*</span>
    </label>

    <!-- Clinical Note (for danger signs, urgent items) -->
    <div v-if="clinicalNote" class="mb-2 p-2 rounded text-xs" :class="{
      'bg-red-900/30 text-red-300': uiHint === 'urgent',
      'bg-yellow-900/30 text-yellow-300': uiHint === 'warning',
      'bg-blue-900/30 text-blue-300': !uiHint,
    }">
      {{ clinicalNote }}
    </div>

    <!-- Text Input -->
    <input
      v-if="fieldType === 'text'"
      :id="fieldId"
      type="text"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :class="inputClass"
      @input="updateValue(($event.target as HTMLInputElement).value)"
    />

    <!-- Number Input -->
    <div v-else-if="fieldType === 'number'" class="relative">
      <input
        :id="fieldId"
        type="number"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :min="min"
        :max="max"
        :step="step"
        :class="inputClass"
        @input="updateValue(($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : null)"
      />
      <span v-if="suffix" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
        {{ suffix }}
      </span>
    </div>

    <!-- Select -->
    <select
      v-else-if="fieldType === 'select'"
      :id="fieldId"
      :value="modelValue"
      :disabled="disabled"
      :class="inputClass"
      @change="updateValue(($event.target as HTMLSelectElement).value)"
    >
      <option value="">Select...</option>
      <option v-for="opt in options" :key="opt" :value="opt">
        {{ opt }}
      </option>
    </select>

    <!-- Checkbox -->
    <div v-else-if="fieldType === 'checkbox'" class="flex items-center gap-3">
      <input
        :id="fieldId"
        type="checkbox"
        :checked="modelValue"
        :disabled="disabled"
        class="w-5 h-5 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
        @change="updateValue(($event.target as HTMLInputElement).checked)"
      />
      <label :for="fieldId" class="text-gray-300 text-sm">
        {{ field.description || label }}
      </label>
    </div>

    <!-- Timer (for respiratory rate counting) -->
    <div v-else-if="fieldType === 'timer'" class="flex items-center gap-3">
      <button
        type="button"
        class="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-lg"
        @click="updateValue(60)"
      >
        Start 60s Timer
      </button>
      <span class="text-gray-400">{{ modelValue || 0 }} breaths counted</span>
    </div>

    <!-- Help Text -->
    <p v-if="helpText" class="mt-1 text-gray-500 text-xs">
      {{ helpText }}
    </p>
  </div>
</template>

/**
 * Clinical Form Engine Composable
 * 
 * REQUIRED for all clinical forms per ARCHITECTURE_RULES.md
 * 
 * Provides a standardized interface for:
 * - Form state management
 * - Field validation with Zod schemas
 * - Encryption and persistence through secureDb
 * - Clinical workflow enforcement
 */

import { ref, computed, shallowRef, type Ref, type ComputedRef } from 'vue';
import { formEngine } from '@/services/formEngine';
import type { 
  ClinicalFormSchema, 
  ClinicalFormInstance, 
  FormSection,
  SaveResult,
  ValidationResult 
} from '~/types/clinical-form';
import type { z } from 'zod';
import { getFieldSchema } from '~/schemas/clinical/fieldSchemas';

interface UseClinicalFormEngineOptions {
  /** Schema ID to load from form engine */
  schemaId: string;
  /** Zod schema for field validation */
  zodSchema?: z.ZodType<unknown>;
  /** Optional custom save handler */
  onSave?: (fieldId: string, value: unknown, instance: ClinicalFormInstance) => Promise<void>;
}

interface UseClinicalFormEngineReturn {
  // State
  formState: any;
  schema: any;
  instance: any;
  isLoading: Ref<boolean>;
  isSaving: Ref<boolean>;
  validationErrors: Ref<Record<string, string>>;
  
  // Computed
  currentSectionIndex: any;
  currentSection: any;
  progress: any;
  triagePriority: any;
  
  // Methods
  initialize: () => Promise<void>;
  saveField: (fieldId: string, value: unknown) => Promise<SaveResult>;
  validateForm: () => Promise<ValidationResult>;
  getFieldValue: (fieldId: string) => unknown;
  setFieldValue: (fieldId: string, value: unknown) => void;
  nextSection: () => Promise<void>;
  previousSection: () => void;
  completeForm: () => Promise<{ allowed: boolean; reason?: string }>;
}

export function useClinicalFormEngine(options: UseClinicalFormEngineOptions): UseClinicalFormEngineReturn {
  // Reactive state
  const isLoading = ref(false);
  const isSaving = ref(false);
  const currentSectionIndex = ref(0);
  const validationErrors = ref<Record<string, string>>({});
  
  // Shallow refs for performance (large objects)
  const schema = shallowRef<ClinicalFormSchema | null>(null);
  const instance = shallowRef<ClinicalFormInstance | null>(null);
  const formState = shallowRef<Record<string, unknown>>({});
  
  // Computed
  const currentSection = computed(() => {
    if (!schema.value?.sections || !instance.value) return undefined;
    return schema.value.sections[currentSectionIndex.value];
  });
  
  const progress = computed(() => {
    if (!schema.value?.sections) return 0;
    return ((currentSectionIndex.value + 1) / schema.value.sections.length) * 100;
  });
  
  const triagePriority = computed(() => instance.value?.calculated?.triagePriority);
  
  // Get user ID for audit logging
  function getUserId(): string {
    if (typeof window !== 'undefined') {
      // Use localStorage directly to avoid Pinia initialization issues
      return localStorage.getItem('healthbridge_device_id') || 'unknown';
    }
    return 'server';
  }
  
  // Initialize form
  async function initialize(): Promise<void> {
    if (isLoading.value) return;
    
    isLoading.value = true;
    validationErrors.value = {};
    
    try {
      // Load schema
      const loadedSchema = await formEngine.loadSchema(options.schemaId);
      schema.value = loadedSchema;
      
      // Create new instance
      const newInstance = await formEngine.createInstance(
        options.schemaId,
        getUserId()
      );
      instance.value = newInstance;
      
      // Initialize form state from instance answers
      formState.value = { ...newInstance.answers };
      
      console.log('[useClinicalFormEngine] Initialized successfully');
    } catch (error) {
      console.error('[useClinicalFormEngine] Failed to initialize:', error);
      throw error;
    } finally {
      isLoading.value = false;
    }
  }
  
  // Save a field value with validation
  async function saveField(fieldId: string, value: unknown): Promise<SaveResult> {
    if (!instance.value) {
      return { success: false, formInstance: null as any };
    }
    
    try {
      // 1. Validate with Zod schema if provided
      // Use partial validation for incremental field entry (only validate the field being saved)
      if (options.zodSchema) {
        // Get the field schema for the specific field
        const fieldSchema = getFieldSchema(fieldId);
        
        if (fieldSchema) {
          // Validate just this field
          const fieldValidation = fieldSchema.safeParse(value);
          
          if (!fieldValidation.success) {
            const errors = fieldValidation.error.format();
            const fieldError = (errors as Record<string, any>)?._errors?.[0] || 'Invalid value';
            validationErrors.value = {
              ...validationErrors.value,
              [fieldId]: fieldError
            };
            
            return {
              success: false,
              formInstance: instance.value,
              validationWarnings: [{
                fieldId,
                message: fieldError,
                severity: 'warning' as const
              }]
            };
          }
          
          // Clear previous validation error for this field
          const { [fieldId]: _, ...remainingErrors } = validationErrors.value;
          validationErrors.value = remainingErrors;
        }
      }
      
      // 2. Save through ClinicalFormEngine
      const result = await formEngine.saveFieldValue(
        instance.value._id,
        fieldId,
        value,
        getUserId()
      );
      
      if (!result.success) {
        return {
          success: false,
          formInstance: instance.value
        };
      }
      
      // 3. Update local state
      instance.value = result.formInstance;
      formState.value = { ...result.formInstance.answers };
      
      // 4. Call custom save handler if provided
      if (options.onSave) {
        await options.onSave(fieldId, value, result.formInstance);
      }
      
      return { success: true, formInstance: result.formInstance };
      
    } catch (error) {
      console.error('[useClinicalFormEngine] Failed to save field:', error);
      return {
        success: false,
        formInstance: instance.value,
        validationWarnings: [{
          fieldId,
          message: error instanceof Error ? error.message : 'Failed to save field',
          severity: 'warning' as const
        }]
      };
    }
  }
  
  // Validate entire form
  async function validateForm(): Promise<ValidationResult> {
    if (!instance.value) {
      return { valid: false, errors: ['Form not initialized'] };
    }
    
    // Use validateTransition as a proxy for instance validation
    const result = await formEngine.validateTransition(instance.value._id, instance.value.currentStateId);
    return { valid: result.valid, errors: result.valid ? undefined : result.errors };
  }
  
  // Get field value from form state
  function getFieldValue(fieldId: string): unknown {
    return formState.value[fieldId];
  }
  
  // Set field value directly (for programmatic updates)
  function setFieldValue(fieldId: string, value: unknown): void {
    formState.value = {
      ...formState.value,
      [fieldId]: value
    };
  }
  
  // Navigate to next section
  async function nextSection(): Promise<void> {
    if (!schema.value?.workflow || !instance.value) return;
    
    // Get the current workflow state
    const currentInstance = instance.value;
    const currentState = schema.value.workflow.find((s: any) => s.id === currentInstance.currentStateId);
    if (!currentState || !currentState.allowedTransitions || currentState.allowedTransitions.length === 0) return;
    
    // Get the next state ID from allowed transitions (first one)
    const nextStateId = currentState.allowedTransitions[0] as string;
    
    // Find the section index for the next state
    const nextSectionIndex = schema.value.sections.findIndex((s: any) => s.id === nextStateId);
    if (nextSectionIndex === -1) return;
    
    // Validate transition before proceeding
    const validation = await formEngine.validateTransition(
      currentInstance._id,
      nextStateId
    );
    
    if (!validation.valid && validation.errors && validation.errors.length > 0) {
      throw new Error(validation.errors.join(', '));
    }
    
    // Update the instance state
    currentInstance.currentStateId = nextStateId;
    currentSectionIndex.value = nextSectionIndex;
  }
  
  // Navigate to previous section
  function previousSection(): void {
    if (currentSectionIndex.value > 0) {
      currentSectionIndex.value--;
    }
  }
  
  // Complete the form
  async function completeForm(): Promise<{ allowed: boolean; reason?: string }> {
    if (!instance.value) {
      return { allowed: false, reason: 'Form not initialized' };
    }
    
    isSaving.value = true;
    
    try {
      const result = await formEngine.transitionState(
        instance.value._id,
        'complete',
        getUserId()
      );
      
      if (result.allowed) {
        instance.value = await formEngine.loadInstance(instance.value._id);
        return { allowed: true };
      }
      
      return { allowed: false, reason: result.reason };
    } catch (error) {
      console.error('[useClinicalFormEngine] Failed to complete form:', error);
      return {
        allowed: false,
        reason: error instanceof Error ? error.message : 'Failed to complete form'
      };
    } finally {
      isSaving.value = false;
    }
  }
  
  return {
    // State
    formState,
    schema,
    instance,
    isLoading,
    isSaving,
    validationErrors,
    
    // Computed
    currentSectionIndex,
    currentSection,
    progress,
    triagePriority,
    
    // Methods
    initialize,
    saveField,
    validateForm,
    getFieldValue,
    setFieldValue,
    nextSection,
    previousSection,
    completeForm
  };
}



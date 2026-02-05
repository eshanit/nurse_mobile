# **HealthBridge Frontliner App - Implementation Covenant**

**Project:** HealthBridge Companion  
**Status:** AUTHORITATIVE - NON-NEGOTIABLE  
**Effective:** 2026-01-31  
**For:** KiloCode Development Team  

---

## 🚨 **ARCHITECTURE RULES - ABSOLUTE REQUIREMENTS**

### **1. UI FRAMEWORK - MANDATORY**
All user interfaces **MUST** be built using **NuxtUI v4** components. No exceptions.

| Component Type | Must Use | Forbidden |
|----------------|----------|-----------|
| Forms | `UForm`, `UFormGroup`, `UFormField` | `<form>`, `<input>`, manual validation |
| Inputs | `UInput`, `UTextarea` | Raw `<input>`, `<textarea>` |
| Selection | `USelect`, `URadioGroup`, `UCheckbox`, `UToggle` | `<select>`, manual radio/checkbox |
| Buttons | `UButton` | `<button>` |
| Layout | `UCard`, `UContainer`, `UGrid`, `UModal` | Manual CSS grids, basic divs |
| Feedback | `UAlert`, `UProgress`, `USpinner`, `UToast` | Manual alerts, loaders |
| Navigation | `UTabs`, `UBreadcrumb`, `UPagination` | Manual tab systems |

**Example - CORRECT:**
```vue
<template>
  <UForm :schema="clinicalSchema" :state="formState" @submit="handleSubmit">
    <UFormField name="respiratoryRate" label="Respiratory Rate (breaths/min)">
      <UInput 
        v-model="formState.respiratoryRate" 
        type="number" 
        placeholder="Count for 60 seconds"
        :ui="{ icon: 'i-heroicons-heart' }"
      />
    </UFormField>
  </UForm>
</template>
```

**Example - FORBIDDEN:**
```vue
<template>
  <!-- ❌ NEVER DO THIS -->
  <form @submit.prevent="handleSubmit">
    <label>Respiratory Rate</label>
    <input v-model="rr" type="number" />
    <button type="submit">Save</button>
  </form>
</template>
```

### **2. VALIDATION LAYER - MANDATORY**
All form validation **MUST** use **Zod schemas**. No manual validation logic in components.

**Clinical Field Schema Pattern:**
```typescript
// ~/schemas/clinical/fieldSchemas.ts
import { z } from 'zod';

export const pediatricRespiratorySchema = z.object({
  // Basic validation
  ageMonths: z.number()
    .min(2, "Child must be at least 2 months old")
    .max(59, "Child must be under 5 years (59 months)"),
    
  // Clinical validation with WHO thresholds
  respiratoryRate: z.number()
    .min(10, "Rate too low. Re-count for 60 seconds.")
    .max(120, "Rate too high. Verify measurement.")
    .refine(
      (value, ctx) => {
        const ageMonths = ctx.parent.ageMonths;
        const threshold = ageMonths < 12 ? 50 : 40;
        return value <= threshold;
      },
      {
        message: (value, ctx) => {
          const ageMonths = ctx.parent.ageMonths;
          const threshold = ageMonths < 12 ? 50 : 40;
          return `Fast breathing detected (>${threshold}/min). Consider pneumonia.`;
        },
        path: ["respiratoryRate"]
      }
    ),
    
  // Cross-field clinical validation
  dangerSigns: z.object({
    unableToDrink: z.boolean(),
    vomitingEverything: z.boolean(),
    convulsions: z.boolean(),
    lethargic: z.boolean()
  }).refine(
    data => !(data.unableToDrink && !data.lethargic),
    {
      message: "If unable to drink, check lethargy status",
      path: ["dangerSigns", "lethargic"]
    }
  )
});

// Type inference for TypeScript
export type PediatricRespiratoryInput = z.infer<typeof pediatricRespiratorySchema>;
```

### **3. CLINICAL ENGINE INTEGRATION - MANDATORY**
All data operations **MUST** flow through the `ClinicalFormEngine`.

**Component Pattern - REQUIRED:**
```vue
<script setup lang="ts">
// ~/components/clinical/forms/ClinicalForm.vue
import { useClinicalFormEngine } from '~/composables/useClinicalFormEngine';
import { pediatricRespiratorySchema } from '~/schemas/clinical/fieldSchemas';

const { formEngine, formState, saveField, validateForm } = useClinicalFormEngine({
  schemaId: 'peds_respiratory',
  zodSchema: pediatricRespiratorySchema
});

// Field change handler - ONLY approved pattern
const handleFieldChange = async (fieldId: string, value: any) => {
  // 1. Update local state (optimistic UI)
  formState[fieldId] = value;
  
  // 2. Save through clinical engine (MANDATORY)
  const result = await saveField(fieldId, value);
  
  if (!result.success) {
    // 3. Handle clinical validation errors
    showError(result.clinicalError);
  }
};
</script>

<template>
  <UForm :schema="pediatricRespiratorySchema" :state="formState">
    <UFormField name="respiratoryRate">
      <template #label>
        <div class="clinical-field-header">
          <span>Respiratory Rate</span>
          <UBadge color="orange" variant="soft" size="xs">
            Clinical Priority
          </UBadge>
        </div>
      </template>
      <UInput 
        :model-value="formState.respiratoryRate"
        @update:model-value="(val) => handleFieldChange('respiratoryRate', val)"
        type="number"
        :ui="{ 
          base: 'clinical-input',
          icon: { trailing: 'i-heroicons-clock' }
        }"
      />
    </UFormField>
  </UForm>
</template>
```

### **4. FIELD RENDERER ARCHITECTURE - MANDATORY**
All form fields **MUST** use the `FieldRenderer` component.

**FieldRenderer Implementation:**
```vue
<!-- ~/components/clinical/fields/FieldRenderer.vue -->
<script setup lang="ts">
interface Props {
  field: ClinicalFieldDefinition;
  modelValue: any;
  clinicalContext?: ClinicalContext;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:modelValue': [value: any];
  'clinicalWarning': [warning: ClinicalWarning];
}>();

// Field type to NuxtUI component mapping
const componentMap = {
  text: UInput,
  number: UInput,
  select: USelect,
  radio: URadioGroup,
  checkbox: UCheckboxGroup,
  toggle: UToggle,
  date: UInput, // with type="date"
  time: UInput, // with type="time"
  textarea: UTextarea
};

const SelectedComponent = computed(() => 
  componentMap[props.field.type] || UInput
);

const fieldProps = computed(() => {
  const base = {
    modelValue: props.modelValue,
    'onUpdate:modelValue': (val: any) => emit('update:modelValue', val),
    placeholder: props.field.placeholder,
    required: props.field.required
  };
  
  // Type-specific props
  switch (props.field.type) {
    case 'number':
      return { ...base, type: 'number' };
    case 'select':
      return { ...base, options: props.field.options };
    case 'date':
      return { ...base, type: 'date' };
    default:
      return base;
  }
});
</script>

<template>
  <UFormField 
    :name="field.id" 
    :label="field.label"
    :description="field.clinicalNote"
    :required="field.required"
  >
    <component
      :is="SelectedComponent"
      v-bind="fieldProps"
      :ui="{
        base: field.uiHint === 'urgent' ? 'clinical-input-urgent' : '',
        color: field.uiHint === 'urgent' ? 'red' : 'primary'
      }"
    />
    
    <!-- Clinical context display -->
    <template v-if="field.clinicalNote" #help>
      <UAlert
        :title="field.clinicalNote"
        :icon="field.uiHint === 'urgent' ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-information-circle'"
        :color="field.uiHint === 'urgent' ? 'red' : 'blue'"
        variant="soft"
        size="xs"
        class="mt-2"
      />
    </template>
  </UFormField>
</template>
```

### **5. SECURITY & PERSISTENCE - MANDATORY**
All data **MUST** be encrypted and saved through `secureDb`.

**Data Flow Pattern:**
```typescript
// ~/composables/useClinicalFormEngine.ts
export const useClinicalFormEngine = (options: UseClinicalFormEngineOptions) => {
  const saveField = async (fieldId: string, value: any): Promise<SaveResult> => {
    try {
      // 1. Validate with Zod schema
      const validation = options.zodSchema.safeParse({
        ...formState.value,
        [fieldId]: value
      });
      
      if (!validation.success) {
        return {
          success: false,
          clinicalError: validation.error.format()[fieldId]?._errors[0]
        };
      }
      
      // 2. Save through ClinicalFormEngine
      const engineResult = await clinicalFormEngine.saveFieldValue(
        formInstanceId.value,
        fieldId,
        value
      );
      
      if (!engineResult.success) {
        return {
          success: false,
          clinicalError: engineResult.reason
        };
      }
      
      // 3. Encrypt and persist
      await secureDb.put(engineResult.formInstance);
      
      return { success: true };
      
    } catch (error) {
      // 4. Handle errors with user-friendly messages
      console.error('Clinical save failed:', error);
      return {
        success: false,
        clinicalError: 'Failed to save clinical data. Working offline?'
      };
    }
  };
  
  return { saveField, formState, validateForm };
};
```

### **6. CLINICAL WORKFLOW ENFORCEMENT**
All clinical forms **MUST** enforce the workflow state machine.

**Workflow Guard Implementation:**
```vue
<!-- ~/components/clinical/workflow/WorkflowGuard.vue -->
<script setup lang="ts">
const { currentWorkflowState, allowedTransitions } = useClinicalWorkflow();

// Navigation guard - prevents protocol violations
const route = useRoute();
const router = useRouter();

router.beforeEach((to, from, next) => {
  const targetState = to.params.workflowState as string;
  
  if (!allowedTransitions.value.includes(targetState)) {
    // Show clinical error modal
    useToast().add({
      title: 'Clinical Protocol Violation',
      description: `Cannot skip from ${currentWorkflowState.value} to ${targetState}`,
      icon: 'i-heroicons-exclamation-triangle',
      color: 'red',
      timeout: 5000
    });
    
    // Block navigation
    next(false);
  } else {
    next();
  }
});
</script>
```

### **7. ERROR HANDLING & USER FEEDBACK**
All errors **MUST** use NuxtUI toast system with clinical context.

**Error Handler Pattern:**
```typescript
// ~/utils/clinicalErrorHandler.ts
export const handleClinicalError = (error: ClinicalError) => {
  const toast = useToast();
  
  switch (error.type) {
    case 'validation_error':
      toast.add({
        title: 'Clinical Validation Error',
        description: error.message,
        icon: 'i-heroicons-document-magnifying-glass',
        color: 'orange',
        actions: [{
          label: 'View Details',
          click: () => showValidationDetails(error)
        }]
      });
      break;
      
    case 'protocol_violation':
      toast.add({
        title: 'Protocol Violation',
        description: error.message,
        icon: 'i-heroicons-exclamation-triangle',
        color: 'red',
        timeout: 10000
      });
      break;
      
    case 'sync_error':
      toast.add({
        title: 'Sync Issue',
        description: 'Data saved locally. Will sync when online.',
        icon: 'i-heroicons-signal',
        color: 'blue',
        timeout: 3000
      });
      break;
  }
};
```

---

## 🚫 **FORBIDDEN PATTERNS - IMMEDIATE REJECTION**

If KiloCode attempts any of these, **STOP AND ASK**:

1. **Raw HTML inputs** (`<input>`, `<select>`, `<button>`)
2. **Manual validation** in Vue components (no `if (!value) throw error`)
3. **Direct state mutation** (no `formState.value.rr = 45` without clinical engine)
4. **Bypassing encryption** (no `localStorage.setItem('patient-data', json)`)
5. **Custom CSS for basic components** (use NuxtUI variants instead)
6. **Inline styles for layout** (use NuxtUI `UGrid`, `UFlex`)
7. **Manual modal/dialog creation** (use `UModal`)
8. **Custom toast/notification systems** (use `useToast()`)

---

## ✅ **PRE-IMPLEMENTATION CHECKLIST**

Before writing ANY code, KiloCode **MUST** verify:

### **For New Components:**
- [ ] Uses NuxtUI components exclusively
- [ ] Has corresponding Zod schema defined
- [ ] Integrates with `ClinicalFormEngine`
- [ ] Handles errors with `useToast()`
- [ ] Includes audit logging for clinical actions
- [ ] Works offline (no external dependencies)
- [ ] Follows clinical workflow state machine

### **For Form Fields:**
- [ ] Uses `FieldRenderer.vue` wrapper
- [ ] Maps to NuxtUI component
- [ ] Includes clinical context/help text
- [ ] Has appropriate `uiHint` (urgent/warning/normal)
- [ ] Validates via Zod schema
- [ ] Auto-saves on change

### **For Data Operations:**
- [ ] Goes through `secureDb` service
- [ ] Encrypted at rest
- [ ] Includes audit log entry
- [ ] Handles offline queuing
- [ ] Respects clinical priority (RED first)

---

## 🆘 **ARCHITECTURE VIOLATION RESPONSE PROTOCOL**

If a request violates these rules, KiloCode **MUST** respond:

```
🚨 ARCHITECTURE VIOLATION DETECTED

Request: [Brief description of requested code]
Violation: [Specific rule violated - e.g., "Raw HTML input instead of UInput"]
Rule Reference: [e.g., "Section 1.1 - UI Framework"]

Required Fix: [Specific alternative using approved patterns]
Example: 
```vue
<!-- Use this instead -->
<UInput v-model="value" type="number" placeholder="Enter value" />
```

Please confirm you want to proceed with the corrected implementation.
```

**DO NOT** proceed with violating code. Wait for confirmation of corrected approach.

---

## 📁 **PROJECT STRUCTURE ENFORCEMENT**

```
app/
├── components/
│   ├── clinical/
│   │   ├── forms/          # Form-level components
│   │   ├── fields/         # FieldRenderer and field types
│   │   ├── workflow/       # State machine components
│   │   └── display/        # Clinical data display
│   └── ui/                 # NuxtUI wrapper components (if needed)
├── composables/
│   ├── useClinicalFormEngine.ts   # REQUIRED for all forms
│   └── useClinicalWorkflow.ts     # REQUIRED for workflow
├── schemas/
│   ├── clinical/           # Zod schemas for forms
│   └── validation/         # Custom Zod validators
└── services/
    ├── formEngine.ts       # ClinicalFormEngine
    ├── secureDb.ts         # Encrypted persistence
    └── clinicalCalculations.ts  # WHO IMCI logic
```

---

## 🏁 **IMPLEMENTATION SUCCESS CRITERIA**

Code is **APPROVED** when:

1. **Zero raw HTML** - All UI uses NuxtUI
2. **Zero manual validation** - All validation uses Zod
3. **Zero direct state mutation** - All changes go through clinical engine
4. **Zero unencrypted data** - All persistence uses secureDb
5. **Zero protocol violations** - Workflow state machine enforced
6. **Zero offline failures** - All features work without internet
7. **Zero audit gaps** - Every clinical action logged

---

**This document is the single source of truth for HealthBridge implementation.**  
Any deviation requires explicit approval from the clinical lead and technical architect.

**KiloCode: Acknowledge understanding and compliance before proceeding.**
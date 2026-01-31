<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="navigation-guard-overlay" @click="handleOverlayClick">
        <div class="navigation-guard-modal" @click.stop>
          <header class="modal-header">
            <div class="warning-icon">⚠️</div>
            <h2 class="modal-title">{{ title }}</h2>
          </header>

          <div class="modal-body">
            <p class="warning-message">{{ message }}</p>
            
            <div v-if="blockedTransition" class="block-details">
              <h4>Why can't you proceed?</h4>
              <ul class="block-reasons">
                <li v-for="reason in blockedTransition.reasons" :key="reason">
                  {{ reason }}
                </li>
              </ul>
            </div>

            <div v-if="requiredFields.length > 0" class="required-fields">
              <h4>Complete these first:</h4>
              <ul class="field-list">
                <li v-for="field in requiredFields" :key="field.id">
                  <span class="field-icon">{{ field.completed ? '✓' : '○' }}</span>
                  <span :class="{ 'is-complete': field.completed }">{{ field.label }}</span>
                </li>
              </ul>
            </div>
          </div>

          <footer class="modal-footer">
            <button 
              v-if="allowOverride" 
              class="btn btn-secondary"
              @click="handleProceedAnyway"
            >
              Proceed Anyway
            </button>
            <button class="btn btn-primary" @click="handleGoBack">
              Go Back
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * NavigationGuard.vue - Prevents Protocol Violation
 * STATUS: SPEC-COMPLIANT IMPLEMENTATION
 * PURPOSE: Modal guard that prevents clinical protocol violations by blocking invalid transitions
 * 
 * Usage:
 * <NavigationGuard
 *   :is-open="showGuard"
 *   :blocked-transition="blockedTransition"
 *   :required-fields="requiredFields"
 *   @proceed-anyway="handleOverride"
 *   @go-back="handleGoBack"
 * />
 */

interface BlockedTransition {
  from: string;
  to: string;
  reasons: string[];
}

interface RequiredField {
  id: string;
  label: string;
  completed: boolean;
}

interface Props {
  isOpen: boolean;
  title?: string;
  message?: string;
  blockedTransition?: BlockedTransition | null;
  requiredFields?: RequiredField[];
  allowOverride?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Cannot Proceed',
  message: 'This transition would violate the clinical protocol.',
  blockedTransition: null,
  requiredFields: () => [],
  allowOverride: false
});

const emit = defineEmits<{
  (e: 'proceed-anyway'): void;
  (e: 'go-back'): void;
  (e: 'close'): void;
}>();

function handleProceedAnyway() {
  emit('proceed-anyway');
}

function handleGoBack() {
  emit('go-back');
}

function handleOverlayClick() {
  emit('go-back');
}
</script>

<style scoped>
.navigation-guard-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.navigation-guard-modal {
  background: var(--surface, #fff);
  border-radius: 12px;
  max-width: 400px;
  width: 100%;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px;
  background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
  border-bottom: 1px solid #ff9800;
}

.warning-icon {
  font-size: 32px;
}

.modal-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #e65100;
}

.modal-body {
  padding: 24px;
}

.warning-message {
  font-size: 15px;
  color: var(--text-primary, #333);
  margin: 0 0 20px 0;
  line-height: 1.5;
}

.block-details,
.required-fields {
  margin-bottom: 16px;
}

.block-details h4,
.required-fields h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #333);
  margin: 0 0 8px 0;
}

.block-reasons,
.field-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.block-reasons li {
  padding: 8px 12px;
  background: var(--error-light, #ffebee);
  border-left: 3px solid var(--error, #f44336);
  margin-bottom: 8px;
  border-radius: 0 4px 4px 0;
  font-size: 14px;
  color: #c62828;
}

.field-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-light, #eee);
  font-size: 14px;
  color: var(--text-secondary, #666);
}

.field-list li:last-child {
  border-bottom: none;
}

.field-icon {
  width: 20px;
  text-align: center;
  font-size: 14px;
}

.field-list li.is-complete {
  color: var(--success, #4caf50);
}

.field-list li.is-complete .field-icon {
  color: var(--success, #4caf50);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  background: var(--surface-variant, #f5f5f5);
  border-top: 1px solid var(--border-light, #eee);
}

.btn {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-secondary {
  background: var(--surface, #fff);
  color: var(--text-secondary, #666);
  border: 1px solid var(--border, #ccc);
}

.btn-secondary:hover {
  background: var(--surface-hover, #f5f5f5);
}

.btn-primary {
  background: var(--primary, #2196f3);
  color: white;
}

.btn-primary:hover {
  background: var(--primary-dark, #1565c0);
}

/* Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .navigation-guard-modal,
.modal-leave-to .navigation-guard-modal {
  transform: scale(0.9);
}
</style>

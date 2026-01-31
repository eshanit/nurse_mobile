<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useAuth } from '@/composables/useAuth';
import { useDashboardStore } from '@/stores/dashboard';

const auth = useAuth();
const dashboardStore = useDashboardStore();

const isReady = computed(() => dashboardStore.isReady);

onMounted(() => {
  // Auth check
  if (!auth.isAuthenticated.value) {
    navigateTo('/');
    return;
  }

  // Redirect if not in ready state
  if (!isReady.value) {
    navigateTo('/dashboard');
  }
});

function handleGoBack() {
  navigateTo('/dashboard');
}
</script>

<template>
  <div class="min-h-screen bg-gray-900 p-4">
    <!-- Header -->
    <header class="flex items-center gap-4 mb-6">
      <button 
        @click="handleGoBack"
        class="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <div>
        <h1 class="text-2xl font-bold text-white">New Assessment</h1>
        <p class="text-gray-400 text-sm">Start a new patient encounter</p>
      </div>
    </header>

    <!-- Assessment Type Selection -->
    <div class="bg-gray-800 rounded-xl p-4 mb-6">
      <h2 class="text-white font-semibold mb-4">Select Assessment Type</h2>
      
      <div class="grid gap-4">
        <!-- Pediatric Respiratory -->
        <button 
          class="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg text-left transition-colors"
          @click="navigateTo('/assessment/peds-respiratory/new')"
        >
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-blue-900/50 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <p class="text-white font-medium">Pediatric Respiratory</p>
              <p class="text-gray-400 text-xs">Respiratory assessment for pediatric patients</p>
            </div>
          </div>
        </button>

        <!-- General Assessment -->
        <button 
          class="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg text-left transition-colors"
        >
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-green-900/50 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p class="text-white font-medium">General Assessment</p>
              <p class="text-gray-400 text-xs">General patient assessment form</p>
            </div>
          </div>
        </button>
      </div>
    </div>

    <!-- Quick Info -->
    <div class="bg-gray-800/50 rounded-xl p-4">
      <p class="text-gray-400 text-sm text-center">
        Select an assessment type to begin a new patient encounter.
      </p>
    </div>
  </div>
</template>

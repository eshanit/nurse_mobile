<script setup lang="ts">
import { onMounted, computed, onUnmounted, ref, h } from 'vue';
import { formatDistanceToNow, format } from 'date-fns';
import { useAuth } from '@/composables/useAuth';
import { useSecurityStore } from '@/stores/security';
import { useDashboardStore, type DashboardState } from '@/stores/dashboard';

const auth = useAuth();
const securityStore = useSecurityStore();
const dashboardStore = useDashboardStore();

// ----- PIN Entry State -----
const showPinModal = ref(false);
const pinEntry = ref('');
const pinError = ref('');
const isVerifyingPin = ref(false);
const pinEntryError = ref<boolean>(false);

// ----- Icon Component Mapping -----
const iconComponents: Record<string, any> = {
  'i-heroicons-lock-closed': {
    render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', class: 'h-5 w-5', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' })
    ])
  },
  'i-heroicons-key': {
    render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', class: 'h-5 w-5', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z' })
    ])
  },
  'i-heroicons-check-circle': {
    render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', class: 'h-5 w-5', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' })
    ])
  },
  'i-heroicons-wifi-slash': {
    render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', class: 'h-5 w-5', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414' })
    ])
  },
  'i-heroicons-arrow-path': {
    render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', class: 'h-5 w-5 animate-spin', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' })
    ])
  },
  'i-heroicons-exclamation-circle': {
    render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', class: 'h-5 w-5', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' })
    ])
  }
};

function getHeaderBadgeIcon(iconName: string) {
  return iconComponents[iconName] || null;
}

// ----- Auth & Security -----
const isAuthenticated = computed(() => auth.isAuthenticated.value);
const nurseName = computed(() => auth.nurseName.value || 'Nurse');

// ----- State Machine UI Bindings -----
const currentState = computed(() => dashboardStore.state);
const headerBadge = computed(() => dashboardStore.headerBadge);
const bannerMessage = computed(() => dashboardStore.bannerMessage);
const isReady = computed(() => dashboardStore.isReady);
const isOffline = computed(() => dashboardStore.isOffline);
const isSyncing = computed(() => dashboardStore.isSyncing);
const isError = computed(() => dashboardStore.isError);

// ----- Dashboard Data -----
const hasDraft = computed(() => dashboardStore.hasDraft);
const draftMeta = computed(() => dashboardStore.draftMeta);
const awaitingSyncCount = computed(() => dashboardStore.awaitingSyncCount);
const urgentCount = computed(() => dashboardStore.urgentCount);
const stats = computed(() => dashboardStore.stats);
const recent = computed(() => dashboardStore.recent);
const syncStatus = computed(() => dashboardStore.syncStatus);
const syncProgress = computed(() => dashboardStore.syncProgress);

// ----- Security State -----
const testRecordStatus = ref<'pending' | 'success' | 'failed' | 'not_created'>('pending');
const isCreatingTestRecord = ref(false);

const needsTestRecord = computed(() => testRecordStatus.value === 'not_created' || testRecordStatus.value === 'failed');

// ----- Stats Color Classes -----
const redStatsClass = computed(() => stats.value.red > 0 ? 'bg-red-500' : 'bg-gray-600');
const yellowStatsClass = computed(() => stats.value.yellow > 0 ? 'bg-yellow-500' : 'bg-gray-600');
const greenStatsClass = computed(() => stats.value.green > 0 ? 'bg-green-500' : 'bg-gray-600');

// ----- Network Monitoring -----
let onlineStatus = true;

function handleOnline() {
  if (!onlineStatus) {
    onlineStatus = true;
    dashboardStore.handleNetworkChange(true);
  }
}

function handleOffline() {
  if (onlineStatus) {
    onlineStatus = false;
    dashboardStore.handleNetworkChange(false);
  }
}

// ----- Security Actions -----
async function verifyTestRecord() {
  testRecordStatus.value = 'pending';
  
  // Check if we need PIN to unlock
  if (securityStore.needsPinToUnlock()) {
    showPinModal.value = true;
    pinEntryError.value = true; // Show error state
    testRecordStatus.value = 'failed';
    return;
  }
  
  try {
    const isValid = await securityStore.verifyEncryptedTestRecord();
    if (isValid) {
      testRecordStatus.value = 'success';
      // Now transition to READY and load dashboard
      dashboardStore.transitionToReady();
      await dashboardStore.loadDashboard();
      
      // Check initial network status
      if (!navigator.onLine) {
        dashboardStore.transitionToOffline();
      }
    } else {
      testRecordStatus.value = 'not_created';
    }
  } catch (error) {
    console.error('[Dashboard] Test record verification failed:', error);
    
    // Check if PIN is needed after failure
    if (securityStore.needsPinToUnlock()) {
      showPinModal.value = true;
      pinEntryError.value = true;
    }
    testRecordStatus.value = 'failed';
  }
}

async function createTestRecord() {
  isCreatingTestRecord.value = true;
  try {
    await securityStore.createEncryptedTestRecord();
    await verifyTestRecord();
  } finally {
    isCreatingTestRecord.value = false;
  }
}

// ----- PIN Entry Actions -----
function closePinModal() {
  showPinModal.value = false;
  pinEntry.value = '';
  pinError.value = '';
  pinEntryError.value = false;
}

async function submitPin() {
  if (pinEntry.value.length !== 4 || isVerifyingPin.value) {
    return;
  }
  
  isVerifyingPin.value = true;
  pinError.value = '';
  
  try {
    const unlocked = await securityStore.unlockWithPin(pinEntry.value);
    if (unlocked) {
      closePinModal();
      // Retry verification after successful unlock
      await verifyTestRecord();
    } else {
      pinError.value = 'Invalid PIN';
      pinEntry.value = '';
    }
  } catch (error) {
    console.error('[Dashboard] PIN unlock failed:', error);
    pinError.value = 'Failed to unlock. Please try again.';
  } finally {
    isVerifyingPin.value = false;
  }
}

function handlePinInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const value = input.value.replace(/\D/g, '').slice(0, 4);
  pinEntry.value = value;
  input.value = value;
  
  // Auto-submit when 4 digits entered
  if (value.length === 4) {
    submitPin();
  }
}

// ----- Lifecycle -----
onMounted(async () => {
  // Setup network listeners
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  onlineStatus = navigator.onLine;

  // Auth check
  if (!isAuthenticated.value) {
    navigateTo('/');
    return;
  }

  // Transition to UNLOCKING state
  dashboardStore.transitionToUnlocking();
  
  // Verify or create test record
  await verifyTestRecord();
});

onUnmounted(() => {
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
});

// ----- Actions -----
function handleLogout() {
  dashboardStore.transitionToLocked();
  auth.logout();
  navigateTo('/');
}

function handleNewAssessment() {
  if (dashboardStore.canCreateNewAssessment) {
    navigateTo('/assessment/new');
  }
}

function handleOpenSessions() {
  navigateTo('/sessions');
}

function handleViewRecords(filter: string) {
  navigateTo(`/records?filter=${filter}`);
}

function handleSync() {
  if (dashboardStore.isReady || dashboardStore.isOffline) {
    dashboardStore.transitionToSyncing();
    // Simulate sync completion after delay
    setTimeout(() => {
      dashboardStore.handleSyncComplete();
    }, 2000);
  }
}

function handleResumeDraft() {
  if (hasDraft.value && draftMeta.value) {
    navigateTo(`/assessment/${draftMeta.value.workflow}/edit`);
  }
}

function formatTimeAgo(timestamp: string | undefined): string {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return 'Unknown';
  
  // Use date-fns for relative time formatting
  return formatDistanceToNow(date, { addSuffix: true });
}

function formatDate(date: string | undefined): string {
  if (!date) return 'Invalid Date';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Invalid Date';
  
  // Use date-fns for date formatting
  return format(d, 'MMM d, yyyy');
}

// State indicator helper
function getStateColor(state: DashboardState): string {
  switch (state) {
    case 'LOCKED': return 'bg-gray-500';
    case 'UNLOCKING': return 'bg-yellow-500';
    case 'READY': return 'bg-green-500';
    case 'OFFLINE': return 'bg-orange-500';
    case 'SYNCING': return 'bg-blue-500';
    case 'ERROR': return 'bg-red-500';
    default: return 'bg-gray-500';
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-900 p-4">
    <!-- State Banner -->
    <div 
      v-if="bannerMessage"
      class="mb-4 p-3 rounded-lg flex items-center gap-3"
      :class="{
        'bg-yellow-900/30 border border-yellow-700': currentState === 'UNLOCKING',
        'bg-orange-900/30 border border-orange-700': currentState === 'OFFLINE',
        'bg-blue-900/30 border border-blue-700': currentState === 'SYNCING',
        'bg-red-900/30 border border-red-700': currentState === 'ERROR'
      }"
    >
      <div 
        class="w-3 h-3 rounded-full animate-pulse"
        :class="getStateColor(currentState)"
      ></div>
      <span class="text-white text-sm">{{ bannerMessage }}</span>
      
      <!-- Sync Progress Bar -->
      <div 
        v-if="currentState === 'SYNCING'" 
        class="flex-1 h-1 bg-gray-700 rounded overflow-hidden ml-2"
      >
        <div 
          class="h-full bg-blue-500 transition-all duration-300"
          :style="{ width: `${syncProgress}%` }"
        ></div>
      </div>
    </div>

    <!-- Header -->
    <header class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-white">HealthBridge</h1>
        <p class="text-gray-400 text-sm">Welcome, {{ nurseName }}</p>
      </div>
      
      <!-- State Badge -->
      <div class="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-full">
        <component :is="getHeaderBadgeIcon(headerBadge.icon)" v-if="getHeaderBadgeIcon(headerBadge.icon)" class="text-lg" :class="{ 'animate-spin': headerBadge.icon === 'i-heroicons-arrow-path' }"></component>
        <span class="text-gray-300 text-sm font-medium">{{ headerBadge.text }}</span>
      </div>
      
      <button 
        @click="handleLogout"
        class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
      >
        Logout
      </button>
    </header>

    <!-- Test Record Needed State (not created yet) -->
    <div v-if="needsTestRecord" class="mb-6 p-4 bg-blue-900/20 border border-blue-700 rounded-xl">
      <div class="flex items-center gap-3 mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <div>
          <p class="text-blue-400 font-medium">Security Setup Required</p>
          <p class="text-gray-400 text-sm">A test record is needed to verify your encryption key.</p>
        </div>
      </div>
      <button 
        @click="createTestRecord"
        :disabled="isCreatingTestRecord"
        class="w-full py-3 bg-blue-700 hover:bg-blue-600 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
      >
        <svg v-if="isCreatingTestRecord" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <span>{{ isCreatingTestRecord ? 'Creating...' : 'Create Test Record' }}</span>
      </button>
    </div>

    <!-- ERROR State Display -->
    <div v-else-if="isError" class="mb-6 p-4 bg-red-900/20 border border-red-700 rounded-xl">
      <div class="flex items-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <p class="text-red-400 font-medium">Dashboard Error</p>
          <p class="text-gray-400 text-sm">Please check your network connection and try again.</p>
        </div>
        <button 
          @click="verifyTestRecord"
          class="ml-auto px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm"
        >
          Retry
        </button>
      </div>
    </div>

    <!-- Main Dashboard Content (READY, OFFLINE, SYNCING) -->
    <template v-else-if="isReady || isOffline || isSyncing">
      
      <!-- Stats Bar -->
      <div class="grid grid-cols-3 gap-4 mb-6">
        <!-- Urgent/Red -->
        <div 
          class="bg-gray-800 rounded-xl p-4 cursor-pointer hover:bg-gray-750 transition-colors"
          :class="{ 'ring-2 ring-red-500': stats.red > 0 }"
          @click="handleViewRecords('urgent')"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-red-400 text-xs font-medium uppercase tracking-wide">Urgent</span>
            <div :class="redStatsClass" class="w-3 h-3 rounded-full"></div>
          </div>
          <p class="text-3xl font-bold text-white">{{ stats.red }}</p>
        </div>

        <!-- Needs Attention/Yellow -->
        <div 
          class="bg-gray-800 rounded-xl p-4 cursor-pointer hover:bg-gray-750 transition-colors"
          :class="{ 'ring-2 ring-yellow-500': stats.yellow > 0 }"
          @click="handleViewRecords('attention')"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-yellow-400 text-xs font-medium uppercase tracking-wide">Attention</span>
            <div :class="yellowStatsClass" class="w-3 h-3 rounded-full"></div>
          </div>
          <p class="text-3xl font-bold text-white">{{ stats.yellow }}</p>
        </div>

        <!-- Stable/Green -->
        <div 
          class="bg-gray-800 rounded-xl p-4 cursor-pointer hover:bg-gray-750 transition-colors"
          :class="{ 'ring-2 ring-green-500': stats.green > 0 }"
          @click="handleViewRecords('stable')"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-green-400 text-xs font-medium uppercase tracking-wide">Stable</span>
            <div :class="greenStatsClass" class="w-3 h-3 rounded-full"></div>
          </div>
          <p class="text-3xl font-bold text-white">{{ stats.green }}</p>
        </div>
      </div>

      <!-- Action Cards Row -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        
        <!-- Draft Encounter Card -->
        <div 
          v-if="hasDraft"
          class="bg-gray-800 rounded-xl p-4 border border-blue-500/30 cursor-pointer hover:bg-gray-750 transition-colors"
          @click="handleResumeDraft"
        >
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 rounded-full bg-blue-900/50 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div>
              <h3 class="text-white font-semibold">Resume Draft</h3>
              <p class="text-gray-400 text-xs">{{ draftMeta?.workflow || 'In Progress' }}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-blue-400 text-sm">Tap to continue</span>
          </div>
        </div>

        <!-- Awaiting Sync Card -->
        <div 
          v-if="awaitingSyncCount > 0" 
          class="bg-gray-800 rounded-xl p-4 cursor-pointer hover:bg-gray-750 transition-colors"
          @click="handleViewRecords('pending')"
        >
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 rounded-full bg-yellow-900/50 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div>
              <h3 class="text-white font-semibold">Pending Sync</h3>
              <p class="text-gray-400 text-xs">Awaiting upload</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-yellow-400 text-sm">{{ awaitingSyncCount }} item{{ awaitingSyncCount !== 1 ? 's' : '' }}</span>
          </div>
        </div>

        <!-- Urgent Items Card -->
        <div 
          v-if="urgentCount > 0" 
          class="bg-gray-800 rounded-xl p-4 border border-red-500/30 cursor-pointer hover:bg-gray-750 transition-colors"
          @click="handleViewRecords('urgent')"
        >
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 rounded-full bg-red-900/50 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 class="text-white font-semibold">Needs Review</h3>
              <p class="text-gray-400 text-xs">Urgent items</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-red-400 text-sm">{{ urgentCount }} urgent</span>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="bg-gray-800 rounded-xl p-4 mb-6">
        <h2 class="text-white font-semibold mb-4">Quick Actions</h2>
        <div class="grid grid-cols-3 gap-3">
          <button 
            @click="handleOpenSessions"
            class="p-4 bg-purple-900/30 hover:bg-purple-800/40 border border-purple-700/50 rounded-lg transition-colors text-left"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-purple-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p class="text-white font-medium">Open Sessions</p>
            <p class="text-gray-400 text-xs">Patient queue</p>
          </button>
          <button 
            @click="handleNewAssessment"
            :disabled="!dashboardStore.canCreateNewAssessment"
            class="p-4 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-lg transition-colors text-left"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-blue-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            <p class="text-white font-medium">New Assessment</p>
            <p class="text-gray-400 text-xs">Start patient encounter</p>
          </button>
          <button 
            @click="handleSync"
            :disabled="isSyncing"
            class="p-4 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-lg transition-colors text-left"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              class="h-6 w-6 text-green-400 mb-2" 
              :class="{ 'animate-spin': isSyncing }"
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <p class="text-white font-medium">Sync Now</p>
            <p class="text-gray-400 text-xs">{{ isOffline ? 'Go online to sync' : 'Push/pull changes' }}</p>
          </button>
        </div>
      </div>

      <!-- Recent Activity Feed -->
      <div class="bg-gray-800 rounded-xl p-4">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-white font-semibold">Recent Activity</h2>
          <span class="text-gray-500 text-xs">{{ recent.length }} items</span>
        </div>
        
        <div v-if="recent.length === 0" class="text-center py-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto text-gray-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p class="text-gray-500 text-sm">No recent activity</p>
          <p class="text-gray-600 text-xs">Start an assessment to see activity here</p>
        </div>
        
        <div v-else class="space-y-2">
          <div 
            v-for="item in recent" 
            :key="item.id"
            class="flex items-center justify-between py-3 border-b border-gray-700 last:border-0"
          >
            <div class="flex items-center gap-3">
              <!-- Priority Indicator -->
              <div 
                v-if="item.priority"
                class="w-2 h-2 rounded-full"
                :class="{
                  'bg-red-500': item.priority === 'red',
                  'bg-yellow-500': item.priority === 'yellow',
                  'bg-green-500': item.priority === 'green'
                }"
              ></div>
              <div v-else class="w-2 h-2 rounded-full bg-gray-500"></div>
              
              <div>
                <p class="text-white text-sm">{{ item.title }}</p>
                <p v-if="item.description" class="text-gray-500 text-xs">{{ item.description }}</p>
              </div>
            </div>
            <div class="text-right">
              <p class="text-gray-400 text-xs">{{ formatTimeAgo(item.updated_at) }}</p>
              <p v-if="!item.synced" class="text-yellow-500 text-xs">Pending</p>
            </div>
          </div>
        </div>
      </div>

    </template>

    <!-- UNLOCKING State -->
    <div v-else-if="currentState === 'UNLOCKING'" class="flex flex-col items-center justify-center py-20">
      <div class="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mb-4"></div>
      <p class="text-white text-lg">Verifying encryption...</p>
      <p class="text-gray-500 text-sm">Please wait while we unlock your data</p>
    </div>

    <!-- LOCKED State (should redirect but fallback) -->
    <div v-else class="flex flex-col items-center justify-center py-20">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 text-gray-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
      <p class="text-white text-lg">Dashboard Locked</p>
      <p class="text-gray-500 text-sm">Please enter your PIN to continue</p>
    </div>

    <!-- PIN Entry Modal -->
    <div v-if="showPinModal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div class="bg-gray-800 rounded-xl p-6 max-w-sm w-full mx-4">
        <div class="text-center mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-yellow-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <h3 class="text-xl font-semibold text-white mb-2">
            {{ pinEntryError ? 'Re-encrypting Data' : 'Enter PIN' }}
          </h3>
          <p class="text-gray-400 text-sm">
            {{ pinEntryError ? 'Your encryption key needs to be re-derived. Enter your PIN to continue.' : 'Enter your 4-digit PIN to unlock the encryption key.' }}
          </p>
        </div>

        <!-- PIN Input -->
        <div class="mb-4">
          <input
            type="text"
            inputmode="numeric"
            maxlength="4"
            :value="pinEntry"
            @input="handlePinInput"
            :disabled="isVerifyingPin"
            placeholder="••••"
            class="w-full text-center text-3xl tracking-widest py-3 bg-gray-700 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            :class="{ 'border-red-500 focus:ring-red-500': pinError }"
          />
          <p v-if="pinError" class="text-red-500 text-sm text-center mt-2">{{ pinError }}</p>
        </div>

        <!-- PIN Dots -->
        <div class="flex justify-center gap-3 mb-6">
          <div 
            v-for="i in 4" 
            :key="i"
            class="w-4 h-4 rounded-full transition-colors duration-200"
            :class="i <= pinEntry.length ? 'bg-blue-500' : 'bg-gray-600'"
          ></div>
        </div>

        <!-- Actions -->
        <div class="flex gap-3">
          <button 
            @click="closePinModal"
            :disabled="isVerifyingPin"
            class="flex-1 py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button 
            @click="submitPin"
            :disabled="pinEntry.length !== 4 || isVerifyingPin"
            class="flex-1 py-3 bg-blue-700 hover:bg-blue-600 disabled:bg-blue-800 text-white rounded-lg font-medium transition-colors"
          >
            {{ isVerifyingPin ? 'Verifying...' : 'Unlock' }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

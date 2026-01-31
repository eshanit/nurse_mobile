import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

// ============================================
// Dashboard State Machine Types
// ============================================

export type DashboardState = 
  | 'LOCKED'
  | 'UNLOCKING'
  | 'READY'
  | 'OFFLINE'
  | 'SYNCING'
  | 'ERROR';

export type SyncStatus = 'online' | 'offline' | 'syncing' | 'error';

export interface ActivityItem {
  id: string;
  type: 'encounter' | 'patient' | 'sync' | 'system';
  action: 'created' | 'updated' | 'finalized' | 'synced';
  title: string;
  description?: string;
  priority?: 'red' | 'yellow' | 'green';
  updated_at: string;
  synced: boolean;
}

export interface DraftMeta {
  workflow: string;
  patientName: string;
  updated_at: string;
}

export interface DashboardStats {
  red: number;      // Urgent/emergent
  yellow: number;   // Needs attention
  green: number;    // Stable/completed
}

export interface DashboardData {
  hasDraft: boolean;
  draftMeta?: DraftMeta;
  awaitingSyncCount: number;
  urgentCount: number;
  stats: DashboardStats;
  recent: ActivityItem[];
  sync: {
    status: SyncStatus;
    lastSuccess?: string;
    progress?: number;
    error?: string;
  };
}

// ============================================
// Dashboard Store
// ============================================

export const useDashboardStore = defineStore('dashboard', () => {
  // ----- State Machine State -----
  const state = ref<DashboardState>('LOCKED');
  const stateError = ref<string | null>(null);

  // ----- Dashboard Data -----
  const hasDraft = ref(false);
  const draftMeta = ref<DraftMeta | null>(null);
  const awaitingSyncCount = ref(0);
  const urgentCount = ref(0);
  const stats = ref<DashboardStats>({ red: 0, yellow: 0, green: 0 });
  const recent = ref<ActivityItem[]>([]);
  
  // ----- Sync State -----
  const syncStatus = ref<SyncStatus>('online');
  const lastSyncSuccess = ref<string | null>(null);
  const syncProgress = ref<number>(0);
  const syncError = ref<string | null>(null);

  // ----- Computed -----
  const isLocked = computed(() => state.value === 'LOCKED');
  const isUnlocking = computed(() => state.value === 'UNLOCKING');
  const isReady = computed(() => state.value === 'READY');
  const isOffline = computed(() => state.value === 'OFFLINE');
  const isSyncing = computed(() => state.value === 'SYNCING');
  const isError = computed(() => state.value === 'ERROR');
  
  const canCreateNewAssessment = computed(() => 
    isReady.value || isOffline.value
  );

  const headerBadge = computed(() => {
    switch (state.value) {
      case 'LOCKED': return { icon: '🔒', text: 'Locked' };
      case 'UNLOCKING': return { icon: '🔑', text: 'Unlocking' };
      case 'READY': return { icon: '●', text: 'Online' };
      case 'OFFLINE': return { icon: '○', text: 'Offline' };
      case 'SYNCING': return { icon: '⟳', text: 'Syncing' };
      case 'ERROR': return { icon: '🔴', text: 'Error' };
    }
  });

  const bannerMessage = computed(() => {
    switch (state.value) {
      case 'LOCKED': return 'Enter PIN to unlock';
      case 'UNLOCKING': return 'Verifying encryption...';
      case 'OFFLINE': return 'Working offline';
      case 'SYNCING': return syncProgress.value > 0 
        ? `Syncing... ${syncProgress.value}%` 
        : 'Syncing...';
      case 'ERROR': return syncError.value || 'An error occurred';
      default: return null;
    }
  });

  // ----- Actions -----
  
  /**
   * Transition to UNLOCKING state (PIN verified)
   */
  function transitionToUnlocking() {
    state.value = 'UNLOCKING';
    stateError.value = null;
  }

  /**
   * Transition to READY state (key valid, DB unlocked)
   */
  function transitionToReady() {
    state.value = 'READY';
    stateError.value = null;
    syncStatus.value = 'online';
  }

  /**
   * Transition to OFFLINE state (network lost)
   */
  function transitionToOffline() {
    state.value = 'OFFLINE';
    syncStatus.value = 'offline';
  }

  /**
   * Transition to SYNCING state
   */
  function transitionToSyncing() {
    state.value = 'SYNCING';
    syncStatus.value = 'syncing';
    syncProgress.value = 0;
    syncError.value = null;
  }

  /**
   * Transition back to READY after sync completes
   */
  function transitionFromSyncingToReady() {
    state.value = 'READY';
    syncStatus.value = 'online';
    lastSyncSuccess.value = new Date().toISOString();
    syncProgress.value = 100;
  }

  /**
   * Transition to ERROR state (critical error)
   */
  function transitionToError(error?: string) {
    state.value = 'ERROR';
    stateError.value = error || null;
    syncStatus.value = 'error';
    syncError.value = error || 'Unknown error';
  }

  /**
   * Reset to LOCKED state (logout)
   */
  function transitionToLocked() {
    state.value = 'LOCKED';
    stateError.value = null;
    resetDashboardData();
  }

  /**
   * Reset dashboard data when locking
   */
  function resetDashboardData() {
    hasDraft.value = false;
    draftMeta.value = null;
    awaitingSyncCount.value = 0;
    urgentCount.value = 0;
    stats.value = { red: 0, yellow: 0, green: 0 };
    recent.value = [];
    syncProgress.value = 0;
    syncError.value = null;
  }

  /**
   * Load dashboard data from PouchDB
   */
  async function loadDashboard(): Promise<void> {
    if (!isReady.value && !isOffline.value) {
      throw new Error('Cannot load dashboard in current state');
    }

    try {
      // TODO: Replace with actual PouchDB queries
      // const draft = await find({ type: 'encounter', status: 'draft' });
      // const awaitingSync = await find({ status: { $in: ['finalized', 'ai_processed'] }, synced: false });
      // const urgent = await find({ priority: 'red' });
      // const recentItems = await find({ type: 'encounter' }, { sort: ['updated_at'], limit: 5 });

      // Mock data for now
      hasDraft.value = false;
      awaitingSyncCount.value = 0;
      urgentCount.value = 0;
      stats.value = { red: 0, yellow: 0, green: 0 };
      recent.value = [];
    } catch (error) {
      transitionToError(error instanceof Error ? error.message : 'Failed to load dashboard');
      throw error;
    }
  }

  /**
   * Update sync progress
   */
  function updateSyncProgress(progress: number) {
    syncProgress.value = Math.min(100, Math.max(0, progress));
  }

  /**
   * Handle sync completion
   */
  function handleSyncComplete() {
    transitionFromSyncingToReady();
    loadDashboard();
  }

  /**
   * Handle sync error
   */
  function handleSyncError(error: string) {
    transitionToError(error);
  }

  /**
   * Handle network status change
   */
  function handleNetworkChange(online: boolean) {
    if (online) {
      if (state.value === 'OFFLINE') {
        transitionToSyncing();
      }
    } else {
      if (state.value === 'READY') {
        transitionToOffline();
      }
    }
  }

  /**
   * Get dashboard model for UI binding
   */
  function getDashboardModel(): DashboardData {
    return {
      hasDraft: hasDraft.value,
      draftMeta: draftMeta.value || undefined,
      awaitingSyncCount: awaitingSyncCount.value,
      urgentCount: urgentCount.value,
      stats: { ...stats.value },
      recent: [...recent.value],
      sync: {
        status: syncStatus.value,
        lastSuccess: lastSyncSuccess.value || undefined,
        progress: syncProgress.value || undefined,
        error: syncError.value || undefined,
      },
    };
  }

  return {
    // State
    state,
    stateError,
    hasDraft,
    draftMeta,
    awaitingSyncCount,
    urgentCount,
    stats,
    recent,
    syncStatus,
    lastSyncSuccess,
    syncProgress,
    syncError,

    // Computed
    isLocked,
    isUnlocking,
    isReady,
    isOffline,
    isSyncing,
    isError,
    canCreateNewAssessment,
    headerBadge,
    bannerMessage,

    // Actions
    transitionToUnlocking,
    transitionToReady,
    transitionToOffline,
    transitionToSyncing,
    transitionFromSyncingToReady,
    transitionToError,
    transitionToLocked,
    loadDashboard,
    updateSyncProgress,
    handleSyncComplete,
    handleSyncError,
    handleNetworkChange,
    getDashboardModel,
  };
});

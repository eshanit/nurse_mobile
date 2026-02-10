<template>
  <div class="admin-dashboard">
    <div class="dashboard-header">
      <h1>🔐 Admin Dashboard</h1>
      <p>Security management and monitoring</p>
    </div>

    <div class="dashboard-content">
      <!-- Key Management Section -->
      <div class="section">
        <h2>Key Management</h2>
        <div class="key-status-card">
          <div class="status-row">
            <span class="label">Current Key ID</span>
            <span class="value monospace">{{ keyStatus.currentVersion?.keyId || 'N/A' }}</span>
          </div>
          <div class="status-row">
            <span class="label">Key Version</span>
            <span class="value">{{ keyStatus.currentVersion?.version || 'N/A' }}</span>
          </div>
          <div class="status-row">
            <span class="label">Key Age</span>
            <span class="value">{{ keyAgeText }}</span>
          </div>
          <div class="status-row">
            <span class="label">Days Until Rotation</span>
            <span :class="['value', keyStatus.daysUntilRotation < 7 ? 'warning' : '']">
              {{ keyStatus.daysUntilRotation }} days
            </span>
          </div>
          <div class="status-row">
            <span class="label">Operations Until Rotation</span>
            <span class="value">{{ keyStatus.operationsUntilRotation }}</span>
          </div>
        </div>

        <div class="actions-row">
          <button class="btn-primary" @click="rotateKey" :disabled="rotating">
            {{ rotating ? 'Rotating...' : '🔄 Rotate Key Now' }}
          </button>
          <button class="btn-secondary" @click="backupKey">
            💾 Backup Key
          </button>
        </div>

        <div class="version-history">
          <h3>Key Version History</h3>
          <div class="version-list">
            <div 
              v-for="version in keyVersions" 
              :key="version.keyId"
              class="version-item"
              :class="{ active: version.isActive }"
            >
              <div class="version-info">
                <span class="version-badge">{{ version.version }}</span>
                <span class="version-date">{{ formatDate(version.rotatedAt) }}</span>
                <span class="version-type">{{ version.rotatedBy }}</span>
              </div>
              <span :class="['status-badge', version.isActive ? 'active' : 'inactive']">
                {{ version.isActive ? 'Active' : 'Inactive' }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Document Integrity Section -->
      <div class="section">
        <h2>Document Integrity</h2>
        <div class="integrity-stats">
          <div class="stat-card">
            <span class="stat-value">{{ checksumStatus.totalDocuments }}</span>
            <span class="stat-label">Tracked Documents</span>
          </div>
          <div class="stat-card success">
            <span class="stat-value">{{ checksumStatus.verifiedDocuments }}</span>
            <span class="stat-label">Verified (24h)</span>
          </div>
          <div class="stat-card danger">
            <span class="stat-value">{{ checksumStatus.failedDocuments }}</span>
            <span class="stat-label">Failed</span>
          </div>
        </div>

        <div class="actions-row">
          <button class="btn-primary" @click="verifyAllDocuments">
            ✅ Verify All Documents
          </button>
          <button class="btn-secondary" @click="clearChecksumData">
            🗑️ Clear Checksum Data
          </button>
        </div>
      </div>

      <!-- Cross-Device Sync Section -->
      <div class="section">
        <h2>Cross-Device Sync</h2>
        <div class="sync-status">
          <div class="sync-indicator" :class="{ online: syncStatus.isOnline }">
            <span class="status-dot"></span>
            {{ syncStatus.isOnline ? 'Online' : 'Offline' }}
          </div>
          <div class="sync-stats">
            <span>{{ syncStatus.pairedDevices }} Paired Devices</span>
            <span>{{ syncStatus.pendingTransfers }} Pending Transfers</span>
          </div>
        </div>

        <div class="paired-devices">
          <h3>Paired Devices</h3>
          <div class="device-list">
            <div 
              v-for="device in pairedDevices" 
              :key="device.deviceId"
              class="device-item"
            >
              <div class="device-info">
                <span class="device-icon">{{ getDeviceIcon(device.deviceType) }}</span>
                <div class="device-details">
                  <span class="device-name">{{ device.deviceName }}</span>
                  <span class="device-id monospace">{{ device.deviceId }}</span>
                </div>
              </div>
              <div class="device-meta">
                <span class="last-sync">{{ device.lastSync ? formatDate(device.lastSync) : 'Never' }}</span>
                <button class="btn-danger btn-small" @click="unpairDevice(device.deviceId)">
                  Unpair
                </button>
              </div>
            </div>
            <div v-if="pairedDevices.length === 0" class="empty-state">
              No devices paired yet
            </div>
          </div>
        </div>

        <div class="actions-row">
          <button class="btn-primary" @click="syncKeysToDevices">
            🔄 Sync Keys to All Devices
          </button>
          <button class="btn-secondary" @click="showPairModal = true">
            ➕ Pair New Device
          </button>
        </div>
      </div>

      <!-- Audit Log Section -->
      <div class="section">
        <h2>Recent Audit Events</h2>
        <div class="audit-list">
          <div 
            v-for="event in recentAuditEvents" 
            :key="event.id"
            class="audit-item"
            :class="event.severity"
          >
            <div class="audit-header">
              <span class="audit-type">{{ formatEventType(event.eventType) }}</span>
              <span class="audit-time">{{ formatTime(event.timestamp) }}</span>
            </div>
            <div class="audit-details">{{ event.details }}</div>
            <span :class="['audit-outcome', event.outcome]">{{ event.outcome }}</span>
          </div>
          <div v-if="recentAuditEvents.length === 0" class="empty-state">
            No recent audit events
          </div>
        </div>

        <div class="actions-row">
          <button class="btn-secondary" @click="exportAuditLog">
            📥 Export Audit Log
          </button>
          <button class="btn-danger" @click="clearAuditLog">
            🗑️ Clear Audit Log
          </button>
        </div>
      </div>
    </div>

    <!-- Pair Device Modal -->
    <div v-if="showPairModal" class="modal-overlay" @click.self="showPairModal = false">
      <div class="modal-content">
        <h3>Pair New Device</h3>
        
        <div class="form-group">
          <label>Device Name</label>
          <input v-model="newDevice.name" type="text" placeholder="e.g., My Tablet" />
        </div>
        
        <div class="form-group">
          <label>Device Type</label>
          <select v-model="newDevice.type">
            <option value="mobile">Mobile</option>
            <option value="desktop">Desktop</option>
            <option value="tablet">Tablet</option>
          </select>
        </div>
        
        <div class="form-group">
          <label>Device Public Key</label>
          <textarea 
            v-model="newDevice.publicKey" 
            placeholder="Paste the device's public key here"
            rows="4"
          ></textarea>
        </div>
        
        <div class="modal-actions">
          <button class="btn-primary" @click="pairNewDevice" :disabled="pairing">
            {{ pairing ? 'Pairing...' : 'Pair Device' }}
          </button>
          <button class="btn-secondary" @click="showPairModal = false">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { format, formatDistanceToNow } from 'date-fns';
import { getKeyVersions, getKeyRotationStatus, rotateAndMigrate, clearKeyRotationData } from '~/services/keyRotation';
import { 
  getChecksumStatus, 
  verifyAllChecksums, 
  clearChecksumData,
  exportChecksums 
} from '~/services/documentChecksum';
import { 
  getPairedDevices, 
  unpairDevice, 
  getSyncStatus, 
  initiateKeySync,
  pairDevice,
  exportSyncData,
  clearSyncData,
  getDeviceId,
  storeLocalPublicKey
} from '~/services/keySync';
import { getRecentAuditEvents, exportAuditLog as exportAudit, clearAuditLog as clearAudit } from '~/services/auditLogger';

interface KeyVersion {
  keyId: string;
  version: number;
  createdAt: number;
  rotatedAt: number;
  rotatedBy: string;
  keyHash: string;
  isActive: boolean;
}

interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  publicKey: string;
  pairedAt: number;
  lastSync: number | null;
  isActive: boolean;
}

interface AuditEvent {
  id: string;
  timestamp: number;
  eventType: string;
  severity: string;
  details: Record<string, unknown>;
  outcome: string;
}

// State
const keyStatus = ref<{
  shouldRotate: boolean;
  currentVersion: KeyVersion | null;
  daysUntilRotation: number;
  operationsUntilRotation: number;
}>({
  shouldRotate: false,
  currentVersion: null,
  daysUntilRotation: 0,
  operationsUntilRotation: 0
});

const checksumStatus = ref<{
  totalDocuments: number;
  verifiedDocuments: number;
  failedDocuments: number;
  lastVerification: number | null;
}>({
  totalDocuments: 0,
  verifiedDocuments: 0,
  failedDocuments: 0,
  lastVerification: null
});

const syncStatus = ref<{
  isOnline: boolean;
  lastSyncTime: number | null;
  pendingTransfers: number;
  pairedDevices: number;
}>({
  isOnline: false,
  lastSyncTime: null,
  pendingTransfers: 0,
  pairedDevices: 0
});

const keyVersions = ref<KeyVersion[]>([]);
const pairedDevices = ref<DeviceInfo[]>([]);
const recentAuditEvents = ref<AuditEvent[]>([]);

const rotating = ref(false);
const pairing = ref(false);
const showPairModal = ref(false);

const newDevice = ref({
  name: '',
  type: 'mobile' as 'mobile' | 'desktop' | 'tablet',
  publicKey: ''
});

onMounted(() => {
  refreshAllData();
});

function refreshAllData() {
  keyStatus.value = getKeyRotationStatus();
  keyVersions.value = getKeyVersions();
  checksumStatus.value = getChecksumStatus();
  syncStatus.value = getSyncStatus();
  pairedDevices.value = getPairedDevices();
  recentAuditEvents.value = getRecentAuditEvents(20).reverse();
}

const keyAgeText = computed(() => {
  if (!keyStatus.value.currentVersion) return 'N/A';
  const age = Date.now() - keyStatus.value.currentVersion.rotatedAt;
  return formatDistanceToNow(age, { addSuffix: true });
});

function formatDate(timestamp: number): string {
  return format(new Date(timestamp), 'MMM dd, yyyy HH:mm');
}

function formatTime(timestamp: number): string {
  return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
}

function formatEventType(eventType: string): string {
  return eventType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function getDeviceIcon(type: string): string {
  switch (type) {
    case 'mobile': return '📱';
    case 'desktop': return '🖥️';
    case 'tablet': return '📟';
    default: return '💻';
  }
}

async function rotateKey() {
  rotating.value = true;
  try {
    const { getSessionKey } = await import('~/composables/useKeyManager');
    const currentKey = getSessionKey();
    
    if (currentKey) {
      // Generate a new key
      const newKey = crypto.getRandomValues(new Uint8Array(32));
      
      await rotateAndMigrate(currentKey, newKey, async (doc, key) => {
        const { securePut } = await import('~/services/secureDb');
        await securePut(doc as { _id: string; _rev?: string }, key);
      });
      
      refreshAllData();
      console.log('[AdminDashboard] Key rotation complete');
    }
  } catch (error) {
    console.error('[AdminDashboard] Key rotation failed:', error);
  } finally {
    rotating.value = false;
  }
}

function backupKey() {
  console.log('[AdminDashboard] Key backup initiated');
  const data = exportSyncData();
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `healthbridge-key-backup-${format(new Date(), 'yyyy-MM-dd')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function verifyAllDocuments() {
  const { secureAllDocs } = await import('~/services/secureDb');
  const { getSessionKey } = await import('~/composables/useKeyManager');
  
  const key = getSessionKey();
  if (!key) return;
  
  const docs = await secureAllDocs(key);
  const results = await verifyAllChecksums(docs);
  
  console.log('[AdminDashboard] Verification complete:', results);
  refreshAllData();
  
  alert(`Verified: ${results.verified}, Failed: ${results.failed}`);
}

function clearChecksumData() {
  if (confirm('Clear all checksum data?')) {
    clearChecksumData();
    refreshAllData();
  }
}

async function syncKeysToDevices() {
  const { getSessionKey } = await import('~/composables/useKeyManager');
  const key = getSessionKey();
  
  if (key) {
    const result = await initiateKeySync(key);
    console.log('[AdminDashboard] Sync result:', result);
    alert(`Synced to ${result.transferredTo.length} devices, failed: ${result.failedDevices.length}`);
    refreshAllData();
  }
}

async function pairNewDevice() {
  if (!newDevice.value.name || !newDevice.value.publicKey) {
    alert('Please fill in all fields');
    return;
  }
  
  pairing.value = true;
  try {
    const deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await pairDevice(
      deviceId,
      newDevice.value.name,
      newDevice.value.type,
      newDevice.value.publicKey
    );
    
    showPairModal.value = false;
    newDevice.value = { name: '', type: 'mobile', publicKey: '' };
    refreshAllData();
  } catch (error) {
    console.error('[AdminDashboard] Pairing failed:', error);
  } finally {
    pairing.value = false;
  }
}

function unpairDevice(deviceId: string) {
  if (confirm('Unpair this device?')) {
    unpairDevice(deviceId);
    refreshAllData();
  }
}

function exportAuditLog() {
  const data = exportAudit();
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `healthbridge-audit-log-${format(new Date(), 'yyyy-MM-dd')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function clearAuditLog() {
  if (confirm('Clear all audit logs? This cannot be undone.')) {
    clearAudit();
    refreshAllData();
  }
}
</script>

<style scoped>
.admin-dashboard {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

.dashboard-header {
  margin-bottom: 32px;
}

.dashboard-header h1 {
  font-size: 28px;
  margin: 0 0 8px;
}

.dashboard-header p {
  color: #666;
  margin: 0;
}

.section {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
}

.section h2 {
  font-size: 18px;
  margin: 0 0 16px;
}

.section h3 {
  font-size: 14px;
  color: #666;
  margin: 16px 0 12px;
}

.key-status-card {
  background: white;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.status-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #e9ecef;
}

.status-row:last-child {
  border-bottom: none;
}

.status-row .label {
  color: #666;
}

.status-row .value {
  font-weight: 500;
}

.status-row .value.warning {
  color: #e67700;
}

.monospace {
  font-family: monospace;
  font-size: 12px;
}

.actions-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.integrity-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.stat-card {
  background: white;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
}

.stat-card.success .stat-value {
  color: #2b8a3e;
}

.stat-card.danger .stat-value {
  color: #c92a2a;
}

.stat-value {
  display: block;
  font-size: 24px;
  font-weight: 700;
}

.stat-label {
  font-size: 12px;
  color: #666;
}

.sync-status {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.sync-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: white;
  border-radius: 20px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #dc3545;
}

.sync-indicator.online .status-dot {
  background: #2b8a3e;
}

.sync-stats {
  display: flex;
  gap: 16px;
  color: #666;
  font-size: 14px;
}

.device-list {
  margin-bottom: 16px;
}

.device-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: white;
  border-radius: 8px;
  margin-bottom: 8px;
}

.device-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.device-icon {
  font-size: 24px;
}

.device-details {
  display: flex;
  flex-direction: column;
}

.device-name {
  font-weight: 500;
}

.device-id {
  font-size: 11px;
  color: #666;
}

.device-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.last-sync {
  font-size: 12px;
  color: #666;
}

.audit-list {
  margin-bottom: 16px;
}

.audit-item {
  padding: 12px;
  background: white;
  border-radius: 8px;
  margin-bottom: 8px;
  border-left: 4px solid #e9ecef;
}

.audit-item.info {
  border-left-color: #4dabf7;
}

.audit-item.warning {
  border-left-color: #ffc107;
}

.audit-item.error {
  border-left-color: #dc3545;
}

.audit-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.audit-type {
  font-weight: 500;
  font-size: 13px;
}

.audit-time {
  font-size: 12px;
  color: #666;
}

.audit-details {
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.audit-outcome {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.audit-outcome.success {
  background: #d3f9d8;
  color: #2b8a3e;
}

.audit-outcome.failure {
  background: #ffe3e3;
  color: #c92a2a;
}

.version-list {
  background: white;
  border-radius: 8px;
  overflow: hidden;
}

.version-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid #e9ecef;
}

.version-item:last-child {
  border-bottom: none;
}

.version-item.active {
  background: #f0f9ff;
}

.version-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.version-badge {
  background: #4dabf7;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.version-date {
  font-size: 13px;
}

.version-type {
  font-size: 11px;
  color: #666;
  text-transform: uppercase;
}

.status-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.status-badge.active {
  background: #d3f9d8;
  color: #2b8a3e;
}

.status-badge.inactive {
  background: #e9ecef;
  color: #666;
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: #666;
  background: white;
  border-radius: 8px;
}

.btn-primary, .btn-secondary, .btn-danger {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

.btn-primary {
  background: #4dabf7;
  color: white;
}

.btn-secondary {
  background: #e9ecef;
  color: #333;
}

.btn-danger {
  background: #dc3545;
  color: white;
}

.btn-primary:disabled, .btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-small {
  padding: 4px 12px;
  font-size: 12px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 32px;
  border-radius: 12px;
  max-width: 400px;
  width: 90%;
}

.modal-content h3 {
  margin: 0 0 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  color: #666;
  margin-bottom: 4px;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  font-size: 14px;
}

.form-group textarea {
  resize: vertical;
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}
</style>

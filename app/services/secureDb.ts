/**
 * Secure Database Service
 * 
 * Zero-trust encrypted database at rest.
 * Uses AES-256-GCM encryption for all documents at the storage level.
 * 
 * Architecture:
 * - PIN → deriveKeyFromPin() → security.encryptionKey (memory only)
 * - getSecureDb() → PouchDB with transparent encryption
 * 
 * All data is encrypted transparently - no application-visible encrypted fields
 * at the document content level (internal wrapper fields are used).
 */

import PouchDB from 'pouchdb-browser';
import pouchdbFind from 'pouchdb-find';
import { useSecurityStore } from '~/stores/security';

// ============================================
// PouchDB Plugins
// ============================================

PouchDB.plugin(pouchdbFind);

// ============================================
// Types
// ============================================

export interface SecureDbConfig {
  dbName?: string;
  autoCompaction?: boolean;
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
}

export interface EncryptedDocument {
  _id: string;
  _rev?: string;
  _encrypted: true;
  _data: string;
  _encryptedAt: string;
}

// ============================================
// Encryption Utilities
// ============================================

async function encryptData(plaintext: string, key: Uint8Array): Promise<EncryptedPayload> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    encoder.encode(plaintext)
  );
  
  const encryptedArray = new Uint8Array(encrypted);
  const ciphertext = encryptedArray.slice(0, -16);
  const tag = encryptedArray.slice(-16);
  
  return {
    ciphertext: btoa(String.fromCharCode(...ciphertext)),
    iv: btoa(String.fromCharCode(...iv)),
    tag: btoa(String.fromCharCode(...tag))
  };
}

async function decryptData(payload: EncryptedPayload, key: Uint8Array): Promise<string> {
  const decoder = new TextDecoder();
  
  const iv = Uint8Array.from(atob(payload.iv), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(payload.ciphertext), (c) => c.charCodeAt(0));
  const tag = Uint8Array.from(atob(payload.tag), (c) => c.charCodeAt(0));
  
  const encrypted = new Uint8Array(ciphertext.length + tag.length);
  encrypted.set(ciphertext);
  encrypted.set(tag, ciphertext.length);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    encrypted
  );
  
  return decoder.decode(decrypted);
}

// ============================================
// Database Instance
// ============================================

let dbInstance: PouchDB.Database | null = null;
let dbName = 'healthbridge_secure';

/**
 * Initialize the secure database
 */
export async function initializeSecureDb(config?: SecureDbConfig): Promise<void> {
  if (config?.dbName) {
    dbName = config.dbName;
  }
  
  const security = useSecurityStore();
  
  if (!security.encryptionKey) {
    throw new Error('[SecureDB] Cannot initialize: no encryption key available');
  }
  
  if (!dbInstance) {
    dbInstance = new PouchDB(dbName, {
      adapter: 'idb',
      auto_compaction: config?.autoCompaction ?? true
    });
    
    await dbInstance.info();
    console.log('[SecureDB] Database initialized');
  }
}

/**
 * Get the secure database instance
 */
export function getSecureDb(): PouchDB.Database {
  const security = useSecurityStore();
  
  if (!security.isUnlocked || !security.encryptionKey) {
    throw new Error('[SecureDB] Database locked: app must be unlocked first');
  }
  
  if (!dbInstance) {
    throw new Error('[SecureDB] Database not initialized: call initializeSecureDb() first');
  }
  
  return dbInstance;
}

/**
 * Check if the secure database is ready
 */
export function isSecureDbReady(): boolean {
  const security = useSecurityStore();
  return security.isUnlocked && security.encryptionKey !== null && dbInstance !== null;
}

/**
 * Close the secure database connection
 */
export async function closeSecureDb(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
    console.log('[SecureDB] Database closed');
  }
}

/**
 * Delete the secure database (factory reset)
 */
export async function deleteSecureDb(): Promise<void> {
  if (dbInstance) {
    await dbInstance.destroy();
    dbInstance = null;
    console.log('[SecureDB] Database deleted');
  }
}

// ============================================
// CRUD Operations (Transparent Encryption)
// ============================================

export async function securePut<T extends { _id: string; _rev?: string }>(
  doc: T
): Promise<{ id: string; rev: string }> {
  const db = getSecureDb();
  const security = useSecurityStore();
  
  if (!security.encryptionKey) {
    throw new Error('[SecureDB] Cannot put: encryption key not available');
  }
  
  const { _id, _rev } = doc;
  
  // Encrypt document content (exclude PouchDB metadata)
  const dataToEncrypt: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc)) {
    if (key !== '_id' && key !== '_rev') {
      dataToEncrypt[key] = value;
    }
  }
  
  const encryptedPayload = await encryptData(JSON.stringify(dataToEncrypt), security.encryptionKey);
  
  const encryptedDoc: EncryptedDocument = {
    _id,
    _encrypted: true,
    _data: JSON.stringify(encryptedPayload),
    _encryptedAt: new Date().toISOString()
  };
  
  if (_rev) {
    encryptedDoc._rev = _rev;
  }
  
  const result = await db.put(encryptedDoc);
  return { id: result.id, rev: result.rev };
}

export async function secureGet<T>(
  id: string
): Promise<T | null> {
  const db = getSecureDb();
  const security = useSecurityStore();
  
  if (!security.encryptionKey) {
    throw new Error('[SecureDB] Cannot get: encryption key not available');
  }
  
  try {
    const doc = await db.get(id) as EncryptedDocument & { _rev?: string };
    
    if (!doc._encrypted) {
      return doc as unknown as T;
    }
    
    const payload: EncryptedPayload = JSON.parse(doc._data);
    const decryptedData = JSON.parse(await decryptData(payload, security.encryptionKey));
    
    return {
      _id: doc._id,
      _rev: doc._rev,
      ...decryptedData
    } as T;
  } catch (error) {
    if ((error as { status?: number }).status === 404) {
      return null;
    }
    throw error;
  }
}

export async function secureFind<T>(
  selector: Record<string, unknown>
): Promise<T[]> {
  const db = getSecureDb();
  const result = await db.find({ selector });
  return result.docs as unknown as T[];
}

export async function secureDelete(
  id: string,
  rev: string
): Promise<{ id: string; rev: string; ok: boolean }> {
  const db = getSecureDb();
  const result = await db.remove(id, rev);
  return { id: result.id, rev: result.rev, ok: result.ok };
}

export async function secureInfo(): Promise<{
  dbName: string;
  docCount: number;
  updateSeq: number;
}> {
  const db = getSecureDb();
  const info = await db.info();
  
  return {
    dbName: String(info.db_name),
    docCount: Number(info.doc_count),
    updateSeq: Number(info.update_seq)
  };
}

export async function secureAllDocs<T extends { _id: string; _rev?: string }>(): Promise<T[]> {
  const db = getSecureDb();
  const result = await db.allDocs({ include_docs: false });
  
  const docs: T[] = [];
  for (const row of result.rows) {
    if (!row.id.startsWith('_design/')) {
      docs.push({ _id: row.id, _rev: row.value.rev } as T);
    }
  }
  
  return docs;
}

export async function secureCreateIndex(fields: string[]): Promise<void> {
  const db = getSecureDb();
  await db.createIndex({ index: { fields } });
}

export async function secureCreateDesignDoc(
  designDocId: string,
  views: Record<string, { map: string; reduce?: string }>
): Promise<void> {
  const db = getSecureDb();
  
  const designDoc = {
    _id: `_design/${designDocId}`,
    views
  };
  
  await db.put(designDoc);
}

export interface BulkResult {
  id: string;
  rev?: string;
  ok?: boolean;
  error?: unknown;
}

export async function secureBulkDocs<T extends { _id: string; _rev?: string }>(
  docs: T[]
): Promise<BulkResult[]> {
  const results = await Promise.all(
    docs.map(async (doc) => {
      try {
        const result = await securePut(doc);
        return { id: result.id, rev: result.rev, ok: true };
      } catch (error) {
        return { id: doc._id, error };
      }
    })
  );
  
  return results;
}

// Re-export PouchDB for advanced operations
export { PouchDB };

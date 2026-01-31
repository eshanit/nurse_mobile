/**
 * PouchDB Service
 * 
 * ⚠️ DEPRECATED - Use services/secureDb.ts instead
 * 
 * This module is kept for backward compatibility only.
 * All new code should use the secureDb service for encrypted storage.
 * 
 * @deprecated Use ~/services/secureDb instead
 */

import PouchDB from 'pouchdb-browser';
import pouchdbFind from 'pouchdb-find';
import pouchdbAuthentication from 'pouchdb-authentication';
import { 
  getSecureDb, 
  securePut, 
  secureGet, 
  secureFind,
  secureDelete,
  secureInfo,
  initializeSecureDb,
  closeSecureDb,
  secureCreateIndex,
  secureCreateDesignDoc,
  secureBulkDocs,
  secureAllDocs,
  type BulkResult
} from './secureDb';

// ============================================
// DEPRECATED - These functions are no longer used
// ============================================

/**
 * @deprecated No longer used. Encryption is handled by secureDb.
 */
export async function generateEncryptionKey(): Promise<Uint8Array> {
  console.warn('[PouchDB] generateEncryptionKey is deprecated. Use secureDb instead.');
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const exportedKey = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(exportedKey);
}

/**
 * @deprecated No longer used. Key derivation is handled by security store.
 */
export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array
): Promise<Uint8Array> {
  console.warn('[PouchDB] deriveKeyFromPassphrase is deprecated. Use security store instead.');
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  
  const exportedKey = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(exportedKey);
}

/**
 * @deprecated No longer used. Keys are stored encrypted with device secret.
 */
export function storeEncryptionKey(key: Uint8Array): void {
  console.warn('[PouchDB] storeEncryptionKey is deprecated. Use security store instead.');
  const keyBase64 = btoa(String.fromCharCode(...key));
  localStorage.setItem('healthbridge_db_key', keyBase64);
}

/**
 * @deprecated No longer used. Keys are managed by security store.
 */
export function retrieveEncryptionKey(): Uint8Array | null {
  console.warn('[PouchDB] retrieveEncryptionKey is deprecated. Use security store instead.');
  const keyBase64 = localStorage.getItem('healthbridge_db_key');
  if (!keyBase64) return null;
  
  const keyBytes = Uint8Array.from(atob(keyBase64), (c) => c.charCodeAt(0));
  return keyBytes;
}

// ============================================
// PouchDB Service Class - Now wraps secureDb
// ============================================

/**
 * PouchDB Service Class
 * 
 * ⚠️ DEPRECATED - Use functions from secureDb instead
 * 
 * This class now delegates to secureDb for all operations.
 * 
 * @deprecated Use ~/services/secureDb instead
 */
export class PouchDBService {
  private initialized = false;

  /**
   * @deprecated Use initializeSecureDb() from secureDb instead
   */
  async initialize(passphrase?: string): Promise<void> {
    console.warn('[PouchDB] PouchDBService.initialize() is deprecated. Use initializeSecureDb() from secureDb instead.');
    
    if (!this.initialized) {
      await initializeSecureDb();
      this.initialized = true;
      console.log('[PouchDB] Database initialized via secureDb');
    }
  }

  /**
   * @deprecated Use securePut() from secureDb instead
   */
  async put<T extends { _id: string; _rev?: string }>(
    doc: T
  ): Promise<{ id: string; rev: string; ok: boolean }> {
    console.warn('[PouchDB] put() is deprecated. Use securePut() from secureDb instead.');
    const result = await securePut(doc);
    return { id: result.id, rev: result.rev, ok: true };
  }

  /**
   * @deprecated Use secureGet() from secureDb instead
   */
  async get<T>(id: string): Promise<T | null> {
    console.warn('[PouchDB] get() is deprecated. Use secureGet() from secureDb instead.');
    return secureGet<T>(id);
  }

  /**
   * @deprecated Use secureFind() from secureDb instead
   */
  async find<T>(selector: Record<string, unknown>): Promise<T[]> {
    console.warn('[PouchDB] find() is deprecated. Use secureFind() from secureDb instead.');
    return secureFind<T>(selector);
  }

  /**
   * @deprecated Use secureDelete() from secureDb instead
   */
  async delete(
    id: string,
    rev: string
  ): Promise<{ id: string; rev: string; ok: boolean }> {
    console.warn('[PouchDB] delete() is deprecated. Use secureDelete() from secureDb instead.');
    const result = await secureDelete(id, rev);
    return { id: result.id, rev: rev, ok: result.ok };
  }

  /**
   * @deprecated Use secureAllDocs() from secureDb instead
   */
  async allDocs<T extends { _id: string; _rev?: string }>(): Promise<T[]> {
    console.warn('[PouchDB] allDocs() is deprecated. Use secureAllDocs() from secureDb instead.');
    return secureAllDocs<T>();
  }

  /**
   * @deprecated Use secureInfo() from secureDb instead
   */
  async info(): Promise<{ db_name: string; doc_count: number; update_seq: number }> {
    console.warn('[PouchDB] info() is deprecated. Use secureInfo() from secureDb instead.');
    const info = await secureInfo();
    return { 
      db_name: info.dbName, 
      doc_count: info.docCount, 
      update_seq: info.updateSeq 
    };
  }

  /**
   * @deprecated Use secureBulkDocs() from secureDb instead
   */
  async bulkDocs<T extends { _id: string; _rev?: string }>(
    docs: T[]
  ): Promise<BulkResult[]> {
    console.warn('[PouchDB] bulkDocs() is deprecated. Use secureBulkDocs() from secureDb instead.');
    return secureBulkDocs(docs);
  }

  /**
   * @deprecated Use secureCreateIndex() from secureDb instead
   */
  async createIndexes(): Promise<void> {
    console.warn('[PouchDB] createIndexes() is deprecated. Use secureCreateIndex() from secureDb instead.');
    await secureCreateIndex(['type', 'createdAt']);
    await secureCreateIndex(['_id']);
  }

  /**
   * @deprecated Use secureCreateDesignDoc() from secureDb instead
   */
  async createDesignDoc(
    designDocId: string,
    views: Record<string, { map: string; reduce?: string }>
  ): Promise<void> {
    console.warn('[PouchDB] createDesignDoc() is deprecated. Use secureCreateDesignDoc() from secureDb instead.');
    await secureCreateDesignDoc(designDocId, views);
  }

  /**
   * @deprecated Use closeSecureDb() from secureDb instead
   */
  async compact(): Promise<void> {
    console.warn('[PouchDB] compact() is deprecated. PouchDB auto-compaction is enabled by default.');
  }

  /**
   * @deprecated Use closeSecureDb() from secureDb instead
   */
  async close(): Promise<void> {
    console.warn('[PouchDB] close() is deprecated. Use closeSecureDb() from secureDb instead.');
    await closeSecureDb();
  }
}

// ============================================
// Singleton Instance (for backward compatibility)
// ============================================

let pouchDBService: PouchDBService | null = null;

/**
 * @deprecated Use functions from secureDb instead
 */
export function getPouchDBService(): PouchDBService {
  console.warn('[PouchDB] getPouchDBService() is deprecated. Use functions from secureDb instead.');
  if (!pouchDBService) {
    pouchDBService = new PouchDBService();
  }
  return pouchDBService;
}

// Re-export PouchDB for advanced operations
export { PouchDB };

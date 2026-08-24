"use client";

export type OfflineMutationIssue = { status: number; message: string; at: string };

export type OfflineMutation = {
  id?: number;
  userId: number;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  body?: unknown;
  /** Stable entity identity. Successive offline edits of it are compacted. */
  entityKey?: string;
  createdAt: string;
  attempts?: number;
  issue?: OfflineMutationIssue;
};

export type OfflineSyncResult = {
  synced: number;
  pending: number;
  failed: number;
  status: "complete" | "offline" | "auth-required" | "blocked" | "network-error";
  issues: OfflineMutationIssue[];
};

const DB_NAME = "hora-a-hora-offline";
const DB_VERSION = 2;
const CACHE_STORE = "cache";
const OUTBOX_STORE = "outbox";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE);
      const outbox = db.objectStoreNames.contains(OUTBOX_STORE)
        ? request.transaction?.objectStore(OUTBOX_STORE)
        : db.createObjectStore(OUTBOX_STORE, { keyPath: "id", autoIncrement: true });
      if (outbox && !outbox.indexNames.contains("userId")) outbox.createIndex("userId", "userId");
      if (outbox && !outbox.indexNames.contains("entityKey")) outbox.createIndex("entityKey", "entityKey");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir o armazenamento offline."));
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha no armazenamento offline."));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Falha no armazenamento offline."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Operação offline cancelada."));
  });
}

export async function offlineCacheSet(key: string, value: unknown) {
  if (!("indexedDB" in window)) return;
  const db = await openDatabase();
  const tx = db.transaction(CACHE_STORE, "readwrite");
  tx.objectStore(CACHE_STORE).put({ value, savedAt: new Date().toISOString() }, key);
  await transactionDone(tx);
  db.close();
}

export async function offlineCacheGet<T>(key: string): Promise<T | null> {
  if (!("indexedDB" in window)) return null;
  const db = await openDatabase();
  const tx = db.transaction(CACHE_STORE, "readonly");
  const cached = await requestResult<{ value: T } | undefined>(tx.objectStore(CACHE_STORE).get(key));
  db.close();
  return cached?.value ?? null;
}

export async function queueOfflineMutation(mutation: Omit<OfflineMutation, "id" | "createdAt" | "attempts" | "issue">) {
  if (!("indexedDB" in window)) throw new Error("Este aparelho não oferece armazenamento offline.");
  const db = await openDatabase();
  const tx = db.transaction(OUTBOX_STORE, "readwrite");
  const store = tx.objectStore(OUTBOX_STORE);

  // Timer mutations are additive and therefore have no entityKey. Record edits do:
  // compacting them prevents a changed date from creating a phantom record.
  if (mutation.entityKey) {
    const all = await requestResult<OfflineMutation[]>(store.getAll());
    for (const previous of all) {
      if (previous.userId === mutation.userId && previous.entityKey === mutation.entityKey && previous.id !== undefined) {
        store.delete(previous.id);
      }
    }
  }

  store.add({ ...mutation, createdAt: new Date().toISOString(), attempts: 0 });
  await transactionDone(tx);
  db.close();
}

export async function offlinePendingCount(userId: number) {
  if (!("indexedDB" in window)) return 0;
  const db = await openDatabase();
  const tx = db.transaction(OUTBOX_STORE, "readonly");
  const all = await requestResult<OfflineMutation[]>(tx.objectStore(OUTBOX_STORE).getAll());
  db.close();
  return all.filter((item) => item.userId === userId).length;
}

export async function removeQueuedEntityChanges(userId: number, entityKey: string) {
  if (!("indexedDB" in window)) return;
  const db = await openDatabase();
  const tx = db.transaction(OUTBOX_STORE, "readwrite");
  const store = tx.objectStore(OUTBOX_STORE);
  const all = await requestResult<OfflineMutation[]>(store.getAll());
  for (const item of all) {
    if (item.userId === userId && item.entityKey === entityKey && item.id !== undefined) store.delete(item.id);
  }
  await transactionDone(tx);
  db.close();
}

/** @deprecated Prefer removeQueuedEntityChanges with a stable entity key. */
export async function removeQueuedRecordChanges(userId: number, date: string) {
  if (!("indexedDB" in window)) return;
  const db = await openDatabase();
  const tx = db.transaction(OUTBOX_STORE, "readwrite");
  const store = tx.objectStore(OUTBOX_STORE);
  const all = await requestResult<OfflineMutation[]>(store.getAll());
  for (const item of all) {
    const bodyDate = (item.body as { date?: string } | undefined)?.date;
    if (item.userId === userId && item.url.startsWith("/api/records") && bodyDate === date && item.id !== undefined) store.delete(item.id);
  }
  await transactionDone(tx);
  db.close();
}

async function responseMessage(response: Response) {
  try {
    const result = await response.clone().json() as { error?: string };
    return result.error || `Falha HTTP ${response.status}.`;
  } catch {
    return `Falha HTTP ${response.status}.`;
  }
}

async function saveIssue(db: IDBDatabase, mutation: OfflineMutation, status: number, message: string) {
  if (mutation.id === undefined) return;
  const tx = db.transaction(OUTBOX_STORE, "readwrite");
  tx.objectStore(OUTBOX_STORE).put({
    ...mutation,
    attempts: (mutation.attempts ?? 0) + 1,
    issue: { status, message, at: new Date().toISOString() },
  });
  await transactionDone(tx);
}

async function deleteMutation(db: IDBDatabase, id: number | undefined) {
  if (id === undefined) return;
  const tx = db.transaction(OUTBOX_STORE, "readwrite");
  tx.objectStore(OUTBOX_STORE).delete(id);
  await transactionDone(tx);
}

export async function syncOfflineMutations(userId: number, options: { retryBlocked?: boolean } = {}): Promise<OfflineSyncResult> {
  const pendingBefore = await offlinePendingCount(userId);
  if (!("indexedDB" in window) || !navigator.onLine) {
    return { synced: 0, pending: pendingBefore, failed: 0, status: "offline", issues: [] };
  }

  const db = await openDatabase();
  const listTx = db.transaction(OUTBOX_STORE, "readonly");
  const all = await requestResult<OfflineMutation[]>(listTx.objectStore(OUTBOX_STORE).getAll());
  let synced = 0;
  let failed = 0;
  let syncStatus: OfflineSyncResult["status"] = "complete";
  const issues: OfflineMutationIssue[] = [];

  for (const mutation of all.filter((item) => item.userId === userId).sort((a, b) => (a.id ?? 0) - (b.id ?? 0))) {
    if (mutation.issue && !options.retryBlocked) {
      failed += 1;
      issues.push(mutation.issue);
      syncStatus = "blocked";
      continue;
    }

    let response: Response;
    try {
      response = await fetch(mutation.url, {
        method: mutation.method,
        headers: { "Content-Type": "application/json", "X-Offline-Sync": "1" },
        credentials: "include",
        body: mutation.body === undefined ? undefined : JSON.stringify(mutation.body),
      });
    } catch {
      syncStatus = "network-error";
      break;
    }

    // DELETE is idempotent: a missing resource already has the desired state.
    if (response.ok || (mutation.method === "DELETE" && response.status === 404)) {
      await deleteMutation(db, mutation.id);
      synced += 1;
      continue;
    }

    const message = await responseMessage(response);
    if (response.status === 401 || response.status === 403) {
      syncStatus = "auth-required";
      issues.push({ status: response.status, message, at: new Date().toISOString() });
      break;
    }
    if (response.status >= 500 || response.status === 429) {
      syncStatus = "network-error";
      issues.push({ status: response.status, message, at: new Date().toISOString() });
      break;
    }

    await saveIssue(db, mutation, response.status, message);
    const issue = { status: response.status, message, at: new Date().toISOString() };
    issues.push(issue);
    failed += 1;
    syncStatus = "blocked";
  }

  db.close();
  const pending = await offlinePendingCount(userId);
  return { synced, pending, failed, status: syncStatus, issues };
}

export async function clearOfflineUserCaches(userId: number) {
  if (!("indexedDB" in window)) return;
  const db = await openDatabase();
  const tx = db.transaction(CACHE_STORE, "readwrite");
  const store = tx.objectStore(CACHE_STORE);
  const keys = await requestResult<IDBValidKey[]>(store.getAllKeys());
  for (const key of keys) {
    if (String(key).includes(`user-${userId}-`)) store.delete(key);
  }
  await transactionDone(tx);
  db.close();
}

export async function clearOfflineUserData(userId: number) {
  if (!("indexedDB" in window)) return;
  const db = await openDatabase();
  const cacheTx = db.transaction(CACHE_STORE, "readwrite");
  const cacheStore = cacheTx.objectStore(CACHE_STORE);
  const cacheKeys = await requestResult<IDBValidKey[]>(cacheStore.getAllKeys());
  for (const key of cacheKeys) {
    if (String(key).includes(`user-${userId}-`)) cacheStore.delete(key);
  }
  await transactionDone(cacheTx);

  const outboxTx = db.transaction(OUTBOX_STORE, "readwrite");
  const outboxStore = outboxTx.objectStore(OUTBOX_STORE);
  const mutations = await requestResult<OfflineMutation[]>(outboxStore.getAll());
  for (const item of mutations) {
    if (item.userId === userId && item.id !== undefined) outboxStore.delete(item.id);
  }
  await transactionDone(outboxTx);
  db.close();
}

import type { PlanNode } from './execution-plan'

const DB_NAME = 'oracle-plan-visualizer'
const DB_VERSION = 1
const STORE_NAME = 'saved-plans'

export interface SavedPlan {
  id: string
  name: string
  sqlName?: string
  environment?: string
  notes?: string
  createdAt: number
  updatedAt: number
  plan: PlanNode
}

export type SavedPlanInput = Omit<SavedPlan, 'id' | 'createdAt' | 'updatedAt'> &
  Partial<Pick<SavedPlan, 'id' | 'createdAt' | 'updatedAt'>>

function getIndexedDb(): IDBFactory {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    throw new Error('Plan history requires a browser with IndexedDB support.')
  }

  return indexedDB
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'))
  })
}

function openDatabase(): Promise<IDBDatabase> {
  const request = getIndexedDb().open(DB_NAME, DB_VERSION)

  request.onupgradeneeded = () => {
    const database = request.result
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
  }

  return requestResult(request)
}

function newestFirst(plans: SavedPlan[]): SavedPlan[] {
  return plans.sort((left, right) => right.updatedAt - left.updatedAt)
}

export async function listSavedPlans(): Promise<SavedPlan[]> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const plans = await requestResult(transaction.objectStore(STORE_NAME).getAll())
    await transactionComplete(transaction)
    return newestFirst(plans)
  } finally {
    database.close()
  }
}

export async function getSavedPlan(id: string): Promise<SavedPlan | undefined> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const plan = await requestResult(transaction.objectStore(STORE_NAME).get(id))
    await transactionComplete(transaction)
    return plan
  } finally {
    database.close()
  }
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export async function savePlan(input: SavedPlanInput): Promise<SavedPlan> {
  const now = Date.now()
  const savedPlan: SavedPlan = {
    ...input,
    id: input.id ?? createId(),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  }

  const database = await openDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(savedPlan)
    await transactionComplete(transaction)
    return savedPlan
  } finally {
    database.close()
  }
}

export async function deleteSavedPlan(id: string): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(id)
    await transactionComplete(transaction)
  } finally {
    database.close()
  }
}

export async function clearPlanHistory(): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).clear()
    await transactionComplete(transaction)
  } finally {
    database.close()
  }
}

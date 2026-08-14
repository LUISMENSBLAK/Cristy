/**
 * offlineQueue.ts
 * ---------------
 * Resilient offline queue using idb-keyval (IndexedDB).
 *
 * Priority rules (per user approval):
 *  - Cash payments MUST never be blocked by network failures.
 *  - Card payments depend on the physical terminal — offline note shown.
 *  - Blocked orders (pending sync) appear locked in the UI.
 *  - On sync failure → admin alert stored for manual review.
 */

import { get, set, del, keys } from 'idb-keyval'

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type OfflineOpType =
  | 'procesar_pago'

export type OfflineOpStatus =
  | 'pending'      // Waiting to be synced
  | 'syncing'      // Sync in progress
  | 'failed'       // Sync attempted and failed — needs admin review

export interface PendingPayment {
  id: string             // Local UUID
  type: 'procesar_pago'
  status: OfflineOpStatus
  createdAt: string      // ISO string
  attempts: number
  lastError?: string

  // Fields mirroring processPayment params
  orderId: string
  tableId: string | null
  itemIds: string[]
  metodo: 'efectivo' | 'tarjeta'
  montoRecibido: number
  montoCobrado: number
  cambio: number
  employeeId: string

  // For optimistic local display
  localOrderLabel: string  // e.g. "Mesa 3" or "Para llevar"
}

// ────────────────────────────────────────────────────────────────────────────
// Storage key helpers
// ────────────────────────────────────────────────────────────────────────────

const QUEUE_PREFIX = 'offline_payment_'
const FAILED_PREFIX = 'failed_payment_'

export function paymentKey(id: string) { return `${QUEUE_PREFIX}${id}` }
export function failedKey(id: string) { return `${FAILED_PREFIX}${id}` }

// ────────────────────────────────────────────────────────────────────────────
// Core queue operations
// ────────────────────────────────────────────────────────────────────────────

/** Add a pending cash payment to the local queue */
export async function enqueuePendingPayment(op: Omit<PendingPayment, 'status' | 'attempts' | 'createdAt'>): Promise<void> {
  const full: PendingPayment = {
    ...op,
    status: 'pending',
    attempts: 0,
    createdAt: new Date().toISOString(),
  }
  await set(paymentKey(op.id), full)
}

/** Get all pending (non-failed) payments */
export async function getPendingPayments(): Promise<PendingPayment[]> {
  const allKeys = await keys()
  const pendingKeys = allKeys.filter(k => typeof k === 'string' && (k as string).startsWith(QUEUE_PREFIX))
  const payments = await Promise.all(pendingKeys.map(k => get<PendingPayment>(k)))
  return payments.filter(Boolean) as PendingPayment[]
}

/** Get all failed (admin-review) payments */
export async function getFailedPayments(): Promise<PendingPayment[]> {
  const allKeys = await keys()
  const failedKeys = allKeys.filter(k => typeof k === 'string' && (k as string).startsWith(FAILED_PREFIX))
  const payments = await Promise.all(failedKeys.map(k => get<PendingPayment>(k)))
  return payments.filter(Boolean) as PendingPayment[]
}

/** Remove a successfully synced payment from the queue */
export async function removePendingPayment(id: string): Promise<void> {
  await del(paymentKey(id))
}

/** Move a payment to the failed list for admin review */
export async function markPaymentFailed(id: string, error: string): Promise<void> {
  const op = await get<PendingPayment>(paymentKey(id))
  if (!op) return
  const failed: PendingPayment = { ...op, status: 'failed', lastError: error }
  await set(failedKey(id), failed)
  await del(paymentKey(id))
}

/** Get all item IDs that are blocked locally (pending payment sync) */
export async function getBlockedItemIds(): Promise<string[]> {
  const pending = await getPendingPayments()
  return pending.flatMap(p => p.itemIds)
}

// ────────────────────────────────────────────────────────────────────────────
// Sync engine
// ────────────────────────────────────────────────────────────────────────────

export type SyncResult =
  | { type: 'success'; id: string }
  | { type: 'failed'; id: string; error: string }

/**
 * Attempt to sync all pending payments.
 * Call this when the network comes back online.
 * Returns results for each attempted operation.
 */
export async function syncPendingPayments(
  processPaymentFn: (params: {
    orderId: string
    tableId: string | null
    itemIds: string[]
    metodo: 'efectivo' | 'tarjeta'
    montoRecibido: number
    montoCobrado: number
    cambio: number
    employeeId: string
  }) => Promise<{ error?: string; success?: boolean }>
): Promise<SyncResult[]> {
  const pending = await getPendingPayments()
  const results: SyncResult[] = []

  for (const op of pending) {
    // Update status to syncing
    await set(paymentKey(op.id), { ...op, status: 'syncing', attempts: op.attempts + 1 })

    try {
      const res = await processPaymentFn({
        orderId: op.orderId,
        tableId: op.tableId,
        itemIds: op.itemIds,
        metodo: op.metodo,
        montoRecibido: op.montoRecibido,
        montoCobrado: op.montoCobrado,
        cambio: op.cambio,
        employeeId: op.employeeId,
      })

      if (res?.error) {
        // RPC rejected — send to admin review queue
        await markPaymentFailed(op.id, res.error)
        results.push({ type: 'failed', id: op.id, error: res.error })
      } else {
        // Success — remove from queue
        await removePendingPayment(op.id)
        results.push({ type: 'success', id: op.id })
      }
    } catch (err: any) {
      // Network error during sync — keep as pending for retry
      await set(paymentKey(op.id), {
        ...op,
        status: 'pending',
        attempts: op.attempts + 1,
        lastError: err.message,
      })
      // Don't push to failed — will retry next time
    }
  }

  return results
}

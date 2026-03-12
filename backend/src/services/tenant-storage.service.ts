/**
 * Tenant-Scoped Storage Helpers
 *
 * Provides utilities for tenant-aware data operations.
 * All functions accept optional tenantId — when undefined, no tenant filter is applied.
 */

import { IStorageAdapter, QueryFilter, QueryResult } from '../core/storage'

/**
 * Add tenantId to a query filter's where clause.
 * If tenantId is undefined, returns the original filter unchanged.
 */
export function withTenantFilter(tenantId: string | undefined, filter: QueryFilter = {}): QueryFilter {
  if (!tenantId) return filter

  return {
    ...filter,
    where: {
      ...filter.where,
      tenantId,
    },
  }
}

/**
 * Save data with tenantId injected into the data object.
 * If tenantId is undefined, saves without tenant field.
 */
export async function saveTenantData<T extends Record<string, any>>(
  storage: IStorageAdapter<T>,
  key: string,
  tenantId: string | undefined,
  data: T,
): Promise<void> {
  const enriched = tenantId ? { ...data, tenantId } : data
  await storage.save(key, enriched as T)
}

/**
 * Query data scoped to a tenant.
 * If tenantId is undefined, queries all data (no tenant filter).
 */
export async function queryTenantData<T>(
  storage: IStorageAdapter<T>,
  tenantId: string | undefined,
  filter: QueryFilter = {},
): Promise<QueryResult<T>> {
  return storage.query(withTenantFilter(tenantId, filter))
}

/**
 * List data scoped to a tenant.
 * Uses query with tenantId filter since list() doesn't support where clauses.
 */
export async function listTenantData<T>(
  storage: IStorageAdapter<T>,
  tenantId: string | undefined,
): Promise<T[]> {
  if (!tenantId) return storage.list()

  const result = await storage.query({ where: { tenantId } })
  return result.data
}

/**
 * Get data by key, verifying it belongs to the specified tenant.
 * If tenantId is undefined, returns data without tenant check.
 */
export async function getTenantData<T extends Record<string, any>>(
  storage: IStorageAdapter<T>,
  key: string,
  tenantId: string | undefined,
): Promise<T | null> {
  const data = await storage.get(key)
  if (!data) return null

  if (tenantId && (data as any).tenantId && (data as any).tenantId !== tenantId) {
    return null // Cross-tenant access denied
  }

  return data
}

/**
 * Delete data by key, verifying it belongs to the specified tenant.
 */
export async function deleteTenantData<T extends Record<string, any>>(
  storage: IStorageAdapter<T>,
  key: string,
  tenantId: string | undefined,
): Promise<boolean> {
  if (!tenantId) return storage.delete(key)

  const data = await storage.get(key)
  if (!data) return false

  if ((data as any).tenantId && (data as any).tenantId !== tenantId) {
    return false // Cross-tenant access denied
  }

  return storage.delete(key)
}

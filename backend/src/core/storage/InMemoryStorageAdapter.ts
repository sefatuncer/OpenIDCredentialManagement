/**
 * In-Memory Storage Adapter
 *
 * Provides a Map-based in-memory storage implementation for development and testing.
 * Data is lost when the process restarts.
 */

import {
  IStorageAdapter,
  IStorageAdapterFactory,
  QueryFilter,
  QueryResult,
} from './IStorageAdapter'

/**
 * In-memory storage adapter using Map
 */
export class InMemoryStorageAdapter<T>
  implements IStorageAdapter<T>
{
  private data: Map<string, T> = new Map()
  private collection: string

  constructor(collection: string) {
    this.collection = collection
  }

  async save(key: string, data: T): Promise<void> {
    this.data.set(key, { ...data })
  }

  async get(key: string): Promise<T | null> {
    const item = this.data.get(key)
    return item ? { ...item } : null
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key)
  }

  async list(prefix?: string): Promise<T[]> {
    const results: T[] = []
    for (const [key, value] of this.data.entries()) {
      if (!prefix || key.startsWith(prefix)) {
        results.push({ ...value })
      }
    }
    return results
  }

  async query(filter: QueryFilter): Promise<QueryResult<T>> {
    let results = Array.from(this.data.values())

    // Apply where filters
    if (filter.where) {
      results = results.filter((item) => {
        const record = item as Record<string, unknown>
        return Object.entries(filter.where!).every(([field, value]) => {
          const itemValue = record[field]
          if (Array.isArray(value)) {
            return value.includes(itemValue)
          }
          return itemValue === value
        })
      })
    }

    // Apply date range filter
    if (filter.dateRange) {
      const { field, start, end } = filter.dateRange
      results = results.filter((item) => {
        const record = item as Record<string, unknown>
        const dateValue = record[field]
        if (!(dateValue instanceof Date) && typeof dateValue !== 'string') {
          return true
        }
        const date = new Date(dateValue as string | Date)
        if (start && date < start) return false
        if (end && date > end) return false
        return true
      })
    }

    // Get total before pagination
    const total = results.length

    // Apply sorting
    if (filter.orderBy) {
      const descending = filter.orderBy.startsWith('-')
      const field = descending ? filter.orderBy.slice(1) : filter.orderBy
      results.sort((a, b) => {
        const aRec = a as Record<string, unknown>
        const bRec = b as Record<string, unknown>
        const aVal = aRec[field]
        const bVal = bRec[field]
        if (aVal === bVal) return 0
        if (aVal === null || aVal === undefined) return 1
        if (bVal === null || bVal === undefined) return -1
        const comparison = aVal < bVal ? -1 : 1
        return descending ? -comparison : comparison
      })
    }

    // Apply pagination
    const offset = filter.offset || 0
    const limit = filter.limit || 100
    results = results.slice(offset, offset + limit)

    return {
      data: results.map((item) => ({ ...item })),
      total,
      hasMore: offset + results.length < total,
    }
  }

  async count(filter?: QueryFilter): Promise<number> {
    if (!filter || (!filter.where && !filter.dateRange)) {
      return this.data.size
    }

    const result = await this.query({ ...filter, limit: undefined, offset: undefined })
    return result.total
  }

  async exists(key: string): Promise<boolean> {
    return this.data.has(key)
  }

  async update(key: string, data: Partial<T>): Promise<T | null> {
    const existing = this.data.get(key)
    if (!existing) {
      return null
    }

    const updated = { ...existing, ...data } as T
    this.data.set(key, updated)
    return { ...updated }
  }

  async clear(): Promise<void> {
    this.data.clear()
  }

  getAdapterType(): string {
    return 'memory'
  }

  /**
   * Get the size of the collection (for debugging)
   */
  size(): number {
    return this.data.size
  }

  /**
   * Export all data (for backup/migration)
   */
  exportData(): Map<string, T> {
    return new Map(this.data)
  }

  /**
   * Import data (for restore/migration)
   */
  importData(data: Map<string, T> | Array<[string, T]>): void {
    const entries = data instanceof Map ? data.entries() : data
    for (const [key, value] of entries) {
      this.data.set(key, { ...value })
    }
  }
}

/**
 * In-memory storage adapter factory
 */
export class InMemoryStorageAdapterFactory implements IStorageAdapterFactory {
  private adapters: Map<string, InMemoryStorageAdapter<any>> = new Map()

  create<T = any>(collection: string): IStorageAdapter<T> {
    if (!this.adapters.has(collection)) {
      this.adapters.set(collection, new InMemoryStorageAdapter<T>(collection))
    }
    return this.adapters.get(collection)!
  }

  getStorageType(): string {
    return 'memory'
  }

  async isAvailable(): Promise<boolean> {
    return true
  }

  async initialize(): Promise<void> {
    // No initialization needed for in-memory storage
  }

  async shutdown(): Promise<void> {
    this.adapters.clear()
  }

  /**
   * Get all collection names
   */
  getCollections(): string[] {
    return Array.from(this.adapters.keys())
  }

  /**
   * Export all data from all collections
   */
  exportAll(): Record<string, Array<[string, unknown]>> {
    const result: Record<string, Array<[string, unknown]>> = {}
    for (const [name, adapter] of this.adapters.entries()) {
      result[name] = Array.from(adapter.exportData().entries())
    }
    return result
  }

  /**
   * Import data to all collections
   */
  importAll(data: Record<string, Array<[string, unknown]>>): void {
    for (const [name, entries] of Object.entries(data)) {
      const adapter = this.create(name)
      if (adapter instanceof InMemoryStorageAdapter) {
        adapter.importData(entries as Array<[string, Record<string, unknown>]>)
      }
    }
  }
}

/**
 * Global in-memory storage factory instance
 */
export const inMemoryStorageFactory = new InMemoryStorageAdapterFactory()

import { randomUUID } from 'node:crypto';
import type { Firestore, Transaction, Query } from 'firebase-admin/firestore';
import type { Json, TableName } from '@/types/database.types';

export type Doc = { id: string; [key: string]: Json | undefined };
export type Filter = { field: string; op: '==' | 'in' | 'array-contains'; value: unknown };
export class DomainError extends Error {
  constructor(
    message: string,
    public code = 'P0001',
  ) {
    super(message);
  }
}
export function fail(message = 'คุณไม่มีสิทธิ์ดำเนินการนี้', code = '42501'): never {
  throw new DomainError(message, code);
}
export class Store {
  private pending = new Map<string, Doc | null>();
  private cache = new Map<string, Promise<Doc | null>>();
  private queries = new Map<string, Promise<Doc[]>>();
  constructor(
    public db: Firestore,
    public tx?: Transaction,
  ) {}
  async get(table: string, id: string): Promise<Doc | null> {
    if (!id || id.includes('/')) return null;
    const key = table + '/' + id;
    if (this.pending.has(key)) return this.pending.get(key)!;
    if (!this.cache.has(key))
      this.cache.set(
        key,
        (async () => {
          const ref = this.db.collection(table).doc(id);
          const s = this.tx ? await this.tx.get(ref) : await ref.get();
          return s.exists ? ({ ...s.data(), id: s.id } as Doc) : null;
        })(),
      );
    return this.cache.get(key)!;
  }
  async list(table: string, filter?: Filter): Promise<Doc[]> {
    let q: Query = this.db.collection(table);
    if (filter) q = q.where(filter.field, filter.op, filter.value);
    const key = JSON.stringify([table, filter]);
    if (!this.queries.has(key))
      this.queries.set(
        key,
        (async () => {
          const snap = this.tx ? await this.tx.get(q) : await q.get();
          return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Doc);
        })(),
      );
    const rows = new Map((await this.queries.get(key)!).map((d) => [d.id, d]));
    for (const [key, d] of this.pending)
      if (key.startsWith(table + '/')) {
        const id = key.slice(table.length + 1);
        rows.delete(id);
        if (d && (!filter || matches(d, filter))) rows.set(id, d);
      }
    return [...rows.values()];
  }
  async require(table: string, id: string) {
    const r = await this.get(table, id);
    if (!r) fail('ไม่พบข้อมูลอ้างอิง', '23503');
    return r;
  }
  put(table: string, doc: Doc) {
    if (!this.tx) throw new Error('Writes require transaction');
    this.pending.set(table + '/' + doc.id, doc);
  }
  remove(table: string, id: string) {
    if (!this.tx) throw new Error('Writes require transaction');
    this.pending.set(table + '/' + id, null);
  }
  async lock(scope: string) {
    if (!this.tx) throw new Error('Lock requires transaction');
    await this.get('_locks', scope);
    this.put('_locks', { id: scope, version: randomUUID() });
  }
  flush() {
    if (!this.tx) throw new Error('Transaction required');
    let size = 0;
    for (const [path, d] of this.pending) {
      size += Buffer.byteLength(JSON.stringify(d));
      if (size > 8_000_000) fail('ข้อมูลมากเกินไป กรุณาลดจำนวนรายการและลองใหม่');
      const ref = this.db.doc(path);
      if (d) this.tx.set(ref, d);
      else this.tx.delete(ref);
    }
  }
}
function matches(d: Doc, f: Filter) {
  return f.op === '=='
    ? d[f.field] === f.value
    : f.op === 'in'
      ? (f.value as unknown[]).includes(d[f.field])
      : Array.isArray(d[f.field]) && (d[f.field] as Json[]).includes(f.value as Json);
}
export async function atomic<T>(db: Firestore, fn: (s: Store) => Promise<T>) {
  return db.runTransaction(async (tx) => {
    const s = new Store(db, tx);
    const r = await fn(s);
    s.flush();
    return r;
  });
}
export const refId = (d: Doc, key: string) => String(d[key] || '');
export const now = () => new Date().toISOString();
export function newDoc(values: Record<string, Json | undefined>): Doc {
  return { id: randomUUID(), created_at: now(), updated_at: now(), ...values };
}
export async function audit(
  s: Store,
  school: string,
  actor: string | null,
  table: TableName | string,
  before: Doc | null,
  after: Doc | null,
  action?: string,
  metadata: Json = {},
) {
  const clean = (d: Doc | null) => {
    if (!d) return null;
    const copy = { ...d };
    delete copy.national_student_id;
    return copy as Json;
  };
  s.put(
    'audit_logs',
    newDoc({
      school_id: school,
      _school_id: school,
      actor_user_id: actor,
      entity_type: table,
      entity_id: after?.id || before?.id || null,
      action: action || (before ? 'update' : 'insert'),
      before_data: clean(before),
      after_data: clean(after),
      metadata,
    }),
  );
}

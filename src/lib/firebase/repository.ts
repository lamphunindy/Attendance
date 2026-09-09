import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import type { Database, TableName, Row, Json } from '@/types/database.types';
import { type Doc, Store, atomic, DomainError, fail } from './store';
import { Permissions } from './permissions';
import { persist } from './validation';
import { operation } from './operations';

type ErrorResult = { code: string; message: string };
type Result<T> =
  { data: T; error: null; count: number | null } | { data: null; error: ErrorResult; count: null };
type Predicate = (d: Doc) => boolean;
function compareValue(left:Json|undefined,right:string|number) {
  if(typeof right==='number')return Number(left)-right;
  if(typeof left==='string'&&left.includes('T')&&right.includes('T')){
    const a=Date.parse(left),b=Date.parse(right);if(Number.isFinite(a)&&Number.isFinite(b))return a-b;
  }
  return String(left).localeCompare(right);
}
export class Repository {
  readStore: Store;
  constructor(
    public firestore: Firestore,
    public actor: string,
  ) {
    this.readStore = new Store(firestore);
  }
  from<T extends TableName>(table: T) {
    return new CollectionQuery<T>(this, table);
  }
  async rpc<K extends keyof Database['public']['Functions']>(
    name: K,
    args: Database['public']['Functions'][K]['Args'],
  ): Promise<Result<Database['public']['Functions'][K]['Returns']>> {
    try {
      const data =
        name === 'assignment_statistics'
          ? await operation(this.readStore, this.actor, name, args)
          : await atomic(this.firestore, (s) => operation(s, this.actor, name, args));
      if (name !== 'assignment_statistics') this.readStore = new Store(this.firestore);
      return { data: data as Database['public']['Functions'][K]['Returns'], error: null, count: null };
    } catch (e) {
      return failure(e);
    }
  }
}
function failure(e: unknown): { data: null; error: ErrorResult; count: null } {
  return {
    data: null,
    error: {
      code: e instanceof DomainError ? e.code : 'P0001',
      message: e instanceof Error ? e.message : 'ไม่สามารถอ่านหรือบันทึกข้อมูลได้',
    },
    count: null,
  };
}
export class CollectionQuery<T extends TableName> implements PromiseLike<Result<Row<T>[]>> {
  private predicates: Predicate[] = [];
  private indexed: { field: string; values: unknown[] } | null = null;
  private sort: { field: string; asc: boolean }[] = [];
  private start = 0;
  private end = Infinity;
  private fields: string[] | null = null;
  private head = false;
  private mutation: {
    kind: 'insert' | 'update' | 'upsert';
    values: Record<string, unknown>[];
    keys?: string[];
  } | null = null;
  constructor(
    private repo: Repository,
    private table: T,
  ) {}
  select(fields: string, options?: { count?: string; head?: boolean }) {
    this.fields = fields === '*' ? null : fields.split(',').map((s) => s.trim());
    this.head = !!options?.head;
    return this;
  }
  eq(field: string, value: unknown) {
    this.predicates.push((d) => d[field] === value);
    if (!this.indexed || field === 'id') this.indexed = { field, values: [value] };
    return this;
  }
  filter(field: string, operator: string, value: unknown) {
    if (operator === 'in')
      return this.in(
        field,
        String(value)
          .replace(/^\(|\)$/g, '')
          .split(','),
      );
    if (operator !== 'eq') throw new Error('Unsupported filter');
    return this.eq(field, value);
  }
  or(expression: string) {
    const terms = expression.split(',').map((term) => {
      const [field, operator, ...rest] = term.split('.');
      if (!['ilike', 'eq'].includes(operator)) throw new Error('Unsupported search');
      return { field, operator, value: rest.join('.').replace(/^%|%$/g, '').toLocaleLowerCase('th') };
    });
    this.predicates.push((d) =>
      terms.some((t) =>
        t.operator === 'eq'
          ? String(d[t.field]) === t.value
          : String(d[t.field] || '')
              .toLocaleLowerCase('th')
              .includes(t.value),
      ),
    );
    return this;
  }
  in(field: string, values: readonly unknown[]) {
    this.predicates.push((d) => values.includes(d[field]));
    if (!this.indexed || field === 'id') this.indexed = { field, values: [...values] };
    return this;
  }
  gte(field: string, value: string | number) {
    this.predicates.push((d) => compareValue(d[field],value)>=0);
    return this;
  }
  lt(field: string, value: string | number) {
    this.predicates.push((d) => compareValue(d[field],value)<0);
    return this;
  }
  order(field: string, options?: { ascending?: boolean }) {
    this.sort.push({ field, asc: options?.ascending !== false });
    return this;
  }
  limit(n: number) {
    this.end = this.start + n;
    return this;
  }
  range(start: number, end: number) {
    this.start = start;
    this.end = end + 1;
    return this;
  }
  insert(value: Database['public']['Tables'][T]['Insert'] | Database['public']['Tables'][T]['Insert'][]) {
    this.mutation = {
      kind: 'insert',
      values: (Array.isArray(value) ? value : [value]) as Record<string, unknown>[],
    };
    return this;
  }
  update(value: Database['public']['Tables'][T]['Update']) {
    this.mutation = { kind: 'update', values: [value as Record<string, unknown>] };
    return this;
  }
  upsert(
    value: Database['public']['Tables'][T]['Insert'] | Database['public']['Tables'][T]['Insert'][],
    options?: { onConflict?: string },
  ) {
    this.mutation = {
      kind: 'upsert',
      values: (Array.isArray(value) ? value : [value]) as Record<string, unknown>[],
      keys: (options?.onConflict || 'id').split(','),
    };
    return this;
  }
  async single(): Promise<Result<Row<T>>> {
    const r = await this.execute();
    if (r.error) return r;
    if (r.data.length !== 1) return failure(new DomainError('ไม่พบข้อมูลที่ต้องการ', 'PGRST116'));
    return { data: r.data[0], error: null, count: r.count };
  }
  async maybeSingle(): Promise<Result<Row<T> | null>> {
    const r = await this.execute();
    if (r.error) return r;
    if (r.data.length > 1) return failure(new DomainError('พบข้อมูลซ้ำ'));
    return { data: r.data[0] || null, error: null, count: r.count };
  }
  then<TResult1 = Result<Row<T>[]>, TResult2 = never>(
    onfulfilled?: ((v: Result<Row<T>[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
  private async candidates(s: Store, p: Permissions) {
    if (this.indexed) {
      const { field, values } = this.indexed;
      const result = new Map<string, Doc>();
      for (let i = 0; i < values.length; i += 30) {
        const part = values.slice(i, i + 30);
        if (field === 'id') {
          for (const value of part) {
            const d = await s.get(this.table, String(value));
            if (d) result.set(d.id, d);
          }
        } else {
          for (const d of await s.list(this.table, {
            field,
            op: part.length === 1 ? '==' : 'in',
            value: part.length === 1 ? part[0] : part,
          }))
            result.set(d.id, d);
        }
      }
      return [...result.values()];
    }
    return p.candidates(this.table);
  }
  private async execute(): Promise<Result<Row<T>[]>> {
    try {
      const fn = async (s: Store) => {
        const p = new Permissions(s, this.repo.actor);
        let found: Doc[] = [];
        if (!this.mutation || this.mutation.kind === 'update')
          for (const d of await this.candidates(s, p))
            if (this.predicates.every((f) => f(d)) && (await p.canRead(this.table, d))) found.push(d);
        if (this.mutation) {
          const { kind, values, keys } = this.mutation;
          if (kind === 'update') {
            if (!found.length) fail();
            const result: Doc[] = [];
            for (const d of found) result.push(await persist(s, p, this.table, { ...d, ...values[0] }, d));
            found = result;
          } else {
            found = [];
            for (const value of values) {
              let before: Doc | null = null;
              if (kind === 'upsert' && keys) {
                const key = keys[0];
                if (value[key] !== undefined)
                  before =
                    (await s.list(this.table, { field: key, op: '==', value: value[key] })).find((d) =>
                      keys.every((k) => d[k] === value[k]),
                    ) || null;
              }
              found.push(await persist(s, p, this.table, { ...before, ...value }, before));
            }
          }
        }
        const count = found.length;
        if (this.sort.length)
          found.sort((a, b) => {
            for (const { field, asc } of this.sort) {
              const av = a[field],
                bv = b[field];
              const n =
                av === bv
                  ? 0
                  : av == null
                    ? -1
                    : bv == null
                      ? 1
                      : typeof av === 'number' && typeof bv === 'number'
                        ? av - bv
                        : String(av).localeCompare(String(bv), 'th');
              if (n) return asc ? n : -n;
            }
            return a.id.localeCompare(b.id);
          });
        else found.sort((a, b) => a.id.localeCompare(b.id));
        const projected = found.slice(this.start, this.end).map((d) => {
          const out: Record<string, Json | undefined> = {};
          for (const k of this.fields || Object.keys(d))
            if (!k.startsWith('_') && k !== 'national_student_id') out[k] = d[k];
          return out as Row<T>;
        });
        return { data: this.head ? [] : projected, error: null, count } as Result<Row<T>[]>;
      };
      if (this.mutation) {
        const result = await atomic(this.repo.firestore, fn);
        this.repo.readStore = new Store(this.repo.firestore);
        return result;
      }
      return await fn(this.repo.readStore);
    } catch (e) {
      return failure(e);
    }
  }
}

# ERP 2.0 — Fase 0 (Fundamento) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the ERP foundation so that four invariants are structurally impossible to violate: tenant isolation, no unauthorized writes, immutable event log, and lossless money.

**Architecture:** A new TypeScript repo with a hard separation between pure domain code (no I/O) and the platform layer (Postgres). Tenant isolation is enforced by Postgres RLS with the application connecting as a **non-owner role**, so a bug in application code cannot leak data across tenants. Every mutation flows through a single command bus that calls a pure `authorize()` gatekeeper and appends an immutable event in the same transaction. Money is a `bigint`-backed value object; floating point is never used.

**Tech Stack:** TypeScript 5.7 · Node 22 · Postgres 17 (Docker) · `pg` · Vitest · fast-check · plain SQL migrations with a hand-rolled runner (zero vendor lock-in).

**Repo location:** `C:\Users\NewtonSupreme\Videos\lycos-erp` (new, separate from the WhatsApp bot repo). All paths below are relative to that directory.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `vitest.config.ts` | Toolchain |
| `docker-compose.test.yml` | Ephemeral Postgres for tests |
| `db/migrate.ts` | Migration runner (applies `db/migrations/*.sql` in order, records them) |
| `db/migrations/001_roles_and_schema.sql` | `migrator` / `app_user` roles, `app` schema, `app.current_org()` |
| `db/migrations/002_organization.sql` | `organization` table |
| `db/migrations/003_identity.sql` | `user_account`, `membership` |
| `db/migrations/004_authorization.sql` | `role`, `role_grant`, `location`, `actor_location` |
| `db/migrations/005_event_log.sql` | `event` table, append-only grants |
| `src/platform/money/money.ts` | `Money` value object: construction, add, subtract, multiply |
| `src/platform/money/allocate.ts` | Remainder-safe splitting |
| `src/platform/money/rate.ts` | `Rate`, explicit conversion, historical lookup |
| `src/platform/tenancy/client.ts` | Org-scoped DB client; the only way app code touches Postgres |
| `src/platform/authz/types.ts` | `Actor`, `Grant`, `Scope`, `Resource`, `Decision` |
| `src/platform/authz/authorize.ts` | The gatekeeper — pure function, no I/O |
| `src/platform/events/append.ts` | Appends an event inside a caller-supplied transaction |
| `src/platform/commands/types.ts` | `CommandDefinition` |
| `src/platform/commands/registry.ts` | Registry of all commands |
| `src/platform/commands/bus.ts` | authorize → execute → append event, in one transaction |
| `test/helpers/db.ts` | Test DB lifecycle, migration application, truncation |
| `test/invariant-1-tenant-isolation.test.ts` | Adversarial cross-tenant tests |
| `test/invariant-2-authorization.test.ts` | Registry sweep + bus behaviour |
| `test/invariant-3-events.test.ts` | Immutability + every mutation emits |
| `test/invariant-4-money.test.ts` | Property tests |
| `.github/workflows/ci.yml` | Migrations from zero + full suite on every push |

---

## Task 1: Project skeleton

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `src/index.ts`, `test/smoke.test.ts`

- [ ] **Step 1: Create the directory and initialise git**

```bash
mkdir -p "C:/Users/NewtonSupreme/Videos/lycos-erp"
cd "C:/Users/NewtonSupreme/Videos/lycos-erp"
git init
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "lycos-erp",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "db:up": "docker compose -f docker-compose.test.yml up -d --wait",
    "db:down": "docker compose -f docker-compose.test.yml down -v",
    "db:migrate": "tsx db/migrate.ts"
  },
  "dependencies": {
    "pg": "8.13.1"
  },
  "devDependencies": {
    "@types/node": "22.10.2",
    "@types/pg": "8.11.10",
    "fast-check": "3.23.2",
    "tsx": "4.19.2",
    "typescript": "5.7.2",
    "vitest": "2.1.8"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "db/**/*.ts"]
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
```

Note: `singleFork` is deliberate. The invariant tests share one Postgres instance and set session-level tenant context; running them in parallel forks would interleave `set_config` calls and produce false passes.

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
dist/
.env
.env.local
```

- [ ] **Step 6: Create `test/smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs typescript tests', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: Install and run**

```bash
npm install
npm test
```

Expected: `1 passed`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: project skeleton (typescript, vitest)"
```

---

## Task 2: Money value object

**Files:**
- Create: `src/platform/money/money.ts`
- Test: `test/unit/money.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/unit/money.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { money, add, subtract, multiplyByQuantity, isZero } from '../../src/platform/money/money.js';

describe('Money', () => {
  it('holds integer minor units and a currency', () => {
    const m = money(1250n, 'USD');
    expect(m.amountMinor).toBe(1250n);
    expect(m.currency).toBe('USD');
  });

  it('rejects non-integer numeric input', () => {
    expect(() => money(12.5 as unknown as number, 'USD')).toThrow(/integer minor units/);
  });

  it('adds amounts of the same currency', () => {
    expect(add(money(1250n, 'USD'), money(99n, 'USD')).amountMinor).toBe(1349n);
  });

  it('refuses to add different currencies', () => {
    expect(() => add(money(1n, 'USD'), money(1n, 'VES'))).toThrow(/currency mismatch/);
  });

  it('subtracts and can go negative', () => {
    expect(subtract(money(100n, 'USD'), money(150n, 'USD')).amountMinor).toBe(-50n);
  });

  it('multiplies by an integer quantity', () => {
    expect(multiplyByQuantity(money(333n, 'USD'), 3n).amountMinor).toBe(999n);
  });

  it('detects zero', () => {
    expect(isZero(money(0n, 'USD'))).toBe(true);
    expect(isZero(money(1n, 'USD'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/money.test.ts`
Expected: FAIL — `Cannot find module '../../src/platform/money/money.js'`.

- [ ] **Step 3: Write the implementation**

Create `src/platform/money/money.ts`:

```ts
export type Currency = string;

export interface Money {
  readonly amountMinor: bigint;
  readonly currency: Currency;
}

export function money(amountMinor: bigint | number, currency: Currency): Money {
  if (typeof amountMinor === 'number' && !Number.isInteger(amountMinor)) {
    throw new Error(`Money requires integer minor units, received ${amountMinor}`);
  }
  if (!currency) {
    throw new Error('Money requires a currency');
  }
  return { amountMinor: BigInt(amountMinor), currency };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor - b.amountMinor, currency: a.currency };
}

export function multiplyByQuantity(m: Money, quantity: bigint): Money {
  return { amountMinor: m.amountMinor * quantity, currency: m.currency };
}

export function isZero(m: Money): boolean {
  return m.amountMinor === 0n;
}

export function sum(amounts: readonly Money[], currency: Currency): Money {
  return amounts.reduce((acc, m) => add(acc, m), money(0n, currency));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/money.test.ts`
Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/platform/money/money.ts test/unit/money.test.ts
git commit -m "feat(money): Money value object backed by bigint minor units"
```

---

## Task 3: Remainder-safe allocation

Splitting money is where real systems lose or invent cents. This is a property, not an example.

**Files:**
- Create: `src/platform/money/allocate.ts`
- Test: `test/invariant-4-money.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/invariant-4-money.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { money, sum } from '../src/platform/money/money.js';
import { allocate } from '../src/platform/money/allocate.js';

describe('Invariant 4: money never loses or invents minor units', () => {
  it('splits 10.00 into three equal parts without losing a cent', () => {
    const parts = allocate(money(1000n, 'USD'), [1n, 1n, 1n]);
    expect(parts.map(p => p.amountMinor)).toEqual([334n, 333n, 333n]);
    expect(sum(parts, 'USD').amountMinor).toBe(1000n);
  });

  it('respects weights', () => {
    const parts = allocate(money(1000n, 'USD'), [3n, 1n]);
    expect(parts.map(p => p.amountMinor)).toEqual([750n, 250n]);
  });

  it('handles negative amounts', () => {
    const parts = allocate(money(-1000n, 'USD'), [1n, 1n, 1n]);
    expect(sum(parts, 'USD').amountMinor).toBe(-1000n);
  });

  it('rejects empty or non-positive weights', () => {
    expect(() => allocate(money(100n, 'USD'), [])).toThrow(/at least one weight/);
    expect(() => allocate(money(100n, 'USD'), [0n, 0n])).toThrow(/weights must sum/);
    expect(() => allocate(money(100n, 'USD'), [-1n, 2n])).toThrow(/non-negative/);
  });

  it('PROPERTY: allocated parts always sum back to the original', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -10_000_000n, max: 10_000_000n }),
        fc.array(fc.bigInt({ min: 0n, max: 1000n }), { minLength: 1, maxLength: 12 }),
        (amount, weights) => {
          fc.pre(weights.reduce((s, w) => s + w, 0n) > 0n);
          const parts = allocate(money(amount, 'USD'), weights);
          expect(parts).toHaveLength(weights.length);
          expect(sum(parts, 'USD').amountMinor).toBe(amount);
        },
      ),
      { numRuns: 500 },
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/invariant-4-money.test.ts`
Expected: FAIL — cannot find `allocate.js`.

- [ ] **Step 3: Write the implementation**

Create `src/platform/money/allocate.ts`:

```ts
import type { Money } from './money.js';

/**
 * Splits `m` into parts proportional to `weights`, distributing the
 * remainder one minor unit at a time so the parts always sum back to `m`.
 * Weights are integers on purpose: fractional ratios reintroduce the
 * floating-point error this whole module exists to avoid.
 */
export function allocate(m: Money, weights: readonly bigint[]): Money[] {
  if (weights.length === 0) {
    throw new Error('allocate requires at least one weight');
  }
  if (weights.some(w => w < 0n)) {
    throw new Error('allocate weights must be non-negative');
  }
  const totalWeight = weights.reduce((s, w) => s + w, 0n);
  if (totalWeight <= 0n) {
    throw new Error('allocate weights must sum to more than zero');
  }

  const shares: bigint[] = [];
  let distributed = 0n;
  for (const w of weights) {
    // BigInt division truncates toward zero, so every share is <= its exact value
    // in magnitude and the leftover always has the same sign as the total.
    const share = (m.amountMinor * w) / totalWeight;
    shares.push(share);
    distributed += share;
  }

  let remainder = m.amountMinor - distributed;
  const step = remainder >= 0n ? 1n : -1n;
  let i = 0;
  while (remainder !== 0n) {
    shares[i % shares.length]! += step;
    remainder -= step;
    i++;
  }

  return shares.map(amountMinor => ({ amountMinor, currency: m.currency }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/invariant-4-money.test.ts`
Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/platform/money/allocate.ts test/invariant-4-money.test.ts
git commit -m "feat(money): remainder-safe allocation with property tests"
```

---

## Task 4: Rates and explicit conversion

**Files:**
- Create: `src/platform/money/rate.ts`
- Test: `test/unit/rate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/unit/rate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { money } from '../../src/platform/money/money.js';
import { rate, convert, RateRegistry } from '../../src/platform/money/rate.js';

const at = (iso: string) => new Date(iso);

describe('Rate', () => {
  it('converts using an explicit rate and records provenance', () => {
    const r = rate('USD', 'VES', 3600000n, 'BCV', at('2026-09-01T00:00:00Z'));
    const result = convert(money(1000n, 'USD'), r);
    expect(result.money.currency).toBe('VES');
    expect(result.money.amountMinor).toBe(36000n);
    expect(result.rateSource).toBe('BCV');
    expect(result.rateAt).toEqual(at('2026-09-01T00:00:00Z'));
  });

  it('refuses a rate whose source currency does not match', () => {
    const r = rate('EUR', 'VES', 1000000n, 'BCV', at('2026-09-01T00:00:00Z'));
    expect(() => convert(money(1000n, 'USD'), r)).toThrow(/does not apply/);
  });
});

describe('RateRegistry', () => {
  it('returns the rate in force on a given date, not a later one', () => {
    const reg = new RateRegistry([
      rate('USD', 'VES', 3000000n, 'BCV', at('2026-08-01T00:00:00Z')),
      rate('USD', 'VES', 3600000n, 'BCV', at('2026-09-01T00:00:00Z')),
      rate('USD', 'VES', 4000000n, 'BCV', at('2026-10-01T00:00:00Z')),
    ]);
    expect(reg.inForce('USD', 'VES', at('2026-09-15T00:00:00Z')).value).toBe(3600000n);
  });

  it('throws when no rate exists on or before the date', () => {
    const reg = new RateRegistry([rate('USD', 'VES', 3000000n, 'BCV', at('2026-08-01T00:00:00Z'))]);
    expect(() => reg.inForce('USD', 'VES', at('2026-07-01T00:00:00Z'))).toThrow(/no rate/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/rate.test.ts`
Expected: FAIL — cannot find `rate.js`.

- [ ] **Step 3: Write the implementation**

Create `src/platform/money/rate.ts`:

```ts
import type { Currency, Money } from './money.js';

/** Rates are stored scaled by 1e6 so a bigint can carry six decimal places. */
export const RATE_SCALE = 1_000_000n;

export interface Rate {
  readonly from: Currency;
  readonly to: Currency;
  /** Units of `to` per one unit of `from`, scaled by RATE_SCALE. */
  readonly value: bigint;
  readonly source: string;
  readonly at: Date;
}

export interface ConversionResult {
  readonly money: Money;
  readonly rateValue: bigint;
  readonly rateSource: string;
  readonly rateAt: Date;
}

export function rate(
  from: Currency,
  to: Currency,
  value: bigint,
  source: string,
  at: Date,
): Rate {
  if (value <= 0n) throw new Error('rate value must be positive');
  if (!source) throw new Error('rate requires a source');
  return { from, to, value, source, at };
}

/**
 * Conversion always demands an explicit rate. There is deliberately no
 * "convert to base currency" helper that looks a rate up implicitly —
 * that is how systems end up with amounts nobody can reproduce later.
 */
export function convert(m: Money, r: Rate): ConversionResult {
  if (m.currency !== r.from) {
    throw new Error(`rate ${r.from}->${r.to} does not apply to ${m.currency}`);
  }
  return {
    money: { amountMinor: (m.amountMinor * r.value) / RATE_SCALE, currency: r.to },
    rateValue: r.value,
    rateSource: r.source,
    rateAt: r.at,
  };
}

export class RateRegistry {
  readonly #rates: readonly Rate[];

  constructor(rates: readonly Rate[]) {
    this.#rates = [...rates].sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  /** The most recent rate on or before `when`. */
  inForce(from: Currency, to: Currency, when: Date): Rate {
    let found: Rate | undefined;
    for (const r of this.#rates) {
      if (r.from === from && r.to === to && r.at.getTime() <= when.getTime()) {
        found = r;
      }
    }
    if (!found) {
      throw new Error(`no rate ${from}->${to} in force at ${when.toISOString()}`);
    }
    return found;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/rate.test.ts`
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/platform/money/rate.ts test/unit/rate.test.ts
git commit -m "feat(money): explicit rates with historical lookup"
```

---

## Task 5: Test database and migration runner

**Files:**
- Create: `docker-compose.test.yml`, `db/migrate.ts`, `db/migrations/001_roles_and_schema.sql`, `test/helpers/db.ts`, `test/unit/migrate.test.ts`

- [ ] **Step 1: Create `docker-compose.test.yml`**

```yaml
services:
  db:
    image: postgres:17
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: erp_test
    ports:
      - "55432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d erp_test"]
      interval: 2s
      timeout: 3s
      retries: 30
```

- [ ] **Step 2: Create the first migration**

Create `db/migrations/001_roles_and_schema.sql`:

```sql
-- The application NEVER connects as the table owner. This is what makes RLS
-- and append-only grants real rather than decorative: an owner (and a
-- superuser) bypasses RLS by default.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user login password 'app_user_dev_password';
  end if;
end
$$;

create schema if not exists app;
grant usage on schema app to app_user;
grant usage on schema public to app_user;

-- The organization currently in scope, set per transaction by the scoped client.
create or replace function app.current_org() returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_org', true), '')::uuid
$$;

grant execute on function app.current_org() to app_user;

create table if not exists schema_migration (
  version     text primary key,
  applied_at  timestamptz not null default now()
);
```

- [ ] **Step 3: Create the migration runner**

Create `db/migrate.ts`:

```ts
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrate(connectionString: string): Promise<string[]> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query(`
      create table if not exists schema_migration (
        version text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const files = (await readdir(MIGRATIONS_DIR)).filter(f => f.endsWith('.sql')).sort();

    for (const file of files) {
      const { rowCount } = await client.query(
        'select 1 from schema_migration where version = $1',
        [file],
      );
      if (rowCount && rowCount > 0) continue;

      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migration (version) values ($1)', [file]);
        await client.query('commit');
        applied.push(file);
      } catch (err) {
        await client.query('rollback');
        throw new Error(`migration ${file} failed: ${(err as Error).message}`, { cause: err });
      }
    }
  } finally {
    await client.end();
  }
  return applied;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const applied = await migrate(url);
  console.log(applied.length ? `applied: ${applied.join(', ')}` : 'already up to date');
}
```

- [ ] **Step 4: Create the test DB helper**

Create `test/helpers/db.ts`:

```ts
import pg from 'pg';
import { migrate } from '../../db/migrate.js';

export const ADMIN_URL =
  process.env['TEST_DATABASE_URL'] ?? 'postgres://postgres:postgres@localhost:55432/erp_test';

/** The application connection. Non-owner on purpose — RLS applies to it. */
export const APP_URL =
  process.env['TEST_APP_DATABASE_URL'] ??
  'postgres://app_user:app_user_dev_password@localhost:55432/erp_test';

let migrated = false;

export async function ensureMigrated(): Promise<void> {
  if (migrated) return;
  await migrate(ADMIN_URL);
  migrated = true;
}

export async function adminClient(): Promise<pg.Client> {
  const c = new pg.Client({ connectionString: ADMIN_URL });
  await c.connect();
  return c;
}

export async function appPool(): Promise<pg.Pool> {
  return new pg.Pool({ connectionString: APP_URL, max: 4 });
}

/** Wipes all domain tables between tests. Never drops the schema. */
export async function truncateAll(): Promise<void> {
  const c = await adminClient();
  try {
    const { rows } = await c.query<{ tablename: string }>(`
      select tablename from pg_tables
      where schemaname = 'public' and tablename <> 'schema_migration'
    `);
    if (rows.length === 0) return;
    const list = rows.map(r => `public."${r.tablename}"`).join(', ');
    await c.query(`truncate ${list} restart identity cascade`);
  } finally {
    await c.end();
  }
}
```

- [ ] **Step 5: Write the failing test**

Create `test/unit/migrate.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { ensureMigrated, adminClient } from '../helpers/db.js';

describe('migration runner', () => {
  beforeAll(async () => {
    await ensureMigrated();
  });

  it('records applied migrations', async () => {
    const c = await adminClient();
    try {
      const { rows } = await c.query('select version from schema_migration order by version');
      expect(rows.map(r => r.version)).toContain('001_roles_and_schema.sql');
    } finally {
      await c.end();
    }
  });

  it('is idempotent', async () => {
    const { migrate } = await import('../../db/migrate.js');
    const { ADMIN_URL } = await import('../helpers/db.js');
    const applied = await migrate(ADMIN_URL);
    expect(applied).toEqual([]);
  });

  it('creates app.current_org() returning null when unset', async () => {
    const c = await adminClient();
    try {
      const { rows } = await c.query('select app.current_org() as org');
      expect(rows[0].org).toBeNull();
    } finally {
      await c.end();
    }
  });
});
```

- [ ] **Step 6: Start the database and run the test**

```bash
npm run db:up
npx vitest run test/unit/migrate.test.ts
```

Expected: `3 passed`.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.test.yml db/ test/helpers/db.ts test/unit/migrate.test.ts
git commit -m "feat(db): postgres test harness, migration runner, app_user role"
```

---

## Task 6: Organization table and tenant-scoped client

**Files:**
- Create: `db/migrations/002_organization.sql`, `src/platform/tenancy/client.ts`
- Test: `test/unit/tenancy.test.ts`

- [ ] **Step 1: Create the migration**

Create `db/migrations/002_organization.sql`:

```sql
create extension if not exists "pgcrypto";

create table organization (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  status      text not null default 'active',
  created_at  timestamptz not null default now()
);

alter table organization enable row level security;
alter table organization force row level security;

-- An organization row is visible only to its own tenant context.
create policy organization_isolation on organization
  using (id = app.current_org());

grant select on organization to app_user;
```

Note: `force row level security` is required. Without it the table owner bypasses every policy and the isolation tests would pass for the wrong reason.

- [ ] **Step 2: Write the failing test**

Create `test/unit/tenancy.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type pg from 'pg';
import { ensureMigrated, adminClient, appPool, truncateAll } from '../helpers/db.js';
import { withOrg } from '../../src/platform/tenancy/client.js';

let pool: pg.Pool;
let orgA: string;
let orgB: string;

beforeAll(async () => {
  await ensureMigrated();
  pool = await appPool();
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll();
  const c = await adminClient();
  try {
    const a = await c.query(`insert into organization (slug, name) values ('a','A') returning id`);
    const b = await c.query(`insert into organization (slug, name) values ('b','B') returning id`);
    orgA = a.rows[0].id;
    orgB = b.rows[0].id;
  } finally {
    await c.end();
  }
});

describe('tenant-scoped client', () => {
  it('sees only its own organization', async () => {
    const rows = await withOrg(pool, orgA, async tx => {
      const r = await tx.query('select id, slug from organization');
      return r.rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(orgA);
  });

  it('does not leak the other organization even when asked by id', async () => {
    const rows = await withOrg(pool, orgA, async tx => {
      const r = await tx.query('select id from organization where id = $1', [orgB]);
      return r.rows;
    });
    expect(rows).toHaveLength(0);
  });

  it('clears the context after the transaction', async () => {
    await withOrg(pool, orgA, async tx => {
      await tx.query('select 1');
    });
    const client = await pool.connect();
    try {
      const r = await client.query('select app.current_org() as org');
      expect(r.rows[0].org).toBeNull();
    } finally {
      client.release();
    }
  });

  it('rolls back on error', async () => {
    await expect(
      withOrg(pool, orgA, async tx => {
        await tx.query('select 1');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/unit/tenancy.test.ts`
Expected: FAIL — cannot find `client.js`.

- [ ] **Step 4: Write the implementation**

Create `src/platform/tenancy/client.ts`:

```ts
import type { Pool, PoolClient } from 'pg';

/**
 * Runs `fn` inside a transaction scoped to one organization.
 *
 * This is the ONLY way application code reaches Postgres. The tenant context
 * is set with `set_config(..., true)` so it is local to the transaction and
 * cannot leak to the next borrower of a pooled connection.
 */
export async function withOrg<T>(
  pool: Pool,
  orgId: string,
  fn: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select set_config($1, $2, true)', ['app.current_org', orgId]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/unit/tenancy.test.ts`
Expected: `4 passed`.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/002_organization.sql src/platform/tenancy/client.ts test/unit/tenancy.test.ts
git commit -m "feat(tenancy): organization table with forced RLS and scoped client"
```

---

## Task 7: Identity schema

**Files:**
- Create: `db/migrations/003_identity.sql`
- Test: `test/unit/identity.test.ts`

- [ ] **Step 1: Create the migration**

Create `db/migrations/003_identity.sql`:

```sql
-- A person exists once globally and belongs to many organizations.
create table user_account (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  text unique,
  email         text not null unique,
  name          text not null,
  status        text not null default 'active',
  created_at    timestamptz not null default now()
);

create table membership (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organization(id) on delete cascade,
  user_id     uuid not null references user_account(id) on delete cascade,
  status      text not null default 'active',
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);

alter table membership enable row level security;
alter table membership force row level security;

create policy membership_isolation on membership
  using (org_id = app.current_org())
  with check (org_id = app.current_org());

create index membership_org_idx on membership (org_id);
create index membership_user_idx on membership (user_id);

grant select, insert, update, delete on membership to app_user;
-- user_account is global; it is read through membership, never listed directly.
grant select on user_account to app_user;
```

- [ ] **Step 2: Write the failing test**

Create `test/unit/identity.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type pg from 'pg';
import { ensureMigrated, adminClient, appPool, truncateAll } from '../helpers/db.js';
import { withOrg } from '../../src/platform/tenancy/client.js';

let pool: pg.Pool;
let orgA: string;
let orgB: string;
let userId: string;

beforeAll(async () => {
  await ensureMigrated();
  pool = await appPool();
});
afterAll(async () => { await pool.end(); });

beforeEach(async () => {
  await truncateAll();
  const c = await adminClient();
  try {
    orgA = (await c.query(`insert into organization (slug,name) values ('a','A') returning id`)).rows[0].id;
    orgB = (await c.query(`insert into organization (slug,name) values ('b','B') returning id`)).rows[0].id;
    userId = (await c.query(
      `insert into user_account (email,name) values ('u@example.com','U') returning id`,
    )).rows[0].id;
    await c.query(`insert into membership (org_id,user_id) values ($1,$2)`, [orgA, userId]);
    await c.query(`insert into membership (org_id,user_id) values ($1,$2)`, [orgB, userId]);
  } finally { await c.end(); }
});

describe('identity', () => {
  it('lets one user belong to several organizations', async () => {
    const c = await adminClient();
    try {
      const { rows } = await c.query('select org_id from membership where user_id = $1', [userId]);
      expect(rows).toHaveLength(2);
    } finally { await c.end(); }
  });

  it('shows a tenant only its own memberships', async () => {
    const rows = await withOrg(pool, orgA, async tx =>
      (await tx.query('select org_id from membership')).rows,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].org_id).toBe(orgA);
  });

  it('refuses to insert a membership for another organization', async () => {
    await expect(
      withOrg(pool, orgA, async tx => {
        await tx.query('insert into membership (org_id,user_id) values ($1,$2)', [orgB, userId]);
      }),
    ).rejects.toThrow(/row-level security/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/unit/identity.test.ts`
Expected: FAIL — `relation "user_account" does not exist` (the migration has not been applied to the already-created test DB).

- [ ] **Step 4: Reset the database so the new migration applies**

```bash
npm run db:down && npm run db:up
npx vitest run test/unit/identity.test.ts
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/003_identity.sql test/unit/identity.test.ts
git commit -m "feat(identity): user_account and org-scoped membership"
```

---

## Task 8: Invariant 1 — adversarial tenant isolation

This test exists to fail loudly if someone later disables RLS or connects as the owner.

**Files:**
- Create: `test/invariant-1-tenant-isolation.test.ts`

- [ ] **Step 1: Write the test**

Create `test/invariant-1-tenant-isolation.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type pg from 'pg';
import { ensureMigrated, adminClient, appPool, truncateAll, APP_URL } from '../test/helpers/db.js';
import { withOrg } from '../src/platform/tenancy/client.js';

let pool: pg.Pool;
let orgA: string;
let orgB: string;

beforeAll(async () => {
  await ensureMigrated();
  pool = await appPool();
});
afterAll(async () => { await pool.end(); });

beforeEach(async () => {
  await truncateAll();
  const c = await adminClient();
  try {
    orgA = (await c.query(`insert into organization (slug,name) values ('a','A') returning id`)).rows[0].id;
    orgB = (await c.query(`insert into organization (slug,name) values ('b','B') returning id`)).rows[0].id;
    const u = (await c.query(`insert into user_account (email,name) values ('u@e.com','U') returning id`)).rows[0].id;
    await c.query(`insert into membership (org_id,user_id) values ($1,$2)`, [orgB, u]);
  } finally { await c.end(); }
});

describe('Invariant 1: a tenant can never reach another tenant', () => {
  it('the application role is NOT the owner of the tables', async () => {
    const c = await adminClient();
    try {
      const { rows } = await c.query(`
        select tablename, tableowner from pg_tables
        where schemaname = 'public' and tablename in ('organization','membership')
      `);
      for (const r of rows) {
        expect(r.tableowner).not.toBe('app_user');
      }
    } finally { await c.end(); }
  });

  it('every domain table has RLS enabled AND forced', async () => {
    const c = await adminClient();
    try {
      const { rows } = await c.query(`
        select relname, relrowsecurity, relforcerowsecurity
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'schema_migration'
      `);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(`${r.relname}:rls=${r.relrowsecurity}`).toBe(`${r.relname}:rls=true`);
        expect(`${r.relname}:forced=${r.relforcerowsecurity}`).toBe(`${r.relname}:forced=true`);
      }
    } finally { await c.end(); }
  });

  it('a query that FORGETS the org_id filter still cannot see other tenants', async () => {
    // Simulates the exact application bug RLS exists to survive.
    const rows = await withOrg(pool, orgA, async tx =>
      (await tx.query('select * from membership')).rows,
    );
    expect(rows).toHaveLength(0);
  });

  it('cannot read another tenant through a join', async () => {
    const rows = await withOrg(pool, orgA, async tx =>
      (await tx.query(`
        select m.id from membership m join organization o on o.id = m.org_id
      `)).rows,
    );
    expect(rows).toHaveLength(0);
  });

  it('cannot write into another tenant', async () => {
    await expect(
      withOrg(pool, orgA, async tx => {
        const u = (await tx.query('select id from user_account limit 1')).rows[0];
        await tx.query('insert into membership (org_id,user_id) values ($1,$2)', [orgB, u.id]);
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('sees nothing at all when no tenant context is set', async () => {
    const client = await pool.connect();
    try {
      const { rows } = await client.query('select * from organization');
      expect(rows).toHaveLength(0);
    } finally { client.release(); }
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run test/invariant-1-tenant-isolation.test.ts`
Expected: `6 passed`.

- [ ] **Step 3: Prove the test is adversarial — temporarily break RLS and watch it fail**

```bash
docker compose -f docker-compose.test.yml exec -T db psql -U postgres -d erp_test -c "alter table membership no force row level security;"
npx vitest run test/invariant-1-tenant-isolation.test.ts
```

Expected: FAIL on `every domain table has RLS enabled AND forced`.

Restore:

```bash
docker compose -f docker-compose.test.yml exec -T db psql -U postgres -d erp_test -c "alter table membership force row level security;"
npx vitest run test/invariant-1-tenant-isolation.test.ts
```

Expected: `6 passed`.

- [ ] **Step 4: Commit**

```bash
git add test/invariant-1-tenant-isolation.test.ts
git commit -m "test: invariant 1 — adversarial tenant isolation"
```

---

## Task 9: Authorization types and the gatekeeper

The gatekeeper is a pure function. It performs no I/O so it can never be a bottleneck and is trivially testable.

**Files:**
- Create: `src/platform/authz/types.ts`, `src/platform/authz/authorize.ts`
- Test: `test/unit/authorize.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/unit/authorize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { authorize } from '../../src/platform/authz/authorize.js';
import type { Actor, Resource } from '../../src/platform/authz/types.js';

const ORG = 'org-1';

function actor(over: Partial<Actor> = {}): Actor {
  return {
    id: 'actor-1',
    kind: 'user',
    orgId: ORG,
    grants: [],
    locationIds: [],
    ...over,
  };
}

function resource(over: Partial<Resource> = {}): Resource {
  return { type: 'document', orgId: ORG, ...over };
}

describe('authorize', () => {
  it('denies when the actor has no grants at all', () => {
    const d = authorize(actor(), 'document.create', resource());
    expect(d).toEqual({ allowed: false, reason: 'no grant for document.create on document' });
  });

  it('denies across organizations even with a matching grant', () => {
    const a = actor({ grants: [{ action: 'document.read', resourceType: 'document', scope: { kind: 'all' } }] });
    const d = authorize(a, 'document.read', resource({ orgId: 'other-org' }));
    expect(d).toEqual({ allowed: false, reason: 'cross-organization access' });
  });

  it('allows with scope "all"', () => {
    const a = actor({ grants: [{ action: 'document.read', resourceType: 'document', scope: { kind: 'all' } }] });
    expect(authorize(a, 'document.read', resource())).toEqual({ allowed: true });
  });

  it('scope "own" allows only the actor\'s own records', () => {
    const a = actor({ grants: [{ action: 'document.read', resourceType: 'document', scope: { kind: 'own' } }] });
    expect(authorize(a, 'document.read', resource({ ownerId: 'actor-1' }))).toEqual({ allowed: true });
    expect(authorize(a, 'document.read', resource({ ownerId: 'someone-else' })).allowed).toBe(false);
    expect(authorize(a, 'document.read', resource()).allowed).toBe(false);
  });

  it('scope "location" allows only the actor\'s assigned locations', () => {
    const a = actor({
      grants: [{ action: 'document.read', resourceType: 'document', scope: { kind: 'location' } }],
      locationIds: ['sede-1'],
    });
    expect(authorize(a, 'document.read', resource({ locationId: 'sede-1' }))).toEqual({ allowed: true });
    expect(authorize(a, 'document.read', resource({ locationId: 'sede-2' })).allowed).toBe(false);
  });

  it('does not match a grant for a different resource type', () => {
    const a = actor({ grants: [{ action: 'document.read', resourceType: 'party', scope: { kind: 'all' } }] });
    expect(authorize(a, 'document.read', resource()).allowed).toBe(false);
  });

  it('treats a bot actor exactly like a user actor', () => {
    const grants = [{ action: 'document.create', resourceType: 'document', scope: { kind: 'all' } as const }];
    const asUser = authorize(actor({ kind: 'user', grants }), 'document.create', resource());
    const asBot = authorize(actor({ kind: 'bot', grants }), 'document.create', resource());
    expect(asBot).toEqual(asUser);

    const ungrantedUser = authorize(actor({ kind: 'user' }), 'document.create', resource());
    const ungrantedBot = authorize(actor({ kind: 'bot' }), 'document.create', resource());
    expect(ungrantedBot).toEqual(ungrantedUser);
    expect(ungrantedBot.allowed).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/authorize.test.ts`
Expected: FAIL — cannot find `authorize.js`.

- [ ] **Step 3: Write the types**

Create `src/platform/authz/types.ts`:

```ts
export type ActorKind = 'user' | 'bot' | 'system' | 'integration';

/** Fixed, structured scopes. A general expression language arrives in Phase 2. */
export type Scope =
  | { readonly kind: 'all' }
  | { readonly kind: 'own' }
  | { readonly kind: 'location' };

export interface Grant {
  readonly action: string;
  readonly resourceType: string;
  readonly scope: Scope;
}

export interface Actor {
  readonly id: string;
  readonly kind: ActorKind;
  readonly orgId: string;
  readonly grants: readonly Grant[];
  readonly locationIds: readonly string[];
}

export interface Resource {
  readonly type: string;
  readonly orgId: string;
  readonly ownerId?: string;
  readonly locationId?: string;
}

export type Decision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string };
```

- [ ] **Step 4: Write the gatekeeper**

Create `src/platform/authz/authorize.ts`:

```ts
import type { Actor, Decision, Resource } from './types.js';

const ALLOW: Decision = { allowed: true };

/**
 * The single gatekeeper. Pure, no I/O.
 *
 * `actor.kind` is deliberately never inspected: a bot must be subject to
 * exactly the same rules as a person. Any future branch on actor.kind here
 * would reintroduce the class of bug where the chat channel and the UI drift
 * apart.
 */
export function authorize(actor: Actor, action: string, resource: Resource): Decision {
  if (resource.orgId !== actor.orgId) {
    return { allowed: false, reason: 'cross-organization access' };
  }

  const matching = actor.grants.filter(
    g => g.action === action && g.resourceType === resource.type,
  );

  if (matching.length === 0) {
    return { allowed: false, reason: `no grant for ${action} on ${resource.type}` };
  }

  for (const grant of matching) {
    switch (grant.scope.kind) {
      case 'all':
        return ALLOW;
      case 'own':
        if (resource.ownerId !== undefined && resource.ownerId === actor.id) return ALLOW;
        break;
      case 'location':
        if (resource.locationId !== undefined && actor.locationIds.includes(resource.locationId)) {
          return ALLOW;
        }
        break;
    }
  }

  return { allowed: false, reason: `no grant scope covers this ${resource.type}` };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/unit/authorize.test.ts`
Expected: `7 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/platform/authz/ test/unit/authorize.test.ts
git commit -m "feat(authz): pure gatekeeper with all/own/location scopes"
```

---

## Task 10: Roles and grants schema

**Files:**
- Create: `db/migrations/004_authorization.sql`
- Test: `test/unit/roles.test.ts`

- [ ] **Step 1: Create the migration**

Create `db/migrations/004_authorization.sql`:

```sql
create table location (
  id      uuid primary key default gen_random_uuid(),
  org_id  uuid not null references organization(id) on delete cascade,
  name    text not null,
  unique (org_id, name)
);

alter table location enable row level security;
alter table location force row level security;
create policy location_isolation on location
  using (org_id = app.current_org())
  with check (org_id = app.current_org());
grant select, insert, update, delete on location to app_user;

create table role (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organization(id) on delete cascade,
  name         text not null,
  created_at   timestamptz not null default now(),
  unique (org_id, name)
);

alter table role enable row level security;
alter table role force row level security;
create policy role_isolation on role
  using (org_id = app.current_org())
  with check (org_id = app.current_org());
grant select, insert, update, delete on role to app_user;

create table role_grant (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organization(id) on delete cascade,
  role_id        uuid not null references role(id) on delete cascade,
  action         text not null,
  resource_type  text not null,
  scope          text not null check (scope in ('all','own','location')),
  unique (role_id, action, resource_type, scope)
);

alter table role_grant enable row level security;
alter table role_grant force row level security;
create policy role_grant_isolation on role_grant
  using (org_id = app.current_org())
  with check (org_id = app.current_org());
grant select, insert, update, delete on role_grant to app_user;

alter table membership add column role_id uuid references role(id);

create table membership_location (
  membership_id uuid not null references membership(id) on delete cascade,
  location_id   uuid not null references location(id) on delete cascade,
  org_id        uuid not null references organization(id) on delete cascade,
  primary key (membership_id, location_id)
);

alter table membership_location enable row level security;
alter table membership_location force row level security;
create policy membership_location_isolation on membership_location
  using (org_id = app.current_org())
  with check (org_id = app.current_org());
grant select, insert, update, delete on membership_location to app_user;
```

- [ ] **Step 2: Write the failing test**

Create `test/unit/roles.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type pg from 'pg';
import { ensureMigrated, adminClient, appPool, truncateAll } from '../helpers/db.js';
import { withOrg } from '../../src/platform/tenancy/client.js';

let pool: pg.Pool;
let orgA: string;

beforeAll(async () => { await ensureMigrated(); pool = await appPool(); });
afterAll(async () => { await pool.end(); });

beforeEach(async () => {
  await truncateAll();
  const c = await adminClient();
  try {
    orgA = (await c.query(`insert into organization (slug,name) values ('a','A') returning id`)).rows[0].id;
  } finally { await c.end(); }
});

describe('roles and grants', () => {
  it('stores grants scoped to an organization', async () => {
    const grants = await withOrg(pool, orgA, async tx => {
      const role = (await tx.query(
        `insert into role (org_id,name) values ($1,'cajero') returning id`, [orgA],
      )).rows[0];
      await tx.query(
        `insert into role_grant (org_id,role_id,action,resource_type,scope)
         values ($1,$2,'document.create','document','location')`,
        [orgA, role.id],
      );
      return (await tx.query('select action, scope from role_grant')).rows;
    });
    expect(grants).toEqual([{ action: 'document.create', scope: 'location' }]);
  });

  it('rejects an unknown scope', async () => {
    await expect(
      withOrg(pool, orgA, async tx => {
        const role = (await tx.query(
          `insert into role (org_id,name) values ($1,'x') returning id`, [orgA],
        )).rows[0];
        await tx.query(
          `insert into role_grant (org_id,role_id,action,resource_type,scope)
           values ($1,$2,'a','b','everything')`,
          [orgA, role.id],
        );
      }),
    ).rejects.toThrow(/violates check constraint/i);
  });
});
```

- [ ] **Step 3: Reset the DB and run**

```bash
npm run db:down && npm run db:up
npx vitest run test/unit/roles.test.ts
```

Expected: `2 passed`.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/004_authorization.sql test/unit/roles.test.ts
git commit -m "feat(authz): role, role_grant, location schema with forced RLS"
```

---

## Task 11: Event log with enforced append-only

**Files:**
- Create: `db/migrations/005_event_log.sql`, `src/platform/events/append.ts`
- Test: `test/invariant-3-events.test.ts`

- [ ] **Step 1: Create the migration**

Create `db/migrations/005_event_log.sql`:

```sql
create table event (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organization(id) on delete cascade,
  actor_id        text not null,
  actor_kind      text not null check (actor_kind in ('user','bot','system','integration')),
  verb            text not null,
  subject_type    text not null,
  subject_id      text not null,
  payload         jsonb not null default '{}'::jsonb,
  occurred_at     timestamptz not null default now(),
  causation_id    uuid,
  correlation_id  uuid
);

alter table event enable row level security;
alter table event force row level security;

-- Readable and insertable within the tenant. Never updatable, never deletable.
create policy event_read on event for select
  using (org_id = app.current_org());
create policy event_insert on event for insert
  with check (org_id = app.current_org());

grant select, insert on event to app_user;
revoke update, delete on event from app_user;

create index event_org_time_idx on event (org_id, occurred_at desc);
create index event_subject_idx on event (org_id, subject_type, subject_id);
create index event_correlation_idx on event (correlation_id);
```

- [ ] **Step 2: Write the failing test**

Create `test/invariant-3-events.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type pg from 'pg';
import { ensureMigrated, adminClient, appPool, truncateAll } from '../test/helpers/db.js';
import { withOrg } from '../src/platform/tenancy/client.js';
import { appendEvent } from '../src/platform/events/append.js';

let pool: pg.Pool;
let orgA: string;

beforeAll(async () => { await ensureMigrated(); pool = await appPool(); });
afterAll(async () => { await pool.end(); });

beforeEach(async () => {
  await truncateAll();
  const c = await adminClient();
  try {
    orgA = (await c.query(`insert into organization (slug,name) values ('a','A') returning id`)).rows[0].id;
  } finally { await c.end(); }
});

describe('Invariant 3: the event log is append-only', () => {
  it('appends an event inside the caller transaction', async () => {
    const rows = await withOrg(pool, orgA, async tx => {
      await appendEvent(tx, {
        orgId: orgA,
        actorId: 'actor-1',
        actorKind: 'user',
        verb: 'organization.created',
        subjectType: 'organization',
        subjectId: orgA,
        payload: { slug: 'a' },
      });
      return (await tx.query('select verb, actor_kind, payload from event')).rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].verb).toBe('organization.created');
    expect(rows[0].payload).toEqual({ slug: 'a' });
  });

  it('the application role has no UPDATE or DELETE privilege on event', async () => {
    const c = await adminClient();
    try {
      const { rows } = await c.query(`
        select privilege_type from information_schema.role_table_grants
        where grantee = 'app_user' and table_name = 'event'
      `);
      const privs = rows.map(r => r.privilege_type);
      expect(privs).toContain('SELECT');
      expect(privs).toContain('INSERT');
      expect(privs).not.toContain('UPDATE');
      expect(privs).not.toContain('DELETE');
    } finally { await c.end(); }
  });

  it('cannot modify an event', async () => {
    await withOrg(pool, orgA, async tx => {
      await appendEvent(tx, {
        orgId: orgA, actorId: 'a', actorKind: 'user',
        verb: 'x.happened', subjectType: 'x', subjectId: '1', payload: {},
      });
    });
    await expect(
      withOrg(pool, orgA, async tx => {
        await tx.query(`update event set verb = 'tampered'`);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('cannot delete an event', async () => {
    await withOrg(pool, orgA, async tx => {
      await appendEvent(tx, {
        orgId: orgA, actorId: 'a', actorKind: 'user',
        verb: 'x.happened', subjectType: 'x', subjectId: '1', payload: {},
      });
    });
    await expect(
      withOrg(pool, orgA, async tx => { await tx.query('delete from event'); }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('rolls back the event when the surrounding transaction fails', async () => {
    await expect(
      withOrg(pool, orgA, async tx => {
        await appendEvent(tx, {
          orgId: orgA, actorId: 'a', actorKind: 'user',
          verb: 'x.happened', subjectType: 'x', subjectId: '1', payload: {},
        });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const rows = await withOrg(pool, orgA, async tx =>
      (await tx.query('select id from event')).rows,
    );
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/invariant-3-events.test.ts`
Expected: FAIL — cannot find `append.js`.

- [ ] **Step 4: Write the implementation**

Create `src/platform/events/append.ts`:

```ts
import type { PoolClient } from 'pg';
import type { ActorKind } from '../authz/types.js';

export interface EventInput {
  readonly orgId: string;
  readonly actorId: string;
  readonly actorKind: ActorKind;
  readonly verb: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly payload: Record<string, unknown>;
  readonly causationId?: string;
  readonly correlationId?: string;
}

/**
 * Appends to the log using the caller's transaction, so the event and the
 * state change it describes either both commit or neither does.
 */
export async function appendEvent(tx: PoolClient, e: EventInput): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `insert into event
       (org_id, actor_id, actor_kind, verb, subject_type, subject_id,
        payload, causation_id, correlation_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     returning id`,
    [
      e.orgId, e.actorId, e.actorKind, e.verb, e.subjectType, e.subjectId,
      JSON.stringify(e.payload), e.causationId ?? null, e.correlationId ?? null,
    ],
  );
  return rows[0]!.id;
}
```

- [ ] **Step 5: Reset the DB and run**

```bash
npm run db:down && npm run db:up
npx vitest run test/invariant-3-events.test.ts
```

Expected: `5 passed`.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/005_event_log.sql src/platform/events/append.ts test/invariant-3-events.test.ts
git commit -m "feat(events): append-only event log enforced by grants"
```

---

## Task 12: Command definition and registry

**Files:**
- Create: `src/platform/commands/types.ts`, `src/platform/commands/registry.ts`
- Test: `test/unit/registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/unit/registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CommandRegistry } from '../../src/platform/commands/registry.js';
import type { CommandDefinition } from '../../src/platform/commands/types.js';

const noop: CommandDefinition<{ id: string }, { id: string }> = {
  name: 'demo.create',
  action: 'demo.create',
  resourceType: 'demo',
  resolveResource: async (input, ctx) => ({ type: 'demo', orgId: ctx.actor.orgId, ownerId: input.id }),
  execute: async input => ({ id: input.id }),
  describeEvent: (_input, output) => ({
    verb: 'demo.created',
    subjectId: output.id,
    payload: { id: output.id },
  }),
};

describe('CommandRegistry', () => {
  it('registers and retrieves a command', () => {
    const r = new CommandRegistry();
    r.register(noop);
    expect(r.get('demo.create')).toBe(noop);
  });

  it('refuses duplicate names', () => {
    const r = new CommandRegistry();
    r.register(noop);
    expect(() => r.register(noop)).toThrow(/already registered/);
  });

  it('refuses a command with an empty action or resourceType', () => {
    const r = new CommandRegistry();
    expect(() => r.register({ ...noop, action: '' })).toThrow(/action/);
    expect(() => r.register({ ...noop, name: 'other', resourceType: '' })).toThrow(/resourceType/);
  });

  it('lists everything registered', () => {
    const r = new CommandRegistry();
    r.register(noop);
    r.register({ ...noop, name: 'demo.delete', action: 'demo.delete' });
    expect(r.all().map(c => c.name).sort()).toEqual(['demo.create', 'demo.delete']);
  });

  it('throws for an unknown command', () => {
    expect(() => new CommandRegistry().get('nope')).toThrow(/unknown command/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/registry.test.ts`
Expected: FAIL — cannot find `registry.js`.

- [ ] **Step 3: Write the types**

Create `src/platform/commands/types.ts`:

```ts
import type { PoolClient } from 'pg';
import type { Actor, Resource } from '../authz/types.js';

export interface CommandContext {
  readonly actor: Actor;
  readonly tx: PoolClient;
  readonly correlationId: string;
}

export interface EventDescription {
  readonly verb: string;
  readonly subjectId: string;
  readonly payload: Record<string, unknown>;
}

/**
 * Every mutation in the system is a CommandDefinition. `action` and
 * `resourceType` are required by the type system, so a command that forgets
 * to declare what permission it needs does not compile.
 */
export interface CommandDefinition<TInput, TOutput> {
  readonly name: string;
  readonly action: string;
  readonly resourceType: string;
  readonly resolveResource: (input: TInput, ctx: CommandContext) => Promise<Resource>;
  readonly execute: (input: TInput, ctx: CommandContext) => Promise<TOutput>;
  readonly describeEvent: (input: TInput, output: TOutput) => EventDescription;
}

export type AnyCommand = CommandDefinition<never, unknown>;
```

- [ ] **Step 4: Write the registry**

Create `src/platform/commands/registry.ts`:

```ts
import type { CommandDefinition } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StoredCommand = CommandDefinition<any, any>;

export class CommandRegistry {
  readonly #commands = new Map<string, StoredCommand>();

  register(command: StoredCommand): void {
    if (!command.name) throw new Error('command requires a name');
    if (!command.action) throw new Error(`command ${command.name} requires an action`);
    if (!command.resourceType) throw new Error(`command ${command.name} requires a resourceType`);
    if (this.#commands.has(command.name)) {
      throw new Error(`command ${command.name} is already registered`);
    }
    this.#commands.set(command.name, command);
  }

  get(name: string): StoredCommand {
    const c = this.#commands.get(name);
    if (!c) throw new Error(`unknown command: ${name}`);
    return c;
  }

  all(): StoredCommand[] {
    return [...this.#commands.values()];
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/unit/registry.test.ts`
Expected: `5 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/platform/commands/types.ts src/platform/commands/registry.ts test/unit/registry.test.ts
git commit -m "feat(commands): command definition and registry"
```

---

## Task 13: The command bus — authorize, execute, record

**Files:**
- Create: `src/platform/commands/bus.ts`
- Test: `test/invariant-2-authorization.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/invariant-2-authorization.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type pg from 'pg';
import { ensureMigrated, adminClient, appPool, truncateAll } from '../test/helpers/db.js';
import { CommandRegistry } from '../src/platform/commands/registry.js';
import { CommandBus, AuthorizationError } from '../src/platform/commands/bus.js';
import type { CommandDefinition } from '../src/platform/commands/types.js';
import type { Actor } from '../src/platform/authz/types.js';

let pool: pg.Pool;
let orgA: string;

interface CreateLocationInput { readonly name: string }
interface CreateLocationOutput { readonly id: string }

const createLocation: CommandDefinition<CreateLocationInput, CreateLocationOutput> = {
  name: 'location.create',
  action: 'location.create',
  resourceType: 'location',
  resolveResource: async (_input, ctx) => ({ type: 'location', orgId: ctx.actor.orgId }),
  execute: async (input, ctx) => {
    const { rows } = await ctx.tx.query<{ id: string }>(
      'insert into location (org_id, name) values ($1,$2) returning id',
      [ctx.actor.orgId, input.name],
    );
    return { id: rows[0]!.id };
  },
  describeEvent: (input, output) => ({
    verb: 'location.created',
    subjectId: output.id,
    payload: { name: input.name },
  }),
};

function actor(over: Partial<Actor> = {}): Actor {
  return { id: 'actor-1', kind: 'user', orgId: orgA, grants: [], locationIds: [], ...over };
}

const granted = () =>
  actor({ grants: [{ action: 'location.create', resourceType: 'location', scope: { kind: 'all' } }] });

let registry: CommandRegistry;
let bus: CommandBus;

beforeAll(async () => { await ensureMigrated(); pool = await appPool(); });
afterAll(async () => { await pool.end(); });

beforeEach(async () => {
  await truncateAll();
  const c = await adminClient();
  try {
    orgA = (await c.query(`insert into organization (slug,name) values ('a','A') returning id`)).rows[0].id;
  } finally { await c.end(); }
  registry = new CommandRegistry();
  registry.register(createLocation);
  bus = new CommandBus(registry, pool);
});

describe('Invariant 2: nothing writes without passing the gatekeeper', () => {
  it('every registered command declares an action and a resource type', () => {
    for (const cmd of registry.all()) {
      expect(cmd.action, `${cmd.name} must declare an action`).toBeTruthy();
      expect(cmd.resourceType, `${cmd.name} must declare a resourceType`).toBeTruthy();
    }
  });

  it('denies an actor with no grants', async () => {
    await expect(bus.dispatch('location.create', { name: 'Sede 1' }, actor()))
      .rejects.toBeInstanceOf(AuthorizationError);
  });

  it('writes nothing when authorization is denied', async () => {
    await expect(bus.dispatch('location.create', { name: 'Sede 1' }, actor())).rejects.toThrow();
    const c = await adminClient();
    try {
      const { rows } = await c.query('select id from location');
      expect(rows).toHaveLength(0);
    } finally { await c.end(); }
  });

  it('executes when the actor is granted', async () => {
    const out = await bus.dispatch('location.create', { name: 'Sede 1' }, granted());
    expect(out.id).toBeTruthy();
  });

  it('records exactly one event for a successful command', async () => {
    await bus.dispatch('location.create', { name: 'Sede 1' }, granted());
    const c = await adminClient();
    try {
      const { rows } = await c.query('select verb, actor_kind, payload, correlation_id from event');
      expect(rows).toHaveLength(1);
      expect(rows[0].verb).toBe('location.created');
      expect(rows[0].payload).toEqual({ name: 'Sede 1' });
      expect(rows[0].correlation_id).toBeTruthy();
    } finally { await c.end(); }
  });

  it('records no event when the command throws, and rolls back the write', async () => {
    const exploding: CommandDefinition<Record<string, never>, never> = {
      name: 'demo.explode',
      action: 'location.create',
      resourceType: 'location',
      resolveResource: async (_i, ctx) => ({ type: 'location', orgId: ctx.actor.orgId }),
      execute: async (_i, ctx) => {
        await ctx.tx.query('insert into location (org_id,name) values ($1,$2)', [ctx.actor.orgId, 'ghost']);
        throw new Error('boom');
      },
      describeEvent: () => ({ verb: 'demo.exploded', subjectId: 'x', payload: {} }),
    };
    registry.register(exploding);

    await expect(bus.dispatch('demo.explode', {}, granted())).rejects.toThrow('boom');

    const c = await adminClient();
    try {
      expect((await c.query('select id from location')).rows).toHaveLength(0);
      expect((await c.query('select id from event')).rows).toHaveLength(0);
    } finally { await c.end(); }
  });

  it('subjects a bot actor to the same rules as a user', async () => {
    await expect(bus.dispatch('location.create', { name: 'X' }, actor({ kind: 'bot' })))
      .rejects.toBeInstanceOf(AuthorizationError);

    const out = await bus.dispatch(
      'location.create',
      { name: 'Y' },
      { ...granted(), kind: 'bot' },
    );
    expect(out.id).toBeTruthy();

    const c = await adminClient();
    try {
      const { rows } = await c.query('select actor_kind from event');
      expect(rows.map(r => r.actor_kind)).toEqual(['bot']);
    } finally { await c.end(); }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/invariant-2-authorization.test.ts`
Expected: FAIL — cannot find `bus.js`.

- [ ] **Step 3: Write the implementation**

Create `src/platform/commands/bus.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { authorize } from '../authz/authorize.js';
import type { Actor } from '../authz/types.js';
import { appendEvent } from '../events/append.js';
import { withOrg } from '../tenancy/client.js';
import type { CommandRegistry } from './registry.js';
import type { CommandContext } from './types.js';

export class AuthorizationError extends Error {
  constructor(
    readonly command: string,
    readonly reason: string,
  ) {
    super(`denied ${command}: ${reason}`);
    this.name = 'AuthorizationError';
  }
}

/**
 * The only path to a state change.
 *
 * Authorization, execution and the event append all happen inside one
 * transaction scoped to the actor's organization. There is no code path that
 * executes a command without calling authorize() first.
 */
export class CommandBus {
  constructor(
    private readonly registry: CommandRegistry,
    private readonly pool: Pool,
  ) {}

  async dispatch<TOutput = unknown>(
    name: string,
    input: unknown,
    actor: Actor,
    correlationId: string = randomUUID(),
  ): Promise<TOutput> {
    const command = this.registry.get(name);

    return withOrg(this.pool, actor.orgId, async tx => {
      const ctx: CommandContext = { actor, tx, correlationId };

      const resource = await command.resolveResource(input, ctx);
      const decision = authorize(actor, command.action, resource);
      if (!decision.allowed) {
        throw new AuthorizationError(name, decision.reason);
      }

      const output = await command.execute(input, ctx);
      const description = command.describeEvent(input, output);

      await appendEvent(tx, {
        orgId: actor.orgId,
        actorId: actor.id,
        actorKind: actor.kind,
        verb: description.verb,
        subjectType: command.resourceType,
        subjectId: description.subjectId,
        payload: description.payload,
        correlationId,
      });

      return output as TOutput;
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/invariant-2-authorization.test.ts`
Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/platform/commands/bus.ts test/invariant-2-authorization.test.ts
git commit -m "feat(commands): command bus enforcing authorize + event in one transaction"
```

---

## Task 14: Money persistence and the no-float guard

**Files:**
- Create: `db/migrations/006_money_columns.sql`, `src/platform/money/persistence.ts`
- Modify: `test/invariant-4-money.test.ts` (append a section)

- [ ] **Step 1: Create the migration**

Create `db/migrations/006_money_columns.sql`:

```sql
-- Reference shape for every monetary column in the system. Domain tables in
-- Phase 1 embed these five columns; the domain type mirrors them exactly.
create domain currency_code as text check (value ~ '^[A-Z]{3}$');

create table monetary_amount_example (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organization(id) on delete cascade,
  amount_minor   bigint not null,
  currency       currency_code not null,
  rate_to_base   bigint,
  rate_source    text,
  rate_at        timestamptz,
  constraint rate_is_complete check (
    (rate_to_base is null and rate_source is null and rate_at is null)
    or (rate_to_base is not null and rate_source is not null and rate_at is not null)
  )
);

alter table monetary_amount_example enable row level security;
alter table monetary_amount_example force row level security;
create policy monetary_amount_example_isolation on monetary_amount_example
  using (org_id = app.current_org())
  with check (org_id = app.current_org());
grant select, insert, update, delete on monetary_amount_example to app_user;
```

- [ ] **Step 2: Write the failing test — append to `test/invariant-4-money.test.ts`**

Add these imports at the top of the existing file:

```ts
import { beforeAll, afterAll, beforeEach } from 'vitest';
import type pg from 'pg';
import { ensureMigrated, adminClient, appPool, truncateAll } from './helpers/db.js';
import { withOrg } from '../src/platform/tenancy/client.js';
import { toColumns, fromColumns } from '../src/platform/money/persistence.js';
import { rate } from '../src/platform/money/rate.js';
```

Append this block to the end of the file:

```ts
describe('Invariant 4 (persistence): no float columns, rates always complete', () => {
  let pool: pg.Pool;
  let orgA: string;

  beforeAll(async () => { await ensureMigrated(); pool = await appPool(); });
  afterAll(async () => { await pool.end(); });

  beforeEach(async () => {
    await truncateAll();
    const c = await adminClient();
    try {
      orgA = (await c.query(`insert into organization (slug,name) values ('a','A') returning id`)).rows[0].id;
    } finally { await c.end(); }
  });

  it('no money column in the database uses a floating point type', async () => {
    const c = await adminClient();
    try {
      const { rows } = await c.query(`
        select table_name, column_name, data_type
        from information_schema.columns
        where table_schema = 'public'
          and (column_name like '%amount%' or column_name like '%rate%' or column_name like '%price%')
          and data_type in ('real','double precision','float')
      `);
      expect(rows).toEqual([]);
    } finally { await c.end(); }
  });

  it('round-trips an amount without losing precision', async () => {
    const original = money(9_007_199_254_740_993n, 'USD'); // beyond Number.MAX_SAFE_INTEGER
    const stored = await withOrg(pool, orgA, async tx => {
      const cols = toColumns(original);
      const { rows } = await tx.query(
        `insert into monetary_amount_example (org_id, amount_minor, currency)
         values ($1,$2,$3) returning amount_minor, currency, rate_to_base, rate_source, rate_at`,
        [orgA, cols.amountMinor.toString(), cols.currency],
      );
      return rows[0];
    });
    expect(fromColumns(stored).money.amountMinor).toBe(original.amountMinor);
  });

  it('rejects a partial rate', async () => {
    await expect(
      withOrg(pool, orgA, async tx => {
        await tx.query(
          `insert into monetary_amount_example (org_id, amount_minor, currency, rate_to_base)
           values ($1, 100, 'VES', 3600000)`,
          [orgA],
        );
      }),
    ).rejects.toThrow(/rate_is_complete/);
  });

  it('stores a converted amount together with its rate provenance', async () => {
    const r = rate('USD', 'VES', 3_600_000n, 'BCV', new Date('2026-09-01T00:00:00Z'));
    const row = await withOrg(pool, orgA, async tx => {
      const cols = toColumns(money(36_000n, 'VES'), r);
      const { rows } = await tx.query(
        `insert into monetary_amount_example
           (org_id, amount_minor, currency, rate_to_base, rate_source, rate_at)
         values ($1,$2,$3,$4,$5,$6)
         returning amount_minor, currency, rate_to_base, rate_source, rate_at`,
        [orgA, cols.amountMinor.toString(), cols.currency,
         cols.rateToBase?.toString() ?? null, cols.rateSource ?? null, cols.rateAt ?? null],
      );
      return rows[0];
    });
    const restored = fromColumns(row);
    expect(restored.money.amountMinor).toBe(36_000n);
    expect(restored.rateSource).toBe('BCV');
    expect(restored.rateToBase).toBe(3_600_000n);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/invariant-4-money.test.ts`
Expected: FAIL — cannot find `persistence.js`.

- [ ] **Step 4: Write the implementation**

Create `src/platform/money/persistence.ts`:

```ts
import type { Money } from './money.js';
import type { Rate } from './rate.js';

export interface MoneyColumns {
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly rateToBase?: bigint;
  readonly rateSource?: string;
  readonly rateAt?: Date;
}

export interface MoneyRow {
  readonly amount_minor: string | number | bigint;
  readonly currency: string;
  readonly rate_to_base: string | number | bigint | null;
  readonly rate_source: string | null;
  readonly rate_at: Date | null;
}

/** A rate is stored whole or not at all — never partially. */
export function toColumns(m: Money, r?: Rate): MoneyColumns {
  if (!r) {
    return { amountMinor: m.amountMinor, currency: m.currency };
  }
  return {
    amountMinor: m.amountMinor,
    currency: m.currency,
    rateToBase: r.value,
    rateSource: r.source,
    rateAt: r.at,
  };
}

export function fromColumns(row: MoneyRow): {
  money: Money;
  rateToBase?: bigint;
  rateSource?: string;
  rateAt?: Date;
} {
  const money: Money = {
    amountMinor: BigInt(row.amount_minor),
    currency: row.currency,
  };
  if (row.rate_to_base === null || row.rate_source === null || row.rate_at === null) {
    return { money };
  }
  return {
    money,
    rateToBase: BigInt(row.rate_to_base),
    rateSource: row.rate_source,
    rateAt: row.rate_at,
  };
}
```

- [ ] **Step 5: Reset the DB and run the full suite**

```bash
npm run db:down && npm run db:up
npm test
```

Expected: all suites pass.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/006_money_columns.sql src/platform/money/persistence.ts test/invariant-4-money.test.ts
git commit -m "feat(money): persistence shape with complete-rate constraint and no-float guard"
```

---

## Task 15: Continuous integration

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: erp_test
        ports:
          - 55432:5432
        options: >-
          --health-cmd "pg_isready -U postgres -d erp_test"
          --health-interval 2s
          --health-timeout 3s
          --health-retries 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
```

Migrations run from zero on every CI job because the Postgres service starts empty and `ensureMigrated()` applies them.

- [ ] **Step 2: Verify the suite passes locally from a clean database**

```bash
npm run db:down && npm run db:up
npm run typecheck
npm test
```

Expected: typecheck clean, all suites pass.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run migrations from zero and the full suite on every push"
```

---

## Task 16: Phase 0 exit checklist

**Files:**
- Create: `docs/phase-0-invariants.md`

- [ ] **Step 1: Verify every exit criterion from the spec**

Run the full suite and confirm each item:

```bash
npm run db:down && npm run db:up
npm run typecheck && npm test
```

Confirm by inspection of the test output:

| Criterion | Proven by |
|---|---|
| Migrations run from zero | `test/unit/migrate.test.ts` + clean-DB run |
| Users belong to several organizations | `test/unit/identity.test.ts` |
| Invariant 1 — isolation survives app bugs | `test/invariant-1-tenant-isolation.test.ts` |
| Invariant 2 — no command writes without authorization | `test/invariant-2-authorization.test.ts` |
| Invariant 3 — events immutable, emitted per mutation | `test/invariant-3-events.test.ts` |
| Invariant 4 — money lossless, no floats | `test/invariant-4-money.test.ts` |
| Bot treated exactly as user | `authorize` test + bus test |

- [ ] **Step 2: Confirm no `number` represents money anywhere**

```bash
grep -rn "amountMinor" src/ | grep -v "bigint" | grep -v "BigInt"
```

Expected: no output beyond type declarations already using `bigint`.

- [ ] **Step 3: Write the invariants document**

Create `docs/phase-0-invariants.md`:

```markdown
# Phase 0 invariants

These four properties are enforced by the platform. Any change that weakens one
must fail CI. If you find yourself editing a test in this list to make it pass,
stop: the code is wrong, not the test.

1. **Tenant isolation.** Every domain table has RLS enabled AND forced. The
   application connects as `app_user`, which never owns a table. A query that
   forgets its `org_id` filter returns nothing rather than another tenant's rows.

2. **No unauthorized writes.** `CommandBus.dispatch` is the only path to a state
   change. It calls the pure `authorize()` gatekeeper before `execute()`. A
   command that does not declare `action` and `resourceType` does not compile.
   `actor.kind` is never inspected by the gatekeeper: a bot obeys the same rules
   as a person.

3. **Immutable event log.** `app_user` holds only SELECT and INSERT on `event`.
   Events are written in the same transaction as the change they describe.

4. **Lossless money.** Amounts are `bigint` minor units. No floating point, ever.
   `allocate()` never loses or invents a minor unit. Conversion requires an
   explicit rate, and a stored rate is complete or absent — never partial.
```

- [ ] **Step 4: Commit**

```bash
git add docs/phase-0-invariants.md
git commit -m "docs: phase 0 invariants and how they are enforced"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| 3.1 Skeleton and tooling | 1, 5, 15 |
| 3.2 Tenancy | 5, 6, 8 |
| 3.3 Identity | 7 |
| 3.4 Authorization gatekeeper | 9, 10, 12, 13 |
| 3.5 Event log | 11, 13 |
| 3.6 Money | 2, 3, 4, 14 |
| Exit criteria | 16 |
| Out of scope (primitives, UI, rule engine, custom fields, AI, SaaS) | Not implemented — correct |

**Type consistency check:** `Actor`, `Grant`, `Scope`, `Resource`, `Decision` are defined once in `src/platform/authz/types.ts` and imported everywhere. `ActorKind` is imported by `events/append.ts` from that same module rather than redefined. `Money` is defined in `money.ts` and imported by `allocate.ts`, `rate.ts` and `persistence.ts`. `CommandContext` is defined in `commands/types.ts` and used by `bus.ts`. `withOrg` has one signature, used by tests and by the bus.

**Placeholder scan:** every step contains runnable code or an exact command with expected output. No TBD, no "handle errors appropriately".

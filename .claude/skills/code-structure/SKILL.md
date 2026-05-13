---
name: code-structure
owner: baseline
description: MANDATORY skill for ALL code generation. Enforces top-down composition, consistent abstraction layers, and proper module hierarchy. Apply every time you write or modify code — in any language — no exceptions.
---

# Code Structure Rules

Apply these rules every time you write or modify code, in any language. This is not optional.

## Abstraction Layer Model

All modules belong to one of three layers. Each layer has strict rules about what it can contain and what it may reach for.

| Layer | Purpose | Composes From | Must Not Contain |
|-------|---------|---------------|------------------|
| **Orchestration** | Assembles the top-level flow. The entry point a reader hits first. | Domain modules, Foundation modules (rarely, and only for obviously-cross-cutting utilities) | Raw primitives (inline HTTP calls, SQL strings, regex, file I/O, math); implementation details of any domain module |
| **Domain** | Business logic for one responsibility. Named after the capability, not the technology. | Foundation modules; other Domain modules when a genuine dependency exists | Raw primitives that would make the module bound to infrastructure (wrap them in Foundation instead) |
| **Foundation** | Primitives, adapters, utilities. The bedrock everything else is made of. | Language stdlib, third-party libs, other Foundation modules | Nothing restricted here — this is where the raw stuff lives |

### Layer mappings per language family

The layer names are universal; the concrete file types differ per stack:

| Stack | Orchestration | Domain | Foundation |
|---|---|---|---|
| React/TSX | `pages/` / `app/` routes | `features/<domain>/` | `components/ui/`, `components/layout/`, `lib/` |
| Node/Express | `routes/`, `server.ts` entry | `services/<domain>/` | `lib/`, `utils/`, `db/` |
| Python/FastAPI | `main.py`, `api/routes/` | `<domain>/service.py` | `<domain>/repo.py`, `common/`, `adapters/` |
| Python CLI | `cli.py` command entry | `<command>/logic.py` | `<command>/io.py`, `common/` |
| Go service | `cmd/<app>/main.go`, handlers | `internal/<domain>/` | `pkg/` utilities, `internal/store/` |
| Rust CLI | `main.rs`, subcommand entry | `src/<domain>/` | `src/util/`, `src/io/` |

Not in this table? Map by the same principle: **Orchestration files are the table-of-contents; Domain files carry the business logic; Foundation files provide primitives and adapters**.

### Layer Rules

1. **Orchestration** — pure composition. Reads like a table of contents. If a section needs logic beyond assembly, extract it to Domain. No inline business logic, no raw primitives, no fixed strings that belong elsewhere.
2. **Domain** — composed from Foundation. Express business rules in names. Do not reach for raw infrastructure (HTTP, SQL, filesystem, time, randomness) directly — wrap through Foundation.
3. **Foundation** — the layer where the stack shows through. SQL, HTTP clients, Tailwind classes, regex, datetime handling — all legitimately here.

## Core Principles

1. **Write top-down, but reuse first.** Start with how you want the entry point to read. Before creating a new module, check the registry (see below). If a similar one exists, open it and extend it with backward-compatible changes rather than creating a duplicate. Only create new modules when nothing fits.
2. **One abstraction level per composition site.** Every sibling at a given call site (siblings in a JSX tree, statements in a function, items in a pipeline, methods chained together) should be at the same abstraction level. If a named call sits next to a raw primitive, the abstraction is broken — extract the primitive.
3. **Step-over / step-into.** Reading a file should work like a debugger. At the current level, you "step over" each named call (understand what it does from its name). To see how it works, you "step into" its definition. Each step-into reveals exactly one level deeper.
4. **Compose, don't inline.** Instead of writing code directly, identify patterns first, build them as units, then assemble. For pattern identification, refer to https://refactoring.guru/design-patterns for established solutions. This is composition — not premature abstraction.
5. **DRY emerges from structure.** Do not force DRY. If you follow the layer model and compose correctly, reuse happens naturally.
6. **Comments become unnecessary.** If the code needs a comment to explain *what* it does, the abstraction is wrong. Names and composition should convey meaning. Comments for *why* — non-obvious constraints, workarounds, hidden invariants — are still valid.
7. **Refactoring is a separate concern.** If a module grows too large or complex, apply design patterns (see https://refactoring.guru/design-patterns) to restructure it during the `/simplify` review stage — not during initial composition.

## Module Registry

Before creating any new module, scan the codebase for reusable matches:

1. **Search** — Glob for existing modules in the correct layer (e.g., `src/**/*.tsx`, `internal/**/*.go`, `<pkg>/**/*.py`). The filesystem is the registry.
2. **Match** — Check if any existing module serves a similar purpose (same layer, similar inputs/outputs, overlapping responsibility).
3. **Extend or create**:
   - **Match found** — Open it. Add backward-compatible options/variants to support the new use case. Do not fork or duplicate.
   - **No match** — Create a new module in the correct layer directory.
4. **Register** — After creating a new module, it is automatically part of the registry (the filesystem is the registry). No separate manifest needed.

## Detection Rules

Apply these checks when writing or reviewing code — regardless of language:

| Signal | Problem | Fix |
|--------|---------|-----|
| Orchestration file contains raw primitives (inline HTML attributes, SQL strings, HTTP requests, formatting logic) | Orchestration layer is leaking into Foundation | Extract the primitive into a Foundation module; the orchestration should call a name, not a raw primitive |
| Orchestration file defines local inner functions/classes | Domain logic hiding in the orchestration file | Move to a Domain module |
| A loop/map/pipeline body contains more than one level of JSX / logic / formatting | Mixed abstraction — the per-item shape is inline | Extract the body into a named Domain/Foundation call |
| Siblings in a call site mix named calls with raw primitives | Broken abstraction level | Wrap the primitives into a named call at the same layer as the others |
| A module file is longer than ~80 lines of substantive code | Too many concerns in one module | Split into composed sub-modules following the layer model |
| Domain module directly uses `<section>`, `<div>`, raw SQL, raw HTTP, `os.path`, `time.now()`, etc. | Domain should compose from Foundation, not raw infrastructure | Introduce or use a Foundation module that wraps it |
| A name describes *how* (`formatWithRegex`, `httpClient`, `SQLBuilder`) at the Orchestration layer | Implementation leaked into the name | Rename to describe *what* (`format<Thing>`, `<domain>Client`, `<domain>Query`) — the Foundation wrapper owns the how |

## Examples

### Example A — TSX: inline list details (BAD)

```tsx
<Section>
  {items.map((entry) => (
    <div key={entry.id}>
      <div>
        <h1>{entry.title}</h1>
        <p>{entry.subtitle}</p>
      </div>
      <div>
        {entry.tags.map((tag) => (
          <span key={tag.id}>{tag.label}</span>
        ))}
      </div>
    </div>
  ))}
</Section>
```

**Problem:** the `.map()` body contains two abstraction levels — iteration *and* item rendering.

### Example A — Extracted (GOOD)

```tsx
<Section>
  {items.map((entry) => (
    <ProductCard key={entry.id} item={entry} />
  ))}
</Section>
```

`ProductCard` is a Domain module; its internals use Foundation (UI/layout) modules. The Orchestration site reads as a blueprint.

---

### Example B — Python service: inline raw primitives (BAD)

```python
# orders/service.py — Domain module, but reaching for raw primitives
def create_order(user_id: str, sku: str, qty: int) -> str:
    conn = psycopg2.connect(os.environ["DB_URL"])
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO orders (user_id, sku, qty, created_at) "
        "VALUES (%s, %s, %s, now()) RETURNING id",
        (user_id, sku, qty),
    )
    order_id = cur.fetchone()[0]
    conn.commit()
    requests.post(os.environ["WEBHOOK_URL"], json={"order_id": order_id})
    return order_id
```

**Problem:** a Domain function directly handles a DB connection, SQL, and HTTP — three Foundation concerns inlined. Siblings in the function body are at wildly different abstraction levels.

### Example B — Extracted (GOOD)

```python
# orders/service.py — Domain module
def create_order(user_id: str, sku: str, qty: int) -> str:
    order_id = orders_repo.insert(user_id=user_id, sku=sku, qty=qty)
    webhooks.notify_order_created(order_id)
    return order_id
```

`orders_repo` and `webhooks` are Foundation modules. The Domain reads as three intent-level statements; the raw primitives live one layer down and are tested there.

---

### Example C — Go HTTP handler: broken abstraction in Orchestration (BAD)

```go
// cmd/api/main.go — Orchestration
func createOrder(w http.ResponseWriter, r *http.Request) {
    var body struct { SKU string; Qty int }
    if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
        http.Error(w, "bad json", 400); return
    }
    rows, _ := db.Query("INSERT INTO orders (sku, qty) VALUES ($1, $2) RETURNING id",
        body.SKU, body.Qty)
    // ... more raw SQL, HTTP, JSON wiring ...
}
```

**Problem:** the Orchestration handler mixes JSON decoding, SQL, error formatting — every layer is inlined at the top.

### Example C — Extracted (GOOD)

```go
func createOrder(w http.ResponseWriter, r *http.Request) {
    cmd, err := orders.DecodeCreate(r)
    if err != nil { http.Error(w, err.Error(), 400); return }
    id, err := orders.Create(cmd)
    if err != nil { http.Error(w, err.Error(), 500); return }
    json.NewEncoder(w).Encode(map[string]string{"id": id})
}
```

The handler is a 4-line table-of-contents: decode, create, respond. `orders` is the Domain module; its internals use Foundation (DB adapter, JSON codec) modules.

## Directory Structure

Place modules according to their layer. The names of directories depend on your stack's conventions, but the three layers are universal:

```
<project>/
├── <orchestration>/     # pages, routes, main entries, CLI commands
├── <domain>/            # features / services / use-cases — business logic
│   └── <capability>/    # one directory per domain capability
└── <foundation>/        # primitives, adapters, utilities
```

Create directories as needed — do not create empty directories in advance. When a module is created, place it in the layer it belongs to. If a directory doesn't exist yet, create it at that point.

### Placement Rules

- Uses only primitives (HTML+CSS, stdlib, raw SQL, raw HTTP clients, math) → **Foundation**
- Composes Foundation modules to express one domain capability → **Domain**
- Composes Domain modules to express an end-to-end flow or entry point → **Orchestration**
- Shared across domains without domain logic of its own → **Foundation**
- **Domain and Foundation modules do not live inside Orchestration files.** Every module gets its own file in the correct directory.

## Applies to

Every language, every stack, every file type you may write or modify. The detection rules are phrased for JSX because of the original UI context, but the signals translate: a Python function with inline SQL, a Go handler with inline JSON decoding, a Rust `main` with inline regex — all the same category of violation. Use the principles; adapt the vocabulary.

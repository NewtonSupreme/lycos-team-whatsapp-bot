# ERP 2.0 — Fase 0: Fundamento

**Fecha:** 2026-09-05
**Depende de:** [2026-09-05-erp-2.0-design.md](./2026-09-05-erp-2.0-design.md)
**Estado:** diseño para implementar.

---

## 1. Objetivo

Construir la base sobre la que se apoya todo el ERP, de forma que **cuatro invariantes sean estructuralmente imposibles de violar**, incluso si el código de aplicación tiene bugs:

1. Un tenant nunca puede leer ni escribir datos de otro.
2. No existe ningún camino de escritura que saltee el control de permisos.
3. Todo cambio de estado deja un evento inmutable.
4. Ningún monto de dinero pierde precisión ni pierde su tasa de cambio.

**Esta fase no entrega ninguna funcionalidad de negocio.** No hay UI, no hay clientes, no hay facturas. Entrega el fundamento y una suite de tests que demuestra las cuatro invariantes.

Se hace primero y se hace bien porque es la única capa que no se puede corregir después sin reescribir todo lo que se apoye encima.

---

## 2. Decisiones de ingeniería tomadas

| Tema | Decisión | Razón |
|---|---|---|
| Repositorio | **Nuevo repo**, separado del bot actual | Base de código nueva; el sistema actual sigue operando sin riesgo |
| Base de datos | **Postgres** vía Supabase, pero sin acoplar el dominio | RLS, JSONB y realtime salen de fábrica; el dominio queda portable |
| Credenciales | **Supabase Auth detrás de un puerto `IdentityProvider`** | No se reinventa seguridad de contraseñas/sesiones; sigue siendo reemplazable |
| Autorización | **Propia**, en la capa de dominio | Las reglas de negocio (alcance por sede, por propiedad) no las cubre ningún proveedor |
| Aislamiento | **Esquema compartido + `org_id` + RLS** | Una migración; el aislamiento lo garantiza la base, no el código |
| Tests | **Postgres real, no mocks** | RLS y constraints no se pueden testear con mocks |
| Migraciones | Versionadas, hacia adelante, aplicadas en CI desde cero | Reproducibilidad |

---

## 3. Alcance

### 3.1 Esqueleto y herramientas

- Repo TypeScript con límites de módulo explícitos:
  - `db/` — migraciones y acceso
  - `domain/` — lógica pura (sin I/O)
  - `platform/` — tenancy, identidad, autorización, eventos, dinero
  - `test/` — helpers y suite de invariantes
- Migraciones versionadas hacia adelante.
- Harness de tests contra un Postgres real y efímero.
- CI: aplica migraciones desde cero y corre toda la suite en cada push.

**Regla desde el día uno:** la lógica de dominio son funciones puras sobre datos. Nada de lógica de negocio dentro de route handlers. Es la regla que evita repetir el `webhook/route.ts` de 296 KB del sistema actual.

### 3.2 Tenancy

```
organization (id, slug, name, status, created_at)
```

- **Toda** tabla de dominio lleva `org_id NOT NULL REFERENCES organization(id)`.
- RLS **activo en todas las tablas, sin excepción**.
- Las políticas leen la organización actual de una variable de sesión (`app.current_org`), fijada por un cliente de base acotado.
- Todo acceso a datos pasa por ese cliente acotado. No hay un cliente "sin scope" disponible para código de aplicación.

**Test de invariante 1:** con el contexto del tenant A, intentar leer y escribir filas del tenant B — por id directo, por join y por función — debe fallar **en la base**, no en la aplicación.

### 3.3 Identidad

```
user_account (id, auth_user_id, email, name, status)
membership   (user_id, org_id, role_id, status, created_at)
```

- Una identidad global puede pertenecer a varias organizaciones con roles distintos.
- La organización activa de una sesión es explícita, nunca inferida.
- `IdentityProvider` es un puerto; Supabase Auth es la implementación inicial.

### 3.4 Autorización — el portero único

El corazón de la fase.

```
permission  = (action, resource_type)      p.ej. "document.create", "party.read"
role        (id, org_id | null, name, is_template)
role_grant  (role_id, action, resource_type, scope)
```

**`scope`** acota el alcance de un permiso con predicados estructurados (no un lenguaje de expresiones — eso llega en la Fase 2):
- `all` — cualquier registro de la organización
- `own` — solo registros creados por el actor
- `location` — solo registros de las sedes asignadas al actor

**El portero es una función pura:**

```
authorize(actor, action, resource) -> Allow | Deny(motivo)
```

- `actor` incluye su tipo: `user | bot | system | integration`. **El bot pasa por el mismo portero que la UI.**
- Toda mutación entra por una capa de comandos que invoca al portero antes de tocar la base.
- RLS es la **segunda** línea de defensa: la aplicación resuelve reglas ricas, la base garantiza el aislamiento.

**Test de invariante 2:** un test recorre el registro de todos los comandos declarados y falla si alguno puede ejecutarse sin una verificación de autorización. Agregar un comando nuevo sin permisos **rompe el build**.

Esto elimina por diseño la clase de bug que ya ocurrió en el sistema actual, donde el bot usaba `WRITE_TAGS` y la UI usaba `permisos`, dos modelos que se desincronizaron.

### 3.5 Log de eventos

```
event (id, org_id, actor_id, actor_kind, verb, subject_type, subject_id,
       payload, occurred_at, causation_id, correlation_id)
```

- Solo `INSERT`. Los privilegios de `UPDATE` y `DELETE` se revocan a nivel de base.
- El evento se escribe **en la misma transacción** que el cambio de estado. O quedan los dos, o no queda ninguno.
- `causation_id` (qué lo provocó) y `correlation_id` (a qué operación pertenece) permiten reconstruir cadenas completas.
- Patrón outbox para entregar eventos a integraciones externas sin acoplar la transacción.

**Test de invariante 3:** toda mutación produce evento; intentar modificar o borrar un evento falla en la base.

### 3.6 Dinero

Objetos de valor puros, sin I/O:

```
Money  { amountMinor: bigint, currency: string }
Rate   { from, to, value, source, at }
```

Persistencia de todo monto: `amount_minor`, `currency`, `rate_to_base`, `rate_source`, `rate_at`.

Operaciones puras: `add`, `subtract`, `multiplyByQuantity`, `allocate`, `convert`.

- **Prohibido el punto flotante.** Enteros en la unidad mínima, siempre.
- `allocate` reparte un monto entre N partes **sin perder ni inventar centavos** (reparto de resto determinista).
- `convert` **exige** una tasa explícita con fecha y fuente. No existe conversión implícita.
- Registro de tasas con búsqueda histórica: "la tasa vigente en tal fecha".

**Test de invariante 4:** tests de propiedad — sumar y luego repartir nunca cambia el total; ninguna operación produce flotantes; ningún monto persiste sin tasa y fuente.

---

## 4. Fuera de alcance en esta fase

Explícitamente **no** entra:

- Las cinco primitivas de dominio (Partes, Ítems, Documentos, Movimientos) — son la Fase 1.
- Cualquier UI.
- El motor de reglas y expresiones — Fase 2. Acá los alcances de permisos son predicados estructurados fijos (`all` / `own` / `location`), no un lenguaje.
- Campos y entidades custom — Fase 2.
- Capa semántica y IA — Fase 3.
- Onboarding, planes y cobro — Fase 5.

---

## 5. Terminado cuando

- [ ] Las migraciones corren desde cero en CI sin intervención.
- [ ] Existe al menos una organización de prueba y usuarios con membresías en varias organizaciones.
- [ ] **Invariante 1:** la suite prueba que el acceso entre tenants falla en la base, incluso simulando un bug de aplicación que omite el filtro por `org_id`.
- [ ] **Invariante 2:** la suite recorre todos los comandos registrados y falla si alguno carece de verificación de autorización.
- [ ] **Invariante 3:** toda mutación emite evento; los eventos no se pueden modificar ni borrar.
- [ ] **Invariante 4:** los tests de propiedad de dinero pasan; no hay un solo `number` representando dinero en el código.
- [ ] El portero de autorización trata a un actor `bot` exactamente igual que a un actor `user`.

---

## 6. Riesgos de esta fase

| Riesgo | Mitigación |
|---|---|
| RLS mal configurado deja un hueco silencioso | Los tests de aislamiento son adversarios: simulan bugs de aplicación a propósito |
| El portero se vuelve un cuello de botella | Es una función pura sobre datos ya cargados en memoria; sin I/O |
| Sobrediseñar los alcances de permisos | Solo tres alcances fijos en esta fase; el lenguaje de expresiones espera a la Fase 2 |
| El log de eventos crece sin control | Particionado por fecha desde el inicio; la política de retención se define en Fase 5 |

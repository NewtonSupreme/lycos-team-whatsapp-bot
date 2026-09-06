# Sistema de diseño — Lycos ERP

Reglas de la interfaz. Si algo acá se contradice en una pantalla nueva, la
pantalla está mal, no la regla.

## El principio

**Un solo acento.** El naranja de marca se reserva para la acción primaria y
el estado activo de la navegación. Nada más. El color en una interfaz de datos
es un recurso escaso: si todo tiene color, nada destaca.

Antes de este sistema la app tenía azul, morado, cian, verde y naranja
compitiendo en la misma pantalla, cada uno con su `/10` de fondo y `/20` de
borde. El resultado no era colorido: era plano, porque nada tenía jerarquía.

## Color

| Token | Cuándo |
|---|---|
| `primary` | Acción primaria, ítem de navegación activo. Una por pantalla. |
| `success` | Confirmado, pagado, en verde, disponible |
| `warning` | Requiere atención, vence pronto, stock bajo |
| `danger` | Error, vencido, eliminado, saldo negativo |
| `info` | Informativo neutro, en curso |
| `muted` | Todo lo demás |

Cada uno tiene su variante `-subtle` para fondos.

**Prohibido:** `bg-blue-500/10`, `text-purple-400`, `bg-white/5` y demás
hardcodeos. Rompen el modo oscuro y no significan nada. `hover:bg-white/5` es
literalmente invisible en modo claro.

**El color nunca comunica solo.** Toda variación lleva flecha, todo estado
lleva texto. Quien no distingue rojo de verde también usa el sistema.

## Tipografía

- **Syne** solo para `h1`/`h2` y la marca. Es una tipografía con carácter;
  usada en todo se vuelve ruido.
- **DM Sans** para todo lo demás.
- **Mínimo 12px.** Nada de `text-[9px]` ni `text-[10px]`. Si no entra, sobra
  contenido, no falta tamaño.
- **Numerales tabulares** (`.num` o dentro de `<table>`) en toda cifra de
  dinero o métrica. Sin esto las columnas bailan al actualizarse.

## Elevación

Tres niveles: `shadow-sm` (tarjetas), `shadow-md` (desplegables),
`shadow-lg` (modales). No se inventan sombras nuevas.

## Espaciado

Ritmo de 4/8px. Secciones separadas por `space-y-6`, contenido interno por
`space-y-3`.

## Primitivas

Antes de escribir una pantalla, revisar si ya existe:

| Componente | Para |
|---|---|
| `PageHeader` | Título, descripción, contexto y acciones. Una pantalla, un `h1`. |
| `Section` | Bloque con encabezado. Da el ritmo vertical. |
| `StatCard` | Métrica. La variación lleva flecha además de color. |
| `Money` | Toda cifra de dinero. Doble moneda con el equivalente subordinado. |
| `StatusPill` | Estado. Seis tonos con significado fijo. |
| `DataTable` | Tabla. Cabecera fija, `aria-sort`, esqueleto, estado vacío. |
| `EmptyState` | Vacío. Siempre con una salida. |

Si algo necesita un color nuevo, casi siempre le falta un **significado**, no
un tono.

## Accesibilidad — no negociable

- Contraste mínimo 4.5:1 en texto de cuerpo.
- Foco visible siempre. Quitar el `outline` rompe la navegación por teclado.
- Objetivos táctiles de 44×44px como mínimo.
- Los botones de solo icono llevan `aria-label`.
- El ítem de navegación activo lleva `aria-current="page"`.
- Se respeta `prefers-reduced-motion` (ya global en `globals.css`).

## Navegación

Seis grupos por dominio: Operación, Clientes, Ventas, Inventario, Finanzas,
Sistema. Ajustes y cuenta van al pie, fuera de los grupos.

Una lista plana de 24 ítems no es navegación, es un índice — y obliga a leerlo
entero cada vez.

/**
 * Qué barra lateral usa el sistema.
 *
 * Hay dos armazones conviviendo: el de siempre (`DashboardLayout` + `Sidebar` +
 * `Header`) y el nuevo del rediseño (`ErpShell`). Mientras el nuevo se termina,
 * conviven mal: las pantallas ya migradas enseñaban una barra distinta al resto,
 * y bastaba olvidar una ruta en la lista de excepciones para acabar con las dos
 * a la vez.
 *
 * Este interruptor decide cuál manda en TODO el sistema:
 *
 *   false → la barra de siempre. `ErpShell` pinta solo su contenido, sin barra
 *           ni cabecera propias, y `DashboardLayout` envuelve todas las
 *           pantallas por igual.
 *
 *   true  → el armazón nuevo. Cada pantalla migrada monta el suyo y
 *           `DashboardLayout` se aparta en esas rutas.
 *
 * Cambiar este valor es lo único que hace falta para pasar de uno al otro: las
 * pantallas no se tocan. Lo que se migra sigue migrado, solo espera su turno.
 */
export const USAR_ARMAZON_NUEVO = false;

/**
 * Las rutas que montan su propio `ErpShell`.
 *
 * Con el armazón nuevo apagado la lista queda vacía a propósito: si una ruta se
 * quedara aquí, `DashboardLayout` se apartaría y esa pantalla se vería sin
 * ninguna barra.
 */
export const RUTAS_ARMAZON_PROPIO: readonly string[] = USAR_ARMAZON_NUEVO
  ? [
    '/dashboard/apps', '/dashboard/nomina', '/dashboard/silenciadores',
    '/dashboard/ajustes/empleados', '/dashboard/ficha', '/dashboard/configuracion',
    '/dashboard/ia', '/dashboard/facturas',
  ]
  : ['/dashboard/apps'];

/**
 * La categoría de un gasto a partir de lo que se escribió.
 *
 * La ficha mandaba todo lo que no era «servicio» a Repuestos, y lo que era
 * «servicio» a Servicios —la misma categoría que la luz y el agua—. Así un
 * lavado completo quedaba como repuesto y la gasolina del motorizado como
 * «otro». Esta regla lee el texto y propone la categoría; quien registra la
 * puede cambiar.
 */

const sinAcentos = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const REGLAS: Array<[RegExp, string]> = [
  // Trabajos que se mandan a hacer fuera para un carro.
  [/\b(lavado|lavad[ao]|limpieza de inyector|limpieza inyector|rectific|torno|tornero|soldadura|pintura|latoneria|tapiceria|vulcaniz|reparacion de|alineacion|balanceo|mano de obra externa)/, 'trabajos_terceros'],
  // Insumos que se gastan en el trabajo.
  [/\b(aceite|grasa|silicon|refrigerante|liga de freno|liquido de freno|lubricante|desengrasante|estopa|lija|thinner|masilla|papel ahumado|teflon)/, 'insumos'],
  // Lo de tener el taller abierto.
  [/\b(luz|electricidad|corpoelec|agua|hidrocapital|internet|cantv|telefono|movistar|digitel|gas domestico)/, 'servicios'],
  [/\b(alquiler|arriendo|condominio|mantenimiento del local|pintura del local|limpieza del local)/, 'local'],
  [/\b(gasolina|combustible|flete|motorizado|delivery|pasaje|taxi|transporte|peaje)/, 'transporte'],
  [/\b(seniat|impuesto|alcaldia|patente|permiso|bomberos|iva a pagar)/, 'impuestos'],
  [/\b(herramienta|llave|gato hidraulico|compresor|escaner|scanner|equipo|taladro|pistola)/, 'herramientas'],
  [/\b(sueldo|salario|nomina|comision|adelanto|bono)/, 'nomina'],
];

export function categoriaSugerida(texto: string, porDefecto = 'repuestos'): string {
  const t = sinAcentos(texto);
  for (const [re, cat] of REGLAS) if (re.test(t)) return cat;
  return porDefecto;
}

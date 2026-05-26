const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'app', 'api', 'whatsapp', 'webhook', 'route.ts');
let content = fs.readFileSync(filePath, 'utf8');

const target = `   - [CITA_DELETE: id]\r\n   - [CLIENTE_UPSERT: id_opcional | nombre | apellido | telefono | cedula | direccion | sede_id]\r\n   - [ASK_SEDE: motivo] -> Úsalo si falta la sede en una orden administrativa.`;

const replacement = `   - [CITA_DELETE: id]\r\n   - [CLIENTE_UPSERT: id_opcional | nombre | apellido | telefono | cedula | direccion | sede_id]\r\n   - [ASK_SEDE: motivo] -> Úsalo si falta la sede en una orden administrativa.\r\n   - [ACTION: registrar_venta_completa | titulo=X | items=Prod1:Pre1,Prod2:Pre2 | total=TOTAL | iva=MONTO | inicial=INICIAL_CASHEA | metodo_pago=cashea_bcv/divisas/bcv/binance/zelle/pago_movil/efectivo_ves/punto_venta/transferencia/otro | pago_mixto=DESC | cliente=NOMBRE | vehiculo=MARCA_PLACA | inv_ids=ID1:qty1,ID2:qty2] -> Úsalo para registrar una venta en el sistema (por ejemplo, tras confirmación de precio o factura).`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully updated ADMIN_KNOWLEDGE in route.ts');
} else {
  console.error('Target text not found in route.ts!');
}

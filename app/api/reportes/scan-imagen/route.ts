import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

export async function POST(req: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY no configurada' }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { imageBase64, mimeType = 'image/jpeg', modo = 'cierre' } = body;

    if (!imageBase64) {
      return NextResponse.json({ error: 'Se requiere la imagen en base64' }, { status: 400 });
    }

    const today = new Date().toISOString().split('T')[0];

    let prompt = '';
    
    if (modo === 'ticket') {
      prompt = `Eres un asistente automatizado de facturación para Lycos Team.
Analiza este documento que es un Ticket o Factura individual.
Extrae ABSOLUTAMENTE TODO el detalle del ticket de forma estructurada.

Responde ÚNICAMENTE con un JSON válido con esta estructura exacta:
{
  "tipo_escaneo": "ticket",
  "empresa_nombre": "",
  "empresa_rif": "",
  "fecha": "${today}",
  "hora": "",
  "nro_factura": "",
  "cliente_nombre": "",
  "cliente_vehiculo": "",
  "items": [
    {
      "cantidad": 1,
      "descripcion": "",
      "precio_unitario": 0.00,
      "total": 0.00
    }
  ],
  "subtotal": 0.00,
  "impuestos": 0.00,
  "total_ingresos": 0.00,
  "total_servicios": 0,
  "total_clientes": 1,
  "metodo_pago": ""
}

REGLAS IMPORTANTES PARA TICKET:
- Extrae todas las líneas (items) compradas, con detalle exacto.
- Las cantidades son numéricas, igual que los totales.
- NO incluyas Markdown (\`\`\`json) rodeando la respuesta, solo retorna el objeto JSON crudo en texto.`;
    } else {
      prompt = `Eres un asistente contable experto para Lycos Team, un taller automotriz en Venezuela.
Analiza esta imagen que puede ser: un cierre de caja, recibo, resumen diario, lista de servicios, o el formato de reporte del taller.

Extrae TODOS los datos visibles y responde ÚNICAMENTE con un JSON válido con esta estructura exacta (todos los campos son requeridos, usa 0 si no aparece):

{
  "tipo_escaneo": "cierre",
  "fecha": "${today}",
  "clientes_atendidos": 0,
  "servicios": {
    "silenciador": 0.00,
    "cauchera": 0.00,
    "alineacion": 0.00,
    "electronica": 0.00,
    "mecanica": 0.00,
    "frenos": 0.00,
    "lavado": 0.00,
    "repuestos": 0.00
  },
  "total_ingresos": 0.00,
  "formas_de_pago": {
    "contado": 0.00,
    "por_cobrar": 0.00,
    "cashea": 0.00,
    "iva": 0.00,
    "inicial": 0.00,
    "financiado": 0.00,
    "tasa": 0.00,
    "pago_movil_banesco": 0.00,
    "pago_movil_exterior": 0.00,
    "punto_bancamiga": 0.00,
    "punto_banesco": 0.00,
    "bnc": 0.00,
    "dolares": 0.00,
    "binance": 0.00,
    "zelle": 0.00,
    "efectivo_bs": 0.00
  },
  "clientes": [
    {
      "nombre": "",
      "carro": "",
      "servicio": "",
      "total": 0.00,
      "forma_pago": ""
    }
  ],
  "notas": "",
  "total_servicios": 0
}

REGLAS IMPORTANTES:
- fecha: si aparece en la imagen úsala, si no usa "${today}"
- Si ves montos en Bs (bolívares), el campo efectivo_bs los recibe tal cual en Bs
- Si ves montos en $ (dólares) o sin indicador, úsalos en el campo correspondiente
- total_ingresos es la suma total de TODOS los ingresos en dólares
- tasa es la tasa BCV del día si aparece
- Extrae los clientes individuales si aparecen listados con nombre y vehículo
- NO incluyas Markdown (\`\`\`json) rodeando la respuesta, solo retorna el objeto JSON crudo en texto.`;
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType, data: imageBase64 } },
              { text: prompt }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini error:', errText.substring(0, 200));
      return NextResponse.json({ error: 'Error al procesar imagen con IA' }, { status: 500 });
    }

    const geminiData = await response.json();
    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    const rawText = parts.map((p: any) => p.text).join('') || '';

    const cleanJson = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let extracted;
    try {
      extracted = JSON.parse(cleanJson);
    } catch {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0]);
      } else {
        return NextResponse.json({ error: 'No se pudo extraer datos estructurados', rawText }, { status: 422 });
      }
    }

    return NextResponse.json({ success: true, data: extracted, rawText });

  } catch (error) {
    console.error('Error en scan-imagen:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

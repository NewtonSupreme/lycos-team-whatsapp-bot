import { NextResponse } from 'next/server';
import { fetchNominaRates } from '@/lib/payroll/currency';

export const dynamic = 'force-dynamic';

/** Tasas en vivo para el motor de nómina: VES (BCV + paralelo) y EUR (BCE). */
export async function GET() {
  const rates = await fetchNominaRates();
  return NextResponse.json(rates);
}

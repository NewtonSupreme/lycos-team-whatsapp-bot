import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface ExchangeRates {
  bcv: number;
  paralelo: number;
  fetchedAt: string;
}

let ratesCache: ExchangeRates | null = null;
let ratesCacheTime = 0;
const RATES_TTL = 30 * 60 * 1000; // 30 minutes

export async function GET() {
  if (ratesCache && Date.now() - ratesCacheTime < RATES_TTL) {
    return NextResponse.json(ratesCache);
  }

  try {
    let bcvRate = 0;
    try {
      const respBcv = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 1800 }
      });
      if (respBcv.ok) {
        const bcvEntry = await respBcv.json();
        if (bcvEntry) bcvRate = bcvEntry.promedio || bcvEntry.precio || 0;
      }
    } catch (e) { console.error('Error fetching BCV:', e); }

    let binanceRate = 0;
    try {
      const respBin = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36'
        },
        body: JSON.stringify({
          fiat: "VES", page: 1, rows: 10, tradeType: "BUY", asset: "USDT",
          countries: [], proMerchantAds: false, shieldMerchantAds: false,
          publisherType: null, payTypes: ["PagoMovil"], classifies: ["mass", "profession", "user"]
        })
      });
      if (respBin.ok) {
        const binData = await respBin.json();
        if (binData.data && binData.data.length > 3) {
          const marketAds = binData.data.slice(2, 7);
          binanceRate = marketAds.reduce((acc: number, ad: any) => acc + parseFloat(ad.adv.price), 0) / marketAds.length;
        } else if (binData.data && binData.data.length > 0) {
          binanceRate = parseFloat(binData.data[0].adv.price);
        }
      }
    } catch (e) { console.error('Error fetching Binance P2P:', e); }

    // Fallback if Binance P2P fails
    if (!binanceRate) {
      try {
        const tempResp = await fetch('https://ve.dolarapi.com/v1/dolares/paralelo');
        if (tempResp.ok) {
          const parEntry = await tempResp.json();
          binanceRate = parseFloat(parEntry?.promedio || parEntry?.precio || 0);
        }
      } catch (e) { console.error('Error in parallel fallback:', e); }
    }

    if (!bcvRate || !binanceRate) {
      return NextResponse.json(ratesCache || { bcv: 36.5, paralelo: 54.0, fetchedAt: 'FALLBACK' });
    }

    ratesCache = { bcv: bcvRate, paralelo: binanceRate, fetchedAt: new Date().toISOString() };
    ratesCacheTime = Date.now();
    return NextResponse.json(ratesCache);
  } catch (error) {
    console.error('Error in rates API:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

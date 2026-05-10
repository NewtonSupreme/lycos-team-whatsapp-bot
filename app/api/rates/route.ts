import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let bcvRate = 0;
    // 1. FETCH BCV (Oficial)
    try {
      const respBcv = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', { cache: 'no-store' });
      if (respBcv.ok) {
        const data = await respBcv.json();
        bcvRate = data.promedio || data.precio || 0;
      }
      
      if (!bcvRate) {
        const respPy = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/dollar?page=bcv', { cache: 'no-store' });
        if (respPy.ok) {
          const dataPy = await respPy.json();
          bcvRate = dataPy.monitors?.bcv?.price || 0;
        }
      }
    } catch (e) {
      console.error('Error fetching BCV:', e);
    }

    // 2. FETCH BINANCE (P2P)
    let binanceRate = 0;
    try {
      const respBin = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          fiat: "VES", page: 1, rows: 15, tradeType: "BUY", asset: "USDT",
          countries: [], proMerchantAds: false, shieldMerchantAds: false,
          publisherType: null, payTypes: ["PagoMovil"], classifies: ["mass", "profession", "user"]
        }),
        cache: 'no-store'
      });
      
      if (respBin.ok) {
        const binData = await respBin.json();
        if (binData.data && binData.data.length > 3) {
          // Skip first 2 ads (often outliers) and average next 5
          const marketAds = binData.data.slice(2, 7);
          binanceRate = marketAds.reduce((acc: number, ad: any) => acc + parseFloat(ad.adv.price), 0) / marketAds.length;
        } else if (binData.data && binData.data.length > 0) {
          binanceRate = parseFloat(binData.data[0].adv.price);
        }
      }
    } catch (e) {
      console.error('Error fetching Binance P2P:', e);
    }

    // 3. FALLBACK PARALELO (if Binance fails)
    if (!binanceRate) {
      try {
        const tempResp = await fetch('https://ve.dolarapi.com/v1/dolares', { cache: 'no-store' });
        if (tempResp.ok) {
          const tempData = await tempResp.json();
          const parEntry = tempData.find((d: any) => 
            d.nombre?.toLowerCase().includes('paralelo') || 
            d.nombre?.toLowerCase().includes('binance') ||
            d.fuente === 'enparalelovzla'
          );
          if (parEntry) binanceRate = parEntry.promedio || parEntry.precio;
        }
      } catch (e) {}
    }

    // Final Hard Fallback if everything fails
    if (!bcvRate) bcvRate = 36.5;
    if (!binanceRate) binanceRate = bcvRate * 1.15; // Estimate 15% spread if totally blind

    return NextResponse.json({
      bcv: bcvRate,
      binance: binanceRate,
      paralelo: binanceRate,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch rates' }, { status: 500 });
  }
}

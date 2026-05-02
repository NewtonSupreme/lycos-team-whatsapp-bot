import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let bcvRate = 0;
    try {
      const respBcv = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
        next: { revalidate: 600 } // Cache for 10 minutes
      });
      if (respBcv.ok) {
        const data = await respBcv.json();
        bcvRate = data.promedio || data.precio || 0;
      } else {
        // Fallback to general list if /oficial fails
        const respAll = await fetch('https://ve.dolarapi.com/v1/dolares');
        if (respAll.ok) {
          const dataAll = await respAll.json();
          const bcvEntry = dataAll.find((d: any) => 
            d.fuente === 'oficial' || 
            d.nombre?.toLowerCase().includes('bcv') || 
            d.nombre?.toLowerCase().includes('oficial')
          );
          if (bcvEntry) bcvRate = bcvEntry.promedio || bcvEntry.precio || 0;
        }
      }

      // Final fallback if still 0
      if (!bcvRate) {
        const respPy = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/dollar?page=bcv');
        if (respPy.ok) {
          const dataPy = await respPy.json();
          bcvRate = dataPy.monitors?.bcv?.price || 0;
        }
      }
    } catch (e) {
      console.error('Error fetching BCV:', e);
    }

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
        }),
        next: { revalidate: 600 }
      });
      if (respBin.ok) {
        const binData = await respBin.json();
        if (binData.data && binData.data.length > 0) {
          binanceRate = parseFloat(binData.data[0].adv.price);
        }
      }
    } catch (e) {
      console.error('Error fetching Binance P2P:', e);
    }

    // Fallback for Binance if native fetch fails
    if (!binanceRate) {
      try {
        const tempResp = await fetch('https://ve.dolarapi.com/v1/dolares');
        if (tempResp.ok) {
          const tempData = await tempResp.json();
          const parEntry = tempData.find((d: any) => d.nombre?.toLowerCase().includes('paralelo') || d.nombre?.toLowerCase().includes('binance'));
          if (parEntry) binanceRate = parEntry.promedio;
        }
      } catch (e) {}
    }

    return NextResponse.json({
      bcv: bcvRate,
      binance: binanceRate,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch rates' }, { status: 500 });
  }
}

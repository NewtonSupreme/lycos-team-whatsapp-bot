const RATES_TTL = 30 * 60 * 1000;
let ratesCache = null;
let ratesCacheTime = 0;

async function fetchExchangeRates() {
  if (ratesCache && Date.now() - ratesCacheTime < RATES_TTL) return ratesCache;
  try {
    let bcvRate = 0;
    try {
      const respBcv = await fetch('https://ve.dolarapi.com/v1/dolares', {
        headers: { 'Accept': 'application/json' }
      });
      if (respBcv.ok) {
        const data = await respBcv.json();
        const bcvEntry = data.find(d => d.nombre?.toLowerCase().includes('oficial') || d.nombre?.toLowerCase().includes('bcv'));
        if (bcvEntry) bcvRate = bcvEntry.promedio;
        console.log('BCV Rate fetched:', bcvRate);
      } else {
        console.log('BCV fetch not OK', respBcv.status);
      }
    } catch(e) { console.error('Error fetching BCV:', e); }

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
        if (binData.data && binData.data.length > 0) {
          binanceRate = parseFloat(binData.data[0].adv.price);
          console.log('Binance Rate fetched:', binanceRate);
        }
      } else {
        console.log('Binance fetch not OK', respBin.status);
      }
    } catch(e) { console.error('Error fetching Binance P2P:', e); }

    if (!bcvRate && ratesCache) bcvRate = ratesCache.bcv;
    if (!binanceRate && ratesCache) binanceRate = ratesCache.paralelo;

    if (!binanceRate) {
      console.log('Fallback to dolarAPI for Binance');
      try {
        const tempResp = await fetch('https://ve.dolarapi.com/v1/dolares');
        if (tempResp.ok) {
          const tempData = await tempResp.json();
          const parEntry = tempData.find(d => d.nombre?.toLowerCase().includes('paralelo') || d.nombre?.toLowerCase().includes('binance'));
          if (parEntry) binanceRate = parEntry.promedio;
        }
      } catch(e) {}
    }

    if (!bcvRate || !binanceRate) {
       console.log('Fallo final, devolviendo cache', bcvRate, binanceRate);
       return ratesCache;
    }

    ratesCache = {
      bcv: bcvRate,
      paralelo: binanceRate,
      fetchedAt: new Date().toISOString(),
    };
    ratesCacheTime = Date.now();
    console.log(`💱 Tasas actualizadas: BCV ${ratesCache.bcv} | Binance P2P Nativo ${ratesCache.paralelo}`);
    return ratesCache;
  } catch (e) {
    console.error('Error general fetchExchangeRates:', e);
    return ratesCache;
  }
}

fetchExchangeRates().then(console.log);

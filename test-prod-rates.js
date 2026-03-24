const RATES_TTL = 30 * 60 * 1000;
let ratesCache = null;
let ratesCacheTime = 0;

async function fetchExchangeRates() {
  if (ratesCache && Date.now() - ratesCacheTime < RATES_TTL) return ratesCache;
  try {
    let bcvRate = 0;
    try {
      const respBcv = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
        headers: { 'Accept': 'application/json' }
      });
      if (respBcv.ok) {
        const bcvEntry = await respBcv.json();
        if (bcvEntry) bcvRate = bcvEntry.promedio || bcvEntry.precio || bcvEntry.value || 0;
        console.log('BCV fetched directly from /oficial:', bcvRate);
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
          console.log('Binance fetched directly:', binanceRate);
        }
      }
    } catch(e) { console.error('Error fetching Binance P2P:', e); }

    if (!bcvRate || !binanceRate) return null;

    ratesCache = {
      bcv: bcvRate,
      paralelo: binanceRate,
      fetchedAt: new Date().toISOString(),
    };
    ratesCacheTime = Date.now();
    return ratesCache;
  } catch (e) {
    return null;
  }
}

fetchExchangeRates().then(data => console.log('Final Cache:', data));

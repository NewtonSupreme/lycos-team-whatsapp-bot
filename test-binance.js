async function getBinanceRate() {
  const url = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
  const body = {
    fiat: "VES",
    page: 1,
    rows: 10,
    tradeType: "BUY",
    asset: "USDT",
    countries: [],
    proMerchantAds: false,
    shieldMerchantAds: false,
    publisherType: null,
    payTypes: ["PagoMovil"],
    classifies: ["mass", "profession", "user"]
  };
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36'
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      console.error('Error HTTP:', response.status);
      process.exit(1);
    }
    
    const data = await response.json();
    if (data.data && data.data.length > 0) {
      const rateString = data.data[0].adv.price;
      console.log('SUCCESS! Binance P2P Rate:', parseFloat(rateString));
    } else {
      console.log('No ads found', data);
    }
  } catch (err) {
    console.error('Fetch failed:', err);
  }
}

getBinanceRate();

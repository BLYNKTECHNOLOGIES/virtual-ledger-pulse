import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CryptoData {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
}

export function LiveCryptoRates() {
  const [cryptoData, setCryptoData] = useState<CryptoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);

  // Fallback data to ensure something always displays
  const fallbackData: CryptoData[] = [
    {
      id: 'bitcoin',
      symbol: 'btc',
      name: 'Bitcoin',
      image: 'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png?1696501400',
      current_price: 67234,
      price_change_percentage_24h: 2.4,
      market_cap: 1300000000000
    },
    {
      id: 'ethereum',
      symbol: 'eth', 
      name: 'Ethereum',
      image: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png?1696501628',
      current_price: 3891,
      price_change_percentage_24h: 1.8,
      market_cap: 400000000000
    },
    {
      id: 'litecoin',
      symbol: 'ltc',
      name: 'Litecoin', 
      image: 'https://coin-images.coingecko.com/coins/images/2/large/litecoin.png?1696501400',
      current_price: 142,
      price_change_percentage_24h: -0.5,
      market_cap: 10000000000
    },
    {
      id: 'bitcoin-cash',
      symbol: 'bch',
      name: 'Bitcoin Cash',
      image: 'https://coin-images.coingecko.com/coins/images/780/large/bitcoin-cash-circle.png?1696501932',
      current_price: 289,
      price_change_percentage_24h: 3.2,
      market_cap: 6000000000
    }
  ];

  const supportedCryptos = [
    'bitcoin',
    'ethereum', 
    'litecoin',
    'bitcoin-cash',
    'dogecoin',
    'tether',
    'usd-coin'
  ];

  useEffect(() => {
    // Load cached data from localStorage on mount
    const cachedData = localStorage.getItem('cryptoData');
    const cachedTime = localStorage.getItem('cryptoDataTime');
    
    if (cachedData && cachedTime) {
      try {
        const data = JSON.parse(cachedData);
        const time = new Date(cachedTime);
        // Use cached data if it's less than 5 minutes old
        if (Date.now() - time.getTime() < 5 * 60 * 1000 && data.length > 0) {
          setCryptoData(data);
          setLastFetchTime(time);
          setLoading(false);
          console.log('Using cached crypto data:', data);
        }
      } catch (e) {
        console.error('Error parsing cached data:', e);
      }
    }

    const fetchCryptoData = async () => {
      try {
        console.log('Starting crypto data fetch...');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
        
        const response = await fetch(
          `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${supportedCryptos.join(',')}&order=market_cap_desc&per_page=10&page=1&sparkline=false&price_change_percentage=24h`,
          {
            headers: {
              'Accept': 'application/json'
            },
            signal: controller.signal
          }
        );
        
        clearTimeout(timeoutId);
        console.log('Fetch response received:', response.status, response.ok);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Data parsed successfully, items:', data.length);
        
        // Ensure we have valid data
        if (Array.isArray(data) && data.length > 0) {
          const now = new Date();
          setCryptoData(data);
          setLastFetchTime(now);
          setError(null);
          
          // Cache the data in localStorage
          localStorage.setItem('cryptoData', JSON.stringify(data));
          localStorage.setItem('cryptoDataTime', now.toISOString());
        } else {
          throw new Error('Invalid data received from API');
        }
      } catch (err) {
        console.error('Error fetching crypto data:', err);
        
        // Only show error if we have no data at all (no cached data and no current data)
        if (cryptoData.length === 0) {
          console.log('Using fallback data due to fetch failure');
          setCryptoData(fallbackData);
          setLastFetchTime(new Date());
          setError('Using fallback data. Unable to connect to live rates.');
        } else {
          // We have cached data, so don't show error state
          console.log('Fetch failed but using existing cached data');
          setError(null);
        }
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch if we don't have recent cached data
    if (!cachedData || !cachedTime || Date.now() - new Date(cachedTime).getTime() > 5 * 60 * 1000) {
      fetchCryptoData();
    }
    
    // Refresh data every 30 seconds
    const interval = setInterval(() => {
      fetchCryptoData();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const formatPrice = (price: number) => {
    if (price >= 1) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(price);
    } else {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 4,
        maximumFractionDigits: 6,
      }).format(price);
    }
  };

  const formatMarketCap = (marketCap: number) => {
    if (marketCap >= 1e12) {
      return `$${(marketCap / 1e12).toFixed(2)}T`;
    } else if (marketCap >= 1e9) {
      return `$${(marketCap / 1e9).toFixed(2)}B`;
    } else if (marketCap >= 1e6) {
      return `$${(marketCap / 1e6).toFixed(2)}M`;
    }
    return `$${marketCap.toLocaleString()}`;
  };

  if (loading) {
    return (
      <section className="py-16 bg-muted/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">Live Crypto Rates</h2>
            <p className="text-muted-foreground">Real-time cryptocurrency prices and market data</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, index) => (
              <Card key={index} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-muted rounded-full"></div>
                    <div className="space-y-2">
                      <div className="h-4 bg-muted rounded w-20"></div>
                      <div className="h-3 bg-muted rounded w-16"></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-6 bg-muted rounded w-24"></div>
                    <div className="h-4 bg-muted rounded w-16"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="py-16 bg-muted/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="text-destructive mb-4">{error}</div>
          <button 
            onClick={() => window.location.reload()} 
            className="text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 bg-muted/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-foreground mb-4">Live Crypto Rates</h2>
          <p className="text-muted-foreground">Real-time cryptocurrency prices and market data</p>
          <div className="text-xs text-muted-foreground mt-2">
            Updates every 30 seconds • Powered by CoinGecko {lastFetchTime && `• Last updated: ${lastFetchTime.toLocaleTimeString()}`}
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {cryptoData.map((crypto) => (
            <Card key={crypto.id} className="hover:shadow-lg transition-shadow group">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <img 
                    src={crypto.image} 
                    alt={`${crypto.name} logo`}
                    className="w-12 h-12 rounded-full"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = '/placeholder.svg';
                    }}
                  />
                  <div>
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {crypto.name}
                    </h3>
                    <p className="text-sm text-muted-foreground uppercase">
                      {crypto.symbol}
                    </p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="text-2xl font-bold text-foreground">
                    {formatPrice(crypto.current_price)}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "flex items-center gap-1 text-sm font-medium",
                        crypto.price_change_percentage_24h >= 0
                          ? "text-success"
                          : "text-destructive"
                      )}
                    >
                      {crypto.price_change_percentage_24h >= 0 ? (
                        <TrendingUp className="w-4 h-4" />
                      ) : (
                        <TrendingDown className="w-4 h-4" />
                      )}
                      {Math.abs(crypto.price_change_percentage_24h).toFixed(2)}%
                    </div>
                    <span className="text-xs text-muted-foreground">24h</span>
                  </div>
                  
                  <div className="text-xs text-muted-foreground">
                    Market Cap: {formatMarketCap(crypto.market_cap)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        
        <div className="text-center mt-8">
          <p className="text-xs text-muted-foreground">
            We compare offers from the best providers so you always get the most crypto for your money, 
            with transparent pricing and multiple payment options.
          </p>
        </div>
      </div>
    </section>
  );
}
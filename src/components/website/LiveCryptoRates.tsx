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
    const fetchCryptoData = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${supportedCryptos.join(',')}&order=market_cap_desc&per_page=10&page=1&sparkline=false&price_change_percentage=24h`
        );
        
        if (!response.ok) {
          throw new Error('Failed to fetch crypto data');
        }
        
        const data = await response.json();
        setCryptoData(data);
        setError(null);
      } catch (err) {
        setError('Failed to load live rates. Please try again later.');
        console.error('Error fetching crypto data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCryptoData();
    
    // Refresh data every 30 seconds
    const interval = setInterval(fetchCryptoData, 30000);
    
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
            Updates every 30 seconds • Powered by CoinGecko
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
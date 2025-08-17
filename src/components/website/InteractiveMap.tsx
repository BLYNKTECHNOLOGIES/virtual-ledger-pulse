import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MapPin } from 'lucide-react';

const InteractiveMap = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [token, setToken] = useState<string>('');
  const [isTokenSet, setIsTokenSet] = useState(false);

  // Bhopal office coordinates
  const officeLocation: [number, number] = [77.4126, 23.2599];

  const initializeMap = (accessToken: string) => {
    if (!mapContainer.current) return;

    mapboxgl.accessToken = accessToken;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: officeLocation,
      zoom: 15,
      pitch: 0,
    });

    // Add navigation controls
    map.current.addControl(
      new mapboxgl.NavigationControl({
        visualizePitch: true,
      }),
      'top-right'
    );

    // Add a marker for the office location
    const marker = new mapboxgl.Marker({
      color: 'hsl(var(--primary))',
      scale: 1.2,
    })
      .setLngLat(officeLocation)
      .addTo(map.current);

    // Add popup with office information
    const popup = new mapboxgl.Popup({
      offset: 25,
      closeButton: false,
      className: 'office-popup',
    })
      .setLngLat(officeLocation)
      .setHTML(`
        <div class="p-4 min-w-[250px]">
          <h3 class="font-bold text-lg mb-2 text-foreground">BLYNK VIRTUAL TECHNOLOGIES</h3>
          <p class="text-sm text-muted-foreground leading-relaxed">
            1st Floor Balwant Arcade, Plot No. 15<br/>
            Maharana Pratap Nagar, Zone II<br/>
            Bhopal, 462011, Madhya Pradesh, India
          </p>
          <div class="mt-3 pt-3 border-t border-border">
            <p class="text-xs text-muted-foreground">
              📞 +91 9266712788<br/>
              ✉️ support@blynkex.com
            </p>
          </div>
        </div>
      `)
      .addTo(map.current);

    // Style the popup
    const style = document.createElement('style');
    style.textContent = `
      .office-popup .mapboxgl-popup-content {
        background: hsl(var(--background));
        border: 1px solid hsl(var(--border));
        border-radius: 12px;
        box-shadow: 0 10px 30px -10px hsl(var(--primary) / 0.3);
        color: hsl(var(--foreground));
      }
      .office-popup .mapboxgl-popup-tip {
        border-top-color: hsl(var(--background));
      }
    `;
    document.head.appendChild(style);
  };

  const handleTokenSubmit = () => {
    if (token.trim()) {
      try {
        initializeMap(token.trim());
        setIsTokenSet(true);
      } catch (error) {
        console.error('Failed to initialize map:', error);
        alert('Invalid Mapbox token. Please check your token and try again.');
      }
    }
  };

  useEffect(() => {
    return () => {
      map.current?.remove();
    };
  }, []);

  if (!isTokenSet) {
    return (
      <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent h-64 flex items-center justify-center rounded-3xl border border-primary/10">
        <div className="text-center max-w-md p-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6">
            <MapPin className="h-8 w-8 text-primary" />
          </div>
          <h3 className="font-bold text-xl mb-4">Interactive Map</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Enter your Mapbox public token to view our office location. 
            Get your token from <a href="https://mapbox.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">mapbox.com</a>
          </p>
          <div className="space-y-3">
            <Input
              type="password"
              placeholder="Enter Mapbox public token..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="text-sm"
            />
            <Button onClick={handleTokenSubmit} className="w-full">
              Load Map
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-64 rounded-3xl overflow-hidden border border-primary/10">
      <div ref={mapContainer} className="absolute inset-0" />
      <div className="absolute top-4 left-4 bg-background/90 backdrop-blur-sm border border-primary/10 rounded-xl px-4 py-2 shadow-lg">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Our Office</span>
        </div>
      </div>
    </div>
  );
};

export default InteractiveMap;

import { ModernHeroSection } from '../ModernHeroSection';
import { ModernFeaturesSection } from '../ModernFeaturesSection';
import { ModernServicesSection } from '../ModernServicesSection';
import { LiveCryptoRates } from '../LiveCryptoRates';

export function HomePage() {
  return (
    <div className="min-h-screen">
      <ModernHeroSection />
      <div className="bg-muted/30 border-b border-border/40">
        <LiveCryptoRates />
      </div>
      <ModernFeaturesSection />
      <ModernServicesSection />
    </div>
  );
}

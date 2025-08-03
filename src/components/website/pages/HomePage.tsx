
import { ModernHeroSection } from '../ModernHeroSection';
import { ModernFeaturesSection } from '../ModernFeaturesSection';
import { ModernServicesSection } from '../ModernServicesSection';
import { LiveCryptoRates } from '../LiveCryptoRates';
import { SecurityComplianceSection } from '../SecurityComplianceSection';

export function HomePage() {
  return (
    <div className="min-h-screen">
      <ModernHeroSection />
      <LiveCryptoRates />
      <ModernFeaturesSection />
      <ModernServicesSection />
    </div>
  );
}

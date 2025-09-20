
import { ModernHeroSection } from '../ModernHeroSection';
import { ModernFeaturesSection } from '../ModernFeaturesSection';
import { ModernServicesSection } from '../ModernServicesSection';
import { LiveCryptoRates } from '../LiveCryptoRates';
import { FIUTrustBanner } from '../FIUTrustBanner';

export function HomePage() {
  return (
    <div className="min-h-screen">
      <ModernHeroSection />
      <div className="bg-muted/30 border-b border-border/40">
        <LiveCryptoRates />
      </div>
      
      {/* FIU Trust Section */}
      <section className="py-16 bg-gradient-to-br from-blue-50 via-white to-green-50">
        <div className="max-w-4xl mx-auto px-4">
          <FIUTrustBanner variant="full" />
        </div>
      </section>
      
      <ModernFeaturesSection />
      <ModernServicesSection />
    </div>
  );
}

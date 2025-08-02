
import { ModernHeroSection } from '../ModernHeroSection';
import { ModernFeaturesSection } from '../ModernFeaturesSection';
import { ModernServicesSection } from '../ModernServicesSection';

export function HomePage() {
  return (
    <div className="min-h-screen">
      <ModernHeroSection />
      <ModernFeaturesSection />
      <ModernServicesSection />
    </div>
  );
}

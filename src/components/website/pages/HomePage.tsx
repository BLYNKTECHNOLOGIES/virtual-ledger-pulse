
import { HeroSection } from '../HeroSection';
import { ServicesSection } from '../ServicesSection';
import { TestimonialsSection } from '../TestimonialsSection';
import { CTASection } from '../CTASection';

export function HomePage() {
  return (
    <div className="min-h-screen">
      <HeroSection />
      <ServicesSection />
      <TestimonialsSection />
      <CTASection />
    </div>
  );
}

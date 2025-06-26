
import { ArrowRight, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function HeroSection() {
  return (
    <section className="relative bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 text-white overflow-hidden">
      <div className="absolute inset-0 bg-black/20"></div>
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-4xl lg:text-6xl font-bold leading-tight">
                Build Your 
                <span className="text-blue-400"> Digital Future</span>
              </h1>
              <p className="text-xl text-blue-100 leading-relaxed">
                Transform your business with cutting-edge IT solutions. We deliver 
                world-class web development, mobile apps, cloud services, and VASP solutions 
                that drive growth and innovation.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" className="bg-orange-600 hover:bg-orange-700 text-white px-8 py-4 text-lg">
                Get Started
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-blue-900 px-8 py-4 text-lg">
                <Play className="mr-2 h-5 w-5" />
                Watch Demo
              </Button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 pt-8">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-400">10+</div>
                <div className="text-sm text-blue-100">Years Experience</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-400">200+</div>
                <div className="text-sm text-blue-100">Happy Clients</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-400">5</div>
                <div className="text-sm text-blue-100">Countries</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-400">99.9%</div>
                <div className="text-sm text-blue-100">Uptime</div>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="relative z-10">
              <img 
                src="https://images.unsplash.com/photo-1551434678-e076c223a692?w=600&h=400&fit=crop" 
                alt="Team collaboration" 
                className="rounded-2xl shadow-2xl"
              />
            </div>
            <div className="absolute -top-4 -right-4 w-full h-full bg-gradient-to-br from-blue-400 to-purple-600 rounded-2xl opacity-20"></div>
          </div>
        </div>
      </div>

      {/* Trusted by logos */}
      <div className="relative bg-white/10 backdrop-blur-sm border-t border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center mb-8">
            <p className="text-blue-100 text-lg">Trusted by industry leaders</p>
          </div>
          <div className="flex justify-center items-center space-x-12 opacity-70">
            <div className="text-white font-bold text-2xl">Binance</div>
            <div className="text-white font-bold text-2xl">Razorpay</div>
            <div className="text-white font-bold text-2xl">Zoho</div>
            <div className="text-white font-bold text-2xl">Google Cloud</div>
            <div className="text-white font-bold text-2xl">AWS</div>
          </div>
        </div>
      </div>
    </section>
  );
}

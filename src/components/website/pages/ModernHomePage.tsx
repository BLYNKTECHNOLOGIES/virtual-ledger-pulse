
import { ArrowRight, Play, Users, Globe, Award, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function ModernHomePage() {
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false);
  const navigate = useNavigate();

  const handleLoginClick = () => {
    setIsLoginDialogOpen(true);
  };

  const handleProceedToLogin = () => {
    setIsLoginDialogOpen(false);
    navigate('/website/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-400 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-400 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute top-40 left-40 w-80 h-80 bg-indigo-400 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
        <div className="text-center space-y-8">
          {/* Main heading with icons */}
          <div className="space-y-6">
            <h1 className="text-5xl lg:text-7xl font-bold text-gray-900 leading-tight">
              We craft tomorrow's{' '}
              <span className="inline-flex items-center gap-2">
                <span className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                  digital
                </span>
                <div className="inline-flex gap-1">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
                    <Globe className="w-6 h-6 text-white" />
                  </div>
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
                    <Award className="w-6 h-6 text-white" />
                  </div>
                </div>
              </span>
            </h1>
            <h2 className="text-4xl lg:text-6xl font-bold text-gray-900">
              experiences, products, and ventures
            </h2>
          </div>

          <p className="text-xl text-gray-600 max-w-4xl mx-auto leading-relaxed">
            The Success Stories of Blynk Technologies, that brought light to many Startups and Global Brands.
          </p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
            <Button 
              size="lg" 
              className="bg-black hover:bg-gray-800 text-white px-8 py-4 text-lg rounded-full"
              onClick={() => navigate('/website/contact')}
            >
              Get in Touch
            </Button>

            <Dialog open={isLoginDialogOpen} onOpenChange={setIsLoginDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="border-2 border-gray-300 hover:border-gray-400 text-gray-700 hover:bg-gray-50 px-8 py-4 text-lg rounded-full"
                  onClick={handleLoginClick}
                >
                  Staff Login
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-center text-xl font-semibold">Staff Access Only</DialogTitle>
                  <DialogDescription className="text-center pt-4">
                    This login portal is restricted to authorized staff members only. 
                    Please ensure you have proper credentials before proceeding.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-3 pt-4">
                  <Button 
                    onClick={handleProceedToLogin}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    Proceed to Login
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setIsLoginDialogOpen(false)}
                    className="w-full"
                  >
                    Cancel
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Decorative images section */}
          <div className="relative pt-16">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
              {/* Left side */}
              <div className="space-y-6">
                <div className="relative">
                  <div className="w-64 h-48 bg-gradient-to-br from-purple-400 to-purple-600 rounded-2xl shadow-xl transform rotate-12 opacity-80"></div>
                  <div className="absolute -top-4 -left-4 w-48 h-36 bg-white rounded-xl shadow-lg p-4">
                    <div className="space-y-2">
                      <div className="h-3 bg-gray-200 rounded"></div>
                      <div className="h-3 bg-gray-300 rounded w-3/4"></div>
                      <div className="h-8 bg-blue-500 rounded w-1/2"></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Center */}
              <div className="relative">
                <div className="w-80 h-64 bg-gradient-to-br from-blue-400 to-indigo-600 rounded-3xl shadow-2xl mx-auto overflow-hidden">
                  <div className="absolute inset-0 bg-black bg-opacity-10"></div>
                  <div className="absolute bottom-6 left-6 right-6">
                    <div className="bg-white bg-opacity-20 backdrop-blur-sm rounded-xl p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-white bg-opacity-30 rounded-full flex items-center justify-center">
                          <TrendingUp className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <div className="h-3 bg-white bg-opacity-60 rounded w-24 mb-2"></div>
                          <div className="h-2 bg-white bg-opacity-40 rounded w-16"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right side */}
              <div className="space-y-6">
                <div className="relative">
                  <div className="w-64 h-48 bg-gradient-to-br from-indigo-400 to-blue-600 rounded-2xl shadow-xl transform -rotate-12 opacity-80"></div>
                  <div className="absolute -top-4 -right-4 w-48 h-36 bg-white rounded-xl shadow-lg overflow-hidden">
                    <div className="h-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center">
                      <Users className="w-12 h-12 text-white" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats section */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 pt-16 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="text-4xl font-bold text-gray-900 mb-2">10+</div>
              <div className="text-gray-600">Years Experience</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-gray-900 mb-2">200+</div>
              <div className="text-gray-600">Happy Clients</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-gray-900 mb-2">5</div>
              <div className="text-gray-600">Countries</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-gray-900 mb-2">99.9%</div>
              <div className="text-gray-600">Uptime</div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes blob {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
          100% {
            transform: translate(0px, 0px) scale(1);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
}

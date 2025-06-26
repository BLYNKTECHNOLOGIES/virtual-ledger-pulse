
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from '@/components/website/Navbar';
import { Footer } from '@/components/website/Footer';
import { HomePage } from '@/components/website/pages/HomePage';
import { WebDesignPage } from '@/components/website/pages/WebDesignPage';
import { SEOServicesPage } from '@/components/website/pages/SEOServicesPage';
import { AppDevelopmentPage } from '@/components/website/pages/AppDevelopmentPage';
import { CloudHostingPage } from '@/components/website/pages/CloudHostingPage';
import { CustomSoftwarePage } from '@/components/website/pages/CustomSoftwarePage';
import { VASPPage } from '@/components/website/pages/VASPPage';
import { WebsiteLoginPage } from '@/components/website/pages/WebsiteLoginPage';

export default function ITWebsite() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <Router>
        <Navbar />
        <main className="pt-16">
          <Routes>
            <Route path="/website" element={<HomePage />} />
            <Route path="/website/web-design" element={<WebDesignPage />} />
            <Route path="/website/seo-services" element={<SEOServicesPage />} />
            <Route path="/website/app-development" element={<AppDevelopmentPage />} />
            <Route path="/website/cloud-hosting" element={<CloudHostingPage />} />
            <Route path="/website/custom-software" element={<CustomSoftwarePage />} />
            <Route path="/website/vasp" element={<VASPPage />} />
            <Route path="/website/login" element={<WebsiteLoginPage />} />
            <Route path="/" element={<Navigate to="/website" replace />} />
          </Routes>
        </main>
        <Footer />
      </Router>
    </div>
  );
}

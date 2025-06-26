
import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { HomePage } from './components/website/pages/HomePage';
import { AboutPage } from './components/website/pages/AboutPage';
import { ContactPage } from './components/website/pages/ContactPage';
import { WebDevelopmentPage } from './components/website/pages/WebDevelopmentPage';
import { SEOServicesPage } from './components/website/pages/SEOServicesPage';
import { AppDevelopmentPage } from './components/website/pages/AppDevelopmentPage';
import { PrivacyPolicyPage } from './components/website/pages/PrivacyPolicyPage';
import { TermsOfServicePage } from './components/website/pages/TermsOfServicePage';
import { LoginPage } from './components/website/pages/LoginPage';
import { WebsiteLayout } from './components/website/WebsiteLayout';
import { ModernHomePage } from './components/website/pages/ModernHomePage';
import { VASPPage } from './components/website/pages/VASPPage';
import { P2PTradingPage } from './components/website/pages/P2PTradingPage';
import { KYCServicesPage } from './components/website/pages/KYCServicesPage';
import { VASPCompliancePage } from './components/website/pages/VASPCompliancePage';
import { VASPHomePage } from './components/website/pages/VASPHomePage';
import { VASPSecurityPage } from './components/website/pages/VASPSecurityPage';
import { KYCFormPage } from './components/website/pages/KYCFormPage';

const router = createBrowserRouter([
  {
    path: "/website",
    element: <WebsiteLayout><HomePage /></WebsiteLayout>,
  },
  {
    path: "/website/home",
    element: <WebsiteLayout><ModernHomePage /></WebsiteLayout>,
  },
  {
    path: "/website/about",
    element: <WebsiteLayout><AboutPage /></WebsiteLayout>,
  },
  {
    path: "/website/contact",
    element: <WebsiteLayout><ContactPage /></WebsiteLayout>,
  },
  {
    path: "/website/web-development",
    element: <WebsiteLayout><WebDevelopmentPage /></WebsiteLayout>,
  },
  {
    path: "/website/seo-services",
    element: <WebsiteLayout><SEOServicesPage /></WebsiteLayout>,
  },
  {
    path: "/website/app-development",
    element: <WebsiteLayout><AppDevelopmentPage /></WebsiteLayout>,
  },
  {
    path: "/website/privacy",
    element: <WebsiteLayout><PrivacyPolicyPage /></WebsiteLayout>,
  },
  {
    path: "/website/terms",
    element: <WebsiteLayout><TermsOfServicePage /></WebsiteLayout>,
  },
  {
    path: "/website/login",
    element: <WebsiteLayout><LoginPage /></WebsiteLayout>,
  },
  {
    path: "/website/vasp",
    element: <WebsiteLayout><VASPPage /></WebsiteLayout>,
  },
  {
    path: "/website/vasp-home",
    element: <WebsiteLayout><VASPHomePage /></WebsiteLayout>,
  },
  {
    path: "/website/vasp/p2p-trading",
    element: <WebsiteLayout><P2PTradingPage /></WebsiteLayout>,
  },
  {
    path: "/website/vasp/kyc",
    element: <WebsiteLayout><KYCServicesPage /></WebsiteLayout>,
  },
  {
    path: "/website/vasp/kyc-form",
    element: <WebsiteLayout><KYCFormPage /></WebsiteLayout>,
  },
  {
    path: "/website/vasp/compliance",
    element: <WebsiteLayout><VASPCompliancePage /></WebsiteLayout>,
  },
  {
    path: "/website/vasp/security",
    element: <WebsiteLayout><VASPSecurityPage /></WebsiteLayout>,
  },
]);

function App() {
  return (
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>
  );
}

export default App;

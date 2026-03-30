import React from 'react';
import blynkLogo from '@/assets/blynk-logo.png';

interface CompanyLetterheadProps {
  children: React.ReactNode;
  showCIN?: boolean;
}

export function CompanyLetterhead({ children, showCIN = true }: CompanyLetterheadProps) {
  return (
    <div className="relative bg-white w-full min-h-[1122px] overflow-hidden" style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* Top-left corner decoration */}
      <div className="absolute top-0 left-0 w-[120px] h-[160px] overflow-hidden">
        {/* Dark navy stripe */}
        <div
          className="absolute"
          style={{
            top: '-30px',
            left: '-60px',
            width: '200px',
            height: '80px',
            background: '#0a1f44',
            transform: 'rotate(-35deg)',
            transformOrigin: 'center',
          }}
        />
        {/* Medium blue stripe */}
        <div
          className="absolute"
          style={{
            top: '10px',
            left: '-50px',
            width: '200px',
            height: '60px',
            background: '#1a8fcf',
            transform: 'rotate(-35deg)',
            transformOrigin: 'center',
          }}
        />
        {/* Light blue stripe */}
        <div
          className="absolute"
          style={{
            top: '45px',
            left: '-40px',
            width: '200px',
            height: '50px',
            background: '#3db4f0',
            transform: 'rotate(-35deg)',
            transformOrigin: 'center',
          }}
        />
      </div>

      {/* Right side navy bar */}
      <div
        className="absolute right-0 top-0 h-full"
        style={{
          width: '45px',
          background: 'linear-gradient(180deg, #0a1f44 0%, #0d2a5c 100%)',
        }}
      />

      {/* Right side accent line */}
      <div
        className="absolute"
        style={{
          right: '50px',
          top: '35%',
          height: '30%',
          width: '2px',
          background: '#ffffff',
          opacity: 0.0,
        }}
      />

      {/* Bottom-left corner decoration */}
      <div className="absolute bottom-0 left-0 w-[140px] h-[120px] overflow-hidden">
        {/* Dark navy stripe */}
        <div
          className="absolute"
          style={{
            bottom: '-20px',
            left: '-60px',
            width: '220px',
            height: '60px',
            background: '#0a1f44',
            transform: 'rotate(-35deg)',
            transformOrigin: 'center',
          }}
        />
        {/* Medium blue stripe */}
        <div
          className="absolute"
          style={{
            bottom: '15px',
            left: '-50px',
            width: '220px',
            height: '50px',
            background: '#1a8fcf',
            transform: 'rotate(-35deg)',
            transformOrigin: 'center',
          }}
        />
        {/* Light blue stripe */}
        <div
          className="absolute"
          style={{
            bottom: '50px',
            left: '-40px',
            width: '220px',
            height: '40px',
            background: '#3db4f0',
            transform: 'rotate(-35deg)',
            transformOrigin: 'center',
          }}
        />
      </div>

      {/* Header: Logo + CIN */}
      <div className="relative z-10 flex flex-col items-center pt-6 pb-4">
        <img
          src={blynkLogo}
          alt="Blynk Virtual Technologies"
          className="h-14 object-contain"
        />
        {showCIN && (
          <p className="mt-1 text-xs text-gray-600 tracking-wide">
            CIN No . U62099MP2025PTC074915
          </p>
        )}
      </div>

      {/* Content area */}
      <div className="relative z-10 px-16 pr-20 py-4">
        {children}
      </div>
    </div>
  );
}

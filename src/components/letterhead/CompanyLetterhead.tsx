import React from 'react';
import blynkLogo from '@/assets/blynk-logo.png';

interface CompanyLetterheadProps {
  children: React.ReactNode;
  showCIN?: boolean;
}

export function CompanyLetterhead({ children, showCIN = true }: CompanyLetterheadProps) {
  return (
    <div
      className="relative bg-white w-full overflow-hidden"
      style={{
        fontFamily: 'Arial, sans-serif',
        minHeight: '1122px',
        aspectRatio: '210 / 297',
      }}
    >
      {/* ── Top-left corner: 3 diagonal chevron stripes ── */}
      <svg
        className="absolute top-0 left-0"
        width="180"
        height="200"
        viewBox="0 0 180 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Light blue (bottom layer) */}
        <path
          d="M0 0 L180 0 L180 30 L60 200 L0 200 Z"
          fill="#a8d4f0"
        />
        {/* Medium blue (middle layer) */}
        <path
          d="M0 0 L140 0 L140 20 L40 175 L0 175 Z"
          fill="#2196F3"
        />
        {/* Dark navy (top layer) */}
        <path
          d="M0 0 L100 0 L100 15 L20 145 L0 145 Z"
          fill="#0b1f3f"
        />
      </svg>

      {/* ── Right-side navy bar (full height) ── */}
      <div
        className="absolute right-0 top-0 w-[42px] h-full"
        style={{ background: '#0b1f3f' }}
      />
      {/* White accent line inside right bar */}
      <div
        className="absolute bg-white"
        style={{
          right: '48px',
          top: '33%',
          height: '30%',
          width: '2px',
        }}
      />

      {/* ── Bottom-left corner: 3 diagonal chevron stripes (mirrored) ── */}
      <svg
        className="absolute bottom-0 left-0"
        width="200"
        height="180"
        viewBox="0 0 200 180"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Light blue (top layer visually, drawn first) */}
        <path
          d="M0 180 L200 180 L200 155 L80 0 L0 0 Z"
          fill="#a8d4f0"
        />
        {/* Medium blue */}
        <path
          d="M0 180 L160 180 L160 160 L55 15 L0 15 Z"
          fill="#2196F3"
        />
        {/* Dark navy */}
        <path
          d="M0 180 L115 180 L115 168 L30 40 L0 40 Z"
          fill="#0b1f3f"
        />
      </svg>

      {/* ── Header: Logo + CIN ── */}
      <div className="relative z-10 flex flex-col items-center pt-5 pb-3">
        <img
          src={blynkLogo}
          alt="Blynk Virtual Technologies"
          className="h-16 object-contain"
        />
        {showCIN && (
          <p className="mt-1 text-[11px] text-gray-600 tracking-wide">
            CIN No . U62099MP2025PTC074915
          </p>
        )}
      </div>

      {/* ── Content area ── */}
      <div className="relative z-10 px-14 pr-[72px] py-4">
        {children}
      </div>
    </div>
  );
}

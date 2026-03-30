import React from 'react';
import blynkLogo from '@/assets/blynk-logo.png';

interface CompanyLetterheadProps {
  children: React.ReactNode;
  showCIN?: boolean;
}

/**
 * Production-ready letterhead component matching the official PDF exactly.
 *
 * - Top-left chevrons are LARGER than bottom-left
 * - L-shaped watermark blocks in center
 * - Right navy bar with white accent line
 *
 * For Puppeteer PDF: margin: { top: '140px', bottom: '120px', left: '50px', right: '60px' }
 */
export function CompanyLetterhead({ children, showCIN = true }: CompanyLetterheadProps) {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', position: 'relative', minHeight: '100vh' }}>

      {/* ═══ FIXED HEADER ═══ */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '120px', zIndex: 10, pointerEvents: 'none' }}>
        {/* Top-left chevrons (LARGER) */}
        <svg style={{ position: 'absolute', top: 0, left: 0 }} width="220" height="260" viewBox="0 0 220 260" fill="none">
          <path d="M0 0 L220 0 L220 35 L70 260 L0 260 Z" fill="#a8d4f0"/>
          <path d="M0 0 L175 0 L175 25 L50 230 L0 230 Z" fill="#2196F3"/>
          <path d="M0 0 L125 0 L125 18 L25 195 L0 195 Z" fill="#0b1f3f"/>
        </svg>

        {/* Right navy bar */}
        <div style={{ position: 'fixed', top: 0, right: 0, width: '42px', height: '100%', background: '#0b1f3f', zIndex: 5 }} />

        {/* White accent line */}
        <div style={{ position: 'fixed', right: '50px', top: '35%', height: '25%', width: '2px', background: '#fff', zIndex: 6 }} />

        {/* Logo + CIN */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '12px' }}>
          <img src={blynkLogo} alt="Blynk Virtual Technologies" style={{ height: '56px', objectFit: 'contain' }} />
          {showCIN && (
            <p style={{ marginTop: '4px', fontSize: '11px', color: '#555', letterSpacing: '0.5px' }}>
              CIN No . U62099MP2025PTC074915
            </p>
          )}
        </div>
      </div>

      {/* ═══ WATERMARK (L-shaped blocks) ═══ */}
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none' }}>
        {/* Top block */}
        <div style={{ position: 'absolute', left: '30%', top: '28%', width: '140px', height: '120px', background: 'rgba(217,242,242,0.5)' }} />
        {/* Middle-right block */}
        <div style={{ position: 'absolute', left: '42%', top: '42%', width: '140px', height: '120px', background: 'rgba(217,242,242,0.5)' }} />
        {/* Bottom spanning block */}
        <div style={{ position: 'absolute', left: '26%', top: '53%', width: '210px', height: '120px', background: 'rgba(217,242,242,0.5)' }} />
      </div>

      {/* ═══ FIXED FOOTER ═══ */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '100px', zIndex: 10, pointerEvents: 'none' }}>
        {/* Bottom-left chevrons (SMALLER) */}
        <svg style={{ position: 'absolute', bottom: 0, left: 0 }} width="170" height="160" viewBox="0 0 170 160" fill="none">
          <path d="M0 160 L170 160 L170 140 L65 0 L0 0 Z" fill="#a8d4f0"/>
          <path d="M0 160 L135 160 L135 144 L45 20 L0 20 Z" fill="#2196F3"/>
          <path d="M0 160 L95 160 L95 150 L25 45 L0 45 Z" fill="#0b1f3f"/>
        </svg>
      </div>

      {/* ═══ CONTENT ═══ */}
      <div style={{ position: 'relative', zIndex: 2, marginTop: '140px', marginBottom: '120px', paddingLeft: '50px', paddingRight: '70px' }}>
        {children}
      </div>
    </div>
  );
}

import React from 'react';
import blynkLogo from '@/assets/blynk-logo.png';

interface CompanyLetterheadProps {
  children: React.ReactNode;
  showCIN?: boolean;
}

/**
 * Production-ready letterhead component.
 *
 * Header & footer use `position: fixed` so that Puppeteer / browser print
 * repeats them on every page.  The content area has matching top/bottom
 * margins so it never overlaps the fixed regions.
 *
 * When generating a PDF with Puppeteer, set matching margins:
 *   await page.pdf({ format: 'A4', margin: { top: '140px', bottom: '120px', left: '50px', right: '60px' } });
 */
export function CompanyLetterhead({ children, showCIN = true }: CompanyLetterheadProps) {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', position: 'relative', minHeight: '100vh' }}>

      {/* ═══════════════ FIXED HEADER ═══════════════ */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '120px',
          zIndex: 10,
          pointerEvents: 'none',
        }}
      >
        {/* Top-left chevron stripes */}
        <svg
          style={{ position: 'absolute', top: 0, left: 0 }}
          width="180"
          height="200"
          viewBox="0 0 180 200"
          fill="none"
        >
          <path d="M0 0 L180 0 L180 30 L60 200 L0 200 Z" fill="#a8d4f0" />
          <path d="M0 0 L140 0 L140 20 L40 175 L0 175 Z" fill="#2196F3" />
          <path d="M0 0 L100 0 L100 15 L20 145 L0 145 Z" fill="#0b1f3f" />
        </svg>

        {/* Right-side navy bar (full page height — drawn in header but extends via border trick) */}
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: '42px',
            height: '100%',
            background: '#0b1f3f',
            zIndex: 5,
          }}
        />

        {/* White accent line beside right bar */}
        <div
          style={{
            position: 'fixed',
            right: '48px',
            top: '33%',
            height: '30%',
            width: '2px',
            background: '#fff',
            zIndex: 6,
          }}
        />

        {/* Centered logo + CIN */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: '12px',
          }}
        >
          <img
            src={blynkLogo}
            alt="Blynk Virtual Technologies"
            style={{ height: '56px', objectFit: 'contain' }}
          />
          {showCIN && (
            <p
              style={{
                marginTop: '4px',
                fontSize: '11px',
                color: '#555',
                letterSpacing: '0.5px',
              }}
            >
              CIN No . U62099MP2025PTC074915
            </p>
          )}
        </div>
      </div>

      {/* ═══════════════ FIXED FOOTER ═══════════════ */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '100px',
          zIndex: 10,
          pointerEvents: 'none',
        }}
      >
        {/* Bottom-left chevron stripes */}
        <svg
          style={{ position: 'absolute', bottom: 0, left: 0 }}
          width="200"
          height="180"
          viewBox="0 0 200 180"
          fill="none"
        >
          <path d="M0 180 L200 180 L200 155 L80 0 L0 0 Z" fill="#a8d4f0" />
          <path d="M0 180 L160 180 L160 160 L55 15 L0 15 Z" fill="#2196F3" />
          <path d="M0 180 L115 180 L115 168 L30 40 L0 40 Z" fill="#0b1f3f" />
        </svg>
      </div>

      {/* ═══════════════ CONTENT (flows across pages) ═══════════════ */}
      <div
        style={{
          marginTop: '140px',
          marginBottom: '120px',
          paddingLeft: '50px',
          paddingRight: '70px',
        }}
      >
        {children}
      </div>
    </div>
  );
}

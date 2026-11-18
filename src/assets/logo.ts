/**
 * Nexora AI Official Vector Logo and Branding Assets
 * Modern futuristic geometric Nexus emblem with glowing cyan, indigo, and violet gradients.
 */

export const NEXORA_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 64" fill="none">
  <defs>
    <linearGradient id="nexoraGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8" />
      <stop offset="50%" stop-color="#6366F1" />
      <stop offset="100%" stop-color="#A855F7" />
    </linearGradient>
    <linearGradient id="nexoraGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#06B6D4" />
      <stop offset="100%" stop-color="#3B82F6" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Nexus Hexagon Icon Mark -->
  <g transform="translate(4, 4)">
    <!-- Outer Shield / Hex Prism -->
    <path d="M28 2L50 14V42L28 54L6 42V14L28 2Z" stroke="url(#nexoraGrad1)" stroke-width="2.5" stroke-linejoin="round" fill="none" opacity="0.4"/>
    
    <!-- Dynamic 'N' Polygons -->
    <path d="M16 40V16L28 32V48L16 40Z" fill="url(#nexoraGrad2)"/>
    <path d="M28 16L40 32V48L28 32V16Z" fill="url(#nexoraGrad1)"/>
    
    <!-- Central Energy Core -->
    <circle cx="28" cy="28" r="4.5" fill="#38BDF8" filter="url(#glow)"/>
    <circle cx="28" cy="28" r="2" fill="#FFFFFF"/>
    
    <!-- Neural Node Points -->
    <circle cx="16" cy="16" r="2.5" fill="#38BDF8"/>
    <circle cx="40" cy="16" r="2.5" fill="#A855F7"/>
    <circle cx="28" cy="48" r="2.5" fill="#6366F1"/>
  </g>

  <!-- Brand Typography -->
  <text x="68" y="37" font-family="'Montserrat', sans-serif" font-size="24" font-weight="900" letter-spacing="3" fill="#0F172A">
    NEXORA
  </text>
  
  <!-- AI Badge -->
  <rect x="202" y="18" width="46" height="24" rx="6" fill="url(#nexoraGrad1)"/>
  <text x="225" y="35" font-family="'Montserrat', sans-serif" font-size="13" font-weight="800" fill="#FFFFFF" text-anchor="middle" letter-spacing="1">
    AI
  </text>
  
  <text x="69" y="49" font-family="'Montserrat', sans-serif" font-size="8.5" font-weight="600" letter-spacing="2" fill="#64748B">
    AUTONOMOUS WORKFORCE
  </text>
</svg>`;

export const NEXORA_ICON_ONLY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56" fill="none">
  <defs>
    <linearGradient id="iconGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8" />
      <stop offset="50%" stop-color="#6366F1" />
      <stop offset="100%" stop-color="#A855F7" />
    </linearGradient>
    <linearGradient id="iconGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#06B6D4" />
      <stop offset="100%" stop-color="#3B82F6" />
    </linearGradient>
    <filter id="iconGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2.5" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  <rect width="56" height="56" rx="14" fill="#0F172A"/>
  <path d="M28 4L48 15V39L28 50L8 39V15L28 4Z" stroke="url(#iconGrad1)" stroke-width="2" stroke-linejoin="round" fill="none" opacity="0.5"/>
  <path d="M17 38V18L28 32V46L17 38Z" fill="url(#iconGrad2)"/>
  <path d="M28 18L39 32V46L28 32V18Z" fill="url(#iconGrad1)"/>
  <circle cx="28" cy="28" r="4" fill="#38BDF8" filter="url(#iconGlow)"/>
  <circle cx="28" cy="28" r="1.8" fill="#FFFFFF"/>
</svg>`;

export const NEXORA_WHITE_LOGO_SVG = NEXORA_LOGO_SVG.replace('fill="#0F172A"', 'fill="#FFFFFF"').replace('fill="#64748B"', 'fill="#94A3B8"');

export const NEXORA_LOGO_BASE64 = `data:image/svg+xml;base64,${Buffer.from(NEXORA_LOGO_SVG).toString('base64')}`;
export const NEXORA_WHITE_LOGO_BASE64 = `data:image/svg+xml;base64,${Buffer.from(NEXORA_WHITE_LOGO_SVG).toString('base64')}`;
export const NEXORA_ICON_BASE64 = `data:image/svg+xml;base64,${Buffer.from(NEXORA_ICON_ONLY_SVG).toString('base64')}`;

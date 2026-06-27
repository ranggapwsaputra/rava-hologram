import React from "react";

const HOVER_AREAS = 16;
type NavStyle = React.CSSProperties & { "--max-a": number };

// Frosted image you "defrost" by hovering — used for Meme of the Day.
export function FrostedHover({ image }: { image: string }) {
  const navStyle: NavStyle = { "--max-a": HOVER_AREAS };
  const areaCount = HOVER_AREAS * HOVER_AREAS;
  const TV = "0.000 0.016 0.032 0.048 0.063 0.079 0.095 0.111 0.127 0.143 0.159 0.175 0.190 0.206 0.222 0.238 0.254 0.270 0.286 0.302 0.317 0.333 0.349 0.365 0.381 0.397 0.413 0.429 0.444 0.460 0.476 0.492 0.508 0.524 0.540 0.556 0.571 0.587 0.603 0.619 0.635 0.651 0.667 0.683 0.698 0.714 0.730 0.746 0.762 0.778 0.794 0.810 0.825 0.841 0.857 0.873 0.889 0.905 0.921 0.937 0.952 0.968 0.984 1.000";
  return (
    <>
      <nav className="frost-nav" style={navStyle}>
        <img src={image} alt="meme of the day" />
        <aside className="hover-area" aria-hidden="true">
          {Array.from({ length: areaCount }).map((_, i) => <i key={i} />)}
        </aside>
      </nav>
      <svg data-defs height="0" width="0" viewBox="0 0 1 1">
        <defs>
          <filter id="❄️" primitiveUnits="userSpaceOnUse" x="0%" y="0%" width="120%" height="120%">
            <feComponentTransfer result="SourceBackground" in="SourceGraphic">
              <feFuncR type="discrete" tableValues={TV} />
              <feFuncG type="discrete" tableValues={TV} />
              <feFuncB type="discrete" tableValues={TV} />
            </feComponentTransfer>
            <feBlend result="blend-0" in="SourceBackground" in2="none" />
            <feGaussianBlur result="gaussian-blur-6" in="blend-0" stdDeviation="10" />
            <feTurbulence result="turbulence-0" baseFrequency="0.420" type="fractalNoise" />
            <feDisplacementMap result="displacement-map-0" in="gaussian-blur-6" in2="turbulence-0" scale="150" xChannelSelector="R" yChannelSelector="G" />
            <feMerge result="merge-0"><feMergeNode in="displacement-map-0" /></feMerge>
          </filter>
        </defs>
      </svg>
    </>
  );
}

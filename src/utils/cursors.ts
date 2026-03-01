/**
 * Dark cursor utility — guarantees cursor visibility on light backgrounds.
 *
 * Each cursor is an inline SVG data-URI so there are zero external assets.
 * The fallback after the URL is the standard CSS keyword, which ensures
 * behaviour degrades gracefully if the browser cannot render the data-URI.
 *
 * Hotspot coordinates (the numbers after the URL) match the logical click
 * point of each cursor shape so precision is preserved.
 */

const svgToDataUri = (svg: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(svg.trim())}")`;

// ── SVG sources ──────────────────────────────────────────────────────────

const defaultArrowSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
  <path d="M2 1 L2 17 L6.5 12.5 L10 19 L12.5 18 L9 11.5 L15 11.5 Z"
        fill="#222" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>
</svg>`;

const pointerSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="22" viewBox="0 0 20 22">
  <path d="M7 1 C7 1 7 10 7 10 L5 8 C4 7 2.5 7.5 3 9 L6 16 C6 16 7 19 11 19 C15 19 16 16 16 13 L16 8 C16 7 15 6.5 14 7 L14 8 L14 7 C14 6 13 5.5 12 6 L12 7 L12 6 C12 5 11 4.5 10 5 L10 10 L10 1 C10 0 9 -0.5 8 0 C7 0.5 7 1 7 1Z"
        fill="#222" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>
</svg>`;

const grabSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
  <path d="M8 8 L8 4.5 C8 3.5 9 3 10 3.5 L10 8 M10 7 L10 3 C10 2 11 1.5 12 2 L12 7 M12 7 L12 3.5 C12 2.5 13 2 14 2.5 L14 8 M14 8 L14 5 C14 4 15 3.5 16 4 L16 13 C16 17 13 19 10 19 C7 19 5 17 5 14 L5 10 C5 9 6 8.5 7 9 L8 10 L8 8 C8 7 7 6.5 6 7"
        fill="#222" stroke="#fff" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`;

const grabbingSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
  <path d="M8 10 L8 8 C8 7 9 6.5 10 7 L10 10 M10 9 L10 7 C10 6 11 5.5 12 6 L12 9 M12 9 L12 7 C12 6 13 5.5 14 6 L14 10 M14 10 L14 8 C14 7 15 6.5 16 7 L16 14 C16 18 13 20 10 20 C7 20 5 18 5 15 L5 11 C5 10 6 9.5 7 10 L8 11 L8 10"
        fill="#222" stroke="#fff" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`;

const crosshairSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
  <line x1="11" y1="0" x2="11" y2="8" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
  <line x1="11" y1="14" x2="11" y2="22" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
  <line x1="0" y1="11" x2="8" y2="11" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
  <line x1="14" y1="11" x2="22" y2="11" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
  <line x1="11" y1="0" x2="11" y2="8" stroke="#222" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="11" y1="14" x2="11" y2="22" stroke="#222" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="0" y1="11" x2="8" y2="11" stroke="#222" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="14" y1="11" x2="22" y2="11" stroke="#222" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="11" cy="11" r="2" fill="none" stroke="#222" stroke-width="1.5"/>
</svg>`;

const nwseResizeSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
  <line x1="4" y1="4" x2="16" y2="16" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="4" y1="4" x2="16" y2="16" stroke="#222" stroke-width="2" stroke-linecap="round"/>
  <polygon points="4,4 4,9 6,7" fill="#222" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>
  <polygon points="16,16 16,11 14,13" fill="#222" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>
</svg>`;

const neswResizeSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
  <line x1="16" y1="4" x2="4" y2="16" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="16" y1="4" x2="4" y2="16" stroke="#222" stroke-width="2" stroke-linecap="round"/>
  <polygon points="16,4 16,9 14,7" fill="#222" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>
  <polygon points="4,16 4,11 6,13" fill="#222" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>
</svg>`;

// ── Mapping ──────────────────────────────────────────────────────────────

const cursorMap: Record<string, string> = {
  default:       `${svgToDataUri(defaultArrowSvg)} 2 1, default`,
  pointer:       `${svgToDataUri(pointerSvg)} 8 1, pointer`,
  grab:          `${svgToDataUri(grabSvg)} 11 11, grab`,
  grabbing:      `${svgToDataUri(grabbingSvg)} 11 11, grabbing`,
  crosshair:     `${svgToDataUri(crosshairSvg)} 11 11, crosshair`,
  'nwse-resize': `${svgToDataUri(nwseResizeSvg)} 10 10, nwse-resize`,
  'nesw-resize': `${svgToDataUri(neswResizeSvg)} 10 10, nesw-resize`,
};

/**
 * Returns a dark, high-visibility CSS cursor value for the given cursor name.
 * Unknown names are passed through unchanged.
 */
export function darkCursor(name: string): string {
  return cursorMap[name] ?? name;
}

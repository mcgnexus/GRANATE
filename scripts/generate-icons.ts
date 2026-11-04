/**
 * Regenera los iconos PNG de la PWA a partir de la gema del logo.
 *
 * Uso: npm run icons
 *
 * Genera en public/:
 *  - icon-192.png / icon-512.png   → esquinas redondeadas, transparentes (purpose: any)
 *  - icon-maskable-512.png         → fondo full-bleed, gema en la zona segura de Android (purpose: maskable)
 *  - apple-touch-icon.png          → 180x180 opaco y sin esquinas (iOS aplica su propia máscara y
 *                                    no soporta SVG ni transparencia en apple-touch-icon)
 *
 * El SVG base (public/icon.svg) sigue siendo la fuente de verdad para el icono vectorial
 * que se muestra en el navegador.
 */
import path from "node:path";
import sharp from "sharp";

const PUBLIC_DIR = path.resolve(import.meta.dirname, "../public");

const BG = "#120f0e";

/** Gemas del logo, tal cual están en public/icon.svg. */
const GEM_PATHS = [
  { d: "M256 80 348 176 256 432 164 176Z", fill: "#b23a48" },
  { d: "M256 80 348 176 256 240 164 176Z", fill: "#d85d63" },
  { d: "M164 176 256 240 256 432Z", fill: "#8c2532" },
  { d: "M256 240 348 176 256 432Z", fill: "#a5303d" },
];

/** Gema escalada y centrada sobre el punto (256, 256). */
function gem(scale: number): string {
  const paths = GEM_PATHS.map((p) => `<path d="${p.d}" fill="${p.fill}"/>`).join("");
  const transform = `translate(256 256) scale(${scale}) translate(-256 -256)`;
  return `<g transform="${transform}">${paths}</g>`;
}

function iconSvg(scale: number, rounded: boolean): string {
  const rx = rounded ? 112 : 0;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">`,
    `  <rect width="512" height="512" rx="${rx}" fill="${BG}"/>`,
    `  ${gem(scale)}`,
    `</svg>`,
  ].join("\n");
}

const TARGETS = [
  { file: "icon-192.png", svg: iconSvg(1, true), size: 192 },
  { file: "icon-512.png", svg: iconSvg(1, true), size: 512 },
  // La zona segura maskable es un círculo de radio 0.4·512 ≈ 205 px; la gema a escala
  // 0.82 queda holgadamente dentro aunque el launcher aplique una máscara agresiva.
  { file: "icon-maskable-512.png", svg: iconSvg(0.82, false), size: 512 },
  { file: "apple-touch-icon.png", svg: iconSvg(0.78, false), size: 180 },
] as const;

async function main() {
  for (const target of TARGETS) {
    const out = path.join(PUBLIC_DIR, target.file);
    await sharp(Buffer.from(target.svg))
      .resize(target.size, target.size)
      .png({ compressionLevel: 9 })
      .toFile(out);
    console.log(`✓ public/${target.file} (${target.size}x${target.size})`);
  }
}

main().catch((error) => {
  console.error("Error generando iconos:", error);
  process.exit(1);
});

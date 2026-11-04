import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GRANATE",
    short_name: "GRANATE",
    description: "Tu bóveda de notas Markdown con LLM, búsqueda semántica y grafo.",
    // Identidad estable de la PWA: evita que el navegador trate como apps
    // distintas las instalaciones de distintas URLs (p. ej. previews de Vercel).
    id: "/",
    start_url: "/vaults",
    display: "standalone",
    background_color: "#120f0e",
    theme_color: "#120f0e",
    orientation: "any",
    lang: "es",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

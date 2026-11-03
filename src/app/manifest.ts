import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GRANATE",
    short_name: "GRANATE",
    description: "Tu bóveda de notas Markdown con LLM, búsqueda semántica y grafo.",
    start_url: "/vaults",
    display: "standalone",
    background_color: "#120f0e",
    theme_color: "#120f0e",
    orientation: "any",
    lang: "es",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}

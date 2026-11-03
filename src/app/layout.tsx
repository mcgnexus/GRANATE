import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { RegisterSW } from "@/components/register-sw";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "GRANATE · Tu bóveda de notas en la nube",
    template: "%s · GRANATE",
  },
  description:
    "Bóveda de notas Markdown tipo Obsidian, guardada en Neon, con búsqueda semántica, grafo, canvas y un LLM que revisa, ordena e indexa tus documentos.",
  applicationName: "GRANATE",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "GRANATE", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#120f0e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('granate-theme');if(t==='light')document.documentElement.dataset.theme='light';}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full bg-[var(--bg)] text-[var(--text)]">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}

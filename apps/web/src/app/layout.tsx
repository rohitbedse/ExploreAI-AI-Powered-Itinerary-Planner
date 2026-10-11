import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "@/components/layout/providers";
import { PwaRegister } from "@/components/layout/pwa-register";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { Aurora } from "@/components/ui/aurora";
import "./globals.css";

// Free Google Fonts, self-hosted by next/font at build time (no runtime requests to Google).
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap", axes: ["opsz"] });

export const metadata: Metadata = {
  title: { default: "ExploreAI", template: "%s · ExploreAI" },
  description: "Timed, costed, mapped itineraries built only from real places.",
  applicationName: "ExploreAI",
  appleWebApp: { capable: true, title: "ExploreAI", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b14" },
  ],
};

// Runs before first paint so there's no light-mode flash. Keep in sync with theme-toggle.tsx.
const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("exploreai:theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${jakarta.variable} ${fraunces.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <a
          href="#main"
          className="sr-only z-50 rounded-full bg-primary px-4 py-2 font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        <Aurora parallax />
        <Providers>
          <SiteHeader />
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 pb-10 pt-6 outline-none">
            {children}
          </main>
          <SiteFooter />
        </Providers>
        <PwaRegister />
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import "./globals.css";
import AuthProvider from "@/components/providers/AuthProvider";
import RuntimeConfigScript from "@/components/providers/RuntimeConfigScript";
import { getSiteOrigin } from "@/lib/seo/site";

const siteTitle = "My Heroes";
const siteDescription = "Jeu de stratégie au tour par tour dans un monde héroïque fantasy";
const ogImage = {
  url: "/assets/banners/my-heroes-banner.png",
  width: 2172,
  height: 724,
  alt: "My Heroes, une carte fantasy pixel art avec héros, cités et dragon",
};

export const metadata: Metadata = {
  metadataBase: new URL(getSiteOrigin()),
  title: siteTitle,
  description: siteDescription,
  applicationName: siteTitle,
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    siteName: siteTitle,
    images: [ogImage],
    locale: "fr_FR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: [
      {
        url: ogImage.url,
        alt: ogImage.alt,
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: "#0e0904",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased">
        <RuntimeConfigScript />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

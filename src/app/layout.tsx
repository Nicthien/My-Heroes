import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import AuthProvider from "@/components/providers/AuthProvider";
import RuntimeConfigScript from "@/components/providers/RuntimeConfigScript";

const siteTitle = "My Heroes";
const siteDescription = "Jeu de stratégie au tour par tour dans un monde héroïque fantasy";
const ogImage = {
  url: "/assets/banners/my-heroes-banner.png",
  width: 2172,
  height: 724,
  alt: "My Heroes, une carte fantasy pixel art avec héros, cités et dragon",
};

type MetadataHeaders = {
  get(name: string): string | null;
};

function firstHeaderValue(value: string | null | undefined): string {
  return value?.split(",")[0]?.trim() || "";
}

function getMetadataBase(headersList: MetadataHeaders): URL {
  const configuredUrl =
    process.env.APP_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "";
  const forwardedHost = firstHeaderValue(headersList.get("x-forwarded-host"));
  const host = forwardedHost || firstHeaderValue(headersList.get("host"));
  const forwardedProtocol = firstHeaderValue(headersList.get("x-forwarded-proto"));
  const protocol = forwardedProtocol === "http" || forwardedProtocol === "https" ? forwardedProtocol : "https";
  const requestUrl = host ? `${protocol}://${host}` : "";
  const siteUrl = (configuredUrl.trim() || requestUrl || "http://localhost:3000").replace(
    /\/+$/,
    "",
  );

  try {
    return new URL(siteUrl);
  } catch {
    return new URL("http://localhost:3000");
  }
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: getMetadataBase(await headers()),
    title: siteTitle,
    description: siteDescription,
    applicationName: siteTitle,
    alternates: {
      canonical: "/",
    },
    openGraph: {
      title: siteTitle,
      description: siteDescription,
      url: "/",
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
}

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

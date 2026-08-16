import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";
import { getSiteUrl } from "@/lib/seo/site";

const title = "My Heroes — Jeu de stratégie fantasy gratuit en ligne";
const description =
  "Explorez un monde fantasy, développez vos villes, recrutez des héros et remportez des combats tactiques au tour par tour dans votre navigateur.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title,
    description,
    url: "/",
    siteName: "My Heroes",
    locale: "fr_FR",
    type: "website",
    images: [
      {
        url: "/assets/banners/my-heroes-banner.png",
        width: 2172,
        height: 724,
        alt: "My Heroes, jeu de stratégie fantasy au tour par tour",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/assets/banners/my-heroes-banner.png"],
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${getSiteUrl("/")}#website`,
      name: "My Heroes",
      url: getSiteUrl("/"),
      inLanguage: ["fr", "en"],
    },
    {
      "@type": "VideoGame",
      "@id": `${getSiteUrl("/")}#game`,
      name: "My Heroes",
      description,
      url: getSiteUrl("/"),
      image: getSiteUrl("/assets/covers/my-heroes-cover.png"),
      genre: ["Stratégie", "Fantasy", "Tour par tour", "Tactique"],
      gamePlatform: "Navigateur Web",
      operatingSystem: "Tout système avec un navigateur moderne",
      inLanguage: ["fr", "en"],
      publisher: {
        "@type": "Organization",
        name: "NTH Studio",
        url: "https://nthstudio.eu",
      },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "EUR",
        availability: "https://schema.org/InStock",
      },
      sameAs: [
        "https://nth-studio.itch.io/my-heroes",
        "https://www.facebook.com/people/My-Heroes/61590578679625/",
      ],
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <LandingPage />
    </>
  );
}

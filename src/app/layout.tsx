import type { Metadata, Viewport } from "next";
import "./globals.css";
import AuthProvider from "@/components/providers/AuthProvider";
import RuntimeConfigScript from "@/components/providers/RuntimeConfigScript";

export const metadata: Metadata = {
  title: "My Heroes",
  description: "Jeu de stratégie au tour par tour dans un monde héroïque fantasy",
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

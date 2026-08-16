import { privatePageMetadata } from "@/lib/seo/metadata";

export const metadata = privatePageMetadata;

export default function DevLayout({ children }: { children: React.ReactNode }) {
  return children;
}

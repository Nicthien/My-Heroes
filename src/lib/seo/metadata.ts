import type { Metadata } from "next";

export const privatePageMetadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export function createGuideMetadata(
  title: string,
  path: string,
  options: { index?: boolean; description?: string } = {},
): Metadata {
  const index = options.index ?? true;
  return {
    title,
    ...(options.description ? { description: options.description } : {}),
    alternates: {
      canonical: path,
    },
    robots: {
      index,
      follow: true,
      googleBot: {
        index,
        follow: true,
      },
    },
  };
}

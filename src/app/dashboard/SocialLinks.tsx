"use client";

import { DISCORD_URL, FACEBOOK_URL, ITCH_URL, STUDIO_URL } from "./dashboardConstants";

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.99 3.66 9.13 8.44 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99C18.34 21.13 22 16.99 22 12z" />
    </svg>
  );
}

function ItchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M3.13 4.18C2.2 4.73.36 6.85.36 7.42v.94c0 1.2 1.12 2.25 2.13 2.25.92 0 1.73-.76 1.73-1.66 0 .9.74 1.66 1.66 1.66s1.6-.76 1.6-1.66c0 .9.82 1.66 1.74 1.66h.02c.92 0 1.74-.76 1.74-1.66 0 .9.68 1.66 1.6 1.66s1.66-.76 1.66-1.66c0 .9.81 1.66 1.73 1.66 1.01 0 2.13-1.05 2.13-2.25v-.94c0-.57-1.84-2.69-2.77-3.24C18.07 4.07 15.36 4 12 4s-6.07.07-8.87.18zm5.32 6.65c-.42.73-1.22 1.27-2.13 1.32l-.16.01c-.86 0-1.64-.39-2.16-1-.13.5-.18 1.04-.18 1.6 0 1.36.45 4.18.86 5.32.4 1.11.66 1.72 2.43 1.72h8.82c1.77 0 2.03-.61 2.43-1.72.41-1.14.86-3.96.86-5.32 0-.56-.05-1.1-.18-1.6-.52.61-1.3 1-2.16 1l-.16-.01c-.91-.05-1.71-.59-2.13-1.32-.42.73-1.2 1.27-2.13 1.27s-1.71-.54-2.13-1.27zm-.86 3.04h2.21c.31 0 .53.32.53.32l1.66 1.63 1.66-1.63s.22-.32.53-.32h2.21c.18 0 .35.07.35.31 0 .56-.66 1.83-1.27 2.43l-1.67 1.6c-.31.31-.62.32-.93.32h-1.76c-.31 0-.62-.01-.93-.32l-1.67-1.6c-.61-.6-1.27-1.87-1.27-2.43 0-.24.17-.31.35-.31z" />
    </svg>
  );
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M20.32 4.57A19.79 19.79 0 0 0 15.41 3c-.24.43-.52 1.01-.71 1.47a18.27 18.27 0 0 0-5.4 0C9.1 4 8.82 3.43 8.58 3a19.74 19.74 0 0 0-4.91 1.57C.54 9.24-.31 13.79.11 18.27a19.9 19.9 0 0 0 6.07 3.08c.49-.67.93-1.38 1.3-2.13-.71-.27-1.4-.6-2.04-.99.17-.13.34-.26.5-.4a14.2 14.2 0 0 0 12.12 0c.16.14.33.27.5.4-.65.39-1.34.72-2.05.99.37.75.81 1.46 1.3 2.13a19.85 19.85 0 0 0 6.07-3.08c.5-5.18-.85-9.69-3.56-13.7zM8.02 15.52c-1.18 0-2.15-1.09-2.15-2.42s.95-2.42 2.15-2.42c1.21 0 2.18 1.09 2.15 2.42 0 1.33-.95 2.42-2.15 2.42zm7.96 0c-1.18 0-2.15-1.09-2.15-2.42s.95-2.42 2.15-2.42c1.21 0 2.18 1.09 2.15 2.42 0 1.33-.94 2.42-2.15 2.42z" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.5 3.8 5.6 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.6-3.8-9S9.5 5.5 12 3z" />
    </svg>
  );
}

interface SocialLink {
  href: string;
  label: string;
  Icon: ({ className }: { className?: string }) => React.JSX.Element;
  hover: string;
}

const SOCIAL_LINKS: SocialLink[] = [
  { href: FACEBOOK_URL, label: "Facebook", Icon: FacebookIcon, hover: "hover:border-sky-400/70 hover:bg-sky-950/40 hover:text-sky-200" },
  { href: ITCH_URL, label: "itch.io", Icon: ItchIcon, hover: "hover:border-rose-400/70 hover:bg-rose-950/40 hover:text-rose-200" },
  { href: DISCORD_URL, label: "Discord", Icon: DiscordIcon, hover: "hover:border-indigo-400/70 hover:bg-indigo-950/40 hover:text-indigo-200" },
  { href: STUDIO_URL, label: "NTH Studio", Icon: GlobeIcon, hover: "hover:border-emerald-400/70 hover:bg-emerald-950/40 hover:text-emerald-200" },
];

/** Row of community & store links shown on the login screen and the dashboard footer. */
export function SocialLinks({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center justify-center gap-2 sm:gap-3 ${className}`}>
      {SOCIAL_LINKS.map(({ href, label, Icon, hover }) => (
        <a
          key={href}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={label}
          aria-label={label}
          className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border border-amber-700/40 bg-stone-950/70 text-amber-200/80 transition ${hover}`}
        >
          <Icon className="h-5 w-5" />
        </a>
      ))}
    </div>
  );
}

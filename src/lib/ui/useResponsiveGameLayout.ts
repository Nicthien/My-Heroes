"use client";

import { useEffect, useState } from "react";

export type ViewportMode = "phonePortrait" | "phoneLandscape" | "tablet" | "desktop";

export type ResponsiveGameLayout = {
  width: number;
  height: number;
  orientation: "portrait" | "landscape";
  mode: ViewportMode;
  isTouchLayout: boolean;
  isCompactHud: boolean;
  safeArea: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
};

const DEFAULT_LAYOUT: ResponsiveGameLayout = {
  width: 1024,
  height: 768,
  orientation: "landscape",
  mode: "desktop",
  isTouchLayout: false,
  isCompactHud: false,
  safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
};

function getViewportLayout(): ResponsiveGameLayout {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;

  const viewport = window.visualViewport;
  const width = Math.round(viewport?.width ?? window.innerWidth);
  const height = Math.round(viewport?.height ?? window.innerHeight);
  const orientation = height >= width ? "portrait" : "landscape";
  const hasCoarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const maxSide = Math.max(width, height);
  const minSide = Math.min(width, height);
  const isPhone = minSide < 700 && maxSide < 1100;
  const isTablet = !isPhone && minSide < 900 && maxSide < 1400;
  const mode: ViewportMode = isPhone
    ? orientation === "portrait"
      ? "phonePortrait"
      : "phoneLandscape"
    : isTablet
      ? "tablet"
      : "desktop";

  return {
    width,
    height,
    orientation,
    mode,
    isTouchLayout: hasCoarsePointer || mode !== "desktop",
    isCompactHud: mode === "phonePortrait" || mode === "phoneLandscape",
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
  };
}

export function useResponsiveGameLayout() {
  const [layout, setLayout] = useState<ResponsiveGameLayout>(DEFAULT_LAYOUT);

  useEffect(() => {
    const update = () => setLayout(getViewportLayout());
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, []);

  return layout;
}

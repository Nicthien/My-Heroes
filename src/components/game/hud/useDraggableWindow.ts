"use client";

import { type CSSProperties, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";

export type HudWindowPosition = { x: number; y: number };

type HudWindowSize = { width: number; height: number };

type UseDraggableWindowOptions = {
  storageKey: string;
  defaultPosition: HudWindowPosition | ((size: HudWindowSize) => HudWindowPosition);
  disabled?: boolean;
  fallbackSize?: HudWindowSize;
};

const HUD_WINDOW_MARGIN = 12;

function isCompactHudViewport() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px), (hover: none) and (pointer: coarse)").matches;
}

function clampPosition(position: HudWindowPosition, size: HudWindowSize): HudWindowPosition {
  if (typeof window === "undefined") return position;
  const maxX = Math.max(HUD_WINDOW_MARGIN, window.innerWidth - size.width - HUD_WINDOW_MARGIN);
  const maxY = Math.max(HUD_WINDOW_MARGIN, window.innerHeight - size.height - HUD_WINDOW_MARGIN);
  return {
    x: Math.min(Math.max(HUD_WINDOW_MARGIN, position.x), maxX),
    y: Math.min(Math.max(HUD_WINDOW_MARGIN, position.y), maxY),
  };
}

function readStoredPosition(storageKey: string) {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<HudWindowPosition>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

export function useDraggableWindow({
  storageKey,
  defaultPosition,
  disabled = false,
  fallbackSize = { width: 320, height: 220 },
}: UseDraggableWindowOptions) {
  const ref = useRef<HTMLDivElement | null>(null);
  const defaultPositionRef = useRef(defaultPosition);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    latestPosition: HudWindowPosition;
  } | null>(null);
  const [compactViewport, setCompactViewport] = useState(isCompactHudViewport);
  const [position, setPosition] = useState<HudWindowPosition | null>(null);
  const isEnabled = !disabled && !compactViewport;

  useEffect(() => {
    defaultPositionRef.current = defaultPosition;
  }, [defaultPosition]);

  const getSize = useCallback((): HudWindowSize => {
    const element = ref.current;
    return {
      width: element?.offsetWidth ?? fallbackSize.width,
      height: element?.offsetHeight ?? fallbackSize.height,
    };
  }, [fallbackSize.height, fallbackSize.width]);

  const getDefaultPosition = useCallback(() => {
    const size = getSize();
    const currentDefault = defaultPositionRef.current;
    const next = typeof currentDefault === "function" ? currentDefault(size) : currentDefault;
    return clampPosition(next, size);
  }, [getSize]);

  useEffect(() => {
    const updateViewport = () => setCompactViewport(isCompactHudViewport());
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    if (!isEnabled) return;
    const frame = window.requestAnimationFrame(() => {
      const size = getSize();
      setPosition(clampPosition(readStoredPosition(storageKey) ?? getDefaultPosition(), size));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [getDefaultPosition, getSize, isEnabled, storageKey]);

  useEffect(() => {
    if (!isEnabled || !position) return;
    const handleResize = () => setPosition((current) => current ? clampPosition(current, getSize()) : current);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [getSize, isEnabled, position]);

  const savePosition = useCallback((nextPosition: HudWindowPosition) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(nextPosition));
  }, [storageKey]);

  const resetPosition = useCallback(() => {
    if (typeof window !== "undefined") window.localStorage.removeItem(storageKey);
    setPosition(getDefaultPosition());
  }, [getDefaultPosition, storageKey]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isEnabled || event.button !== 0) return;
    const origin = position ?? getDefaultPosition();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: origin.x,
      originY: origin.y,
      latestPosition: origin,
    };
  }, [getDefaultPosition, isEnabled, position]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isEnabled) return;
    const drag = dragRef.current;
    if (!drag) return;
    const nextPosition = clampPosition({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    }, getSize());
    drag.latestPosition = nextPosition;
    setPosition(nextPosition);
  }, [getSize, isEnabled]);

  const stopDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    savePosition(drag.latestPosition);
  }, [savePosition]);

  const style: CSSProperties | undefined = isEnabled && position
    ? { position: "absolute", left: position.x, top: position.y, right: "auto", bottom: "auto" }
    : undefined;

  return {
    ref,
    style,
    isEnabled,
    resetPosition,
    dragHandleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: stopDrag,
      onPointerCancel: stopDrag,
    },
  };
}

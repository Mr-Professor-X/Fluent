'use client';
// Ported from Kevin's Lovable prototype, restyled for Fluid.
import { useEffect, useRef } from 'react';

export default function VideoTile({ stream, muted = false, mirrored = false }: { stream: MediaStream; muted?: boolean; mirrored?: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.srcObject = stream;
    void element.play().catch(() => {});
  }, [stream]);
  return <video ref={ref} className={`video-tile ${mirrored ? 'mirrored' : ''}`} muted={muted} playsInline autoPlay />;
}

'use client';
import { useRef, useEffect } from 'react';
import type { EditorEngine } from '@/src/engine/EditorEngine';
import { KonvaRenderer } from '@/src/renderer/KonvaRenderer';

export function useCanvasSetup(engine: EditorEngine) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<KonvaRenderer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const renderer = new KonvaRenderer(engine);
    renderer.attach(containerRef.current);
    rendererRef.current = renderer;

    // Bind input to the Konva Stage's content element
    const contentEl = renderer.getContentElement();
    if (contentEl) {
      engine.input.bind(contentEl);
    }

    // ResizeObserver
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        renderer.resize(width, height);
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      engine.input.unbind();
      renderer.detach();
      rendererRef.current = null;
    };
  }, [engine]);

  return { containerRef, rendererRef };
}

'use client';
import { useEngine } from '@/src/ui/hooks/useEngine';
import { useCanvasSetup } from '@/src/ui/hooks/useCanvasSetup';
import { useEditorStore } from '@/src/store/useEditorStore';

export function CanvasHost() {
  const engine = useEngine();
  const { containerRef } = useCanvasSetup(engine);
  const cursor = useEditorStore((s) => s.cursor);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        cursor,
        backgroundColor: '#ffffff',
      }}
    />
  );
}

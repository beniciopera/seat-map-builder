'use client';
import { createContext, useContext } from 'react';
import type { EditorEngine } from '@/src/engine/EditorEngine';

export const EngineContext = createContext<EditorEngine | null>(null);

export const EngineProvider = EngineContext.Provider;

export function useEngine(): EditorEngine {
  const engine = useContext(EngineContext);
  if (!engine) {
    throw new Error('useEngine must be used within an EngineProvider');
  }
  return engine;
}

'use client';
import dynamic from 'next/dynamic';

const EditorShell = dynamic(
  () => import('@/src/ui/EditorShell').then((mod) => mod.EditorShell),
  { ssr: false },
);

export default function EditorPage() {
  return <EditorShell />;
}

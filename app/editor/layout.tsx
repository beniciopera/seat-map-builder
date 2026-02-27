export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {children}
    </div>
  );
}

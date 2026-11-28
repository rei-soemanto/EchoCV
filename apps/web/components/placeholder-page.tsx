export function PlaceholderPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-h1">{title}</h1>
        <p className="text-body max-w-2xl text-ink-secondary">{description}</p>
      </header>
      {children}
    </div>
  );
}

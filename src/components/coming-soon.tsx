export function ComingSoon({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-dashed border-line p-6 text-center">
      <h2 className="font-bold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{children ?? "준비 중이에요."}</p>
    </section>
  );
}

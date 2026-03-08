export default function FilterBar({ children }) {
  return (
    <section className="rounded border bg-white p-3 sm:p-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </section>
  );
}
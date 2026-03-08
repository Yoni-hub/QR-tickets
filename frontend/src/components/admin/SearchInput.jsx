export default function SearchInput({ value, onChange, placeholder = "Search..." }) {
  return (
    <input
      className="w-full rounded border p-2 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
    />
  );
}
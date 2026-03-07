import { useEffect, useRef, useState } from "react";

export default function EditableText({ value, onChange, className = "", ariaLabel }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) setDraft(value || "");
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        aria-label={ariaLabel}
        className={`w-full rounded border border-white/70 bg-white/90 px-2 py-1 text-current outline-none ${className}`}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          onChange(draft.trim() || value);
          setEditing(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onChange(draft.trim() || value);
            setEditing(false);
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setDraft(value || "");
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={`w-full rounded text-left transition hover:opacity-90 active:scale-[0.99] ${className}`}
      onClick={() => setEditing(true)}
    >
      {value}
    </button>
  );
}

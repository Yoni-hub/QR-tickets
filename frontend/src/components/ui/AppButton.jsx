import { useEffect, useRef, useState } from "react";

const BASE_CLASS =
  "inline-flex w-full items-center justify-center gap-2 rounded px-4 py-2 text-center font-medium leading-tight transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

const VARIANT_CLASS = {
  primary: "bg-black text-white hover:bg-slate-800 focus-visible:ring-slate-500",
  secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 focus-visible:ring-slate-400",
  indigo: "bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:ring-indigo-500",
  success: "bg-green-600 text-white hover:bg-green-500 focus-visible:ring-green-500",
  danger: "bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-500",
};

function Spinner() {
  return (
    <span
      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
      aria-hidden="true"
    />
  );
}

export default function AppButton({
  children,
  loading = false,
  loadingText = "Processing...",
  disabled = false,
  type = "button",
  variant = "primary",
  className = "",
  onClick,
  ...props
}) {
  const [wasClicked, setWasClicked] = useState(false);
  const [clickLocked, setClickLocked] = useState(false);
  const clickResetRef = useRef(null);
  const isDisabled = disabled || loading || clickLocked;
  const label = loading ? loadingText : children;

  useEffect(() => {
    return () => {
      if (clickResetRef.current) {
        clearTimeout(clickResetRef.current);
      }
    };
  }, []);

  const handleClick = (event) => {
    if (isDisabled) return;
    setClickLocked(true);
    setWasClicked(true);
    if (clickResetRef.current) {
      clearTimeout(clickResetRef.current);
    }
    clickResetRef.current = setTimeout(() => {
      setWasClicked(false);
      setClickLocked(false);
    }, 700);
    if (typeof onClick === "function") {
      onClick(event);
    }
  };

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading}
      onClick={handleClick}
      className={`${BASE_CLASS} ${VARIANT_CLASS[variant] || VARIANT_CLASS.primary} ${wasClicked ? "opacity-90 shadow-inner" : ""} ${className}`}
      {...props}
    >
      {loading ? <Spinner /> : null}
      <span>{label}</span>
    </button>
  );
}

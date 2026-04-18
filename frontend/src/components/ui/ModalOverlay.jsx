import { useEffect } from "react";

export default function ModalOverlay({ children, className = "" }) {
  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:items-center ${className}`}
    >
      {children}
    </div>
  );
}

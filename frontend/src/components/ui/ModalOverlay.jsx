import { useEffect } from "react";

export default function ModalOverlay({ children, className = "" }) {
  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);

  return (
    <div className={`fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-3 sm:items-center ${className}`}>
      {children}
    </div>
  );
}

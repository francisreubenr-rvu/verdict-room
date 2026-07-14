"use client";

import { useEffect, useRef, useState } from "react";

// Fade+rise-once on scroll into view, mirroring the design's data-reveal
// behavior. Starts visible (no flash of hidden content) and only hides once
// IntersectionObserver is confirmed alive, so a browser without it — or one
// where callbacks never fire — never loses content.
export function Reveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const el = ref.current;
    if (!el) return;

    if (el.getBoundingClientRect().top > (window.innerHeight || 800)) {
      setVisible(false);
    }
    setArmed(true);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.02 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : "translateY(30px)",
        transition: armed
          ? "opacity .75s ease, transform .75s cubic-bezier(.22,1,.36,1)"
          : "none",
      }}
    >
      {children}
    </div>
  );
}

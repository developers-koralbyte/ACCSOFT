"use client";

import { useRef } from "react";

// A screenshot that opens larger when clicked. Uses the native <dialog> element: Esc closes it, focus is handled
// by the browser, and there is no extra dependency.
export function Shot({ src, alt, w, h, caption, priority = false }: { src: string; alt: string; w: number; h: number; caption?: string; priority?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <figure className="p-frame p-zoomable">
        <div className="p-bar" aria-hidden="true"><i /><i /><i /></div>
        <button type="button" className="p-zoom-btn" aria-label={`Open larger: ${alt}`} onClick={() => ref.current?.showModal()}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} width={w} height={h} loading={priority ? "eager" : "lazy"} />
          <span className="p-zoom-hint" aria-hidden="true">Click to enlarge</span>
        </button>
      </figure>
      <dialog
        ref={ref}
        className="p-lightbox"
        aria-label={alt}
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div className="p-lightbox-in">
          <button type="button" className="p-lightbox-close" onClick={() => ref.current?.close()} aria-label="Close">Close</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} />
          {caption && <p>{caption}</p>}
        </div>
      </dialog>
    </>
  );
}

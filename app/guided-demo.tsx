"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DATA_EVENT, loadState, readMode, resetDemoData, writeMode, writeStaff } from "@/lib/store";
import { GUIDE_KEY, GUIDE_STEPS, type GuideState } from "@/lib/guide";
import type { AppState } from "@/lib/types";

function readGuide(): GuideState {
  try {
    const raw = window.localStorage.getItem(GUIDE_KEY);
    return raw ? (JSON.parse(raw) as GuideState) : { active: false, step: 0 };
  } catch {
    return { active: false, step: 0 };
  }
}

function writeGuide(g: GuideState) {
  try {
    window.localStorage.setItem(GUIDE_KEY, JSON.stringify(g));
    window.dispatchEvent(new Event(DATA_EVENT));
  } catch {
    /* ignore */
  }
}

// Restores the seeded data, switches to the firm view as Aisyah, and opens step one.
export async function startGuidedDemo() {
  writeMode("firm");
  await resetDemoData("firm");
  writeStaff("aisyah");
  writeGuide({ active: true, step: 0 });
  window.location.assign(GUIDE_STEPS[0].href);
}

export function StartGuidedDemoButton({ className = "btn", label = "Start guided demo" }: { className?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button className={className} disabled={busy} onClick={async () => { setBusy(true); await startGuidedDemo(); }}>
      {busy ? "Starting..." : label}
    </button>
  );
}

// The floating prompt panel. It stays while you move between screens.
export default function GuidedDemo() {
  const path = usePathname();
  const router = useRouter();
  const [guide, setGuide] = useState<GuideState>({ active: false, step: 0 });
  const [state, setState] = useState<AppState | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const read = () => {
      setGuide(readGuide());
      if (readMode() === "firm") setState(loadState("firm"));
    };
    read();
    window.addEventListener(DATA_EVENT, read);
    return () => window.removeEventListener(DATA_EVENT, read);
  }, [path]);

  const isPublic = path === "/" || path === "/pricing";
  if (!guide.active || isPublic) return null;
  const step = GUIDE_STEPS[Math.min(guide.step, GUIDE_STEPS.length - 1)];
  const done = step.done ? Boolean(state && step.done(state)) : false;
  const last = guide.step >= GUIDE_STEPS.length - 1;
  const here = path === step.href.split("?")[0];

  if (hidden) {
    return <button className="guide-tab" onClick={() => setHidden(false)}>Guided demo: step {guide.step + 1} of {GUIDE_STEPS.length}</button>;
  }

  return (
    <aside className="guide" aria-label="Guided demo">
      <div className="guide-head">
        <strong>Guided demo, step {guide.step + 1} of {GUIDE_STEPS.length}</strong>
        <span>
          <button className="linkbtn" onClick={() => setHidden(true)}>Hide</button>{" | "}
          <button className="linkbtn" onClick={() => writeGuide({ active: false, step: 0 })}>Exit</button>
        </span>
      </div>
      <div className="guide-title">{done ? "Done: " : ""}{step.title}</div>
      <p className="guide-text">{step.text}</p>
      <div className="guide-actions">
        <button className="btn secondary" disabled={guide.step === 0} onClick={() => writeGuide({ active: true, step: guide.step - 1 })}>Back</button>
        {!here && <Link className="btn secondary" href={step.href}>Go to this screen</Link>}
        {last ? (
          <button className="btn green" onClick={() => writeGuide({ active: false, step: 0 })}>Finish</button>
        ) : (
          <button className={`btn ${done || !step.done ? "green" : ""}`} onClick={() => {
            const next = GUIDE_STEPS[guide.step + 1];
            writeGuide({ active: true, step: guide.step + 1 });
            // in-app navigation, so the page you are on keeps its state when the next step is on the same screen
            if (next.href !== `${path}${typeof window === "undefined" ? "" : window.location.search}`) router.push(next.href);
          }}>
            {done ? "Done, next step" : "Next step"}
          </button>
        )}
      </div>
    </aside>
  );
}

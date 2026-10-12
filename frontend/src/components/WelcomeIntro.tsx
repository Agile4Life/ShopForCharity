import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { BrandMark } from "./BrandMark";
import "./welcome-intro.css";

const brandName = "Gói Ấm Trao Em";

/** A brief brand greeting on a fresh home-page visit. */
export function WelcomeIntro() {
  const location = useLocation();
  const entryKey = useRef(location.key);
  const [visible, setVisible] = useState(() =>
    location.pathname === "/" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (location.key !== entryKey.current) setVisible(false);
  }, [location.key]);

  useEffect(() => {
    if (!visible) return;
    const dismiss = () => setVisible(false);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotionChange = () => { if (motion.matches) dismiss(); };
    // Keep the greeting independent of network requests and animation events.
    const timeout = window.setTimeout(dismiss, 2550);
    const events = ["pointerdown", "keydown", "wheel", "touchmove", "focusin"] as const;
    events.forEach(event => window.addEventListener(event, dismiss, { passive: true }));
    motion.addEventListener("change", onMotionChange);
    onMotionChange();
    return () => {
      window.clearTimeout(timeout);
      events.forEach(event => window.removeEventListener(event, dismiss));
      motion.removeEventListener("change", onMotionChange);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="welcome-intro" data-testid="welcome-intro" aria-hidden="true">
      <div className="welcome-intro__content">
        <div className="welcome-intro__mark">
          <div className="welcome-intro__sway">
            <BrandMark className="welcome-intro__flower" />
          </div>
        </div>
        <p className="welcome-intro__name">
          {Array.from(brandName).map((letter, index) => (
            <span key={index} style={{ animationDelay: `${450 + index * 65}ms` }}>
              {letter === " " ? "\u00a0" : letter}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import { ImageOff } from "lucide-react";

type Props = ImgHTMLAttributes<HTMLImageElement> & { onRetry?: () => void };

// A refreshed signed URL should also clear the previous image failure.
export function AssetImage(props: Props) {
  return <ImageAttempt key={props.src} {...props} />;
}

function ImageAttempt({ onRetry, onError, onLoad, className = "", ...props }: Props) {
  const ref = useRef<HTMLImageElement>(null);
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  useEffect(() => {
    if (state !== "loading") return;
    const image = ref.current;
    if (!image) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      if (!timer) timer = setTimeout(() => setState("failed"), 15000);
    };
    // Start the deadline for lazy images when they enter the viewport.
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { start(); observer.disconnect(); }
    });
    if (props.loading === "lazy") observer.observe(image);
    else start();
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, [state, props.loading]);
  if (state === "failed") return <span className={`${className} asset-image-fallback`} role="status">
    <ImageOff size={20} aria-hidden="true" />
    <span>Chưa tải được ảnh</span>
    {onRetry && <button type="button" className="btn-text-sm" onClick={() => { setState("loading"); onRetry(); }}>Tải lại ảnh</button>}
  </span>;
  return <img ref={ref} {...props} className={className} aria-busy={state === "loading"}
    onLoad={event => { setState("loaded"); onLoad?.(event); }}
    onError={event => { setState("failed"); onError?.(event); }} />;
}

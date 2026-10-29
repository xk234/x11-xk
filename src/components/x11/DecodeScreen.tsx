import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/codec";

type Props = {
  mime: string | null;
  content: string | null;
  onEdit: () => void;
};

// Shown when the page is opened with a #payload. Auto-runs after a short countdown.
export function DecodeScreen({ mime, content, onEdit }: Props) {
  const failed = content === null;
  const [count, setCount] = useState(3);
  const [paused, setPaused] = useState(false);

  const run = () => {
    if (content === null) return;
    const url = URL.createObjectURL(new Blob([content], { type: mime ?? "text/html" }));
    location.replace(url);
  };

  useEffect(() => {
    if (failed || paused) return;
    if (count <= 0) {
      run();
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, paused, failed]);

  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="glass animate-fade-up w-full max-w-md rounded-2xl border p-8 text-center shadow-[var(--shadow-panel)]">
        <div
          className={`mx-auto mb-6 grid size-16 place-items-center rounded-2xl font-mono-ui text-lg font-bold ${
            failed ? "bg-destructive/15 text-destructive" : "bg-gradient-primary text-primary-foreground animate-pulse-ring"
          }`}
        >
          {failed ? "!" : paused ? "x11" : count}
        </div>
        <h1 className="text-xl font-semibold tracking-tight">
          {failed ? "This link couldn't be decoded" : "Opening shared content"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {failed
            ? "The link is incomplete or corrupted. Check that it was copied in full."
            : `${mime} · ${formatBytes(new TextEncoder().encode(content).length)}`}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          {!failed && (
            <Button variant="hero" onClick={run}>
              Run now
            </Button>
          )}
          {!failed && !paused && (
            <Button variant="outline" onClick={() => setPaused(true)}>
              Pause
            </Button>
          )}
          <Button variant="outline" onClick={onEdit}>
            {failed ? "Go to editor" : "Open in editor"}
          </Button>
        </div>
      </div>
    </div>
  );
}

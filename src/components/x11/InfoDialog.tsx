import { useState } from "react";
import { CheckCircle2, Circle, X } from "lucide-react";
import { CHANGELOG, TODO } from "@/lib/changelog";

export function InfoDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"log" | "todo">("log");
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/60 p-4 backdrop-blur-md" onClick={onClose}>
      <div className="liquid animate-fade-up flex max-h-[85vh] w-full max-w-xl flex-col rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="liquid flex rounded-full p-1 text-sm">
            {(["log", "todo"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`rounded-full px-4 py-1.5 transition ${tab === t ? "bg-gradient-primary text-primary-foreground shadow-glow" : "text-muted-foreground hover:text-foreground"}`}>
                {t === "log" ? "Update history" : "TODO"}
              </button>
            ))}
          </div>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="size-5" /></button>
        </div>
        <div className="mt-5 min-h-0 overflow-y-auto pr-1">
          {tab === "log" ? (
            <ol className="space-y-5">
              {CHANGELOG.map((c) => (
                <li key={c.version} className="relative border-l border-primary/40 pl-5">
                  <span className="bg-gradient-primary shadow-glow absolute -left-[5px] top-1.5 size-2.5 rounded-full" />
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono-ui text-sm font-semibold text-primary">v{c.version}</span>
                    <span className="font-semibold">{c.title}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">{c.date}</span>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {c.items.map((i) => <li key={i}>• {i}</li>)}
                  </ul>
                </li>
              ))}
            </ol>
          ) : (
            <ul className="space-y-2">
              {TODO.map((t) => (
                <li key={t.text} className="liquid flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm">
                  {t.done ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-muted-foreground" />}
                  <span className={t.done ? "text-muted-foreground line-through" : ""}>{t.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

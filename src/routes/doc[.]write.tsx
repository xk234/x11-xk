import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { decodeAny } from "@/lib/codec2";

export const Route = createFileRoute("/doc.write")({
  head: () => ({
    meta: [
      { title: "x11 Document" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DocumentWriteRoute,
});

type View =
  | { kind: "html"; value: string }
  | { kind: "text"; value: string }
  | { kind: "url"; value: string };

function DocumentWriteRoute() {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    const payload = location.hash.slice(1).trim();

    if (!payload) {
      setError("No document payload was provided.");
      return;
    }

    decodeAny(payload).then((decoded) => {
      if (!active) return;
      if (decoded.status !== "ok") {
        setError(decoded.status === "locked" ? "This document is password protected. Open it through the x11 editor to unlock it." : decoded.reason);
        return;
      }

      if (decoded.text !== null) {
        if (decoded.mime.includes("html") || decoded.mime.includes("svg")) {
          setView({ kind: "html", value: decoded.text });
        } else {
          setView({ kind: "text", value: decoded.text });
        }
        return;
      }

      objectUrl = URL.createObjectURL(new Blob([decoded.bytes as BlobPart], { type: decoded.mime }));
      setView({ kind: "url", value: objectUrl });
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Unable to open this document.");
    });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <section className="liquid w-full max-w-lg rounded-3xl p-8 text-center">
          <div className="text-sm font-semibold text-destructive">Document unavailable</div>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <a className="mt-6 inline-flex rounded-xl border px-4 py-2 text-sm hover:bg-accent" href="/">Back to x11</a>
        </section>
      </main>
    );
  }

  if (!view) {
    return <main className="grid min-h-screen place-items-center"><div className="size-9 animate-pulse rounded-xl bg-gradient-primary shadow-glow" /></main>;
  }

  if (view.kind === "text") {
    return <main className="min-h-screen overflow-auto p-6"><pre className="mx-auto max-w-5xl whitespace-pre-wrap break-words font-mono-ui text-sm">{view.value}</pre></main>;
  }

  return (
    <main className="fixed inset-0 bg-background">
      {view.kind === "html" ? (
        <iframe
          title="Shared x11 document"
          srcDoc={view.value}
          sandbox="allow-scripts allow-forms allow-modals"
          referrerPolicy="no-referrer"
          className="size-full border-0 bg-white"
        />
      ) : (
        <iframe
          title="Shared x11 file"
          src={view.value}
          sandbox="allow-scripts allow-forms allow-modals"
          referrerPolicy="no-referrer"
          className="size-full border-0 bg-white"
        />
      )}
    </main>
  );
}

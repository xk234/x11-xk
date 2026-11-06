import Editor, { type OnMount } from "@monaco-editor/react";

type Props = {
  value: string;
  language: string;
  wordWrap: boolean;
  onChange: (v: string) => void;
  onMount?: OnMount;
};

// Browser-only module: loaded lazily from the page after hydration.
export default function CodeEditor({ value, language, wordWrap, onChange, onMount }: Props) {
  return (
    <Editor
      value={value}
      language={language}
      theme="x11-dark"
      onChange={(v) => onChange(v ?? "")}
      beforeMount={(monaco) => {
        monaco.editor.defineTheme("x11-dark", {
          base: "vs-dark",
          inherit: true,
          rules: [
            { token: "comment", foreground: "6b6a7c", fontStyle: "italic" },
            { token: "keyword", foreground: "FA1F4E" },
            { token: "string", foreground: "f5a3b5" },
            { token: "number", foreground: "ffb36b" },
            { token: "tag", foreground: "FA1F4E" },
            { token: "attribute.name", foreground: "c9b8e8" },
            { token: "attribute.value", foreground: "f5a3b5" },
          ],
          colors: {
            "editor.background": "#00000000",
            "editor.foreground": "#ececf1",
            "editor.lineHighlightBackground": "#ffffff08",
            "editor.selectionBackground": "#FA1F4E40",
            "editorCursor.foreground": "#FA1F4E",
            "editorLineNumber.foreground": "#3e3d4e",
            "editorLineNumber.activeForeground": "#9a99ab",
            "editorIndentGuide.background1": "#222130",
            "minimap.background": "#00000000",
            "scrollbarSlider.background": "#3a394a66",
          },
        });
      }}
      {...(onMount ? { onMount } : {})}
      loading={<div className="grid h-full place-items-center text-sm text-muted-foreground">Loading editor…</div>}
      options={{
        fontSize: 13.5,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontLigatures: true,
        minimap: { enabled: true, scale: 0.8 },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        padding: { top: 14, bottom: 14 },
        cursorBlinking: "smooth",
        cursorSmoothCaretAnimation: "on",
        smoothScrolling: true,
        bracketPairColorization: { enabled: true },
        tabSize: 2,
        wordWrap: wordWrap ? "on" : "off",
        stickyScroll: { enabled: true },
      }}
    />
  );
}

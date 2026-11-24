import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import "./style.css";

const APP_STATE_KEYS = [
  "viewBackgroundColor",
  "theme",
  "gridSize",
  "currentItemStrokeColor",
  "currentItemBackgroundColor",
  "currentItemFillStyle",
  "currentItemStrokeWidth",
  "currentItemStrokeStyle",
  "currentItemRoughness",
  "currentItemOpacity",
  "currentItemFontFamily",
  "currentItemFontSize",
  "currentItemTextAlign",
  "currentItemStartArrowhead",
  "currentItemEndArrowhead",
  "scrollX",
  "scrollY",
  "zoom",
];

async function loadBoard() {
  const response = await fetch("/api/board", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Не удалось загрузить доску (HTTP ${response.status})`);
  }
  return response.json();
}

function App() {
  const [initialData, setInitialData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [saveState, setSaveState] = useState("loading");
  const timerRef = useRef(null);
  const latestRef = useRef(null);
  const saveQueueRef = useRef(Promise.resolve());
  const revisionRef = useRef(0);

  useEffect(() => {
    let active = true;
    loadBoard()
      .then((data) => {
        if (!active) return;
        setInitialData(data);
        setSaveState("saved");
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(error.message || "Ошибка загрузки доски");
        setSaveState("error");
      });
    return () => {
      active = false;
      window.clearTimeout(timerRef.current);
    };
  }, []);

  const persist = useCallback((payload, revision) => {
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const response = await fetch("/api/board", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || `HTTP ${response.status}`);
        }
        if (revision === revisionRef.current) setSaveState("saved");
      })
      .catch((error) => {
        console.error("Miko Pad save failed:", error);
        if (revision === revisionRef.current) setSaveState("error");
      });
  }, []);

  const handleChange = useCallback((elements, appState, files) => {
    const safeAppState = {};
    for (const key of APP_STATE_KEYS) {
      if (appState[key] !== undefined) safeAppState[key] = appState[key];
    }

    latestRef.current = { elements, appState: safeAppState, files };
    const revision = ++revisionRef.current;
    setSaveState("saving");
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      if (latestRef.current) persist(latestRef.current, revision);
    }, 700);
  }, [persist]);

  useEffect(() => {
    const flush = () => {
      window.clearTimeout(timerRef.current);
      if (!latestRef.current) return;
      const payload = JSON.stringify(latestRef.current);
      try {
        fetch("/api/board", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        });
      } catch (error) {
        console.error("Miko Pad unload save failed:", error);
      }
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  if (loadError) {
    return (
      <main className="fatal">
        <h1>Не удалось открыть доску</h1>
        <p>{loadError}</p>
        <button onClick={() => window.location.reload()}>Повторить</button>
      </main>
    );
  }

  if (!initialData) {
    return <main className="loading">Загрузка доски…</main>;
  }

  const statusText = {
    loading: "Загрузка…",
    saving: "Сохранение…",
    saved: "Сохранено",
    error: "Ошибка сохранения",
  }[saveState];

  return (
    <main className="app-shell">
      <div className={`save-indicator ${saveState}`} role="status">
        <span className="save-dot" />
        {statusText}
      </div>
      <Excalidraw
        initialData={initialData}
        onChange={handleChange}
        langCode="ru-RU"
        UIOptions={{
          canvasActions: {
            loadScene: true,
            saveToActiveFile: false,
            export: { saveFileToDisk: true },
          },
        }}
      />
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

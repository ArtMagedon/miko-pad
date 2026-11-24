import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CaptureUpdateAction, Excalidraw, newElementWith } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import "./style.css";

const STROKE_WIDTH_SCALE = 5;

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
  const data = await response.json();
  if (data.mikoStrokeWidthScale !== STROKE_WIDTH_SCALE) {
    data.elements = (data.elements || []).map((element) => ({
      ...element,
      strokeWidth: element.strokeWidth / STROKE_WIDTH_SCALE,
    }));
    if (Number.isFinite(data.appState?.currentItemStrokeWidth)) {
      data.appState = {
        ...data.appState,
        currentItemStrokeWidth: data.appState.currentItemStrokeWidth / STROKE_WIDTH_SCALE,
      };
    }
    data.mikoStrokeWidthScale = STROKE_WIDTH_SCALE;
  }
  return data;
}

function App() {
  const [initialData, setInitialData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [saveState, setSaveState] = useState("loading");
  const [excalidrawAPI, setExcalidrawAPI] = useState(null);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const timerRef = useRef(null);
  const latestRef = useRef(null);
  const saveQueueRef = useRef(Promise.resolve());
  const revisionRef = useRef(0);
  const elementsBeforePointerRef = useRef(new Set());

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

  useEffect(() => {
    if (!excalidrawAPI) return;

    // Ignore hardware pen pressure so the editor receives a uniform input width.
    const normalizePointerPressure = (event) => {
      try {
        Object.defineProperty(event, "pressure", {
          configurable: true,
          value: 0.5,
        });
      } catch {
        // Some browsers expose a non-configurable PointerEvent property.
      }
    };

    const handlePointerDown = (event) => {
      normalizePointerPressure(event);
      elementsBeforePointerRef.current = new Set(
        excalidrawAPI.getSceneElementsIncludingDeleted().map((element) => element.id),
      );
    };

    const handlePointerMove = normalizePointerPressure;

    const handlePointerUp = (event) => {
      normalizePointerPressure(event);
      // Excalidraw commits the final freehand element during its pointer-up handler.
      window.setTimeout(() => {
        const currentElements = excalidrawAPI.getSceneElementsIncludingDeleted();
        const normalizedElements = currentElements.map((element) => {
          if (element.type !== "freedraw" || elementsBeforePointerRef.current.has(element.id)) {
            return element;
          }
          return {
            ...element,
            simulatePressure: false,
            pressures: element.points.map(() => 0.5),
          };
        });
        const changed = normalizedElements.some((element, index) => element !== currentElements[index]);
        if (changed) {
          excalidrawAPI.updateScene({
            elements: normalizedElements,
            captureUpdate: CaptureUpdateAction.NEVER,
          });
        }
        elementsBeforePointerRef.current.clear();
      }, 0);
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", handlePointerUp, true);
    window.addEventListener("pointercancel", handlePointerUp, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", handlePointerUp, true);
      window.removeEventListener("pointercancel", handlePointerUp, true);
    };
  }, [excalidrawAPI]);

  const handleChange = useCallback((elements, appState, files) => {
    const selectedWidths = elements
      .filter((element) => appState.selectedElementIds?.[element.id])
      .map((element) => element.strokeWidth * STROKE_WIDTH_SCALE);
    if (selectedWidths.length > 0) {
      const firstWidth = selectedWidths[0];
      setStrokeWidth(selectedWidths.every((width) => width === firstWidth) ? firstWidth : "");
    } else if (Number.isFinite(appState.currentItemStrokeWidth)) {
      setStrokeWidth(appState.currentItemStrokeWidth * STROKE_WIDTH_SCALE);
    }
    const safeAppState = {};
    for (const key of APP_STATE_KEYS) {
      if (appState[key] !== undefined) safeAppState[key] = appState[key];
    }

    latestRef.current = {
      type: "excalidraw",
      version: 2,
      mikoStrokeWidthScale: STROKE_WIDTH_SCALE,
      source: "https://github.com/ArtMagedon/miko-pad",
      elements,
      appState: safeAppState,
      files,
    };
    const revision = ++revisionRef.current;
    setSaveState("saving");
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      if (latestRef.current) persist(latestRef.current, revision);
    }, 700);
  }, [persist]);

  const handleStrokeWidthChange = (event) => {
    const value = Number(event.target.value);
    if (!Number.isFinite(value) || value < 1 || value > 100) return;
    const actualWidth = value / STROKE_WIDTH_SCALE;
    setStrokeWidth(value);
    if (!excalidrawAPI) return;
    const appState = excalidrawAPI.getAppState();
    const selectedIds = appState.selectedElementIds;
    const elements = excalidrawAPI.getSceneElementsIncludingDeleted().map((element) =>
      selectedIds[element.id] ? newElementWith(element, { strokeWidth: actualWidth }) : element,
    );
    excalidrawAPI.updateScene({
      elements,
      appState: { currentItemStrokeWidth: actualWidth },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  useEffect(() => {
    const editor = document.querySelector(".app-shell");
    if (!editor) return;

    const installNumericStrokeWidth = () => {
      editor.querySelectorAll("fieldset").forEach((fieldset) => {
        const legend = fieldset.querySelector("legend");
        if (legend?.textContent?.trim() !== "Толщина штриха") return;
        if (fieldset.dataset.mikoStrokeWidthMounted === "true") {
          const existingInput = fieldset.querySelector(".miko-stroke-width-input");
          if (existingInput) {
            existingInput.onchange = handleStrokeWidthChange;
            if (document.activeElement !== existingInput) existingInput.value = String(strokeWidth);
          }
          return;
        }

        fieldset.dataset.mikoStrokeWidthMounted = "true";
        fieldset.classList.add("miko-numeric-stroke-width");

        const input = document.createElement("input");
        input.type = "number";
        input.min = "1";
        input.max = "100";
        input.step = "1";
        input.value = String(strokeWidth);
        input.setAttribute("aria-label", "Толщина штриха в пикселях");
        input.className = "miko-stroke-width-input";
        input.onchange = handleStrokeWidthChange;
        fieldset.appendChild(input);

      });
    };

    installNumericStrokeWidth();
    const observer = new MutationObserver(installNumericStrokeWidth);
    observer.observe(editor, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [initialData, strokeWidth, excalidrawAPI]);

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
        excalidrawAPI={setExcalidrawAPI}
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

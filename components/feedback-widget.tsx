"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  capturePixelRatio,
  clipElementText,
  deviceType,
  FEEDBACK_PRIORITY_LABELS,
  FEEDBACK_PRIORITIES,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_TYPES,
  markAnchor,
  MAX_SCREENSHOT_BYTES,
  type FeedbackStatus,
} from "@/lib/feedback-rules";
import type { FeedbackMark, FeedbackTarget } from "@/lib/db/schema";

type Tool = FeedbackMark["type"];
type Point = { x: number; y: number };
type Pin = { id: string; title: string | null; body: string; status: string; marks: FeedbackMark[] };
type MineEvent = { id: string; kind: string; body: string; actorName: string | null; createdAt: string };
type MineItem = {
  id: string;
  title: string | null;
  body: string;
  status: string;
  route: string;
  fixPrUrl: string | null;
  unread: boolean;
  events: MineEvent[];
};

const TOOLS: { id: Tool; label: string }[] = [
  { id: "box", label: "Box" },
  { id: "circle", label: "Circle" },
  { id: "arrow", label: "Arrow" },
  { id: "freehand", label: "Pen" },
];

function cssPath(el: Element) {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.tagName.toLowerCase() !== "html") {
    const current: Element = node;
    if (current.id && /^[A-Za-z][\w:-]*$/.test(current.id)) {
      parts.unshift(`#${CSS.escape(current.id)}`);
      break;
    }
    const parent: Element | null = current.parentElement;
    if (!parent) {
      parts.unshift(current.tagName.toLowerCase());
      break;
    }
    const tag = current.tagName;
    const same = Array.from(parent.children).filter((child): child is Element => child.tagName === tag);
    parts.unshift(`${tag.toLowerCase()}:nth-of-type(${same.indexOf(current) + 1})`);
    node = parent;
  }
  return parts.join(" > ");
}

function pagePoint(event: { clientX: number; clientY: number }): Point {
  return { x: event.clientX + window.scrollX, y: event.clientY + window.scrollY };
}

function normalizeBox(a: Point, b: Point) {
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  if (w < 8 && h < 8) return { x: b.x - 14, y: b.y - 14, w: 28, h: 28 };
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w, h };
}

function paintMarks(ctx: CanvasRenderingContext2D, marks: FeedbackMark[], scrollX: number, scrollY: number, dpr: number) {
  ctx.save();
  ctx.strokeStyle = "#e15a1c";
  ctx.fillStyle = "rgba(225, 90, 28, 0.18)";
  ctx.lineWidth = 3 * dpr;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const X = (x: number) => (x - scrollX) * dpr;
  const Y = (y: number) => (y - scrollY) * dpr;
  for (const mark of marks) {
    ctx.beginPath();
    if (mark.type === "box") {
      ctx.rect(X(mark.x), Y(mark.y), mark.w * dpr, mark.h * dpr);
      ctx.fill();
      ctx.stroke();
    } else if (mark.type === "circle") {
      ctx.ellipse(X(mark.x), Y(mark.y), Math.abs(mark.r) * dpr, Math.abs(mark.r) * dpr, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (mark.type === "arrow") {
      ctx.moveTo(X(mark.x1), Y(mark.y1));
      ctx.lineTo(X(mark.x2), Y(mark.y2));
      ctx.stroke();
      const angle = Math.atan2(mark.y2 - mark.y1, mark.x2 - mark.x1);
      const size = 12 * dpr;
      ctx.beginPath();
      ctx.moveTo(X(mark.x2), Y(mark.y2));
      ctx.lineTo(X(mark.x2) - size * Math.cos(angle - Math.PI / 7), Y(mark.y2) - size * Math.sin(angle - Math.PI / 7));
      ctx.lineTo(X(mark.x2) - size * Math.cos(angle + Math.PI / 7), Y(mark.y2) - size * Math.sin(angle + Math.PI / 7));
      ctx.closePath();
      ctx.fillStyle = "#e15a1c";
      ctx.fill();
    } else if (mark.points.length) {
      mark.points.forEach((point, index) => (index === 0 ? ctx.moveTo(X(point.x), Y(point.y)) : ctx.lineTo(X(point.x), Y(point.y))));
      ctx.stroke();
    }
  }
  ctx.restore();
}

async function blobUnderCap(canvas: HTMLCanvasElement) {
  const qualities = [0.85, 0.7, 0.55, 0.4];
  for (const quality of qualities) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= MAX_SCREENSHOT_BYTES) return blob;
  }
  throw new Error("Screenshot is over 12 MB.");
}

async function captureViewport(marks: FeedbackMark[]) {
  const dpr = capturePixelRatio(window.devicePixelRatio || 1);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-feedback-ui]"));
  const previous = nodes.map((node) => node.style.display);
  nodes.forEach((node) => {
    node.style.display = "none";
  });
  try {
    const { toCanvas } = await import("html-to-image");
    const canvas = await toCanvas(document.body, {
      pixelRatio: dpr,
      width: w,
      height: h,
      canvasWidth: Math.round(w * dpr),
      canvasHeight: Math.round(h * dpr),
      cacheBust: true,
      skipFonts: true,
      style: { transform: `translate(${-scrollX}px, ${-scrollY}px)`, transformOrigin: "top left" },
      filter: (node) => !(node instanceof Element && node.closest("[data-feedback-ui]")),
    });
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not draw the screenshot.");
    paintMarks(ctx, marks, scrollX, scrollY, dpr);
    return blobUnderCap(canvas);
  } finally {
    nodes.forEach((node, index) => {
      node.style.display = previous[index] ?? "";
    });
  }
}

function MarkShape({ mark }: { mark: FeedbackMark }) {
  if (mark.type === "box") return <rect x={mark.x} y={mark.y} width={mark.w} height={mark.h} fill="rgba(225,90,28,0.18)" stroke="#e15a1c" strokeWidth={2.5} />;
  if (mark.type === "circle") return <ellipse cx={mark.x} cy={mark.y} rx={Math.abs(mark.r)} ry={Math.abs(mark.r)} fill="rgba(225,90,28,0.18)" stroke="#e15a1c" strokeWidth={2.5} />;
  if (mark.type === "arrow") {
    return (
      <g>
        <line x1={mark.x1} y1={mark.y1} x2={mark.x2} y2={mark.y2} stroke="#e15a1c" strokeWidth={2.5} />
        <circle cx={mark.x2} cy={mark.y2} r={5} fill="#e15a1c" />
      </g>
    );
  }
  return <polyline points={mark.points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="#e15a1c" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />;
}

export function FeedbackLaunchButton({ unread }: { unread: number }) {
  return (
    <button
      type="button"
      data-testid="feedback-button-header"
      aria-label="Feedback"
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-ink text-lg text-paper sm:hidden"
      onClick={() => window.dispatchEvent(new Event("bc-feedback-open"))}
    >
      ✎{unread > 0 ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-clay"><span className="sr-only">{unread} unread</span></span> : null}
    </button>
  );
}

export function FeedbackChrome({ mobileFloat = false, initialUnread = 0 }: { mobileFloat?: boolean; initialUnread?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mineOpen, setMineOpen] = useState(false);
  const [tool, setTool] = useState<Tool>("box");
  const [scrollMode, setScrollMode] = useState(false);
  const [phase, setPhase] = useState<"draw" | "form">("draw");
  const [marks, setMarks] = useState<FeedbackMark[]>([]);
  const [targets, setTargets] = useState<FeedbackTarget[]>([]);
  const [draft, setDraftState] = useState<FeedbackMark | null>(null);
  const draftRef = useRef<FeedbackMark | null>(null);
  const [scroll, setScroll] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [pinsOn, setPinsOn] = useState(true);
  const [pins, setPins] = useState<Pin[]>([]);
  const [mine, setMine] = useState<MineItem[]>([]);
  const [unread, setUnread] = useState(initialUnread);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const origin = useRef<Point | null>(null);
  const highlight = searchParams.get("feedback");

  function setDraft(mark: FeedbackMark | null) {
    draftRef.current = mark;
    setDraftState(mark);
  }

  const refreshPins = useCallback(async () => {
    const response = await fetch(`/api/feedback/pins?route=${encodeURIComponent(pathname)}`);
    if (!response.ok) return;
    const data = (await response.json()) as { pins: Pin[] };
    setPins(data.pins);
  }, [pathname]);

  useEffect(() => {
    const openTool = () => {
      setOpen(true);
      setPhase("draw");
      setError("");
    };
    window.addEventListener("bc-feedback-open", openTool);
    return () => window.removeEventListener("bc-feedback-open", openTool);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("bc-feedback-pins");
    if (stored === "off") queueMicrotask(() => setPinsOn(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/feedback/pins?route=${encodeURIComponent(pathname)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { pins: Pin[] } | null) => {
        if (!cancelled && data) setPins(data.pins);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    const update = () => setScroll({ x: window.scrollX, y: window.scrollY, w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    const lock = open && phase === "draw" && !scrollMode;
    const previous = document.body.style.overflow;
    if (lock) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open, phase, scrollMode]);

  useEffect(() => {
    if (!highlight) return;
    const pin = pins.find((item) => item.id === highlight);
    const anchor = pin?.marks[0] ? markAnchor(pin.marks[0]) : null;
    if (!anchor) return;
    window.scrollTo({ left: Math.max(0, anchor.x - window.innerWidth / 2), top: Math.max(0, anchor.y - window.innerHeight / 2) });
  }, [highlight, pins]);

  function togglePins() {
    setPinsOn((current) => {
      window.localStorage.setItem("bc-feedback-pins", current ? "off" : "on");
      return !current;
    });
  }

  async function openMine() {
    setMineOpen(true);
    const response = await fetch("/api/feedback/mine");
    if (!response.ok) return;
    const data = (await response.json()) as { items: MineItem[] };
    setMine(data.items);
    setUnread(data.items.filter((item) => item.unread).length);
  }

  function hitTarget(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (svg) svg.style.pointerEvents = "none";
    const el = document.elementFromPoint(clientX, clientY);
    if (svg && !scrollMode) svg.style.pointerEvents = "auto";
    if (!el || el.closest("[data-feedback-ui]")) return null;
    const text = el instanceof HTMLElement ? el.innerText || el.textContent || "" : el.textContent || "";
    return { selector: cssPath(el), text: clipElementText(text) };
  }

  function finishMark(mark: FeedbackMark, clientX: number, clientY: number) {
    setMarks((current) => [...current, mark]);
    const target = hitTarget(clientX, clientY);
    if (target) setTargets((current) => [...current, target]);
    setDraft(null);
    origin.current = null;
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (scrollMode || phase !== "draw") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pagePoint(event);
    origin.current = point;
    if (tool === "freehand") setDraft({ type: "freehand", points: [point] });
    else if (tool === "arrow") setDraft({ type: "arrow", x1: point.x, y1: point.y, x2: point.x, y2: point.y });
    else if (tool === "circle") setDraft({ type: "circle", x: point.x, y: point.y, r: 0 });
    else setDraft({ type: "box", x: point.x, y: point.y, w: 0, h: 0 });
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const current = draftRef.current;
    if (!origin.current || !current) return;
    const point = pagePoint(event);
    if (current.type === "freehand") setDraft({ type: "freehand", points: [...current.points, point] });
    else if (current.type === "arrow") setDraft({ ...current, x2: point.x, y2: point.y });
    else if (current.type === "circle") {
      const dx = point.x - origin.current.x;
      const dy = point.y - origin.current.y;
      setDraft({ type: "circle", x: origin.current.x, y: origin.current.y, r: Math.hypot(dx, dy) });
    } else setDraft({ type: "box", ...normalizeBox(origin.current, point) });
  }

  function onPointerUp(event: React.PointerEvent<SVGSVGElement>) {
    const current = draftRef.current;
    if (!origin.current || !current) return;
    const point = pagePoint(event);
    let mark = current;
    if (current.type === "box") mark = { type: "box", ...normalizeBox(origin.current, point) };
    if (current.type === "circle") {
      const radius = Math.hypot(point.x - origin.current.x, point.y - origin.current.y);
      mark = { type: "circle", x: origin.current.x, y: origin.current.y, r: radius < 8 ? 14 : radius };
    }
    if (current.type === "arrow") {
      const distance = Math.hypot(point.x - current.x1, point.y - current.y1);
      if (distance < 8) {
        setDraft(null);
        origin.current = null;
        return;
      }
      mark = { type: "arrow", x1: current.x1, y1: current.y1, x2: point.x, y2: point.y };
    }
    if (current.type === "freehand" && current.points.length < 2) {
      mark = { type: "box", x: point.x - 14, y: point.y - 14, w: 28, h: 28 };
    }
    finishMark(mark, event.clientX, event.clientY);
  }

  async function submit(formData: FormData) {
    setBusy(true);
    setError("");
    try {
      const screenshot = await captureViewport(marks);
      formData.set("screenshot", screenshot, "viewport.jpg");
      formData.set("url", window.location.href);
      formData.set("route", pathname);
      formData.set("width", String(window.innerWidth));
      formData.set("marks", JSON.stringify(marks));
      formData.set("targets", JSON.stringify(targets));
      formData.set("viewport", JSON.stringify({
        w: window.innerWidth,
        h: window.innerHeight,
        dpr: capturePixelRatio(window.devicePixelRatio || 1),
        scroll_x: window.scrollX,
        scroll_y: window.scrollY,
      }));
      formData.set("device", deviceType(window.innerWidth));
      const response = await fetch("/api/feedback", { method: "POST", body: formData });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save feedback.");
      setOpen(false);
      setMarks([]);
      setTargets([]);
      setPhase("draw");
      router.refresh();
      await refreshPins();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save feedback.");
    } finally {
      setBusy(false);
    }
  }

  const shownMarks = useMemo(() => (draft ? [...marks, draft] : marks), [marks, draft]);
  const pageNotes = pins.filter((pin) => pin.marks.length === 0);

  return (
    <>
      <div data-feedback-ui className={`fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2 ${mobileFloat ? "" : "hidden sm:flex"}`}>
        <button type="button" data-testid="feedback-button" className="inline-flex h-12 min-w-10 items-center gap-2 rounded-full bg-ink px-4 text-paper shadow-lg" onClick={() => { setOpen(true); setPhase("draw"); setError(""); }}>
          <span aria-hidden>✎</span>
          <span>Feedback</span>
          {unread > 0 ? <span className="rounded-full bg-clay px-1.5 text-xs">{unread}</span> : null}
        </button>
        <button type="button" className="inline-flex h-10 items-center rounded-full bg-white px-3 text-sm ring-1 ring-line" onClick={togglePins}>
          {pinsOn ? "Hide pins" : "Show pins"}
        </button>
        <button type="button" data-testid="feedback-mine" className="inline-flex h-10 items-center rounded-full bg-white px-3 text-sm ring-1 ring-line" onClick={() => void openMine()}>
          My feedback
        </button>
      </div>
      {pinsOn && !open
        ? pins.flatMap((pin) => {
            const anchor = pin.marks[0] ? markAnchor(pin.marks[0]) : null;
            if (!anchor) return [];
            const left = anchor.x - scroll.x;
            const top = anchor.y - scroll.y;
            if (left < -20 || top < -20 || left > scroll.w + 20 || top > scroll.h + 20) return [];
            return (
              <button
                key={pin.id}
                type="button"
                data-feedback-ui
                data-testid="feedback-pin"
                className={`fixed z-40 h-10 max-w-48 -translate-x-1/2 -translate-y-1/2 truncate rounded-full px-3 text-xs text-white ${highlight === pin.id ? "bg-moss ring-4 ring-clay" : "bg-clay"}`}
                style={{ left, top }}
                onClick={() => void openMine()}
              >
                {pin.title || pin.body}
              </button>
            );
          })
        : null}
      {pinsOn && !open && pageNotes.length ? (
        <button type="button" data-feedback-ui className="fixed bottom-24 left-4 z-40 h-10 rounded-full bg-clay px-3 text-xs text-white" onClick={() => void openMine()}>
          {pageNotes.length} page {pageNotes.length === 1 ? "note" : "notes"}
        </button>
      ) : null}
      {open ? (
        <div data-feedback-ui data-testid="feedback-overlay" className="fixed inset-0 z-50">
          {phase === "draw" ? (
            <>
              <svg
                ref={svgRef}
                className="absolute inset-0 h-full w-full"
                viewBox={`${scroll.x} ${scroll.y} ${scroll.w || 1} ${scroll.h || 1}`}
                style={{ touchAction: scrollMode ? "auto" : "none", pointerEvents: scrollMode ? "none" : "auto" }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                {shownMarks.map((mark, index) => <MarkShape key={index} mark={mark} />)}
              </svg>
              <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
                <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-3xl bg-ink/95 p-2 text-paper shadow-lg">
                  {TOOLS.map((item) => (
                    <button key={item.id} type="button" className={`h-10 min-w-10 rounded-full px-3 text-sm ${tool === item.id ? "bg-clay" : "bg-white/10"}`} onClick={() => { setTool(item.id); setScrollMode(false); }}>
                      {item.label}
                    </button>
                  ))}
                  <button type="button" aria-pressed={scrollMode} className={`h-10 rounded-full px-3 text-sm ${scrollMode ? "bg-moss" : "bg-white/10"}`} onClick={() => setScrollMode((value) => !value)}>
                    Scroll
                  </button>
                  <button type="button" className="h-10 rounded-full bg-white/10 px-3 text-sm" onClick={() => { setMarks((current) => current.slice(0, -1)); setTargets((current) => current.slice(0, -1)); }}>
                    Undo
                  </button>
                  <button type="button" className="h-10 rounded-full bg-white/10 px-3 text-sm" onClick={() => setOpen(false)}>
                    Close
                  </button>
                </div>
              </div>
              <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 p-3">
                <button type="button" className="h-10 rounded-full bg-white px-4 text-sm ring-1 ring-line" onClick={() => { setMarks([]); setTargets([]); setPhase("form"); }}>
                  Page note
                </button>
                <button type="button" className="h-10 rounded-full bg-clay px-4 text-sm text-white" onClick={() => setPhase("form")}>
                  Comment{marks.length ? ` (${marks.length})` : ""}
                </button>
              </div>
            </>
          ) : (
            <form
              data-testid="feedback-form"
              className="absolute inset-x-0 bottom-0 mx-auto max-h-[85vh] max-w-lg overflow-auto rounded-t-3xl bg-mist p-4 shadow-2xl ring-1 ring-line"
              onSubmit={(event) => {
                event.preventDefault();
                void submit(new FormData(event.currentTarget));
              }}
            >
              <h2 className="display text-3xl">Send feedback</h2>
              <label className="mt-3 block text-sm">
                Type
                <select name="type" defaultValue="bug" className="mt-1 h-10 w-full rounded-2xl border border-line bg-white px-3 text-[16px]">
                  {FEEDBACK_TYPES.map((type) => <option key={type} value={type}>{FEEDBACK_TYPE_LABELS[type]}</option>)}
                </select>
              </label>
              <label className="mt-3 block text-sm">
                Priority
                <select name="priority" defaultValue="normal" className="mt-1 h-10 w-full rounded-2xl border border-line bg-white px-3 text-[16px]">
                  {FEEDBACK_PRIORITIES.map((priority) => <option key={priority} value={priority}>{FEEDBACK_PRIORITY_LABELS[priority]}</option>)}
                </select>
              </label>
              <label className="mt-3 block text-sm">
                Title
                <input name="title" placeholder="Optional" className="mt-1 h-10 w-full rounded-2xl border border-line bg-white px-3 text-[16px]" />
              </label>
              <label className="mt-3 block text-sm">
                Comment
                <textarea name="body" required rows={4} className="mt-1 w-full rounded-2xl border border-line bg-white px-3 py-2 text-[16px]" />
              </label>
              {error ? <p className="mt-2 text-sm text-clay">{error}</p> : null}
              <div className="mt-3 flex gap-2">
                <button type="button" className="h-10 rounded-full bg-white px-4 text-sm ring-1 ring-line" onClick={() => setPhase("draw")}>Back</button>
                <button type="submit" disabled={busy} className="h-10 rounded-full bg-ink px-4 text-sm text-paper disabled:opacity-60">{busy ? "Sending…" : "Send"}</button>
              </div>
            </form>
          )}
        </div>
      ) : null}
      {mineOpen ? (
        <aside data-feedback-ui data-testid="feedback-mine-drawer" className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-auto bg-mist p-4 shadow-2xl ring-1 ring-line">
          <div className="flex items-center justify-between">
            <h2 className="display text-3xl">My feedback</h2>
            <button type="button" className="h-10 rounded-full bg-white px-3 text-sm ring-1 ring-line" onClick={() => setMineOpen(false)}>Close</button>
          </div>
          <ul className="mt-4 space-y-3">
            {mine.map((item) => (
              <li key={item.id} className="rounded-2xl bg-white p-3 text-sm ring-1 ring-line">
                <p className="font-medium">{item.title || item.body}</p>
                <p className="text-ink/60">{FEEDBACK_STATUS_LABELS[item.status as FeedbackStatus] ?? item.status} · {item.route}{item.unread ? " · unread" : ""}</p>
                {item.fixPrUrl ? <a className="text-clay underline" href={item.fixPrUrl}>Pull request</a> : null}
                <ul className="mt-2 space-y-1 text-ink/80">
                  {item.events.filter((event) => event.kind === "comment" || event.kind === "status").map((event) => (
                    <li key={event.id}><span className="text-ink/50">{event.actorName || "Note"}: </span>{event.body}</li>
                  ))}
                </ul>
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const body = String(new FormData(form).get("body") ?? "");
                    await fetch(`/api/feedback/${item.id}/replies`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }) });
                    await fetch(`/api/feedback/${item.id}/read`, { method: "POST" });
                    form.reset();
                    await openMine();
                    router.refresh();
                  }}
                >
                  <input name="body" required placeholder="Reply" className="h-10 min-w-0 flex-1 rounded-2xl border border-line px-3 text-[16px]" />
                  <button className="h-10 rounded-full bg-ink px-3 text-paper">Reply</button>
                </form>
              </li>
            ))}
            {mine.length === 0 ? <li className="text-sm text-ink/60">No notes yet.</li> : null}
          </ul>
        </aside>
      ) : null}
    </>
  );
}

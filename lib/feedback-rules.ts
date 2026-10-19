import type { FeedbackMark, FeedbackTarget, FeedbackViewport } from "@/lib/db/schema";

export const FEEDBACK_TYPES = ["bug", "copy", "design", "feature", "other"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  bug: "Bug",
  copy: "Copy or text edit",
  design: "Design",
  feature: "Feature idea",
  other: "Other",
};

export const FEEDBACK_PRIORITIES = ["low", "normal", "high"] as const;
export type FeedbackPriority = (typeof FEEDBACK_PRIORITIES)[number];

export const FEEDBACK_PRIORITY_LABELS: Record<FeedbackPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
};

export const FEEDBACK_STATUSES = [
  "pending_review",
  "approved",
  "queued",
  "rejected",
  "needs_info",
  "in_progress",
  "fixed",
  "deployed",
  "wont_fix",
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  pending_review: "Pending review",
  approved: "Approved",
  queued: "Queued",
  rejected: "Rejected",
  needs_info: "Needs info",
  in_progress: "In progress",
  fixed: "Fixed",
  deployed: "Deployed",
  wont_fix: "Won't fix",
};

/** Statuses the fix loop may set through the callback. Approval and rejection stay with an admin. */
export const FIXER_STATUSES = ["queued", "in_progress", "needs_info", "fixed", "deployed", "wont_fix"] as const;
export type FixerStatus = (typeof FIXER_STATUSES)[number];

export const AUTHOR_NOTIFY_STATUSES = ["approved", "rejected", "fixed", "deployed"] as const;

export const OPEN_PIN_STATUSES: FeedbackStatus[] = ["pending_review", "approved", "queued", "needs_info", "in_progress", "fixed"];

export const MAX_SCREENSHOT_BYTES = 12 * 1024 * 1024;
export const MAX_CAPTURE_DPR = 1.5;
export const MAX_ELEMENT_TEXT = 160;

const SENSITIVE_ROUTES = [
  /\/billing(?:\/|$)/i,
  /\/checkout(?:\/|$)/i,
  /\/payouts?(?:\/|$)/i,
  /stripe/i,
  /\/login(?:\/|$)/i,
  /\/signup(?:\/|$)/i,
  /\/forgot(?:\/|$)/i,
  /\/reset(?:\/|$)/i,
  /\/api\/auth(?:\/|$)/i,
  /\/admin\/users(?:\/|$)/i,
  /\/admin\/settings(?:\/|$)/i,
  /\/admin\/promos(?:\/|$)/i,
  /\/teach\/promos(?:\/|$)/i,
  /\/roles(?:\/|$)/i,
  /permission/i,
];

const SENSITIVE_TEXT = [
  /\bbilling\b/i,
  /\bcheckout\b/i,
  /\bstripe\b/i,
  /\bpayouts?\b/i,
  /\bpassword\b/i,
  /\bpermissions?\b/i,
  /\broles?\b/i,
  /\bpromo funding\b/i,
  /\bplatform fee\b/i,
  /\badmin settings\b/i,
  /\bauthentication\b/i,
  /\bauthorization\b/i,
];

export function feedbackRole(roles: readonly string[]): "admin" | "account_manager" | null {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("account_manager")) return "account_manager";
  return null;
}

export function initialFeedbackStatus(role: "admin" | "account_manager"): "approved" | "pending_review" {
  return role === "admin" ? "approved" : "pending_review";
}

export function shouldDispatch(status: string) {
  return status === "approved";
}

export function isFeedbackStatus(value: string): value is FeedbackStatus {
  return (FEEDBACK_STATUSES as readonly string[]).includes(value);
}

export function isFixerStatus(value: string): value is FixerStatus {
  return (FIXER_STATUSES as readonly string[]).includes(value);
}

export function isFeedbackType(value: string): value is FeedbackType {
  return (FEEDBACK_TYPES as readonly string[]).includes(value);
}

export function isFeedbackPriority(value: string): value is FeedbackPriority {
  return (FEEDBACK_PRIORITIES as readonly string[]).includes(value);
}

export function notifiesAuthor(status: string) {
  return (AUTHOR_NOTIFY_STATUSES as readonly string[]).includes(status);
}

export function capturePixelRatio(devicePixelRatio: number) {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) return 1;
  return Math.min(devicePixelRatio, MAX_CAPTURE_DPR);
}

export function deviceType(width: number): "phone" | "tablet" | "desktop" {
  if (width < 640) return "phone";
  if (width < 1024) return "tablet";
  return "desktop";
}

export function clipElementText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_ELEMENT_TEXT);
}

export function isSensitiveFeedback(input: { route?: string | null; title?: string | null; body?: string | null; targets?: FeedbackTarget[] | null }) {
  const route = input.route ?? "";
  if (SENSITIVE_ROUTES.some((pattern) => pattern.test(route))) return true;
  const blobs = [input.title ?? "", input.body ?? "", ...(input.targets ?? []).flatMap((target) => [target.selector, target.text])];
  return blobs.some((blob) => SENSITIVE_ROUTES.some((pattern) => pattern.test(blob)) || SENSITIVE_TEXT.some((pattern) => pattern.test(blob)));
}

export function markAnchor(mark: FeedbackMark): { x: number; y: number } {
  if (mark.type === "box") return { x: mark.x + mark.w / 2, y: mark.y + mark.h / 2 };
  if (mark.type === "circle") return { x: mark.x, y: mark.y };
  if (mark.type === "arrow") return { x: (mark.x1 + mark.x2) / 2, y: (mark.y1 + mark.y2) / 2 };
  const mid = mark.points[Math.floor(mark.points.length / 2)] ?? mark.points[0];
  return mid ?? { x: 0, y: 0 };
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseMarks(value: unknown): FeedbackMark[] {
  if (!Array.isArray(value)) return [];
  const marks: FeedbackMark[] = [];
  for (const raw of value.slice(0, 30)) {
    if (!raw || typeof raw !== "object") continue;
    const mark = raw as Record<string, unknown>;
    if (mark.type === "box") {
      const x = num(mark.x);
      const y = num(mark.y);
      const w = num(mark.w);
      const h = num(mark.h);
      if (x === null || y === null || w === null || h === null) continue;
      marks.push({ type: "box", x, y, w, h });
    } else if (mark.type === "circle") {
      const x = num(mark.x);
      const y = num(mark.y);
      const r = num(mark.r);
      if (x === null || y === null || r === null) continue;
      marks.push({ type: "circle", x, y, r });
    } else if (mark.type === "arrow") {
      const x1 = num(mark.x1);
      const y1 = num(mark.y1);
      const x2 = num(mark.x2);
      const y2 = num(mark.y2);
      if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
      marks.push({ type: "arrow", x1, y1, x2, y2 });
    } else if (mark.type === "freehand" && Array.isArray(mark.points)) {
      const points = mark.points
        .slice(0, 400)
        .map((point) => {
          if (!point || typeof point !== "object") return null;
          const row = point as Record<string, unknown>;
          const x = num(row.x);
          const y = num(row.y);
          return x === null || y === null ? null : { x, y };
        })
        .filter((point): point is { x: number; y: number } => point !== null);
      if (points.length) marks.push({ type: "freehand", points });
    }
  }
  return marks;
}

export function parseTargets(value: unknown): FeedbackTarget[] {
  if (!Array.isArray(value)) return [];
  const targets: FeedbackTarget[] = [];
  for (const raw of value.slice(0, 30)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const selector = typeof row.selector === "string" ? row.selector.slice(0, 1000) : "";
    const text = clipElementText(typeof row.text === "string" ? row.text : "");
    if (!selector && !text) continue;
    targets.push({ selector, text });
  }
  return targets;
}

export function parseViewport(value: unknown): FeedbackViewport | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const w = num(row.w);
  const h = num(row.h);
  const dpr = num(row.dpr);
  const scrollX = num(row.scroll_x);
  const scrollY = num(row.scroll_y);
  if (w === null || h === null || dpr === null || scrollX === null || scrollY === null) return null;
  return { w, h, dpr: Math.min(dpr, MAX_CAPTURE_DPR), scroll_x: scrollX, scroll_y: scrollY };
}

export type FeedbackItemPayload = {
  id: string;
  title: string | null;
  body: string;
  type: string;
  priority: string;
  status: string;
  sensitive: boolean;
  url: string;
  route: string;
  selector: string | null;
  element_text: string | null;
  targets: FeedbackTarget[];
  marks: FeedbackMark[];
  viewport: FeedbackViewport;
  device: string;
  screenshot_url: string | null;
  author: { id: string; name: string; email: string; role: string };
  approved_by: string | null;
  approved_at: string | null;
  fix_pr_url: string | null;
  fix_notes: string | null;
  created_at: string;
  comments: { at: string; author: string; body: string }[];
};

export type FeedbackApprovedPayload = {
  event: "feedback.approved";
  sent_at: string;
  item: FeedbackItemPayload;
};

export function buildApprovedPayload(item: FeedbackItemPayload, sentAt: string): FeedbackApprovedPayload {
  return { event: "feedback.approved", sent_at: sentAt, item };
}

export function pinPath(url: string, id: string) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("feedback", id);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    const join = url.includes("?") ? "&" : "?";
    return `${url}${join}feedback=${encodeURIComponent(id)}`;
  }
}

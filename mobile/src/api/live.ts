import { paymentSheetForPlatform } from "../../../lib/mobile-client";
import { paths } from "./paths";
import { ApiError, type PlatformName, type StudentApi } from "./types";

type LiveOptions = {
  baseUrl: string;
  getToken: () => string | null;
  getPlatform?: () => PlatformName;
  fetchImpl?: typeof fetch;
};

export function createLiveApi(options: LiveOptions): StudentApi {
  const base = options.baseUrl.replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Platform": options.getPlatform?.() ?? "web",
    };
    const token = options.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetchImpl(`${base}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as { error?: unknown }) : {};
    if (!response.ok) {
      const message = typeof payload.error === "string" ? payload.error : "Something went wrong.";
      throw new ApiError(response.status, message);
    }
    return payload as T;
  }

  function query<T>(path: string, params: Record<string, string | undefined>): Promise<T> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    const qs = search.toString();
    return request<T>(qs ? `${path}?${qs}` : path);
  }

  return {
    mode: "live",
    signIn: (input) => request(paths.signIn, { method: "POST", body: input }),
    signUp: (input) => request(paths.signUp, { method: "POST", body: input }),
    signInSocial: (input) => request(paths.social, { method: "POST", body: input }),
    requestPasswordReset: (email) => request(paths.passwordRequest, { method: "POST", body: { email } }),
    confirmPasswordReset: (input) => request(paths.passwordConfirm, { method: "POST", body: input }),
    requestEmailVerification: (email) => request(paths.emailRequest, { method: "POST", body: { email } }),
    confirmEmailVerification: (token) => request(paths.emailConfirm, { method: "POST", body: { token } }),
    signOut: () => request(paths.signOut, { method: "POST", body: {} }),
    deleteAccount: (input) => request(paths.deleteMe, { method: "DELETE", body: input }),
    me: () => request(paths.me),
    explore: (q = {}) => query(paths.explore, { q: q.q, category: q.category, vertical: q.vertical, level: q.level, format: q.format }),
    search: (q = {}) => query(paths.search, { q: q.q, vertical: q.vertical }),
    classDetail: (slug) => request(paths.class(slug)),
    slots: (slug) => request(`${paths.slots}?slug=${encodeURIComponent(slug)}`),
    teacher: (slug) => request(paths.teacher(slug)),
    book: (input) => request(paths.bookings, { method: "POST", body: { ...input, paymentSheet: paymentSheetForPlatform(options.getPlatform?.(), input.paymentSheet) } }),
    cancelBooking: (id) => request(paths.bookingCancel(id), { method: "POST", body: {} }),
    rescheduleBooking: (id, sessionId) => request(paths.bookingReschedule(id), { method: "POST", body: { sessionId } }),
    bookings: () => request(paths.bookings),
    wallet: () => request(paths.wallet),
    purchasePack: (input) => request(paths.purchasePack, { method: "POST", body: { ...input, paymentSheet: paymentSheetForPlatform(options.getPlatform?.(), input.paymentSheet) } }),
    purchaseMembership: (input) => request(paths.purchaseMembership, { method: "POST", body: input }),
    waiver: (slug) => request(paths.waiver(slug)),
    signWaiver: (slug, signedName) => request(paths.signWaiver(slug), { method: "POST", body: { signedName } }),
    notifications: () => request(paths.notifications),
    markNotificationsRead: (id) => request(paths.notificationsRead, { method: "POST", body: id ? { id } : {} }),
    preferences: () => request(paths.preferences),
    updatePreferences: (body) => request(paths.preferences, { method: "PUT", body }),
    registerPushToken: (input) => request(paths.pushTokens, { method: "POST", body: { provider: "expo", ...input } }),
    unregisterPushToken: (token) => request(paths.pushTokens, { method: "DELETE", body: { token } }),
    help: () => request(paths.help),
    helpArticle: (slug) => request(paths.helpArticle(slug)),
    tickets: () => request(paths.tickets),
    createTicket: (input) => request(paths.tickets, { method: "POST", body: input }),
    track: (input) => request(paths.track, { method: "POST", body: { ...input, properties: stringifyProps(input.properties) } }),
    experiment: (key, subject) => request(subject ? `${paths.experiment(key)}?subject=${encodeURIComponent(subject)}` : paths.experiment(key)),
  };
}

function stringifyProps(properties: Record<string, string> | undefined) {
  if (!properties) return undefined;
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(properties)) next[key] = String(value);
  return next;
}

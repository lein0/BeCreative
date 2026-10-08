import { paths } from "./paths";
import { ApiError, type StudentApi, type TrackEvent } from "./types";

type LiveOptions = {
  baseUrl: string;
  getToken: () => string | null;
  fetchImpl?: typeof fetch;
};

export function createLiveApi(options: LiveOptions): StudentApi {
  const base = options.baseUrl.replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request<T>(path: string, init: { method?: string; body?: unknown; idempotencyKey?: string; auth?: boolean } = {}): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-BeCreative-Client": "mobile",
    };
    if (init.auth !== false) {
      const token = options.getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
    const response = await fetchImpl(`${base}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as { error?: { code?: string; message?: string } }) : {};
    if (!response.ok) {
      throw new ApiError(response.status, payload.error?.code ?? "request_failed", payload.error?.message ?? "Something went wrong.");
    }
    return payload as T;
  }

  return {
    mode: "live",
    catalog: () => request(paths.catalog),
    explore: (query = {}) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === "") continue;
        params.set(key, String(value));
      }
      const qs = params.toString();
      return request(qs ? `${paths.explore}?${qs}` : paths.explore);
    },
    classDetail: (slug) => request(paths.class(slug)),
    teacher: (slug) => request(paths.teacher(slug)),
    quote: (input) => request(paths.quote, { method: "POST", body: input }),
    createBooking: (input, idempotencyKey) => request(paths.bookings, { method: "POST", body: input, idempotencyKey }),
    confirmPayment: (orderId, paymentIntentId) => request(paths.orderConfirm(orderId), { method: "POST", body: { paymentIntentId } }),
    getOrder: (orderId) => request(paths.order(orderId)),
    cancelBooking: (id) => request(paths.bookingCancel(id), { method: "POST", body: {} }),
    rescheduleBooking: (id, target) => request(paths.bookingReschedule(id), { method: "POST", body: target }),
    bookings: () => request(paths.bookings),
    booking: (id) => request(paths.booking(id)),
    wallet: () => request(paths.wallet),
    signup: (input) => request(paths.signup, { method: "POST", body: input, auth: false }),
    login: (input) => request(paths.login, { method: "POST", body: input, auth: false }),
    loginWithGoogle: (input) => request(paths.google, { method: "POST", body: input, auth: false }),
    loginWithApple: (input) => request(paths.apple, { method: "POST", body: input, auth: false }),
    verifyEmail: (input) => request(paths.verify, { method: "POST", body: input, auth: false }),
    resendVerification: (email) => request(paths.resend, { method: "POST", body: { email }, auth: false }),
    forgotPassword: (email) => request(paths.forgot, { method: "POST", body: { email }, auth: false }),
    resetPassword: (input) => request(paths.reset, { method: "POST", body: input, auth: false }),
    logout: () => request(paths.logout, { method: "POST", body: {} }),
    me: () => request(paths.me),
    updateMe: (patch) => request(paths.me, { method: "PATCH", body: patch }),
    deleteMe: (confirm) => request(paths.me, { method: "DELETE", body: { confirm } }),
    registerPushToken: (input) => request(paths.pushTokens, { method: "POST", body: input }),
    unregisterPushToken: (token) => request(paths.pushTokens, { method: "DELETE", body: { token } }),
    notifications: () => request(paths.notifications),
    markNotificationRead: (id) => request(paths.notification(id), { method: "POST", body: {} }),
    notificationPreferences: () => request(paths.notificationPreferences),
    updateNotificationPreferences: (patch) => request(paths.notificationPreferences, { method: "PATCH", body: patch }),
    faq: () => request(paths.faq),
    helpActions: (bookingId) => request(paths.bookingHelp(bookingId)),
    tickets: () => request(paths.tickets),
    createTicket: (input) => request(paths.tickets, { method: "POST", body: input }),
    track: (event: TrackEvent) => request(paths.track, { method: "POST", body: event, auth: true }),
    experiments: () => request(paths.experiments),
  };
}

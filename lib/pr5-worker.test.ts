import { beforeEach, describe, expect, it, vi } from "vitest";

const box = vi.hoisted(() => ({
  claimed: [] as { id: string; kind: string; payload: Record<string, unknown>; attempts: number }[],
  finish: vi.fn(async () => undefined),
  requeue: vi.fn(async () => undefined),
  submit: vi.fn(async (): Promise<{ ok: boolean; waiting?: boolean; retry?: boolean; error?: string; runAt?: Date }> => ({ ok: true })),
}));

vi.mock("@/lib/jobs", () => ({
  claimJobs: async () => box.claimed,
  finishJob: box.finish,
  requeueJob: box.requeue,
  enqueueJob: vi.fn(),
}));
vi.mock("@/lib/disputes", () => ({
  submitDispute: () => box.submit(),
}));
vi.mock("@/lib/notifications", () => ({
  deliverOutbox: vi.fn(),
  emitNotification: vi.fn(),
}));
vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(async () => ({ skipped: true })),
}));

const { workJobs } = await import("@/lib/worker");
const { captureException } = await import("@/lib/sentry");

function claim(attempts: number) {
  box.claimed = [{ id: "job-1", kind: "dispute.submit", payload: { disputeId: "dp_1" }, attempts }];
}

describe("dispute submit worker", () => {
  beforeEach(() => {
    box.claimed = [];
    box.finish.mockClear();
    box.requeue.mockClear();
    box.submit.mockReset();
    vi.mocked(captureException).mockClear();
  });

  it("requeues a submit that is still waiting", async () => {
    const runAt = new Date("2026-10-18T00:00:00Z");
    claim(1);
    box.submit.mockResolvedValue({ ok: true, waiting: true, runAt });
    await workJobs();
    expect(box.requeue).toHaveBeenCalledWith("job-1", runAt);
    expect(box.finish).not.toHaveBeenCalled();
  });

  it("retries when Stripe is unset and stops after the attempt cap", async () => {
    claim(1);
    box.submit.mockResolvedValue({ ok: false, retry: true, error: "Stripe is not configured", runAt: new Date("2026-10-01T00:15:00Z") });
    await workJobs();
    expect(box.requeue).toHaveBeenCalledWith("job-1", new Date("2026-10-01T00:15:00Z"), "Stripe is not configured");
    expect(box.finish).not.toHaveBeenCalled();

    box.requeue.mockClear();
    claim(5);
    await workJobs();
    expect(box.finish).toHaveBeenCalledWith("job-1", "Stripe is not configured");
    expect(box.requeue).not.toHaveBeenCalled();
  });

  it("requeues a thrown Stripe error instead of failing the job once", async () => {
    claim(1);
    box.submit.mockRejectedValue(new Error("stripe down"));
    await workJobs();
    expect(box.requeue).toHaveBeenCalledWith("job-1", expect.any(Date), "stripe down");
    expect(box.finish).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalled();
  });
});

const TEACHER_CATEGORIES = new Set(["class", "booking", "pass"]);

export function routeTicket(input: { category: string; createdAt: Date; now: Date; slaHours: number; teacherReplied: boolean }) {
  if (input.category === "payment" || input.category === "safety") {
    return { owner: "admin" as const, escalate: true, reason: "payment_or_safety" };
  }
  if (!TEACHER_CATEGORIES.has(input.category)) {
    return { owner: "admin" as const, escalate: true, reason: "account" };
  }
  const overdue = input.now.getTime() - input.createdAt.getTime() >= input.slaHours * 3_600_000;
  if (!input.teacherReplied && overdue) return { owner: "admin" as const, escalate: true, reason: "sla" };
  return { owner: "teacher" as const, escalate: false, reason: "class" };
}

export function slaDue(createdAt: Date, hours: number) {
  return new Date(createdAt.getTime() + hours * 3_600_000);
}

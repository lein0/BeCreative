export type EvidencePacket = {
  customerName: string;
  customerEmail: string;
  productDescription: string;
  sessionWhen: string;
  policyText: string;
  acceptedAt: string | null;
  acceptedIp: string | null;
  policyVersion: number | null;
  checkedIn: boolean;
  waiverSigned: string | null;
  messages: string;
  emailsSent: string;
  serviceNotes: string;
  priorBookings: string;
  refundExplanation: string;
};

export function normalizeDisputeReason(reason: string) {
  const known = ["fraudulent", "product_not_received", "duplicate", "subscription_canceled", "credit_not_processed", "general"] as const;
  return known.find((item) => item === reason) ?? "general";
}

export function evidenceForReason(reason: string, packet: EvidencePacket): Record<string, string> {
  const policy = `${packet.policyText} Accepted ${packet.acceptedAt ?? "not recorded"} from ${packet.acceptedIp ?? "unknown IP"}, policy version ${packet.policyVersion ?? "n/a"}.`;
  const activity = `Session ${packet.sessionWhen}. Check-in: ${packet.checkedIn ? "yes" : "no"}. Waiver: ${packet.waiverSigned ?? "none"}. Emails: ${packet.emailsSent}. Prior bookings: ${packet.priorBookings}.`;
  const shared = {
    customer_name: packet.customerName,
    customer_email_address: packet.customerEmail,
    product_description: packet.productDescription,
    customer_communication: packet.messages || packet.emailsSent || "No messages on file.",
    service_date: packet.sessionWhen,
    service_documentation: packet.serviceNotes,
    uncategorized_text: activity,
  };
  switch (normalizeDisputeReason(reason)) {
    case "fraudulent":
      return { ...shared, customer_signature: packet.waiverSigned ?? "No waiver signature.", access_activity_log: activity, refund_policy: policy, customer_purchase_ip: packet.acceptedIp ?? "" };
    case "product_not_received":
      return { ...shared, access_activity_log: activity, service_documentation: `${packet.serviceNotes} ${activity}` };
    case "duplicate":
      return { ...shared, duplicate_charge_explanation: packet.refundExplanation || "This customer has one charge for this booking.", refund_policy: policy };
    case "subscription_canceled":
      return { ...shared, cancellation_policy: policy, cancellation_rebuttal: packet.refundExplanation || "The pass was active on the service date." };
    case "credit_not_processed":
      return { ...shared, refund_policy: policy, refund_refusal_explanation: `${packet.refundExplanation} Refunds follow the window the customer accepted at checkout.`.trim() };
    default:
      return { ...shared, refund_policy: policy };
  }
}

export function shouldAutoSubmit(input: { autoSubmit: boolean; held: boolean; attendanceConfirmed: boolean; dueBy: Date | null; now: Date; leadHours: number }) {
  if (!input.autoSubmit || input.held) return false;
  if (input.attendanceConfirmed) return true;
  if (!input.dueBy) return false;
  return input.dueBy.getTime() - input.now.getTime() <= input.leadHours * 3_600_000;
}

export function earlyFraudDecision(input: { amountCents: number; classStarted: boolean; thresholdCents: number }) {
  if (!input.classStarted && input.amountCents <= input.thresholdCents) return "refund" as const;
  return "flag" as const;
}

export function disputeLiability(input: { amountCents: number; feeCents: number; amountBearer: string; feeBearer: string }) {
  return {
    teacherAmountCents: input.amountBearer === "teacher" ? input.amountCents : 0,
    platformAmountCents: input.amountBearer === "platform" ? input.amountCents : 0,
    teacherFeeCents: input.feeBearer === "teacher" ? input.feeCents : 0,
    platformFeeCents: input.feeBearer === "platform" ? input.feeCents : 0,
  };
}

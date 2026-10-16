function subscriptionId(value: unknown) {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string" && value.id) return value.id;
  return null;
}

/** Basil invoices nest the id. Older webhook payloads still send invoice.subscription. */
export function invoiceSubscriptionId(invoice: {
  subscription?: unknown;
  parent?: { subscription_details?: { subscription?: unknown } | null } | null;
}) {
  return subscriptionId(invoice.subscription) ?? subscriptionId(invoice.parent?.subscription_details?.subscription);
}

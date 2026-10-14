function subscriptionId(value: unknown) {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string" && value.id) return value.id;
  return null;
}

/** Open invoices are the ones Stripe Smart Retry can still charge. Paid, draft, and void invoices are left alone. */
export function openInvoicesToVoid(invoices: { id: string; status?: string | null }[]) {
  return invoices.filter((invoice) => invoice.id && invoice.status === "open").map((invoice) => invoice.id);
}

/** Basil invoices nest the id. Older webhook payloads still send invoice.subscription. */
export function invoiceSubscriptionId(invoice: {
  subscription?: unknown;
  parent?: { subscription_details?: { subscription?: unknown } | null } | null;
}) {
  return subscriptionId(invoice.subscription) ?? subscriptionId(invoice.parent?.subscription_details?.subscription);
}

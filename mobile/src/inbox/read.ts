export function markNotificationRead<T extends { id: string; readAt: string | null }>(items: T[], id: string, readAt: string): T[] {
  return items.map((item) => (item.id === id && !item.readAt ? { ...item, readAt } : item));
}

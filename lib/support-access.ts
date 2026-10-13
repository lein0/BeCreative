export type TicketAccess = {
  isAdmin: boolean;
  isTicketTeacher: boolean;
  isOwner: boolean;
  resolved: boolean;
};

export function ticketCommandAllowed(access: TicketAccess, command: string, internal = false) {
  if (command === "assign" || command === "merge" || command === "canned") return access.isAdmin;
  if (command === "resolve") return access.isAdmin || access.isTicketTeacher;
  if (command === "csat") return access.resolved && (access.isOwner || access.isAdmin);
  if (command !== "reply" && command !== "") return false;
  if (internal) return access.isAdmin;
  return access.isAdmin || access.isTicketTeacher || access.isOwner;
}

export function canAddDisputeNote(input: { isAdmin: boolean; actorTeacherId: string | null; disputeTeacherId: string | null }) {
  if (input.isAdmin) return true;
  return Boolean(input.actorTeacherId && input.disputeTeacherId && input.actorTeacherId === input.disputeTeacherId);
}

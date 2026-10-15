import type { Role } from "@/lib/constants";

export function hasRole(roles: Role[], role: Role): boolean {
  return roles.includes(role);
}

export function canViewPlatformStats(roles: Role[]): boolean {
  return hasRole(roles, "admin");
}

export function canManageRoles(roles: Role[]): boolean {
  return hasRole(roles, "admin");
}

export function canApproveTeachers(roles: Role[]): boolean {
  return hasRole(roles, "admin");
}

export function canViewPlatformFinances(roles: Role[]): boolean {
  return hasRole(roles, "admin");
}

export function canManagePlatformPromos(roles: Role[]): boolean {
  return hasRole(roles, "admin");
}

export function canManageLeads(roles: Role[]): boolean {
  return hasRole(roles, "admin") || hasRole(roles, "account_manager");
}

export function canUseFeedback(roles: Role[]): boolean {
  return hasRole(roles, "admin") || hasRole(roles, "account_manager");
}

export function canReviewFeedback(roles: Role[]): boolean {
  return hasRole(roles, "admin");
}

export function canEditTeacherContent(roles: Role[], isOwnTeacherProfile: boolean): boolean {
  if (hasRole(roles, "admin") || hasRole(roles, "account_manager")) return true;
  return hasRole(roles, "teacher") && isOwnTeacherProfile;
}

/** Staff who open Studio without their own teacher row belong in the manage console, not teacher onboarding. */
export function studioEntryPath(roles: Role[], hasStudio: boolean) {
  if (hasStudio) return null;
  if (hasRole(roles, "admin") || hasRole(roles, "account_manager")) return "/manage";
  return "/teach/onboarding";
}

export function canViewTeacherBilling(roles: Role[], isOwnTeacherProfile: boolean): boolean {
  return canEditTeacherContent(roles, isOwnTeacherProfile);
}

export function canBook(roles: Role[]): boolean {
  return roles.length > 0;
}

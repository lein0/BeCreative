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

export function canEditTeacherContent(roles: Role[], isOwnTeacherProfile: boolean): boolean {
  if (hasRole(roles, "admin") || hasRole(roles, "account_manager")) return true;
  return hasRole(roles, "teacher") && isOwnTeacherProfile;
}

export function canViewTeacherBilling(roles: Role[], isOwnTeacherProfile: boolean): boolean {
  return canEditTeacherContent(roles, isOwnTeacherProfile);
}

export function canBook(roles: Role[]): boolean {
  return roles.length > 0;
}

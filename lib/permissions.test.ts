import { describe, expect, it } from "vitest";
import {
  canApproveTeachers,
  canEditTeacherContent,
  canManageLeads,
  canManageRoles,
  canViewPlatformFinances,
  canViewPlatformStats,
} from "@/lib/permissions";

describe("roles", () => {
  it("keeps platform stats, finances, and role management to admins", () => {
    expect(canViewPlatformStats(["admin"])).toBe(true);
    expect(canViewPlatformStats(["account_manager"])).toBe(false);
    expect(canViewPlatformFinances(["account_manager", "teacher"])).toBe(false);
    expect(canManageRoles(["admin"])).toBe(true);
    expect(canManageRoles(["account_manager"])).toBe(false);
    expect(canApproveTeachers(["teacher"])).toBe(false);
  });

  it("lets account managers edit any teacher and lets a teacher edit only their own", () => {
    expect(canEditTeacherContent(["account_manager"], false)).toBe(true);
    expect(canEditTeacherContent(["admin"], false)).toBe(true);
    expect(canEditTeacherContent(["teacher", "student"], true)).toBe(true);
    expect(canEditTeacherContent(["teacher"], false)).toBe(false);
    expect(canEditTeacherContent(["student"], false)).toBe(false);
  });

  it("opens the lead tracker to admins and account managers", () => {
    expect(canManageLeads(["admin"])).toBe(true);
    expect(canManageLeads(["account_manager"])).toBe(true);
    expect(canManageLeads(["teacher", "student"])).toBe(false);
  });
});

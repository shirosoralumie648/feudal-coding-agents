/**
 * Governance types and schemas.
 *
 * This module contains types for:
 * - Rule engine DSL for conditional approval rules (GOV-01)
 * - RBAC (Role-Based Access Control) with role hierarchy
 * - Permission checking and authorization
 * - Role assignments with time-bound access support
 * - Auto-approval rules based on complexity scoring (GOV-04)
 */
export * from "./auto-approval";
export * from "./rbac";
export * from "./rule-engine";

# UI Consistency Checklist

This document ensures UI invariants are maintained across all screens and changes.

## Global Invariants

### ✅ Sidebar Menu Order & Icons
- [ ] Dashboard (`dashboard`)
- [ ] Projects (`folder_open`) 
- [ ] Workflows (`account_tree`)
- [ ] History (`history`)
- [ ] Settings (`settings`)

### ✅ Header Structure
- [ ] Left side: Breadcrumbs (except Dashboard)
- [ ] Right side: Status indicators → Cost badge → Notifications → Primary action
- [ ] Consistent height (64px) and styling
- [ ] Sticky positioning with backdrop blur

### ✅ Icon System
- [ ] Material Symbols Outlined exclusively
- [ ] Consistent sizing across components
- [ ] Consistent fill/stroke usage

### ✅ Design Tokens
- [ ] Spacing: Use TOKENS.spacing values
- [ ] Colors: Use TOKENS.colors values  
- [ ] Typography: Use TOKENS.typography values
- [ ] Border radius: Use TOKENS.borderRadius values

## Layout Shell Requirements

### ✅ Single Layout Implementation
- [ ] All screens use `MainLayout` component
- [ ] No per-screen layout variants
- [ ] Consistent structure: Sidebar + Header + Main content
- [ ] Responsive behavior preserved

### ✅ Sidebar Collapse
- [ ] Toggle button in brand area
- [ ] Smooth CSS transition (300ms, respects prefers-reduced-motion)
- [ ] State preserved across navigation
- [ ] Icons remain visible when collapsed

## No Dead UI Policy

### ✅ Interactive Elements
- [ ] Every clickable element either:
  - [ ] Works end-to-end with proper functionality, OR
  - [ ] Is explicitly disabled with visible explanation
- [ ] No placeholder buttons without behavior
- [ ] No fake dropdowns or menus

### ✅ Navigation Routes
- [ ] All routes in constants.ts have corresponding screens
- [ ] "Coming soon" screens show clear disabled state
- [ ] 404 handling for unknown routes

### ✅ Button States
- [ ] Primary actions: Full functionality
- [ ] Secondary actions: Either functional or disabled with explanation
- [ ] Icon buttons: Consistent hover states
- [ ] Disabled buttons: Visual feedback + tooltip/explanation

## Screen-Specific Consistency

### ✅ Dashboard
- [ ] Stats grid: 4 columns on xl screens
- [ ] Projects table with consistent styling
- [ ] Live logs terminal with proper styling
- [ ] Quick actions with proper disabled states

### ✅ Settings
- [ ] Tab navigation with active state
- [ ] Form controls use consistent styling
- [ ] Toggle switches follow design system
- [ ] Save bar fixed positioning

### ✅ Placeholder Screens
- [ ] Consistent "Not available yet" messaging
- [ ] Disabled buttons with proper styling
- [ ] Icon representation of screen purpose

## Quality Gates

### ✅ Before Any UI Change
- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm build` succeeds
- [ ] Visual regression check (if applicable)

### ✅ After Any UI Change
- [ ] All navigation routes work
- [ ] No console errors
- [ ] Responsive design verified
- [ ] Accessibility check (keyboard navigation)
- [ ] This checklist updated

## Implementation Notes

- Changes to global invariants require updating this checklist first
- New screens must follow existing patterns exactly
- Icon additions must be Material Symbols Outlined
- Color additions must go through TOKENS system
- Spacing changes must use TOKENS.spacing values
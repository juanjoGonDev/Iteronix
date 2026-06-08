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
- [ ] Page-level chrome comes from shared components, not screen-local wrappers
- [ ] `PageFrame` defines the top-level content container and spacing rhythm
- [ ] `PageIntro` defines the screen title and introductory copy
- [ ] `PageNoticeStack` owns transient success and error messaging
- [ ] `PageTabs` owns tab underline styling and sticky tab rows when a screen needs tabs
- [ ] `Projects`, `Workflows`, `History`, `Dashboard` and `Settings` use shared page scaffolding instead of local page wrappers
- [ ] Full-height workbench screens that intentionally do not use `PageFrame` still reuse shared notice chrome

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
- [ ] No screen-local page wrapper or ad hoc tab chrome outside the shared page scaffold

### ✅ Kanban
- [ ] Board columns render through shared Kanban column primitives
- [ ] Task cards render through shared Kanban card primitives
- [ ] Task details render through the shared Kanban modal primitive
- [ ] Placeholder column/task menus are disabled with explanatory tooltips
- [ ] Board load, task create, move, edit and delete flows use the server `/kanban/*` API instead of local seed state

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
- New screens must compose their page wrapper from shared screen primitives before adding screen-specific sections
- New workbench screens must use `WorkbenchTextField` and `WorkbenchMetaCell` for repeated field and metric shells
- Icon additions must be Material Symbols Outlined
- Color additions must go through TOKENS system
- Spacing changes must use TOKENS.spacing values

---
version: alpha
name: Banana Canvas UI Design System
description: "A compact, production-focused AI video creation canvas. The interface should feel like a professional node editor for repeated creative work: calm dark surfaces, clear node hierarchy, restrained accent colors, dense but readable controls, stable dimensions, and predictable interaction states. Visual polish should improve clarity without changing canvas behavior, node parameters, generation flows, API routing, or agent logic."
---

# Banana Canvas UI Design System

## Overview

Banana Canvas is an AI film and visual creation workspace built around a node canvas. The UI should prioritize speed, clarity, and confidence over decorative expression. Users spend most of their time scanning nodes, editing prompts, checking references, and managing generated media, so the design language should be compact, durable, and operational.

The product should not feel like a landing page or a marketing site. It should feel like a creative control room: a dark canvas, precise controls, visible status, and strong but sparse highlights for important actions.

## Design Principles

- **Canvas first:** the canvas and nodes are the main experience. Toolbars, panels, dialogs, and agent chat should support the canvas without stealing attention.
- **Dense but readable:** controls may be compact, but text must remain legible and never overflow or overlap.
- **Functional color:** colors communicate state, category, or action priority. Avoid using bright colors as decoration.
- **Stable layout:** buttons, handles, badges, chips, previews, and toolbars should have stable dimensions so interaction does not shift the UI.
- **No functional drift:** visual optimization must not alter node layout rules, node parameters, shortcut prompts, generation/connection behavior, API gateway forwarding, storyboard skills, autosave, or agent logic.
- **Existing language first:** improve consistency in the current app style instead of replacing it with a copied brand style from a reference site.

## Visual Theme

The primary theme is dark, with light mode supported as a clean secondary mode.

The dark theme should use a layered near-black surface system:

- App canvas: near black
- Toolbar and panel base: one step above canvas
- Node body: raised dark surface
- Node header and grouped fields: slightly stronger raised surface
- Selected and connected states: clear outlines rather than heavy shadows

The light theme should mirror the same hierarchy with off-white canvas, white nodes, and soft gray separators.

## Color Roles

### Neutral Surfaces

- **Dark canvas:** `#09090b`
- **Dark node body:** `#18181b`
- **Dark raised field:** `#27272a`
- **Dark border:** `#3f3f46`
- **Dark subtle border:** `#27272a`
- **Light canvas:** `#f4f4f5`
- **Light node body:** `#ffffff`
- **Light raised field:** `#f4f4f5`
- **Light border:** `#d4d4d8`
- **Light subtle border:** `#e4e4e7`

### Text

- **Primary text dark:** `#f4f4f5`
- **Secondary text dark:** `#a1a1aa`
- **Muted text dark:** `#71717a`
- **Disabled text dark:** `#52525b`
- **Primary text light:** `#18181b`
- **Secondary text light:** `#71717a`
- **Muted text light:** `#a1a1aa`

### Accents

- **Primary action / selected canvas state:** `#3b82f6`
- **Agent / creative action:** `#f97316`
- **Success / saved / completed:** `#22c55e`
- **Warning / temporary / active process:** `#facc15` or `#f97316`
- **Danger / delete / failure:** `#ef4444`
- **Image or prompt specialty accent:** use sparingly, usually blue or rose, only when it clarifies type or state.

Do not introduce new accent families without a clear state or category purpose.

## Typography

Use the existing stack:

```css
"Inter", "Noto Sans SC", system-ui, -apple-system, sans-serif
```

### Scale

- **Toolbar labels:** 11px, weight 500
- **Node title:** 12px, weight 600
- **Node controls:** 10-12px, weight 400-600
- **Panel body:** 12px, line-height 1.45-1.5
- **Dialog title:** 14px, weight 600
- **Dialog body:** 12px
- **Badges and metadata:** 9-10px

### Rules

- Avoid large display typography inside tool panels, node cards, and dialogs.
- Do not use viewport-based font scaling.
- Keep letter spacing at `0` for compact UI text unless a tiny uppercase label needs slight positive tracking.
- Chinese text must be readable at compact sizes; do not reduce core labels below 10px.

## Layout And Spacing

Use a compact 4px rhythm:

- **2px:** hairline offsets, dense icon alignment
- **4px:** tiny gaps inside button groups
- **6px:** compact control padding
- **8px:** default internal card/control spacing
- **12px:** panel side padding
- **16px:** dialog and larger section gap
- **24px:** modal body or major group spacing

### Canvas Chrome

- Top toolbar remains 36px high unless a feature explicitly requires more room.
- Left toolbar remains narrow and icon-first.
- Panels should avoid covering too much of the canvas. Resizable panels are allowed when content can be long.
- Floating UI must not obscure node handles or creation menus.

## Components

### Top Toolbar

The top toolbar is a utility bar, not a navigation header.

- Keep it compact and horizontally scannable.
- Group file actions, project state, settings, update, and zoom controls with subtle separators.
- Use muted text buttons for low-risk actions.
- Use clear status pills for temporary file, autosaving, saved, and error states.
- Do not add large icons, hero branding, or decorative gradients.

### Left Toolbar

The left toolbar is a tool palette.

- Use square icon buttons with stable 28px hit areas.
- Active tool uses the primary blue fill.
- Destructive actions must be visually separated from creation and selection tools.
- Collapsed state should remain discoverable but quiet.

### Nodes

Nodes are the most important reusable UI unit.

- Border radius: 8px for node bodies.
- Header: slightly raised surface with a bottom border.
- Body padding: 8px by default.
- Selected state: blue border/ring, not a large glow.
- Connection target state: green border/ring.
- Delete buttons: red, small, visible only when selected or contextually needed.
- Resize handles and connection handles must be visible but not visually loud.
- Node content should not move or resize on hover.
- Textareas and prompt fields must be easy to edit and must not trigger node dragging.

### Node Controls

- Inputs, selects, textareas, sliders, and buttons inside nodes should share the same surface, border, radius, and focus treatment.
- Focus state should be visible with a blue border or outline.
- Disabled controls should reduce contrast and cursor, but still preserve layout.
- Long prompt content should expand or scroll deliberately; never clip important text silently.

### Reference Chips

Reference chips are functional, not decorative.

- Keep them compact and readable.
- Show the material name clearly.
- The `X` remove action should be easy to click and must visually imply deletion.
- Removing a reference should remove the chip, reference mention, and related connection together.

### Agent Panel

Jiaojiao should feel like a compact creative assistant attached to the canvas.

- Preserve dark-first panel styling.
- Make assistant text clean and readable, without markdown clutter such as excessive asterisks.
- Render detected options as clickable controls, not plain text lists.
- Keep custom input as part of the same conversation flow.
- Image references should feel native through `@` mention chips or a nearby reference menu.
- Long answers should expand the conversation naturally without causing broken scroll behavior.

### Dialogs

Dialogs are configuration surfaces.

- Use a focused modal with one clear title, close button, grouped sections, and a stable action row.
- Keep section cards flat and compact.
- Inputs should have consistent 8px radius, 12px body text, and clear labels.
- Test results, errors, and success states should use semantic color blocks.
- Dialog content may scroll, but the header and primary action area should remain easy to find.

### Toasts

Toasts should be short and actionable.

- Use semantic color.
- Avoid long technical payloads unless the error requires it.
- Keep animation subtle and fast.

## Responsive Behavior

The app is desktop-first, but it should not break on narrow windows.

- Toolbars must keep text inside their buttons.
- Agent panel width should stay within the viewport.
- Dialogs should use `max-width` and `max-height` with internal scrolling.
- Node controls should wrap or compress without overlapping.
- Minimum touch/click target for critical actions should be about 28px in dense toolbars and 36-44px in dialogs or panels.

## Accessibility

- Preserve readable contrast for all text states.
- Every icon-only button needs a `title` or accessible label.
- Keyboard focus should be visible on buttons, inputs, selects, and textareas.
- Disabled states should not rely only on color; cursor and opacity/background should also communicate disabled state.
- Avoid hover-only access to critical controls.

## Motion

Motion should communicate state, not decorate.

- Panel slide-in is acceptable.
- Loading indicators should be calm and compact.
- Avoid repeated glowing effects except for one or two brand/agent moments.
- Hover transforms should be subtle and must not shift layout.

## Do

- Use token-like constants or shared helper styles when touching repeated UI patterns.
- Align toolbar, node, panel, and dialog controls to the same radius, border, and typography rules.
- Improve text clarity and spacing before changing colors.
- Prefer icons for compact actions when the meaning is familiar.
- Verify UI in dark and light mode when possible.

## Don't

- Do not add a landing-page hero or marketing composition to the app shell.
- Do not use large gradients, decorative blobs, or purely atmospheric backgrounds.
- Do not make the palette one-note purple, beige, or dark-blue.
- Do not nest cards inside cards unless the inner element is a repeated item or a real framed tool.
- Do not change node function, port behavior, model parameters, API payloads, autosave logic, or agent skill logic during a visual-only pass.
- Do not rely on plain text lists when an interaction should be clickable.

## UI Optimization Scope

The first safe optimization pass should focus on visual consistency only:

1. Extract shared UI tokens or helper styles for common colors, radii, borders, text, and control surfaces.
2. Normalize TopBar and LeftToolbar button states.
3. Normalize BaseNode header/body/selection/handle styling.
4. Normalize node form controls: inputs, selects, textareas, buttons, badges.
5. Normalize dialog section cards and action rows.
6. Improve Jiaojiao panel readability, option spacing, and input area polish without changing conversation logic.
7. Verify dark/light mode and common long-text cases.

## Success Criteria

- Existing features behave the same.
- No node parameter, generation, connection, reference, autosave, API, or agent workflow changes.
- Controls look more consistent across the app.
- Text remains readable and contained.
- Important states are easier to scan: selected, connected, generating, saved, failed, disabled.
- Build passes after implementation.

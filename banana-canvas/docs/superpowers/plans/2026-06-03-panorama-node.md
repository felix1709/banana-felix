# Panorama Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a usable 360 panorama generation/viewer node to the canvas generation group.

**Architecture:** Register a new `panorama-scene` node type, add typed settings, and implement a focused `PanoramaSceneNode` component. The first stable slice uses Canvas 2D for equirectangular preview, existing image generation API for panorama generation, and existing image input nodes for captured camera shots.

**Tech Stack:** React, TypeScript, Zustand graph store, XYFlow, existing `generateImage` service, Canvas 2D.

---

### Task 1: Node Type And Prompt Contract

**Files:**
- Modify: `src/types/node.ts`
- Modify: `src/types/settings.ts`
- Modify: `src/components/Canvas/nodes/index.tsx`
- Modify: `src/components/Canvas/NodeCreationMenu.tsx`
- Create: `src/components/Canvas/nodes/panoramaPrompt.ts`
- Test: `src/components/Canvas/nodes/panoramaPrompt.test.ts`

- [x] Write a test proving panorama generation prompt preserves user prompt, source image note, format, ratio, and 360 requirements.
- [x] Implement the prompt builder.
- [x] Register `panorama-scene` label, size, default settings, and node component mapping.
- [x] Add `panorama-scene` to the generation category.

### Task 2: Viewer Interaction

**Files:**
- Create: `src/components/Canvas/nodes/panoramaViewer.ts`
- Create: `src/components/Canvas/nodes/PanoramaSceneNode.tsx`
- Test: `src/components/Canvas/nodes/panoramaViewer.test.ts`

- [x] Write a test for clamping field-of-view and normalizing yaw.
- [x] Implement viewer math helpers.
- [x] Render equirectangular and basic cubemap images into a canvas viewport.
- [x] Add mouse drag, wheel zoom, touch pinch zoom, reset, fullscreen, and keyboard WASD/QE controls.

### Task 3: Generate And Capture

**Files:**
- Modify: `src/components/Canvas/nodes/PanoramaSceneNode.tsx`

- [x] Upload a source scene image into the node.
- [x] Generate a panorama through `generateImage` and show the returned image.
- [x] Capture the current viewport to a new `input-image` node and connect it to the panorama node.
- [x] Display loading and error states with retry-friendly messaging.

### Task 4: Verification

**Files:**
- No new files.

- [x] Run panorama tests.
- [x] Run existing video/image request tests affected by the graph changes.
- [x] Run `npm run build`.
- [ ] Open the local app and verify node creation, upload, interaction, fullscreen, generate, and capture when browser control is available.

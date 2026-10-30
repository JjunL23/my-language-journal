# My Language Journal · MVP design

Figma: https://www.figma.com/design/uqD5oAxResXVtRzB2dpbRD

Design direction: a quiet personal notebook, using warm paper, olive green, generous spacing, and serif entry titles. English controls accompany English, Bahasa Melayu, and Chinese content. Example entries in Figma are illustrative, not user records.

## Tokens

| Role | Value |
| --- | --- |
| Paper | `#f8f7f2` |
| Surface | `#ffffff` |
| Text | `#29312a` |
| Muted text | `#74796d` |
| Primary | `#516341` |
| Sage | `#e9eddf` |
| Accent | `#b2674f` |
| Border | `#e1e3d9` |

Typography: DM Sans for controls/body, Lora for page and entry titles, Noto Sans SC for Chinese in the Figma file. Implementation may use the device's CJK fallback to avoid unnecessary download size. Spacing scale: 4, 8, 12, 16, 20, 24, 32px. Controls target at least 44px. Cards use modest 12px corners; controls use 8px.

## Screen inventory

- iPhone 390 × 844: Library, New / Edit Entry, Entry Details, Favorites, Settings.
- Desktop 1120 × 800: Library with persistent left navigation.
- Import is a confirmation flow showing added, updated, and unchanged counts before any write.
- Entry validation accepts at least one non-empty language; notes are optional.
- Delete and leaving an edited form require explicit confirmation.
- Offline readiness and storage limitations must be described accurately; local storage does not replace a JSON backup.

## Design state ledger

Status: composition complete and visually checked. File key `uqD5oAxResXVtRzB2dpbRD`.

- Page `0:1`; screen board `2:34`; mobile row `2:35`; component shelf `2:42`.
- Library `2:36`; New entry `2:37`; Entry details `2:38`; Favorites `2:39`; Settings `2:40`; Desktop `2:41`.
- Foundation collection `VariableCollectionId:2:2`.
- Local components: Primary button `3:4`, Secondary button `3:7`, Entry field `3:12`, Journal card `3:20`.
- Mobile add action `5:62`; title group `5:61`.

## Verification

The Figma board contains 278 editable descendants: 103 frames, 133 text layers, 19 component instances, and 23 vector layers. It contains no image-filled UI or flattened screenshot. Font inspection confirms DM Sans, Lora, and Noto Sans SC. A full-board screenshot was reviewed, then the mobile add action, responsive card header alignment, and delete-action color were corrected and reviewed again. No visible clipping or overlapping content remained in the final composition.

The five mobile screens share the same 390 × 844 frame. The New / Edit pattern uses a single form; edit mode substitutes the title and preserves the existing entry ID. This is an editable visual specification, not a click-through prototype or evidence of real-device PWA testing. Import preview, deletion confirmation, empty/loading/error states, and live keyboard behavior remain application acceptance checks; they are not represented by additional Figma screens.

The implemented app increases secondary-text contrast and mobile type sizes after accessibility testing. It uses a full-screen editor on phones, native confirmation dialogs, and local system fonts for Chinese. This file is a design handoff; the running app remains the source for tested behavior.

## Typography update — 2026-10-30

At the owner’s request, the running app now uses one native system font stack for all headings, body text, controls, entry content, and decorative text: `-apple-system, BlinkMacSystemFont, system-ui, "PingFang SC", "Segoe UI", sans-serif`. The DM Sans and Lora packages and imports have been removed. Apple devices use their built-in system fonts; other devices use their own system fonts. No downloadable font assets are required. The original Figma board above remains a historical design reference; its typography has not been updated. Layout, colors, and journal behavior are unchanged.

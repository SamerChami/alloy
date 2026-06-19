# ALLOY App — Architecture & Tech Stack

## Company Context
- **Company:** ALLOY — kitchens and bedrooms furniture company
- **Location:** Amman, Jordan; showroom on Mecca Street
- **Factory:** Fully automated with beam saw, edge banding, and CNC machines
- **Founders:** Samer (co-founder) — handles design, tech, and operations

## Application Purpose
A comprehensive web-based management application for ALLOY covering:
- Client management
- Product & component catalogue with BOM pricing
- Quotation generation (manual + auto-import from SketchUp)
- Production workflow (future phases)

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database & Auth | Supabase (PostgreSQL + RLS + Auth) |
| 3D Preview | Three.js (in-browser cabinet viewer) |
| Design Tool | SketchUp Pro (cabinet design + export) |

## Repository & Dev Environment
- Version control: Git / GitHub
- Samer works across **two desktops + one laptop** — all synced via Git
- No monorepo — single Next.js app

## Coordinate System Note (Critical for 3D)
- **SketchUp** uses Z-up world axis
- **Three.js** uses Y-up world axis
- Mapping: SketchUp `[x, y, z]` → Three.js `[x, z, -y]`
- This affects the Stage 5e extents/placement fix (open item)

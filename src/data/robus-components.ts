/* ==========================================================================
   Robus 40 — "Inside the frame" showcase.

   Source: Robus40_Website_Transparent_Components_11.blend.
   The photos are path-traced stills made by tools/render_robus40.py + tools/compose_robus40.mjs into
   /public/media/robus40; their positions are in robus40-layout.json.
   Names and descriptions come from the Prominance "Engineered Heroes" brochure graphic.
   ========================================================================== */

export interface RobusComponent {
  /** names the part's images and its entry in robus40-layout.json */
  id: string;
  name: string;
  kicker: string;
  /** one-line description, as in the brochure */
  description: string;
}

export const robusComponents: RobusComponent[] = [
  {
    id: "stay",
    name: "Easy clean friction stay",
    kicker: "Openable sash",
    description: "Smooth and effortless operation.",
  },
  {
    id: "valve",
    name: "Ball non-return valve",
    kicker: "Drainage",
    description: "Blocks wind and insects from coming in, lets collected water flow out.",
  },
  {
    id: "handle",
    name: "Handles / locks",
    kicker: "Touch point",
    description: "Robust quality security with single / multi-point locking systems.",
  },
  {
    id: "receiver",
    name: "Locking receiver",
    kicker: "Frame side",
    description: "Ensures security and peace of mind.",
  },
  {
    id: "alignment",
    name: "Corner alignment",
    kicker: "Fabrication",
    description: "Aligns frame, supports corners, boosts stability and strength.",
  },
  {
    id: "raiser",
    name: "Frame & sash raiser",
    kicker: "Fit",
    description: "Exact fit, stable grip to avoid overtime sagging.",
  },
  {
    id: "cleats",
    name: "Corner cleats",
    kicker: "Fabrication",
    description: "Enhances the overall durability and structural integrity.",
  },
  {
    id: "safety",
    name: "Safety catch",
    kicker: "Ventilation, with a limit",
    description: "Secures the sash to prevent accidental falls if loose.",
  },
  {
    id: "gasket",
    name: "Gaskets",
    kicker: "Weather seal",
    description: "Seals tightly, keeping the outer environment out.",
  },
];

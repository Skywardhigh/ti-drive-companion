import type { Metadata } from "next";
import { ShipExplorer } from "../ShipExplorer";

// The root layout's metadata is drive-specific, so this route sets its own -
// otherwise the tab reads "TI Drive Companion" while showing hulls.
export const metadata: Metadata = {
  title: "TI Ship Companion",
  description:
    "Compare Terra Invicta hulls, weapons, armor and support modules by hardpoints, mass efficiency and tier.",
};

export default function Ships() {
  return <ShipExplorer />;
}

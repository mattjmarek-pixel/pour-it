import React from "react";
import { ModeScreen } from "@/components/ModeScreen";
import { ThcGate } from "@/components/ThcGate";

export default function THCTab() {
  return (
    <ThcGate>
      <ModeScreen mode="thc" />
    </ThcGate>
  );
}

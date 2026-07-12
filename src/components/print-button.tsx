"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      className="btn no-print"
      type="button"
      onClick={() => window.print()}
    >
      <Printer size={15} /> Print
    </button>
  );
}

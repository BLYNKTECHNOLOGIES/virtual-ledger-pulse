import { useLocation } from "react-router-dom";
import { Construction } from "lucide-react";

/**
 * Placeholder page for HRMS modules not yet implemented.
 * Shows module name derived from the current route.
 */
export default function HorillaModulePage() {
  const { pathname } = useLocation();
  
  // Derive module name from path: /hrms/employee/departments -> "Employee / Departments"
  const segments = pathname.replace("/hrms", "").split("/").filter(Boolean);
  const title = segments.length > 0 
    ? segments.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" / ")
    : "Module";

  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="w-16 h-16 rounded-2xl bg-[#E8604C]/10 flex items-center justify-center mb-4">
        <Construction className="h-8 w-8 text-[#E8604C]" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">{title}</h2>
      <p className="text-sm text-gray-500 max-w-md text-center">
        This module is under construction and will be available in the next phase. 
        The full Horilla-style interface will be built here.
      </p>
      <div className="mt-6 px-4 py-2 bg-[#E8604C]/10 text-[#E8604C] rounded-lg text-sm font-medium">
        Coming Soon — Phase 2+
      </div>
    </div>
  );
}

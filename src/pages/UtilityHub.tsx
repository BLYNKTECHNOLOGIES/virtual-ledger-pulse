import { FileText, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

const tools = [
  {
    id: "invoice-creator",
    title: "Invoice Creator",
    description: "Bulk CSV to PDF invoice generator. Upload your data using the provided template to generate invoices.",
    icon: FileText,
    route: "/utility/invoice-creator",
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
  },
];

const UtilityHub = () => {
  const navigate = useNavigate();

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Utility Tools</h1>
        <p className="text-sm text-gray-500 mt-1">Quick access to all tools and utilities</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <div
              key={tool.id}
              onClick={() => navigate(tool.route)}
              className={`group flex flex-col gap-3 p-5 rounded-xl border-2 ${tool.borderColor} ${tool.bgColor} hover:shadow-lg transition-all duration-200 cursor-pointer`}
            >
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-lg bg-white shadow-sm">
                  <Icon className={`h-5 w-5 ${tool.color}`} />
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{tool.title}</h3>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{tool.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default UtilityHub;

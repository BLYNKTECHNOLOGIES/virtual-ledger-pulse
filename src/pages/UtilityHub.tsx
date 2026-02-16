import { FileText, ExternalLink, AlertTriangle } from "lucide-react";

const tools = [
  {
    id: "invoice-creator",
    title: "Invoice Creator",
    description: "Bulk CSV to PDF invoice generator. Upload your data using the provided template to generate invoices.",
    icon: FileText,
    url: "https://preview--order-to-invoice-hero.lovable.app/",
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
  },
];

const UtilityHub = () => {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Utility Tools</h1>
        <p className="text-sm text-gray-500 mt-1">Quick access to all external tools and utilities</p>
      </div>

      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2.5 text-sm rounded-md">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span>
          <strong>Note:</strong> These tools open in a new tab. For the Invoice Creator, please use only the provided CSV template — other formats will cause errors.
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <a
              key={tool.id}
              href={tool.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`group flex flex-col gap-3 p-5 rounded-xl border-2 ${tool.borderColor} ${tool.bgColor} hover:shadow-lg transition-all duration-200 cursor-pointer`}
            >
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-lg bg-white shadow-sm">
                  <Icon className={`h-5 w-5 ${tool.color}`} />
                </div>
                <ExternalLink className="h-4 w-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{tool.title}</h3>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{tool.description}</p>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
};

export default UtilityHub;

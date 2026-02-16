import { AlertTriangle } from "lucide-react";

const InvoiceCreatorPage = () => {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] w-full">
      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2.5 text-sm rounded-md mx-4 mt-3 flex-shrink-0">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span>
          <strong>Important:</strong> Please use only the provided CSV template (Download CSV Template) to upload data. Using any other format will cause errors.
        </span>
      </div>
      <iframe
        src="https://order-to-invoice-hero.lovable.app/"
        className="w-full flex-1 border-0 mt-2"
        title="Invoice Creator"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
};

export default InvoiceCreatorPage;

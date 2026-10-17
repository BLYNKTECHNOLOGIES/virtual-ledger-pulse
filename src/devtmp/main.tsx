import "../index.css";
import { createRoot } from "react-dom/client";
const long = Array.from({length:40},(_,i)=>`Line ${i} of a lengthy candidate email body.`).join("\n");
function Panel({composing}:{composing:boolean}) {
  return <div style={{height:445,width:1000}} className="flex min-h-0 flex-col h-full border">
    <div className="h-12 border-b">Messages</div>
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-[220px] flex-1 basis-0 flex flex-col">
        <div id={"list"+composing} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3"><p className="whitespace-pre-wrap">{long}</p></div>
        <div id={"bar"+composing} className="h-11 border-t">Next step bar</div>
      </div>
      <div id={"comp"+composing} className={composing ? "overflow-y-auto min-h-[180px] max-h-[60%] shrink border-t border-border p-3" : "overflow-y-auto shrink-0 border-t border-border p-2"}>
        {composing ? <textarea className="min-h-[280px] w-full" /> : <button className="w-full border">Write an email…</button>}
      </div>
    </div>
  </div>;
}
createRoot(document.getElementById("root")!).render(<div className="space-y-4 p-4"><Panel composing={false}/><Panel composing={true}/></div>);

/* Isolated render harness for the ATS messages panel (sample data, no auth). */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { MessagesPanel } from "@/components/ats/MessagesPanel";
import "../index.css";

const candidate = {
  id: "cand-1", ref_no: "CAN-0001", full_name: "Aishwary Sharma", email: "aishwary@example.com",
  phone: "9876543210", phone_norm: "9876543210", city: "Pune", state: "Maharashtra",
} as never;

const app = {
  application_id: "app-1", job_title: "KYC Associate", position_text: "KYC Associate",
  stage_name: "Assessment", stage_kind: "assessment", status: "active",
} as never;

const LONG = [
  "Dear Aishwary,",
  "",
  "Thank you for the detailed reply and for sharing the documents. I have gone through everything you sent and I want to be fully transparent about where things stand, because there are a few moving parts on our side that will affect your joining date.",
  "",
  "First, the verification. Our compliance team has checked the Aadhaar and the PAN you uploaded. Both are legible and the names match, so that part is closed. The salary slip you attached for August is dated but the employer name is truncated in the scan, so we have asked you for a cleaner copy; until that arrives the offer cannot be issued.",
  "",
  "Second, the interview feedback. The panel that spoke with you on Tuesday recorded the following notes, which I am passing on as-is so that you know exactly what was discussed:",
  "1. KYC workflow understanding - strong, correctly described the four-eyes check",
  "2. Documentation handling - adequate, needs exposure to the re-KYC cycle",
  "3. Escalation judgement - good, asked the right questions about suspicious profiles",
  "4. Communication in English - comfortable on calls, written note could be tighter",
  "5. Shift readiness - available for morning and evening, night needs confirmation",
  "",
  "Third, the offer itself. The band for this role is 13,600 to 15,400 per month depending on the notice period you serve and the shift you are allotted. Because you can join within fifteen days, we can place you at the upper end, but that has to be approved by the department head, and he is travelling until Thursday.",
  "",
  "Fourth, and this is the part I need you to answer: the shift. The requirement we filled is for the morning and evening batches. If you are comfortable with the night batch as well, say so clearly in your reply, because it changes which requirement line you are mapped against and it also changes the pickup and drop arrangement we can offer you.",
  "",
  "Fifth, the paperwork list. Please keep these ready in original and one photocopy each: Aadhaar, PAN, bank passbook or the front page of a cancelled cheque, the latest salary slip, your relieving letter or a declaration if you are a fresher, two passport-size photographs, and your tenth and twelfth marksheets plus the degree certificate.",
  "",
  "Sixth, the background verification. We run it through a third-party agency. They will call the two references you listed, so please tell them to expect a call from a Mumbai number, and they should be ready to confirm your job title and the dates you worked there. If a reference does not pick up twice, the file is held and the joining slips by three to four working days.",
  "",
  "Seventh, the joining formalities. On the day you report, we will issue the appointment letter, the code of conduct acknowledgement, and the asset form. The laptop and the headset are issued against the asset form, so please carry a pen and be prepared to stay for about two hours.",
  "",
  "To summarise what I need from you in your reply: a clean copy of the August salary slip, a clear yes or no on the night batch, and confirmation that both references have been informed.",
  "",
  "Warm regards,",
  "Shubham",
  "People Operations, BlynkEx",
].join("\n");

const MSGS = [
  {
    id: "m1", candidate_id: "cand-1", application_id: "app-1", direction: "inbound", status: "received", error: null,
    subject: "Re: KYC Associate — documents and shift preference", snippet: LONG.slice(0, 90),
    body_text: LONG, body_html: null, from_name: "Aishwary Sharma", from_address: "aishwary@example.com",
    to_addresses: ["hr@blynkex.com"], received_at: "2026-10-17T06:10:00Z", sent_at: null, created_at: "2026-10-17T06:10:00Z",
    read_at: null, is_automatic: false, attachments: [], intent: "other", intent_data: null, purpose: "general",
    created_by_name: null, calendar_ics: null, from_other_address: false, template_code: null,
    handled_at: null, handled_action: null, handled_by_name: null,
  },
];

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={qc}>
    <div className="h-[calc(100vh-2rem)] rounded-lg border border-border bg-card">
      <MessagesPanel candidate={candidate} appId="app-1" app={app} files={[]} visible
        onOpenFile={() => undefined} onEditProfile={() => undefined} />
    </div>
  </QueryClientProvider>,
);

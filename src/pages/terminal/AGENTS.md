# Copilot decisions (v2 Playbook)

- Copilot AI runs only for Copilot approvers (copilot_config.approver_ids, checked by copilot_is_approver) and only for the order chat an approver has open: the chat panel calls copilot-draft, nothing runs in the background, because AI spend and Playbook training are limited to chats the approvers handle.
- copilot_my_access feeds the screen; every Copilot gate in the UI reads it and copilot-draft / copilot-learn check again, because screen and server must agree.
- Approved Playbook replies (copilot_match_playbook, scoped by side, small/regular, account, status and client state) are shown before any AI and skip drafting; one chat state is drafted once (copilot_requests.request_key), so two approvers never pay twice for the same message.
- Sending or approving a suggestion saves it to the Playbook through copilot-learn ("use = approve"; Undo within 24 h, only while it is the entry's latest change); own typed replies only when Save is on; rejected drafts are kept as examples to avoid, never as replies.
- No reply text carries a typed number: contact numbers come from copilot_contacts through {contact:rm|kyc|support} (available-now first), order values through {amount} {orderNo} {name} {upi}; guardDraft holds back release promises, outside-Binance offers and typed numbers, and the composer refuses to send an unfilled placeholder, because a client must never see a wrong number or a placeholder.
- Personal data in the chat (phones, UPI IDs, account numbers, PAN, Aadhaar, references) is masked with maskPII before any AI call and in stored questions.
- Language and address are decided on the server from the chat: Hindi in English letters only after the client keeps writing Hindi past hindi_switch_after English replies; "ma'am" only when the client refers to herself as female, never from a name.
- The Copilot never skips or suppresses KYC; it shows the client's KYC status and the rule comes from the Playbook.
- Operators get no AI and never change the Playbook; copilot_config.operators_enabled stays false until an approver switches on approved replies (a separate step).
- The old Copilot (copilot-suggest, copilot-teach, copilot-train, style exemplars, blacklist, hourly mining) is retired; its tables are kept as history and nothing reads them.

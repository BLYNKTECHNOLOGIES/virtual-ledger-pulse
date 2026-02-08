
INSERT INTO p2p_quick_replies (label, message_text, order_type, trade_type, sort_order, is_active)
VALUES
  -- Universal replies
  ('Greeting', 'Hi, thank you for the order. I will process it shortly.', NULL, NULL, 1, true),
  ('Payment Reminder', 'Please make the payment and mark as paid. The order will expire if not paid in time.', NULL, 'SELL', 2, true),
  ('Payment Received', 'Payment received. Releasing crypto now. Thank you!', NULL, 'SELL', 3, true),
  ('Waiting Payment', 'I have placed the order. Please share the payment details.', NULL, 'BUY', 4, true),
  ('Payment Sent', 'Payment has been sent. Please check and release the crypto.', NULL, 'BUY', 5, true),
  ('UTR Shared', 'I have shared the UTR/reference number. Please verify and release.', NULL, 'BUY', 6, true),
  ('Processing', 'Your order is being processed. Please wait a moment.', NULL, NULL, 7, true),
  ('Bank Hours', 'Bank transfers may take a few minutes to reflect. Please be patient.', NULL, NULL, 8, true),
  ('Confirm Details', 'Please confirm your payment details are correct before transferring.', NULL, 'SELL', 9, true),
  ('Thank You', 'Trade completed successfully. Thank you for trading with us!', NULL, NULL, 10, true),
  ('UPI Issue', 'If UPI is not working, please try bank transfer (IMPS/NEFT).', NULL, 'SELL', 11, true),
  ('Screenshot Request', 'Could you please share a screenshot of the payment for verification?', NULL, NULL, 12, true)
ON CONFLICT DO NOTHING;

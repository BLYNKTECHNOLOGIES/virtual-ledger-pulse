import { CompanyLetterhead } from '@/components/letterhead/CompanyLetterhead';

export function OfferLetterMockup() {
  return (
    <div style={{ background: '#e5e7eb', minHeight: '100vh', padding: '40px 0', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '794px', background: '#fff', boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>
        <CompanyLetterhead>
          <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '13px', lineHeight: '1.7', color: '#222' }}>

            {/* Date & Ref */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div>
                <strong>Date:</strong> 30th March 2026
              </div>
              <div>
                <strong>Ref:</strong> BVT/HR/OL/2026/0042
              </div>
            </div>

            {/* Recipient */}
            <div style={{ marginBottom: '20px' }}>
              <strong>To,</strong><br />
              Mr. Rahul Kumar Sharma<br />
              123, Sector 15, Indore<br />
              Madhya Pradesh – 452001
            </div>

            {/* Subject */}
            <div style={{ marginBottom: '20px' }}>
              <strong>Subject: Offer of Employment</strong>
            </div>

            {/* Salutation */}
            <p style={{ marginBottom: '16px' }}>
              Dear <strong>Rahul</strong>,
            </p>

            {/* Body */}
            <p style={{ marginBottom: '14px' }}>
              We are pleased to offer you the position of <strong>Software Developer</strong> at
              <strong> Blynk Virtual Technologies Pvt. Ltd.</strong> Your skills and experience will be a
              valuable asset to our team, and we look forward to your contributions.
            </p>

            <p style={{ marginBottom: '14px' }}>
              Please find the details of your offer below:
            </p>

            {/* Details Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '13px' }}>
              <tbody>
                {[
                  ['Designation', 'Software Developer'],
                  ['Department', 'Technology'],
                  ['Date of Joining', '15th April 2026'],
                  ['Work Location', 'Indore, Madhya Pradesh'],
                  ['Reporting To', 'Mr. Amit Verma (Tech Lead)'],
                  ['Employment Type', 'Full-Time, Permanent'],
                  ['Annual CTC', '₹ 6,00,000 (Six Lakhs Only)'],
                  ['Probation Period', '6 Months'],
                ].map(([label, value], i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600, width: '40%', background: i % 2 === 0 ? '#f8fafc' : '#fff' }}>
                      {label}
                    </td>
                    <td style={{ padding: '8px 12px', background: i % 2 === 0 ? '#f8fafc' : '#fff' }}>
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Terms */}
            <p style={{ marginBottom: '14px' }}>
              This offer is contingent upon the successful completion of background verification
              and submission of all required documents on or before your date of joining.
            </p>

            <p style={{ marginBottom: '14px' }}>
              Kindly confirm your acceptance of this offer by signing and returning a copy of this
              letter by <strong>5th April 2026</strong>.
            </p>

            <p style={{ marginBottom: '30px' }}>
              We are excited to welcome you to the Blynk Virtual Technologies family and wish you
              a rewarding career with us.
            </p>

            {/* Signature */}
            <div style={{ marginBottom: '40px' }}>
              <p style={{ marginBottom: '4px' }}>Warm Regards,</p>
              <div style={{ marginTop: '40px' }}>
                <strong>Shubham Singh</strong><br />
                <span style={{ color: '#555' }}>Director</span><br />
                <span style={{ color: '#555' }}>Blynk Virtual Technologies Pvt. Ltd.</span>
              </div>
            </div>

            {/* Acceptance */}
            <div style={{ borderTop: '1px dashed #999', paddingTop: '20px', marginTop: '20px' }}>
              <p style={{ fontWeight: 600, marginBottom: '12px' }}>Acceptance by Candidate:</p>
              <p style={{ marginBottom: '24px' }}>
                I, __________________________, hereby accept the offer of employment as mentioned above.
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <p>Signature: __________________</p>
                </div>
                <div>
                  <p>Date: __________________</p>
                </div>
              </div>
            </div>

          </div>
        </CompanyLetterhead>
      </div>
    </div>
  );
}

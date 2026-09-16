import html2pdf from 'html2pdf.js';
import { getCleanFeeLabel } from './feeEngine';

/**
 * Generate a fee receipt PDF and trigger download.
 * @param {Object} invoice - Invoice data (amount, date, receiptNo, feeType, etc.)
 * @param {Object} student - Student data (name, class, id, contact, etc.)
 * @param {string} schoolName - School name for header
 */
export function generateFeeReceipt(invoice, student, schoolName = 'Jeevan Shilp Group', lang = 'en') {
  const isHi = lang === 'hi';
  const receiptNo = invoice.receiptId || invoice.receiptNo || invoice.voucherNo || invoice.id?.slice(0, 12) || 'N/A';
  const date = invoice.date ? new Date(invoice.date).toLocaleDateString(isHi ? 'hi-IN' : 'en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString();
  const amount = Number(invoice.amount || 0);
  const feeType = invoice.feeType || invoice.description || invoice.category || (isHi ? 'शुल्क भुगतान' : 'Fee Payment');
  const rawMode = invoice.paymentMode || invoice.mode || 'Cash';
  const paymentMode = isHi ? (rawMode === 'Cash' ? 'नकद' : rawMode) : rawMode;

  const title = isHi ? 'अधिकृत फीस रसीद' : 'OFFICIAL FEE RECEIPT';
  const lblReceiptNo = isHi ? 'रसीद क्र.' : 'Receipt No:';
  const lblDate = isHi ? 'दिनांक:' : 'Date:';
  const lblMode = isHi ? 'भुगतान माध्यम:' : 'Payment Mode:';
  const lblStudent = isHi ? 'विद्यार्थी का नाम:' : 'Student Name:';
  const lblClass = isHi ? 'कक्षा एवं सेक्शन:' : 'Class & Section:';
  const lblId = isHi ? 'आईडी / रोल:' : 'Student ID / Roll:';
  const lblContact = isHi ? 'संपर्क नंबर:' : 'Parent Contact:';
  const lblDesc = isHi ? 'विवरण' : 'Fee Description';
  const lblAmount = isHi ? 'राशि' : 'Amount';
  const lblTotal = isHi ? 'कुल प्राप्त राशि' : 'Total Amount Paid';
  const lblFooter = isHi 
    ? 'यह एक कंप्यूटर-जनरेटेड अधिकृत रसीद है, इसमें भौतिक हस्ताक्षर की आवश्यकता नहीं है।'
    : 'This is a computer-generated official receipt and does not require a physical signature.';
  const lblSign = isHi ? 'अधिकृत हस्ताक्षर' : 'Authorized Signatory';

  const allocationsList = (invoice.allocations && invoice.allocations.length > 0) ? invoice.allocations : null;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 28px 32px; color: #1e293b; max-width: 620px; margin: 0 auto; background: #ffffff;">
      <!-- Header Banner -->
      <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 18px;">
        <h1 style="font-size: 22px; font-weight: 900; color: #0f172a; margin: 0; letter-spacing: 0.5px;">${schoolName}</h1>
        <div style="display: inline-block; margin-top: 6px; padding: 3px 12px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 12px; font-size: 11px; font-weight: 800; color: #475569; letter-spacing: 1px;">
          ${title}
        </div>
      </div>

      <!-- Metadata Box -->
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 18px; font-size: 12px; line-height: 1.6;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="width: 50%; vertical-align: top; padding-right: 12px;">
              <strong style="color: #64748b;">${lblReceiptNo}</strong> <span style="font-weight: 800; color: #0f172a;">${receiptNo}</span><br/>
              <strong style="color: #64748b;">${lblDate}</strong> <span style="font-weight: 700; color: #0f172a;">${date}</span><br/>
              <strong style="color: #64748b;">${lblMode}</strong> <span style="font-weight: 700; color: #0f172a;">${paymentMode}</span>
            </td>
            <td style="width: 50%; vertical-align: top; border-left: 1px solid #e2e8f0; padding-left: 12px;">
              <strong style="color: #64748b;">${lblStudent}</strong> <span style="font-weight: 800; color: #0f172a;">${student.name || 'N/A'}</span><br/>
              <strong style="color: #64748b;">${lblClass}</strong> <span style="font-weight: 700; color: #0f172a;">${student.class || 'N/A'} ${student.section ? '(' + student.section + ')' : ''}</span><br/>
              <strong style="color: #64748b;">${lblId}</strong> <span style="font-weight: 700; color: #0f172a;">${student.roll || student.id || 'N/A'}</span>
            </td>
          </tr>
        </table>
      </div>

      <!-- Table Breakdown -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 12px;">
        <thead>
          <tr style="background: #f1f5f9; border-top: 1px solid #cbd5e1; border-bottom: 2px solid #cbd5e1;">
            <th style="padding: 9px 12px; text-align: left; font-weight: 800; color: #334155;">${lblDesc}</th>
            <th style="padding: 9px 12px; text-align: right; font-weight: 800; color: #334155; width: 120px;">${lblAmount}</th>
          </tr>
        </thead>
        <tbody>
          ${allocationsList ? allocationsList.map((alloc, idx) => `
            <tr style="border-bottom: 1px solid #e2e8f0; background: ${idx % 2 === 1 ? '#fafafa' : '#ffffff'};">
              <td style="padding: 9px 12px; color: #1e293b; font-weight: 600;">${getCleanFeeLabel(alloc.label, lang, alloc.componentId)}</td>
              <td style="padding: 9px 12px; text-align: right; font-weight: 700; color: #0f172a;">₹ ${Number(alloc.amount).toLocaleString('en-IN')}</td>
            </tr>
          `).join('') : `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 9px 12px; color: #1e293b; font-weight: 600;">${getCleanFeeLabel(feeType, lang)}</td>
              <td style="padding: 9px 12px; text-align: right; font-weight: 700; color: #0f172a;">₹ ${amount.toLocaleString('en-IN')}</td>
            </tr>
          `}
          <tr style="background: #f8fafc; border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a;">
            <td style="padding: 11px 12px; font-size: 13px; font-weight: 900; color: #0f172a;">${lblTotal}</td>
            <td style="padding: 11px 12px; text-align: right; font-size: 15px; font-weight: 900; color: #059669;">₹ ${amount.toLocaleString('en-IN')}</td>
          </tr>
        </tbody>
      </table>

      <!-- Footer & Signature -->
      <table style="width: 100%; border-collapse: collapse; margin-top: 24px;">
        <tr>
          <td style="vertical-align: bottom; font-size: 10px; color: #64748b; line-height: 1.4;">
            ✓ ${lblFooter}<br/>
            ${schoolName} • Fee Management System
          </td>
          <td style="text-align: right; vertical-align: bottom; width: 150px;">
            <div style="border-bottom: 1px solid #94a3b8; width: 140px; margin-left: auto; margin-bottom: 4px;"></div>
            <div style="font-size: 11px; font-weight: 700; color: #334155;">${lblSign}</div>
          </td>
        </tr>
      </table>
    </div>
  `;

  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);

  html2pdf()
    .set({
      margin: [10, 10, 10, 10],
      filename: 'Receipt_' + receiptNo + '_' + (student.name || 'Student') + '.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    })
    .from(container)
    .save()
    .then(() => {
      document.body.removeChild(container);
    });
}

/**
 * Generate a student profile summary PDF.
 * @param {Object} student - Student data
 * @param {Object} stats - { attendancePercent, marksAvg, paid, due }
 */
export function generateStudentProfilePDF(student, stats = {}) {
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 32px; color: #111; max-width: 600px; margin: 0 auto;">
      <div style="text-align: center; border-bottom: 3px solid #bf5700; padding-bottom: 16px; margin-bottom: 20px;">
        <h1 style="font-size: 22px; font-weight: 900; color: #bf5700; margin: 0;">Student Profile Report</h1>
      </div>

      <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="font-size: 18px; font-weight: 800; margin: 0 0 8px 0;">${student.name || 'N/A'}</h2>
        <p style="font-size: 13px; margin: 2px 0; color: #555;">
          <strong>Class:</strong> ${student.class || 'N/A'} ${student.section ? '(' + student.section + ')' : ''}<br/>
          <strong>Student ID:</strong> ${student.id || 'N/A'}<br/>
          <strong>Parent Contact:</strong> ${student.contact || 'N/A'}<br/>
          <strong>Parent Name:</strong> ${student.parentName || 'N/A'}
        </p>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 12px; text-align: center; background: #f0fdf4; border-radius: 8px; width: 25%;">
            <div style="font-size: 20px; font-weight: 900; color: #10b981;">${stats.attendancePercent != null ? stats.attendancePercent + '%' : 'N/A'}</div>
            <div style="font-size: 11px; color: #666; margin-top: 2px;">Attendance</div>
          </td>
          <td style="padding: 12px; text-align: center; background: #fff7ed; border-radius: 8px; width: 25%;">
            <div style="font-size: 20px; font-weight: 900; color: #f97316;">${stats.marksAvg != null ? stats.marksAvg + '%' : 'N/A'}</div>
            <div style="font-size: 11px; color: #666; margin-top: 2px;">Avg Marks</div>
          </td>
          <td style="padding: 12px; text-align: center; background: #f0fdf4; border-radius: 8px; width: 25%;">
            <div style="font-size: 20px; font-weight: 900; color: #10b981;">Rs.${Number(stats.paid || 0).toLocaleString()}</div>
            <div style="font-size: 11px; color: #666; margin-top: 2px;">Fees Paid</div>
          </td>
          <td style="padding: 12px; text-align: center; background: #fef2f2; border-radius: 8px; width: 25%;">
            <div style="font-size: 20px; font-weight: 900; color: #ef4444;">Rs.${Number(stats.due || 0).toLocaleString()}</div>
            <div style="font-size: 11px; color: #666; margin-top: 2px;">Fee Due / बाकी फीस</div>
          </td>
        </tr>
      </table>

      <div style="text-align: center; font-size: 11px; color: #999; margin-top: 30px; border-top: 1px solid #eee; padding-top: 12px;">
        Generated on ${new Date().toLocaleDateString()} - Jeevan Shilp Group ERP
      </div>
    </div>
  `;

  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);

  html2pdf()
    .set({
      margin: [10, 10, 10, 10],
      filename: 'Profile_' + (student.name || 'Student') + '_' + new Date().toISOString().split('T')[0] + '.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    })
    .from(container)
    .save()
    .then(() => {
      document.body.removeChild(container);
    });
}

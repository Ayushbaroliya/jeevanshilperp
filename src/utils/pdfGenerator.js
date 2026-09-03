import html2pdf from 'html2pdf.js';

/**
 * Generate a fee receipt PDF and trigger download.
 * @param {Object} invoice - Invoice data (amount, date, receiptNo, feeType, etc.)
 * @param {Object} student - Student data (name, class, id, contact, etc.)
 * @param {string} schoolName - School name for header
 */
export function generateFeeReceipt(invoice, student, schoolName = 'Jeevan Shilp Group') {
  const receiptNo = invoice.receiptNo || invoice.voucherNo || invoice.id?.slice(0, 12) || 'N/A';
  const date = invoice.date || new Date().toISOString().split('T')[0];
  const amount = Number(invoice.amount || 0);
  const feeType = invoice.feeType || invoice.description || invoice.category || 'Fee Payment';
  const paymentMode = invoice.paymentMode || invoice.mode || 'Cash';

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 32px; color: #111; max-width: 600px; margin: 0 auto;">
      <div style="text-align: center; border-bottom: 3px solid #bf5700; padding-bottom: 16px; margin-bottom: 20px;">
        <h1 style="font-size: 22px; font-weight: 900; color: #bf5700; margin: 0;">${schoolName}</h1>
        <p style="font-size: 12px; color: #666; margin: 4px 0 0 0;">Official Fee Receipt</p>
      </div>

      <div style="display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 13px;">
        <div>
          <strong>Receipt No:</strong> ${receiptNo}<br/>
          <strong>Date:</strong> ${date}
        </div>
        <div style="text-align: right;">
          <strong>Payment Mode:</strong> ${paymentMode}
        </div>
      </div>

      <div style="background: #f8f9fa; padding: 14px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 13px;">
        <strong>Student:</strong> ${student.name || 'N/A'}<br/>
        <strong>Class:</strong> ${student.class || 'N/A'} ${student.section ? '(' + student.section + ')' : ''}<br/>
        <strong>Student ID:</strong> ${student.id || 'N/A'}<br/>
        <strong>Parent Contact:</strong> ${student.contact || 'N/A'}
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background: #f0f0f0;">
            <th style="padding: 10px 14px; text-align: left; font-size: 13px; border-bottom: 2px solid #ddd;">Description</th>
            <th style="padding: 10px 14px; text-align: right; font-size: 13px; border-bottom: 2px solid #ddd;">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 10px 14px; font-size: 13px; border-bottom: 1px solid #eee;">${feeType}</td>
            <td style="padding: 10px 14px; text-align: right; font-size: 13px; font-weight: 700; border-bottom: 1px solid #eee;">Rs. ${amount.toLocaleString()}</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="padding: 12px 14px; font-size: 14px; font-weight: 800;">Total Paid</td>
            <td style="padding: 12px 14px; text-align: right; font-size: 16px; font-weight: 900; color: #10b981;">Rs. ${amount.toLocaleString()}</td>
          </tr>
        </tbody>
      </table>

      <div style="text-align: center; font-size: 11px; color: #999; margin-top: 30px; border-top: 1px solid #eee; padding-top: 12px;">
        This is a computer-generated receipt and does not require a signature.<br/>
        ${schoolName} - Fee Management System
      </div>
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
            <div style="font-size: 11px; color: #666; margin-top: 2px;">Outstanding</div>
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

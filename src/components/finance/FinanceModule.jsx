import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, CreditCard, Briefcase, Plus, Download, Filter, AlertCircle, Phone, MessageSquare, Printer, CheckCircle, Search, Layers, FileText, RotateCcw } from 'lucide-react';
import { collection, getDocs, doc, runTransaction, query, where, orderBy, addDoc, getDoc, updateDoc , writeBatch} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { auth, db } from '../../firebase';
import { t } from '../../utils/translations';
import SchoolFolderPicker from '../common/SchoolFolderPicker';
import { calculateStudentDue, normalizeClassFeeSettings, calculatePenalties, applyPaymentsAndAdjustments, summarizeDues } from '../../utils/feeEngine';
import { generateFeeReceipt } from '../../utils/pdfGenerator';

function getAcademicYear() {
  return "2026-2027";
}

export default function FinanceModule({ onNavigate, userPermissions, lang = 'en', selectedSchool, setSelectedSchool, classes = [] }) {
  const [activeTab, setActiveTab] = useState('classwise');
  const [prefilledStudentId, setPrefilledStudentId] = useState('');
  const dict = t[lang] || t.en;

  const handleSelectStudentForPayment = (studentId) => {
    setPrefilledStudentId(studentId);
    setActiveTab('record');
  };

  if (selectedSchool === 'ALL') {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <button className="icon-btn" onClick={() => onNavigate('dashboard')} style={{ backgroundColor: 'var(--bg-secondary)', padding: 10 }}>
            <ArrowLeft size={20} />
          </button>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Fees & Finance</h1>
        </div>
        <SchoolFolderPicker 
          title="Select Branch for Finance Management" 
          description="Please select a specific school branch to view and manage fee collection, invoices, and dues."
          onSelectSchool={(schoolId) => setSelectedSchool && setSelectedSchool(schoolId)}
        />
      </div>
    );
  }

  // Permission Guarding
  const canRecord = userPermissions?.recordPayments;
  const canAdjust = userPermissions?.adjustFees;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="print-hide flex-responsive" style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: 12 }}>
        <button className={activeTab === 'classwise' ? 'btn-primary' : 'btn-secondary'} onClick={() => setActiveTab('classwise')} style={{ padding: '10px 18px', fontSize: 13, fontWeight: 800 }}>
          <Filter size={16} /> Classwise Fee Dues
        </button>
        {canRecord && (
          <button className={activeTab === 'record' ? 'btn-primary' : 'btn-secondary'} onClick={() => setActiveTab('record')} style={{ padding: '10px 18px', fontSize: 13, fontWeight: 700 }}>
            <CreditCard size={16} /> Record Payment
          </button>
        )}
        <button className={activeTab === 'invoices' ? 'btn-primary' : 'btn-secondary'} onClick={() => setActiveTab('invoices')} style={{ padding: '10px 18px', fontSize: 13, fontWeight: 700 }}>
          <FileText size={16} /> Receipt History
        </button>
        {canAdjust && (
          <button className={activeTab === 'adjustments' ? 'btn-primary' : 'btn-secondary'} onClick={() => setActiveTab('adjustments')} style={{ padding: '10px 18px', fontSize: 13, fontWeight: 700 }}>
            <Briefcase size={16} /> Adjust Fees
          </button>
        )}
      </div>

      {activeTab === 'classwise' && <ClasswiseDueFeesReport onCollectFee={handleSelectStudentForPayment} onNavigate={onNavigate} dict={dict} selectedSchool={selectedSchool} classes={classes} />}
      {activeTab === 'record' && canRecord && <RecordPayment subOnNavigate={onNavigate} dict={dict} prefilledStudentId={prefilledStudentId} selectedSchool={selectedSchool} userPermissions={userPermissions} />}
      {activeTab === 'adjustments' && canAdjust && <FeeAdjustmentModule selectedSchool={selectedSchool} userPermissions={userPermissions} />}
      {activeTab === 'invoices' && <InvoicesModule subOnNavigate={onNavigate} userPermissions={userPermissions} dict={dict} selectedSchool={selectedSchool} />}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// CLASSWISE DUES REPORT (Using V4 Engine)
// ────────────────────────────────────────────────────────────────────────────
function ClasswiseDueFeesReport({ onCollectFee, onNavigate, dict, selectedSchool, classes = [] }) {
  const [selectedClass, setSelectedClass] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [dueList, setDueList] = useState([]);

  useEffect(() => {
    const fetchCloudDues = async () => {
      try {
        let studentQ = collection(db, "students");
        let chargeQ = collection(db, 'fee_charges');
        if (selectedSchool && selectedSchool !== 'ALL') {
          studentQ = query(studentQ, where("schoolId", "==", selectedSchool));
          chargeQ = query(chargeQ, where("schoolId", "==", selectedSchool));
        }
        
        const [studentSnap, paymentSnap, adjustmentSnap, chargeSnap, settingsSnap] = await Promise.all([
          getDocs(studentQ),
          getDocs(query(collection(db, 'student_ledger'), where('type', '==', 'credit'))),
          getDocs(query(collection(db, 'fee_adjustments'), where('status', '==', 'approved'))),
          getDocs(chargeQ),
          getDoc(doc(db, 'school_settings', 'settings'))
        ]);

        const storedSettings = settingsSnap.exists() ? (settingsSnap.data().schoolClassSettings || {}) : {};

        const paymentsByStudent = {};
        paymentSnap.forEach(d => { const p = d.data(); (paymentsByStudent[p.studentId] ||= []).push({ ...p, id: d.id }); });
        
        const adjustmentsByStudent = {};
        adjustmentSnap.forEach(d => { const a = d.data(); (adjustmentsByStudent[a.studentId] ||= []).push({ ...a, id: d.id }); });

        const chargesByStudent = {};
        chargeSnap.forEach(d => { const c = d.data(); (chargesByStudent[c.studentId] ||= []).push({ ...c, id: d.id }); });

        const cloudDues = [];
        studentSnap.forEach((d) => {
          const data = d.data();
          const studentObj = { id: d.id, ...data };
          
          const sClass = studentObj.class;
          const sSchool = studentObj.schoolId || selectedSchool;
          const classSettings = normalizeClassFeeSettings(storedSettings[sSchool]?.[sClass] || {});
          const dbCharges = chargesByStudent[d.id] || [];
          
          if (dbCharges.length === 0) {
            cloudDues.push({
              id: d.id, name: data.name || 'Student', class: data.class || '', section: data.section || '',
              contact: data.contact || '', dueAmount: 0, status: 'Not Billed', unbilled: true
            });
            return;
          }

          const summary = calculateStudentDue({
            student: studentObj,
            charges: dbCharges,
            classSettings,
            payments: paymentsByStudent[d.id] || [],
            adjustments: adjustmentsByStudent[d.id] || []
          });

          if (summary.totalDue > 0) {
            cloudDues.push({
              id: d.id, name: data.name || 'Student', class: data.class || '', section: data.section || '',
              contact: data.contact || '', dueAmount: summary.totalDue, status: summary.penaltyDue > 0 ? 'Penalty Applied' : 'Due'
            });
          }
        });

        setDueList(cloudDues);
      } catch (err) {
        console.error(err);
      }
    };
    fetchCloudDues();
  }, [selectedSchool]);

  const filtered = dueList.filter(item => {
    if (selectedClass !== 'ALL' && item.class !== selectedClass) return false;
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="glass-card" style={{ padding: 24 }}>
      <h2>Classwise Due Fees Directory</h2>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="form-input" style={{ width: 300 }}>
          <option value="ALL">All Classes</option>
          {[...new Set([...(classes || []), ...dueList.map(s => s.class)])].filter(Boolean).sort().map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="btn-secondary" onClick={async () => {
          if (!window.confirm("Assess Late Fees for all students in the selected view?")) return;
          // Implementation of late fee assessment
          try {
            const rules = [
              { id: 'sept_late', label: 'Late Fee – September', deadline: '2026-09-10', graceDays: 5, amount: 100, waiveIfCleared: false },
              { id: 'dec_late',  label: 'Late Fee – December',  deadline: '2026-12-10', graceDays: 5, amount: 500, waiveIfCleared: true  }
            ];
            
            let studentQ = collection(db, "students");
            if (selectedSchool && selectedSchool !== 'ALL') studentQ = query(studentQ, where("schoolId", "==", selectedSchool));
            const studentSnap = await getDocs(studentQ);
            const allStudents = studentSnap.docs.map(d => ({id: d.id, ...d.data()}));
            
            // Filter by class if needed
            const targetStudents = selectedClass === 'ALL' ? allStudents : allStudents.filter(s => s.class === selectedClass);
            
            const batch = writeBatch(db);
            let count = 0;
            
            for (const student of targetStudents) {
               const cSnap = await getDocs(query(collection(db, 'fee_charges'), where('studentId', '==', student.id)));
               if (cSnap.empty) continue; // Not billed yet
               
               const pSnap = await getDocs(query(collection(db, 'student_ledger'), where('studentId', '==', student.id), where('type', '==', 'credit')));
               const aSnap = await getDocs(query(collection(db, 'fee_adjustments'), where('studentId', '==', student.id), where('status', '==', 'approved')));
               
               const charges = cSnap.docs.map(d => ({id: d.id, ...d.data()}));
               const payments = pSnap.docs.map(d => ({id: d.id, ...d.data()}));
               const adjustments = aSnap.docs.map(d => ({id: d.id, ...d.data()}));
               
               const res = applyPaymentsAndAdjustments(charges, payments, adjustments);
               const penalties = calculatePenalties(res.ledger, new Date().toISOString(), rules);
               
               for (const p of penalties) {
                  // Ensure we don't already have this penalty in fee_charges
                  const exists = charges.some(c => c.type === 'penalty' && c.relatedRuleId === p.relatedRuleId);
                  if (!exists) {
                     const pid = `chg_${student.id}_${student.academicYear || 'AY_2025_26'}_penalty_${p.relatedRuleId}`;
                     batch.set(doc(collection(db, 'fee_charges'), pid), {
                        ...p,
                        id: pid,
                        studentId: student.id,
                        schoolId: selectedSchool,
                        academicYear: student.academicYear || 'AY_2025_26',
                        createdAt: new Date().toISOString()
                     }, { merge: true });
                     count++;
                  }
               }
            }
            await batch.commit();
            alert(`Successfully assessed ${count} new late fees.`);
            window.location.reload();
          } catch(e) {
             console.error(e);
             alert("Error assessing late fees.");
          }
        }}> Assess Late Fees </button>
        <button className="btn-primary" onClick={() => {
          const exportData = filtered.map(item => ({
            'Student Name': item.name,
            'Class': item.class,
            'Section': item.section,
            'Contact': item.contact,
            'Pending Amount (₹)': item.dueAmount,
            'Status': item.status
          }));
          const ws = XLSX.utils.json_to_sheet(exportData);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Due Fees List");
          XLSX.writeFile(wb, `Due_Fees_List_${selectedClass}_${new Date().toISOString().split('T')[0]}.xlsx`);
        }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Download size={16} /> Export to Excel
        </button>
      </div>


      <table className="modern-table">
        <thead>
          <tr>
            <th>Student</th>
            <th>Class</th>
            <th>Pending Amount</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(item => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>{item.class}</td>
              <td style={{ color: 'var(--danger)', fontWeight: 'bold' }}>₹ {item.dueAmount.toLocaleString()}</td>
              <td>
                <button className="btn-primary" onClick={() => onCollectFee(item.id)}>Collect</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// RECORD PAYMENT (V4 FIFO ALLOCATION)
// ────────────────────────────────────────────────────────────────────────────
function RecordPayment({ subOnNavigate, dict, prefilledStudentId, selectedSchool, userPermissions }) {
  const [allStudents, setAllStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(prefilledStudentId || '');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [manualAllocations, setManualAllocations] = useState({});
  const paymentAmount = Object.values(manualAllocations).reduce((sum, val) => sum + (Number(val) || 0), 0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Ledger state
  const [currentLedger, setCurrentLedger] = useState([]);
  const [currentSummary, setCurrentSummary] = useState(null);

  useEffect(() => {
    console.log("RecordPayment fetching students for school:", selectedSchool);
    getDocs(query(collection(db, "students"), where('schoolId', '==', selectedSchool)))
      .then(snap => {
        console.log("Students fetched count:", snap.size);
        setAllStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      })
      .catch(e => console.error("Students Query Error:", e));
  }, [selectedSchool]);

  useEffect(() => {
    if (!prefilledStudentId && allStudents.length > 0) setSelectedStudentId(allStudents[0].id);
  }, [allStudents, prefilledStudentId]);

  const selectedStudentObj = allStudents.find(s => s.id === selectedStudentId);

  useEffect(() => {
    const fetchLedger = async () => {
      if (!selectedStudentObj) return;
      try {
        const [paymentSnap, adjustmentSnap, settingsDoc, chargeSnap] = await Promise.all([
          getDocs(query(collection(db, 'student_ledger'), where('type', '==', 'credit'), where('studentId', '==', selectedStudentId))),
          getDocs(query(collection(db, 'fee_adjustments'), where('status', '==', 'approved'), where('studentId', '==', selectedStudentId))),
          getDoc(doc(db, 'school_settings', 'settings')),
          getDocs(query(collection(db, 'fee_charges'), where('studentId', '==', selectedStudentId)))
        ]);
        
        const payments = paymentSnap.docs.map(d => ({ ...d.data(), id: d.id }));
        const adjustments = adjustmentSnap.docs.map(d => ({ ...d.data(), id: d.id }));
        const storedSettings = settingsDoc.exists() ? (settingsDoc.data().schoolClassSettings || {}) : {};
        const classSettings = normalizeClassFeeSettings(storedSettings[selectedSchool]?.[selectedStudentObj.class] || {});
        const dbCharges = chargeSnap.docs.map(d => ({ ...d.data(), id: d.id }));

        if (dbCharges.length === 0) {
          setCurrentLedger([]);
          setCurrentSummary({
            totalDue: 0,
            totalPaid: 0,
            totalConcession: 0,
            advanceCredit: 0,
            ledger: [],
            missingCharges: true
          });
          return;
        }

        const summary = calculateStudentDue({
          student: selectedStudentObj,
          charges: dbCharges,
          classSettings,
          payments,
          adjustments
        });

        setCurrentLedger(summary.ledger);
        setCurrentSummary(summary);
      } catch (e) {
        console.error("fetchLedger failed:", e);
      }
    };
    fetchLedger();
  }, [selectedStudentId, selectedSchool, selectedStudentObj, refreshTrigger]);

  const previewAllocation = useMemo(() => {
    if (!currentLedger || !paymentAmount || isNaN(paymentAmount) || Number(paymentAmount) <= 0) return null;
    const virtualPayment = { id: 'preview', date: new Date().toISOString(), amount: Number(paymentAmount) };
    const res = applyPaymentsAndAdjustments(currentLedger, [virtualPayment], []);
    return res;
  }, [currentLedger, paymentAmount]);

  const handleRecordPayment = async () => {
    const val = Number(paymentAmount);
    if (!val || val <= 0) return alert("Enter a valid payment amount");
    if (!receiptNumber.trim()) return alert("Enter physical receipt number");
    if (!previewAllocation) return alert("Invalid state");

    setIsProcessing(true);
    try {
      const ledgerRef = doc(collection(db, "student_ledger"));
      const invoiceRef = doc(collection(db, "invoices"));
      const now = new Date().toISOString();

      const myAllocations = previewAllocation.allocations.filter(a => a.paymentId === 'preview');
      const allocatedChargeIds = myAllocations.map(a => a.chargeId);

      const myAllocationsForInvoice = myAllocations.map(a => {
        const charge = currentLedger.find(c => c.id === a.chargeId);
        let label = charge ? charge.label : a.componentId;
        if (label === 'September' || label.toLowerCase().includes('september')) {
          label = label.toLowerCase().includes('late fee') ? 'Late Fee - October / अक्टूबर लेट फीस' : 'October Installment / अक्टूबर की किस्त';
        }
        return {
          chargeId: a.chargeId,
          componentId: a.componentId,
          amount: a.amount,
          label: label
        };
      });

      const advanceAdded = previewAllocation.advanceCredit - (currentSummary?.advanceCredit || 0);
      if (advanceAdded > 0) {
        myAllocationsForInvoice.push({
          chargeId: 'advance',
          componentId: 'advance',
          amount: advanceAdded,
          label: 'Advance Payment / अग्रिम भुगतान'
        });
      }

      // Prevent duplicate receipt submission
      const existingInvoiceQ = query(collection(db, "invoices"), where("receiptId", "==", receiptNumber.trim()), where("schoolId", "==", selectedSchool));
      const existingInvoices = await getDocs(existingInvoiceQ);
      if (!existingInvoices.empty) {
        setIsProcessing(false);
        return alert("Duplicate receipt number detected for this school.");
      }

      await runTransaction(db, async (transaction) => {
        const auditData = {
          userId: auth.currentUser?.uid || 'unknown',
          role: userPermissions?.role || 'unknown',
          timestamp: now,
          action: 'record_payment',
          academicYearId: selectedStudentObj?.academicYear || getAcademicYear(),
          schoolId: selectedSchool,
          relevantChargeIds: allocatedChargeIds
        };

        transaction.set(ledgerRef, {
          studentId: selectedStudentId,
          amount: val,
          type: 'credit',
          receiptNumber: receiptNumber.trim(),
          date: now,
          status: 'completed',
          recordedBy: auditData.userId,
          schoolId: selectedSchool,
          academicYear: auditData.academicYearId,
          allocations: myAllocations,
          auditTrail: auditData
        });

        transaction.set(invoiceRef, {
          receiptId: receiptNumber.trim(),
          receiptNo: receiptNumber.trim(),
          student: selectedStudentObj?.name || '',
          class: selectedStudentObj?.class || '',
          studentId: selectedStudentId,
          date: now,
          amount: val,
          status: 'Paid',
          schoolId: selectedSchool,
          allocations: myAllocationsForInvoice
        });
      });
      
      alert(`Payment of ₹${val} recorded successfully!`);
      setManualAllocations({});
      setReceiptNumber('');
      setRefreshTrigger(prev => prev + 1);
    } catch (e) {
      console.error(e);
      alert("Error: " + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="glass-card" style={{ padding: 24 }}>
        <h2>{dict.recordFeePayment}</h2>
        
        <select className="form-input" value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)} style={{ marginBottom: 20 }}>
          {allStudents.map(s => <option key={s.id} value={s.id}>{s.name} - {s.class}</option>)}
        </select>

        {/* TRANSPARENT STATEMENT */}
        {currentSummary ? (
          <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, marginBottom: 20 }}>
            <div data-testid="debug-summary" style={{ display: 'none' }}>{JSON.stringify(currentSummary)}</div>
            <h3 style={{ marginTop: 0 }}>{dict.financialSummary}</h3>
            <table className="modern-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>{dict.feeCategory}</th>
                  <th>Total Due</th>
                  <th>Previously Paid</th>
                  <th>Collecting Now</th>
                  <th>Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {currentSummary.ledger.map((c, index) => {
                  let isPreviousFullyCovered = true;
                  for (let i = 0; i < index; i++) {
                    const prevCharge = currentSummary.ledger[i];
                    const prevInput = Number(manualAllocations[prevCharge.id]) || 0;
                    if (prevCharge.netDue > 0 && prevInput < prevCharge.netDue) {
                      isPreviousFullyCovered = false;
                      break;
                    }
                  }
                  
                  const isFullyPaid = c.netDue === 0;
                  const isInputDisabled = isFullyPaid || !isPreviousFullyCovered;

                  const collectingNowAmount = manualAllocations[c.id] !== undefined ? manualAllocations[c.id] : '';
                  const balanceAfter = c.netDue - (Number(collectingNowAmount) || 0);
                  
                  let displayLabel = c.label;
                  if (displayLabel === 'September' || displayLabel.toLowerCase().includes('september')) {
                    displayLabel = displayLabel.toLowerCase().includes('late fee') ? 'Late Fee - October / अक्टूबर लेट फीस' : 'October Installment / अक्टूबर की किस्त';
                  }

                  return (
                    <tr key={c.id}>
                      <td>{displayLabel}</td>
                      <td>₹{c.originalAmount - c.allocatedAdjusted}</td>
                      <td style={{ color: 'var(--success)' }}>₹{c.allocatedPaid}</td>
                      <td style={{ color: 'var(--brand-primary)', fontWeight: 'bold' }}>
                        <input
                          type="number"
                          className="form-input"
                          style={{ width: 120, padding: '4px 8px', borderColor: isInputDisabled ? 'transparent' : 'var(--brand-primary)' }}
                          disabled={isInputDisabled}
                          max={c.netDue}
                          value={collectingNowAmount}
                          onChange={e => {
                            let val = e.target.value;
                            if (val !== '' && Number(val) > c.netDue) val = c.netDue;
                            setManualAllocations(prev => ({ ...prev, [c.id]: val }));
                          }}
                          placeholder={isFullyPaid ? "Paid" : "₹ 0"}
                        />
                      </td>
                      <td style={{ fontWeight: 'bold' }}>₹{balanceAfter}</td>
                      <td>
                         <span className={`badge ${balanceAfter === 0 ? 'success' : balanceAfter < (c.originalAmount - c.allocatedAdjusted) ? 'warning' : 'danger'}`}>
                           {balanceAfter === 0 ? 'PAID' : balanceAfter < (c.originalAmount - c.allocatedAdjusted) ? 'PARTIAL' : 'DUE'}
                         </span>
                      </td>
                    </tr>
                  );
                })}
                {(() => {
                  let allChargesFullyCovered = true;
                  for (const c of currentSummary.ledger) {
                    if (c.netDue > 0 && (Number(manualAllocations[c.id]) || 0) < c.netDue) {
                      allChargesFullyCovered = false;
                      break;
                    }
                  }
                  const advanceVal = manualAllocations['advance'] !== undefined ? manualAllocations['advance'] : '';
                  
                  return (
                    <tr>
                      <td style={{ fontWeight: 'bold', color: 'var(--success)' }}>Advance Payment / अग्रिम भुगतान</td>
                      <td>-</td>
                      <td>-</td>
                      <td>
                        <input
                           type="number"
                           className="form-input"
                           style={{ width: 120, padding: '4px 8px', borderColor: !allChargesFullyCovered ? 'transparent' : 'var(--brand-primary)' }}
                           disabled={!allChargesFullyCovered}
                           value={advanceVal}
                           onChange={e => setManualAllocations(prev => ({ ...prev, 'advance': e.target.value }))}
                           placeholder="₹ 0"
                        />
                      </td>
                      <td colSpan="2">-</td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
            <div style={{ marginTop: 10, fontSize: 16, fontWeight: 'bold', color: 'var(--danger)' }}>
              {dict.outstandingDue}: ₹{currentSummary.totalDue}
            </div>
            {currentSummary.advanceCredit > 0 && (
              <div style={{ color: 'var(--success)', fontWeight: 'bold' }}>{dict.walletBalance}: ₹{currentSummary.advanceCredit}</div>
            )}
          </div>
        ) : null}

        {/* PAYMENT INPUT */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <label className="form-label">{dict.amountReceived} (Auto-Sum)</label>
            <div style={{ fontSize: 24, fontWeight: '900', padding: '10px 0', color: 'var(--success)' }}>
              ₹ {paymentAmount}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <label className="form-label">{dict.receiptVoucherNo}</label>
            <input type="text" className="form-input" value={receiptNumber} onChange={e => setReceiptNumber(e.target.value)} placeholder="Physical Book #" />
          </div>
        </div>

        <button className="btn-primary" onClick={handleRecordPayment} disabled={isProcessing || !paymentAmount || !receiptNumber}>
          {isProcessing ? 'Recording...' : dict.recordFeePayment}
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// FEE ADJUSTMENT MODULE (V4 Exact Charge Selection)
// ────────────────────────────────────────────────────────────────────────────
function FeeAdjustmentModule({ selectedSchool, userPermissions }) {
  const [students, setStudents] = useState([]);
  const [studentId, setStudentId] = useState('');
  const [currentLedger, setCurrentLedger] = useState([]);
  const [selectedChargeId, setSelectedChargeId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const selectedStudentObj = students.find(s => s.id === studentId);

  useEffect(() => {
    getDocs(query(collection(db, 'students'), where('schoolId', '==', selectedSchool)))
      .then(snap => setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [selectedSchool]);

  useEffect(() => {
    const fetchLedger = async () => {
      if (!selectedStudentObj) { setCurrentLedger([]); return; }
      
      try {
        const [paymentSnap, adjustmentSnap, settingsDoc, chargeSnap] = await Promise.all([
          getDocs(query(collection(db, 'student_ledger'), where('type', '==', 'credit'), where('studentId', '==', studentId))),
          getDocs(query(collection(db, 'fee_adjustments'), where('status', '==', 'approved'), where('studentId', '==', studentId))),
          getDoc(doc(db, 'school_settings', 'settings')),
          getDocs(query(collection(db, 'fee_charges'), where('studentId', '==', studentId)))
        ]);
        
        const payments = paymentSnap.docs.map(d => ({ ...d.data(), id: d.id }));
        const adjustments = adjustmentSnap.docs.map(d => ({ ...d.data(), id: d.id }));
        const storedSettings = settingsDoc.exists() ? (settingsDoc.data().schoolClassSettings || {}) : {};
        const classSettings = normalizeClassFeeSettings(storedSettings[selectedSchool]?.[selectedStudentObj.class] || {});
        const dbCharges = chargeSnap.docs.map(d => ({ ...d.data(), id: d.id }));

        if (dbCharges.length === 0) {
          setCurrentLedger([]);
          return;
        }

        const summary = calculateStudentDue({
          student: selectedStudentObj,
          charges: dbCharges,
          classSettings,
          payments,
          adjustments
        });

        setCurrentLedger(summary.ledger.filter(c => c.netDue > 0));
      } catch (e) { console.error(e); }
    };
    fetchLedger();
  }, [studentId, students, selectedSchool, selectedStudentObj, refreshTrigger]);

  const handleAdjustment = async () => {
    const value = Number(amount);
    if (!studentId || !selectedChargeId || value <= 0 || !reason.trim()) return alert("Fill all fields correctly");
    
    const targetCharge = currentLedger.find(c => c.id === selectedChargeId);
    if (value > targetCharge.netDue) return alert("Adjustment cannot exceed the net due of this charge");

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const auditData = {
        userId: auth.currentUser?.uid || 'unknown',
        role: userPermissions?.role || 'unknown',
        timestamp: now,
        action: 'create_adjustment',
        academicYearId: selectedStudentObj?.academicYear || getAcademicYear(),
        schoolId: selectedSchool,
        relevantChargeIds: [selectedChargeId]
      };

      await addDoc(collection(db, 'fee_adjustments'), {
        studentId,
        chargeId: selectedChargeId,
        amount: value,
        reason: reason.trim(),
        status: 'approved',
        type: 'waiver',
        schoolId: selectedSchool,
        academicYear: auditData.academicYearId,
        recordedBy: auditData.userId,
        auditTrail: auditData,
        createdAt: now
      });
      alert('Adjustment saved successfully!');
      setAmount(''); setReason(''); setSelectedChargeId('');
      setRefreshTrigger(prev => prev + 1);
    } catch (e) {
      console.error(e);
      alert('Failed: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="glass-card" style={{ padding: 24 }}>
      <h2>Reduce Fee / फीस कम करें</h2>
      <div className="form-group">
        <label className="form-label">Select Student</label>
        <select className="form-input" value={studentId} onChange={e => setStudentId(e.target.value)}>
          <option value="">-- Choose --</option>
          {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      
      {currentLedger.length > 0 && (
        <div className="form-group">
          <label className="form-label">Select Unpaid Charge to Adjust</label>
          <select className="form-input" value={selectedChargeId} onChange={e => setSelectedChargeId(e.target.value)}>
            <option value="">-- Select Charge --</option>
            {currentLedger.map(c => <option key={c.id} value={c.id}>{c.label} (Due: ₹{c.netDue})</option>)}
          </select>
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Adjustment Amount</label>
        <input type="number" className="form-input" value={amount} onChange={e => setAmount(e.target.value)} />
      </div>

      <div className="form-group">
        <label className="form-label">Audit Reason (Mandatory)</label>
        <input type="text" className="form-input" value={reason} onChange={e => setReason(e.target.value)} />
      </div>

      <button className="btn-primary" onClick={handleAdjustment} disabled={isSaving || !selectedChargeId}>
        {isSaving ? 'Saving...' : 'Reduce Fee / फीस कम करें'}
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// INVOICES (Read-Only History)
// ────────────────────────────────────────────────────────────────────────────
function InvoicesModule({ selectedSchool, dict }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchInvoices = async () => {
      setLoading(true);
      try {
        let q = collection(db, "invoices");
        if (selectedSchool && selectedSchool !== 'ALL') {
          q = query(q, where("schoolId", "==", selectedSchool));
        }
        const qs = await getDocs(q);
        const list = qs.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        setInvoices(list);
      } catch (err) {
        console.error("Error fetching invoices:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchInvoices();
  }, [selectedSchool]);

  const filteredInvoices = invoices.filter(inv => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (inv.student || '').toLowerCase().includes(s) ||
      (inv.receiptId || '').toLowerCase().includes(s) ||
      (inv.receiptNo || '').toLowerCase().includes(s) ||
      (inv.class || '').toLowerCase().includes(s)
    );
  });

  return (
    <div className="glass-card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{dict?.invoicesAndReceipts || 'Issued Receipts & History'}</h2>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {filteredInvoices.length} receipt(s) found
          </span>
        </div>
        <div style={{ position: 'relative', minWidth: 260 }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search by student, receipt no, class..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 36, width: '100%' }}
          />
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
          Loading receipts...
        </div>
      ) : filteredInvoices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
          No issued receipts found.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="modern-table">
            <thead>
              <tr>
                <th>{dict?.receiptNo || 'Receipt No'}</th>
                <th>Student</th>
                <th>Class</th>
                <th>Fee Breakdown</th>
                <th>Amount</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map(inv => (
                <tr key={inv.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    {inv.receiptId || inv.receiptNo || inv.id?.slice(0, 10)}
                  </td>
                  <td style={{ fontWeight: 600 }}>{inv.student || 'N/A'}</td>
                  <td>
                    <span className="badge" style={{ backgroundColor: 'var(--bg-secondary)' }}>{inv.class || 'N/A'}</span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {inv.allocations && inv.allocations.length > 0
                      ? inv.allocations.map(a => `${a.label || a.componentId}: ₹${a.amount}`).join(', ')
                      : 'Fee Payment'}
                  </td>
                  <td style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>
                    ₹{Number(inv.amount || 0).toLocaleString()}
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {inv.date ? new Date(inv.date).toLocaleDateString() : 'N/A'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn-secondary"
                      style={{ padding: '6px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      onClick={() => generateFeeReceipt(inv, { name: inv.student, class: inv.class, id: inv.studentId })}
                      title="Print / Download Receipt"
                    >
                      <Printer size={14} /> Print Receipt
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

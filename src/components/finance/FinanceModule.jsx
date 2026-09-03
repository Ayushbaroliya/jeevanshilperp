import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, CreditCard, Briefcase, Plus, Download, Filter, AlertCircle, Phone, MessageSquare, Printer, CheckCircle, Search, Layers, FileText, RotateCcw } from 'lucide-react';
import { collection, getDocs, doc, runTransaction, query, where, orderBy, addDoc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { t } from '../../utils/translations';
import SchoolFolderPicker from '../common/SchoolFolderPicker';
import { generateChargeSchedule, calculateOpeningArrears, calculatePenalties, applyPaymentsAndAdjustments, summarizeDues } from '../../utils/feeEngine';
import * as XLSX from 'xlsx';

function normalizeClassFeeSettings(settings) {
  if (!settings) return { components: [] };
  if (Array.isArray(settings)) return { components: settings };
  if (settings.components && Array.isArray(settings.components)) return settings;
  const components = [];
  if (settings.admission > 0) components.push({ id: 'admission', name: 'Admission Fee', amount: settings.admission, schedule: [{ dueDate: '2026-04-10', label: '1st Installment' }] });
  if (settings.tuition > 0) components.push({ id: 'tuition', name: 'Tuition Fee', amount: settings.tuition, schedule: [{ dueDate: '2026-04-10', label: 'April' }, { dueDate: '2026-09-10', label: 'September' }] });
  return { components };
}

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
        if (selectedSchool && selectedSchool !== 'ALL') studentQ = query(studentQ, where("schoolId", "==", selectedSchool));
        
        const [studentSnap, paymentSnap, adjustmentSnap, settingsDoc] = await Promise.all([
          getDocs(studentQ),
          getDocs(query(collection(db, 'student_ledger'), where('schoolId', '==', selectedSchool), where('type', '==', 'credit'))),
          getDocs(query(collection(db, 'fee_adjustments'), where('schoolId', '==', selectedSchool), where('status', '==', 'approved'))),
          getDoc(doc(db, 'school_settings', 'settings'))
        ]);

        const paymentsByStudent = {};
        paymentSnap.forEach(d => { const p = d.data(); (paymentsByStudent[p.studentId] ||= []).push({ ...p, id: d.id }); });
        
        const adjustmentsByStudent = {};
        adjustmentSnap.forEach(d => { const a = d.data(); (adjustmentsByStudent[a.studentId] ||= []).push({ ...a, id: d.id }); });

        const storedSettings = settingsDoc.exists() ? (settingsDoc.data().schoolClassSettings || {}) : {};

        const cloudDues = [];
        studentSnap.forEach((d) => {
          const data = d.data();
          const academicYear = data.academicYear || getAcademicYear();
          const classSettings = normalizeClassFeeSettings(storedSettings[selectedSchool]?.[data.class] || {});
          
          // RUN ENGINE
          const baseCharges = generateChargeSchedule(data, classSettings, academicYear);
          const arrears = calculateOpeningArrears(data, Number(data.dueAmount || 0), academicYear); // Legacy fallback mapping
          const withArrears = [...arrears, ...baseCharges];
          
          const rules = [
            { id: 'sept_late', label: 'Late Fee – September', deadline: '2026-09-10', graceDays: 5, amount: 100, waiveIfCleared: false },
            { id: 'dec_late',  label: 'Late Fee – December',  deadline: '2026-12-10', graceDays: 5, amount: 500, waiveIfCleared: true  }
          ];
          const penalties = calculatePenalties(withArrears, new Date().toISOString(), rules);
          const fullCharges = [...withArrears, ...penalties];

          const res = applyPaymentsAndAdjustments(fullCharges, paymentsByStudent[d.id] || [], adjustmentsByStudent[d.id] || []);
          const summary = summarizeDues(data, res.ledger, res.advanceCredit);

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
      <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="form-input" style={{ width: 300, marginBottom: 20 }}>
        <option value="ALL">All Classes</option>
        {[...new Set(dueList.map(s => s.class))].sort().map(c => <option key={c} value={c}>{c}</option>)}
      </select>

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
  const [paymentAmount, setPaymentAmount] = useState('');
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
        const [paymentSnap, adjustmentSnap, settingsDoc] = await Promise.all([
          getDocs(query(collection(db, 'student_ledger'), where('schoolId', '==', selectedSchool), where('type', '==', 'credit'), where('studentId', '==', selectedStudentId))),
          getDocs(query(collection(db, 'fee_adjustments'), where('schoolId', '==', selectedSchool), where('status', '==', 'approved'), where('studentId', '==', selectedStudentId))),
          getDoc(doc(db, 'school_settings', 'settings'))
        ]);
        
        const payments = paymentSnap.docs.map(d => ({ ...d.data(), id: d.id }));
        const adjustments = adjustmentSnap.docs.map(d => ({ ...d.data(), id: d.id }));
        const storedSettings = settingsDoc.exists() ? (settingsDoc.data().schoolClassSettings || {}) : {};
        const classSettings = normalizeClassFeeSettings(storedSettings[selectedSchool]?.[selectedStudentObj.class] || {});
        const academicYear = selectedStudentObj.academicYear || getAcademicYear();

        const baseCharges = generateChargeSchedule(selectedStudentObj, classSettings, academicYear);
        const arrears = calculateOpeningArrears(selectedStudentObj, Number(selectedStudentObj.dueAmount || 0), academicYear);
        const rules = [
          { id: 'sept_late', label: 'Late Fee – September', deadline: '2026-09-10', graceDays: 5, amount: 100, waiveIfCleared: false },
          { id: 'dec_late',  label: 'Late Fee – December',  deadline: '2026-12-10', graceDays: 5, amount: 500, waiveIfCleared: true  }
        ];
        
        const withArrears = [...arrears, ...baseCharges];
        const penalties = calculatePenalties(withArrears, new Date().toISOString(), rules);
        const fullCharges = [...withArrears, ...penalties];

        const res = applyPaymentsAndAdjustments(fullCharges, payments, adjustments);
        setCurrentLedger(res.ledger);
        setCurrentSummary(summarizeDues(selectedStudentObj, res.ledger, res.advanceCredit));
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
          student: selectedStudentObj?.name || '',
          class: selectedStudentObj?.class || '',
          studentId: selectedStudentId,
          date: now,
          amount: val,
          status: 'Paid',
          schoolId: selectedSchool
        });
      });
      
      alert(`Payment of ₹${val} recorded successfully!`);
      setPaymentAmount('');
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
        <h2>Record Payment (FIFO Allocation)</h2>
        
        <select className="form-input" value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)} style={{ marginBottom: 20 }}>
          {allStudents.map(s => <option key={s.id} value={s.id}>{s.name} - {s.class}</option>)}
        </select>

        {/* TRANSPARENT STATEMENT */}
        {currentSummary ? (
          <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, marginBottom: 20 }}>
            <div data-testid="debug-summary" style={{ display: 'none' }}>{JSON.stringify(currentSummary)}</div>
            <h3 style={{ marginTop: 0 }}>Transparent Student Statement</h3>
            <table className="modern-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Charge / Penalty</th>
                  <th>Original</th>
                  <th>Adjusted</th>
                  <th>Paid</th>
                  <th>Net Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {currentSummary.ledger.map(c => (
                  <tr key={c.id}>
                    <td>{c.label}</td>
                    <td>{c.originalAmount}</td>
                    <td style={{ color: 'var(--warning)' }}>{c.allocatedAdjusted}</td>
                    <td style={{ color: 'var(--success)' }}>{c.allocatedPaid}</td>
                    <td style={{ fontWeight: 'bold' }}>{c.netDue}</td>
                    <td>
                       <span className={`badge ${c.status === 'paid' ? 'success' : c.status === 'partial' ? 'warning' : 'danger'}`}>
                         {c.status.toUpperCase()}
                       </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 10, fontSize: 16, fontWeight: 'bold', color: 'var(--danger)' }}>
              Total Outstanding: ₹{currentSummary.totalDue}
            </div>
            {currentSummary.advanceCredit > 0 && (
              <div style={{ color: 'var(--success)', fontWeight: 'bold' }}>Advance Credit: ₹{currentSummary.advanceCredit}</div>
            )}
          </div>
        ) : null}

        {/* PAYMENT INPUT */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <label className="form-label">Total Payment Amount (₹)</label>
            <input type="number" className="form-input" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="e.g. 2000" />
          </div>
          <div style={{ flex: 1 }}>
            <label className="form-label">Receipt Number</label>
            <input type="text" className="form-input" value={receiptNumber} onChange={e => setReceiptNumber(e.target.value)} placeholder="Physical Book #" />
          </div>
        </div>

        {/* FIFO PREVIEW */}
        {previewAllocation && (
          <div style={{ padding: 16, background: 'rgba(16, 185, 129, 0.1)', borderRadius: 8, marginBottom: 20 }}>
            <h4 style={{ margin: '0 0 10px' }}>Allocation Preview (Auto-calculated)</h4>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {previewAllocation.allocations.filter(a => a.paymentId === 'preview').map((alloc, i) => (
                <li key={i}>Allocating <strong>₹{alloc.amount}</strong> to <em>{alloc.componentId} ({alloc.chargeId})</em></li>
              ))}
            </ul>
            {previewAllocation.advanceCredit > (currentSummary?.advanceCredit || 0) && (
              <div style={{ color: 'var(--success)', marginTop: 10, fontWeight: 'bold' }}>
                + ₹{previewAllocation.advanceCredit - (currentSummary?.advanceCredit || 0)} will be stored as Advance Credit
              </div>
            )}
          </div>
        )}

        <button className="btn-primary" onClick={handleRecordPayment} disabled={isProcessing || !paymentAmount || !receiptNumber}>
          {isProcessing ? 'Recording...' : 'Record Single Payment'}
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
        const [paymentSnap, adjustmentSnap, settingsDoc] = await Promise.all([
          getDocs(query(collection(db, 'student_ledger'), where('schoolId', '==', selectedSchool), where('type', '==', 'credit'), where('studentId', '==', studentId))),
          getDocs(query(collection(db, 'fee_adjustments'), where('schoolId', '==', selectedSchool), where('status', '==', 'approved'), where('studentId', '==', studentId))),
          getDoc(doc(db, 'school_settings', 'settings'))
        ]);
        
        const payments = paymentSnap.docs.map(d => ({ ...d.data(), id: d.id }));
        const adjustments = adjustmentSnap.docs.map(d => ({ ...d.data(), id: d.id }));
        const storedSettings = settingsDoc.exists() ? (settingsDoc.data().schoolClassSettings || {}) : {};
        const classSettings = normalizeClassFeeSettings(storedSettings[selectedSchool]?.[selectedStudentObj.class] || {});
        
        const academicYear = selectedStudentObj.academicYear || getAcademicYear();
        const baseCharges = generateChargeSchedule(selectedStudentObj, classSettings, academicYear);
        const arrears = calculateOpeningArrears(selectedStudentObj, Number(selectedStudentObj.dueAmount || 0), academicYear);
        const penalties = calculatePenalties([...arrears, ...baseCharges], new Date().toISOString(), []);
        
        const fullCharges = [...arrears, ...baseCharges, ...penalties];
        const res = applyPaymentsAndAdjustments(fullCharges, payments, adjustments);
        setCurrentLedger(res.ledger.filter(c => c.netDue > 0)); 
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
      <h2>Adjust / Waive Exact Charge</h2>
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
        {isSaving ? 'Saving...' : 'Apply Waiver'}
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// INVOICES (Read-Only History)
// ────────────────────────────────────────────────────────────────────────────
function InvoicesModule({ selectedSchool }) {
  const [invoices, setInvoices] = useState([]);
  useEffect(() => {
    let q = query(collection(db, "invoices"), orderBy("date", "desc"));
    if (selectedSchool !== 'ALL') q = query(q, where("schoolId", "==", selectedSchool));
    getDocs(q).then(qs => setInvoices(qs.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [selectedSchool]);

  return (
    <div className="glass-card" style={{ padding: 24 }}>
      <h2>Receipt History</h2>
      <table className="modern-table">
        <thead><tr><th>Receipt No</th><th>Student</th><th>Amount</th><th>Date</th></tr></thead>
        <tbody>
          {invoices.map(inv => (
            <tr key={inv.id}>
              <td>{inv.receiptId}</td>
              <td>{inv.student}</td>
              <td>₹{inv.amount}</td>
              <td>{new Date(inv.date).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

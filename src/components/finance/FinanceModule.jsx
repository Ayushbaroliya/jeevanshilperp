import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, CreditCard, Briefcase, Plus, Download, Filter, AlertCircle, Phone, MessageSquare, Printer, CheckCircle, Search, Layers, FileText, RotateCcw } from 'lucide-react';
import { collection, getDocs, doc, runTransaction, query, where, orderBy, addDoc, getDoc, updateDoc , writeBatch} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { auth, db } from '../../firebase';
import { t, SCHOOLS } from '../../utils/translations';
import SchoolFolderPicker from '../common/SchoolFolderPicker';
import { 
  calculateStudentDue, 
  normalizeClassFeeSettings, 
  calculatePenalties, 
  applyPaymentsAndAdjustments, 
  summarizeDues,
  sortLedgerCharges,
  getJSPSFeeComponents,
  getJSICFeeComponents,
  getSchoolDefaultFeeComponents
} from '../../utils/feeEngine';
import { generateFeeReceipt } from '../../utils/pdfGenerator';

function getAcademicYear() {
  return "2026-2027";
}

const SCHOOL_OPTIONS = SCHOOLS.map(s => ({ id: s.id, name: s.name }));

export default function FinanceModule({ onNavigate, userPermissions, lang = 'en', selectedSchool, setSelectedSchool, classes = [], activeAcademicYearId = 'AY_2026_27' }) {
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

      {activeTab === 'classwise' && (
        <ClasswiseDueFeesReport
          onCollectFee={handleSelectStudentForPayment}
          onNavigate={onNavigate}
          dict={dict}
          selectedSchool={selectedSchool}
          classes={classes}
          activeAcademicYearId={activeAcademicYearId}
        />
      )}
      {activeTab === 'record' && canRecord && (
        <RecordPayment
          subOnNavigate={onNavigate}
          dict={dict}
          prefilledStudentId={prefilledStudentId}
          selectedSchool={selectedSchool}
          setSelectedSchool={setSelectedSchool}
          userPermissions={userPermissions}
          classes={classes}
          activeAcademicYearId={activeAcademicYearId}
        />
      )}
      {activeTab === 'adjustments' && canAdjust && (
        <FeeAdjustmentModule
          selectedSchool={selectedSchool}
          setSelectedSchool={setSelectedSchool}
          classes={classes}
          userPermissions={userPermissions}
          activeAcademicYearId={activeAcademicYearId}
        />
      )}
      {activeTab === 'invoices' && (
        <InvoicesModule
          subOnNavigate={onNavigate}
          userPermissions={userPermissions}
          dict={dict}
          selectedSchool={selectedSchool}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// CLASSWISE DUES REPORT (Strictly Using Permanent Fee Charges)
// ────────────────────────────────────────────────────────────────────────────
function ClasswiseDueFeesReport({ onCollectFee, onNavigate, dict, selectedSchool, classes = [], activeAcademicYearId = 'AY_2026_27' }) {
  const [selectedClass, setSelectedClass] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [dueList, setDueList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const canonicalYearId = activeAcademicYearId === '2026-2027' ? 'AY_2026_27' : (activeAcademicYearId || 'AY_2026_27');
  const canonicalYearLabel = canonicalYearId === 'AY_2026_27' ? '2026-2027' : (activeAcademicYearId || '2026-2027');

  useEffect(() => {
    const fetchCloudDues = async () => {
      setIsLoading(true);
      try {
        let studentQ = collection(db, "students");
        let chargeQ = collection(db, 'fee_charges');
        let paymentQ = collection(db, 'student_ledger');
        let adjustmentQ = collection(db, 'fee_adjustments');

        if (selectedSchool && selectedSchool !== 'ALL') {
          studentQ = query(studentQ, where("schoolId", "==", selectedSchool));
          chargeQ = query(chargeQ, where("schoolId", "==", selectedSchool));
          paymentQ = query(paymentQ, where("schoolId", "==", selectedSchool));
          adjustmentQ = query(adjustmentQ, where("schoolId", "==", selectedSchool));
        }
        
        const [studentSnap, paymentSnap, adjustmentSnap, chargeSnap, settingsDoc] = await Promise.all([
          getDocs(studentQ),
          getDocs(paymentQ),
          getDocs(adjustmentQ),
          getDocs(chargeQ),
          getDoc(doc(db, 'school_settings', 'settings')).catch(() => null)
        ]);

        const storedSettings = settingsDoc && settingsDoc.exists() ? (settingsDoc.data().schoolClassSettings || {}) : {};

        const paymentsByStudent = {};
        paymentSnap.forEach(d => {
          const p = d.data();
          if (p.type === 'credit' || !p.type) {
            (paymentsByStudent[p.studentId] ||= []).push({ ...p, id: d.id });
          }
        });
        
        const adjustmentsByStudent = {};
        adjustmentSnap.forEach(d => {
          const a = d.data();
          if (a.status === 'approved' || !a.status) {
            (adjustmentsByStudent[a.studentId] ||= []).push({ ...a, id: d.id });
          }
        });

        const chargesByStudent = {};
        chargeSnap.forEach(d => {
          const c = d.data();
          const isYearMatch = !c.academicYearId && !c.academicYear
            ? true
            : (c.academicYearId === canonicalYearId ||
               c.academicYear === canonicalYearLabel ||
               c.academicYearId === activeAcademicYearId ||
               c.academicYear === activeAcademicYearId ||
               c.academicYear === '2026-27');
          if (isYearMatch) {
            (chargesByStudent[c.studentId] ||= []).push({ ...c, id: d.id });
          }
        });

        const cloudDues = [];
        studentSnap.forEach((d) => {
          const data = d.data();
          if (data.status === 'Deleted' || data.status === 'archived' || data.isDeleted === true) return;
          const studentObj = { id: d.id, ...data };
          const studentSchool = data.schoolId || selectedSchool || 'SCH_01';
          const dbCharges = chargesByStudent[d.id] || [];

          let summary;
          if (dbCharges.length > 0) {
            const res = applyPaymentsAndAdjustments(
              dbCharges,
              paymentsByStudent[d.id] || [],
              adjustmentsByStudent[d.id] || []
            );
            summary = summarizeDues(studentObj, res.ledger, res.advanceCredit);
          } else {
            // If no permanent charges in DB for this student, fall back to class settings fee schedule
            let rawSettings = storedSettings[studentSchool]?.[data.class];
            if (!rawSettings || !rawSettings.components || rawSettings.components.length === 0) {
              rawSettings = {
                components: getSchoolDefaultFeeComponents(studentSchool, data.class, '2026-2027')
              };
            }
            const classSettings = normalizeClassFeeSettings(rawSettings);
            summary = calculateStudentDue({
              student: studentObj,
              charges: null,
              classSettings,
              payments: paymentsByStudent[d.id] || [],
              adjustments: adjustmentsByStudent[d.id] || []
            });
          }

          if (summary && summary.totalDue > 0) {
            cloudDues.push({
              id: d.id,
              name: data.name || 'Student',
              class: data.class || '',
              section: data.section || '',
              contact: data.contact || data.parentContact || '',
              dueAmount: summary.totalDue,
              status: summary.penaltyDue > 0 ? 'Penalty Applied' : 'Due'
            });
          }
        });

        setDueList(cloudDues);
      } catch (err) {
        console.error("fetchCloudDues error:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCloudDues();
  }, [selectedSchool, activeAcademicYearId]);

  const schoolClassList = useMemo(() => {
    const configured = (classes || []).filter(Boolean);
    const fromDues = dueList.map(s => s.class).filter(Boolean);
    return [...new Set([...configured, ...fromDues])].sort();
  }, [classes, dueList]);

  const filtered = dueList.filter(item => {
    if (selectedClass !== 'ALL' && item.class !== selectedClass) return false;
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="glass-card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Classwise Due Fees Directory</h2>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Branch: <strong>{SCHOOLS.find(s => s.id === selectedSchool)?.name || (selectedSchool === 'ALL' ? 'All Branches' : selectedSchool)}</strong> ({dueList.length} student{dueList.length === 1 ? '' : 's'} with outstanding dues)
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="form-input" style={{ width: 260 }}>
          <option value="ALL">All Classes</option>
          {schoolClassList.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        
        <div style={{ position: 'relative', minWidth: 240 }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search student name..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ paddingLeft: 36, width: '100%' }}
          />
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
        </div>

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
          XLSX.writeFile(wb, `Due_Fees_${selectedSchool}_${selectedClass}_${new Date().toISOString().split('T')[0]}.xlsx`);
        }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Download size={16} /> Export to Excel
        </button>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
          Loading due fees from permanent records...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
          No students with outstanding fee dues found in this view.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="modern-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Class</th>
                <th>Section</th>
                <th>Pending Amount</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600 }}>{item.name}</td>
                  <td>{item.class}</td>
                  <td>{item.section || 'A'}</td>
                  <td style={{ color: 'var(--danger)', fontWeight: 'bold' }}>₹ {item.dueAmount.toLocaleString()}</td>
                  <td>
                    <span className="badge danger">{item.status}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn-primary" onClick={() => onCollectFee(item.id)}>Collect</button>
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

// ────────────────────────────────────────────────────────────────────────────
// RECORD PAYMENT (School → Class → Student → Fee Record Workflow)
// ────────────────────────────────────────────────────────────────────────────
function RecordPayment({ subOnNavigate, dict, prefilledStudentId, selectedSchool, setSelectedSchool, userPermissions, classes = [], activeAcademicYearId = 'AY_2026_27' }) {
  const [currentSchool, setCurrentSchool] = useState(selectedSchool === 'ALL' ? 'SCH_02' : selectedSchool);
  const [selectedClass, setSelectedClass] = useState('');
  const [allSchoolStudents, setAllSchoolStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(prefilledStudentId || '');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [manualAllocations, setManualAllocations] = useState({});
  const paymentAmount = Object.values(manualAllocations).reduce((sum, val) => sum + (Number(val) || 0), 0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Sync if prop selectedSchool changes
  useEffect(() => {
    if (selectedSchool && selectedSchool !== 'ALL' && selectedSchool !== currentSchool) {
      setCurrentSchool(selectedSchool);
      setSelectedClass('');
      setSelectedStudentId('');
    }
  }, [selectedSchool]);

  // Ledger state
  const [currentLedger, setCurrentLedger] = useState([]);
  const [currentSummary, setCurrentSummary] = useState(null);

  // Fetch all students for the current school
  useEffect(() => {
    if (!currentSchool || currentSchool === 'ALL') {
      setAllSchoolStudents([]);
      return;
    }
    getDocs(query(collection(db, "students"), where('schoolId', '==', currentSchool)))
      .then(snap => {
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(s => s.status !== 'Deleted' && s.status !== 'archived' && !s.isDeleted);
        setAllSchoolStudents(list);
      })
      .catch(e => console.error("Students Query Error:", e));
  }, [currentSchool]);

  // Handle prefilledStudentId (e.g. from Due Fees "Collect" button)
  useEffect(() => {
    if (prefilledStudentId && allSchoolStudents.length > 0) {
      const target = allSchoolStudents.find(s => s.id === prefilledStudentId);
      if (target) {
        if (target.schoolId && target.schoolId !== currentSchool) {
          setCurrentSchool(target.schoolId);
          if (setSelectedSchool) setSelectedSchool(target.schoolId);
        }
        setSelectedClass(target.class || '');
        setSelectedStudentId(target.id);
      }
    }
  }, [prefilledStudentId, allSchoolStudents]);

  // School-specific classes
  const schoolClassList = useMemo(() => {
    const defaultClasses = currentSchool === 'SCH_01'
      ? ['Nursery', 'LKG', 'UKG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8']
      : currentSchool === 'SCH_03'
      ? ['Nursery', 'LKG', 'UKG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10']
      : ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12', 'Class 11 Art', 'Class 11 Science', 'Class 12 Art', 'Class 12 Science'];
    const fromProp = (currentSchool === selectedSchool && classes && classes.length > 0) ? classes : [];
    const fromStudents = allSchoolStudents.map(s => s.class).filter(Boolean);
    return [...new Set([...fromProp, ...fromStudents, ...defaultClasses])].filter(Boolean).sort();
  }, [currentSchool, selectedSchool, classes, allSchoolStudents]);

  // Students in selected school + selected class ONLY
  const classStudents = useMemo(() => {
    if (!selectedClass) return [];
    return allSchoolStudents
      .filter(s => s.class === selectedClass)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [allSchoolStudents, selectedClass]);

  const selectedStudentObj = allSchoolStudents.find(s => s.id === selectedStudentId);

  useEffect(() => {
    const fetchLedger = async () => {
      if (!selectedStudentObj) {
        setCurrentLedger([]);
        setCurrentSummary(null);
        return;
      }
      try {
        const [paymentSnap, adjustmentSnap, settingsDoc, chargeSnap] = await Promise.all([
          getDocs(query(collection(db, 'student_ledger'), where('type', '==', 'credit'), where('studentId', '==', selectedStudentId))),
          getDocs(query(collection(db, 'fee_adjustments'), where('status', '==', 'approved'), where('studentId', '==', selectedStudentId))),
          getDoc(doc(db, 'school_settings', 'settings')),
          getDocs(query(collection(db, 'fee_charges'), where('studentId', '==', selectedStudentId)))
        ]);
        
        const payments = paymentSnap.docs.map(d => ({ ...d.data(), id: d.id }));
        const adjustments = adjustmentSnap.docs.map(d => ({ ...d.data(), id: d.id }));
        const dbCharges = chargeSnap.docs.map(d => ({ ...d.data(), id: d.id }));

        let summary;
        if (dbCharges.length > 0) {
          const res = applyPaymentsAndAdjustments(dbCharges, payments, adjustments);
          summary = summarizeDues(selectedStudentObj, res.ledger, res.advanceCredit);
          summary.totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        } else {
          // If no charges in DB, normalize class settings
          const storedSettings = settingsDoc.exists() ? (settingsDoc.data().schoolClassSettings || {}) : {};
          let rawSettings = storedSettings[currentSchool]?.[selectedStudentObj.class];
          if (!rawSettings || !rawSettings.components || rawSettings.components.length === 0) {
            rawSettings = {
              components: getSchoolDefaultFeeComponents(currentSchool, selectedStudentObj.class, '2026-2027')
            };
          }
          const classSettings = normalizeClassFeeSettings(rawSettings);
          summary = calculateStudentDue({
            student: selectedStudentObj,
            charges: null,
            classSettings,
            payments,
            adjustments
          });
        }

        const sortedLedger = sortLedgerCharges(summary.ledger || []);
        summary.ledger = sortedLedger;
        setCurrentLedger(sortedLedger);
        setCurrentSummary(summary);
      } catch (e) {
        console.error("fetchLedger failed:", e);
      }
    };
    fetchLedger();
  }, [selectedStudentId, currentSchool, selectedStudentObj, refreshTrigger]);

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
      const existingInvoiceQ = query(collection(db, "invoices"), where("receiptId", "==", receiptNumber.trim()), where("schoolId", "==", currentSchool));
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
          schoolId: currentSchool,
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
          schoolId: currentSchool,
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
          schoolId: currentSchool,
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
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div className="glass-card" style={{ padding: 24 }}>
        <h2 style={{ marginTop: 0, marginBottom: 20, fontSize: 20, fontWeight: 800 }}>{dict.recordFeePayment}</h2>
        
        {/* HIERARCHICAL SELECTOR: School → Class → Student */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24, padding: 18, background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border-light)' }}>
          {/* 1. School Selector */}
          <div>
            <label className="form-label" style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span className="badge" style={{ padding: '2px 7px', fontSize: 11, background: 'var(--brand-primary)', color: '#fff' }}>1</span>
              Select School
            </label>
            <select
              id="fee-record-school-select"
              className="form-input"
              value={currentSchool}
              onChange={e => {
                const newSchool = e.target.value;
                setCurrentSchool(newSchool);
                if (setSelectedSchool) setSelectedSchool(newSchool);
                setSelectedClass('');
                setSelectedStudentId('');
                setManualAllocations({});
                setCurrentLedger([]);
                setCurrentSummary(null);
              }}
            >
              {SCHOOL_OPTIONS.map(sch => (
                <option key={sch.id} value={sch.id}>{sch.name}</option>
              ))}
            </select>
          </div>

          {/* 2. Class Selector */}
          <div>
            <label className="form-label" style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span className="badge" style={{ padding: '2px 7px', fontSize: 11, background: 'var(--brand-primary)', color: '#fff' }}>2</span>
              Select Class
            </label>
            <select
              id="fee-record-class-select"
              className="form-input"
              value={selectedClass}
              onChange={e => {
                setSelectedClass(e.target.value);
                setSelectedStudentId('');
                setManualAllocations({});
                setCurrentLedger([]);
                setCurrentSummary(null);
              }}
            >
              <option value="">-- Choose Class --</option>
              {schoolClassList.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* 3. Student Selector */}
          <div>
            <label className="form-label" style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span className="badge" style={{ padding: '2px 7px', fontSize: 11, background: 'var(--brand-primary)', color: '#fff' }}>3</span>
              Select Student
            </label>
            <select
              id="fee-record-student-select"
              className="form-input"
              disabled={!selectedClass}
              value={selectedStudentId}
              onChange={e => {
                setSelectedStudentId(e.target.value);
                setManualAllocations({});
              }}
              style={{
                opacity: !selectedClass ? 0.6 : 1,
                cursor: !selectedClass ? 'not-allowed' : 'pointer',
                borderColor: selectedStudentId ? 'var(--brand-primary)' : undefined
              }}
            >
              {!selectedClass ? (
                <option value="">Select Class first...</option>
              ) : classStudents.length === 0 ? (
                <option value="">No students found in {selectedClass}</option>
              ) : (
                <>
                  <option value="">-- Choose Student ({classStudents.length}) --</option>
                  {classStudents.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.roll ? `(Roll: ${s.roll})` : ''} {s.section ? `- ${s.section}` : ''}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>
        </div>

        {/* 4. FEE RECORD STATEMENT */}
        {!selectedStudentId ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: 8 }}>
            <AlertCircle size={32} style={{ margin: '0 auto 12px', opacity: 0.6 }} />
            <p style={{ margin: 0, fontWeight: 600 }}>Please select a School, Class, and Student above to view fee record and collect payments.</p>
          </div>
        ) : currentSummary ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                Student: <strong>{selectedStudentObj?.name}</strong> | Class: <strong>{selectedStudentObj?.class}</strong> {selectedStudentObj?.section ? `(${selectedStudentObj?.section})` : ''} {selectedStudentObj?.roll ? `| Roll: ${selectedStudentObj?.roll}` : ''}
              </span>
              <span className="badge" style={{ backgroundColor: 'var(--bg-secondary)', fontSize: 12 }}>
                {SCHOOLS.find(s => s.id === currentSchool)?.name || currentSchool}
              </span>
            </div>

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
                        <td>₹{c.originalAmount - (c.allocatedAdjusted || 0)}</td>
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
                           <span className={`badge ${balanceAfter === 0 ? 'success' : balanceAfter < (c.originalAmount - (c.allocatedAdjusted || 0)) ? 'warning' : 'danger'}`}>
                             {balanceAfter === 0 ? 'PAID' : balanceAfter < (c.originalAmount - (c.allocatedAdjusted || 0)) ? 'PARTIAL' : 'DUE'}
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
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-secondary)' }}>
            Loading student fee record...
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// FEE ADJUSTMENT MODULE (V4 Exact Charge Selection & 3-Step Cascading Dropdowns)
// ────────────────────────────────────────────────────────────────────────────
function FeeAdjustmentModule({ selectedSchool, setSelectedSchool, userPermissions, classes = [], activeAcademicYearId = 'AY_2026_27' }) {
  const [currentSchool, setCurrentSchool] = useState(() => (selectedSchool && selectedSchool !== 'ALL' ? selectedSchool : 'SCH_02'));
  const [selectedClass, setSelectedClass] = useState('');
  const [allSchoolStudents, setAllSchoolStudents] = useState([]);
  const [studentId, setStudentId] = useState('');
  const [currentLedger, setCurrentLedger] = useState([]);
  const [selectedChargeId, setSelectedChargeId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Sync if prop selectedSchool changes
  useEffect(() => {
    if (selectedSchool && selectedSchool !== 'ALL' && selectedSchool !== currentSchool) {
      setCurrentSchool(selectedSchool);
      setSelectedClass('');
      setStudentId('');
      setSelectedChargeId('');
      setCurrentLedger([]);
    }
  }, [selectedSchool]);

  // Fetch all active students for currentSchool
  useEffect(() => {
    if (!currentSchool || currentSchool === 'ALL') {
      setAllSchoolStudents([]);
      return;
    }
    getDocs(query(collection(db, 'students'), where('schoolId', '==', currentSchool)))
      .then(snap => {
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(s => s.status !== 'Deleted' && s.status !== 'archived' && !s.isDeleted);
        setAllSchoolStudents(list);
      })
      .catch(e => console.error("FeeAdjustmentModule students query error:", e));
  }, [currentSchool]);

  // School-specific classes
  const schoolClassList = useMemo(() => {
    const defaultClasses = currentSchool === 'SCH_01'
      ? ['Nursery', 'LKG', 'UKG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8']
      : currentSchool === 'SCH_03'
      ? ['Nursery', 'LKG', 'UKG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10']
      : ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12', 'Class 11 Art', 'Class 11 Science', 'Class 12 Art', 'Class 12 Science'];
    const fromProp = (currentSchool === selectedSchool && classes && classes.length > 0) ? classes : [];
    const fromStudents = allSchoolStudents.map(s => s.class).filter(Boolean);
    return [...new Set([...fromProp, ...fromStudents, ...defaultClasses])].filter(Boolean).sort();
  }, [currentSchool, selectedSchool, classes, allSchoolStudents]);

  // Students in selected school + selected class ONLY
  const classStudents = useMemo(() => {
    if (!selectedClass) return [];
    return allSchoolStudents
      .filter(s => s.class === selectedClass)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [allSchoolStudents, selectedClass]);

  const selectedStudentObj = allSchoolStudents.find(s => s.id === studentId);

  useEffect(() => {
    const fetchLedger = async () => {
      if (!selectedStudentObj || !studentId) {
        setCurrentLedger([]);
        return;
      }
      
      try {
        let paymentQ = query(collection(db, 'student_ledger'), where('type', '==', 'credit'), where('studentId', '==', studentId));
        let adjQ = query(collection(db, 'fee_adjustments'), where('status', '==', 'approved'), where('studentId', '==', studentId));
        if (currentSchool && currentSchool !== 'ALL') {
          paymentQ = query(paymentQ, where('schoolId', '==', currentSchool));
          adjQ = query(adjQ, where('schoolId', '==', currentSchool));
        }

        const [paymentSnap, adjustmentSnap, settingsDoc, chargeSnap] = await Promise.all([
          getDocs(paymentQ),
          getDocs(adjQ),
          getDoc(doc(db, 'school_settings', 'settings')),
          getDocs(query(collection(db, 'fee_charges'), where('studentId', '==', studentId)))
        ]);
        
        const payments = paymentSnap.docs.map(d => ({ ...d.data(), id: d.id }));
        const adjustments = adjustmentSnap.docs.map(d => ({ ...d.data(), id: d.id }));
        const storedSettings = settingsDoc.exists() ? (settingsDoc.data().schoolClassSettings || {}) : {};
        let rawSettings = storedSettings[currentSchool]?.[selectedStudentObj.class];
        if (!rawSettings || !rawSettings.components || rawSettings.components.length === 0) {
          rawSettings = {
            components: getSchoolDefaultFeeComponents(currentSchool, selectedStudentObj.class, '2026-2027')
          };
        }
        const classSettings = normalizeClassFeeSettings(rawSettings);
        const dbCharges = chargeSnap.docs.map(d => ({ ...d.data(), id: d.id }));

        const summary = calculateStudentDue({
          student: selectedStudentObj,
          charges: dbCharges.length > 0 ? dbCharges : null,
          classSettings,
          payments,
          adjustments
        });

        setCurrentLedger(summary.ledger.filter(c => c.netDue > 0));
      } catch (e) {
        console.error("fetchLedger failed in FeeAdjustmentModule:", e);
      }
    };
    fetchLedger();
  }, [studentId, currentSchool, selectedStudentObj, refreshTrigger]);

  const handleAdjustment = async () => {
    const value = Number(amount);
    if (!studentId || !selectedChargeId || value <= 0 || !reason.trim()) return alert("Fill all fields correctly");

    setIsSaving(true);
    try {
      const charge = currentLedger.find(c => c.id === selectedChargeId);
      if (!charge) return alert("Charge not found");
      if (value > charge.netDue) return alert("Adjustment exceeds current net due of the selected charge");

      const now = new Date().toISOString();
      await addDoc(collection(db, 'fee_adjustments'), {
        studentId,
        chargeId: selectedChargeId,
        amount: value,
        reason: reason.trim(),
        status: 'approved',
        date: now,
        createdAt: now,
        approvedBy: auth.currentUser?.uid || 'unknown',
        schoolId: currentSchool,
        academicYear: selectedStudentObj?.academicYear || activeAcademicYearId || getAcademicYear()
      });

      alert("Fee concession/adjustment applied successfully!");
      setAmount('');
      setReason('');
      setSelectedChargeId('');
      setRefreshTrigger(prev => prev + 1);
    } catch (e) {
      console.error(e);
      alert("Error: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div className="glass-card" style={{ padding: 24 }}>
        <h2 style={{ marginTop: 0, marginBottom: 20, fontSize: 20, fontWeight: 800 }}>Fee Adjustments & Concessions</h2>
        
        {/* 3-STEP HIERARCHICAL SELECTOR: School → Class → Student */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 24,
          padding: 18,
          background: 'var(--bg-secondary)',
          borderRadius: 10,
          border: '1px solid var(--border-light)'
        }}>
          {/* 1. School Selector */}
          <div>
            <label className="form-label" style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span className="badge" style={{ padding: '2px 7px', fontSize: 11, background: 'var(--brand-primary)', color: '#fff' }}>1</span>
              Select School
            </label>
            <select
              id="adjustment-school-select"
              className="form-input"
              value={currentSchool}
              onChange={e => {
                const newSchool = e.target.value;
                setCurrentSchool(newSchool);
                if (setSelectedSchool) setSelectedSchool(newSchool);
                setSelectedClass('');
                setStudentId('');
                setSelectedChargeId('');
                setCurrentLedger([]);
              }}
            >
              {SCHOOL_OPTIONS.map(sch => (
                <option key={sch.id} value={sch.id}>{sch.name}</option>
              ))}
            </select>
          </div>

          {/* 2. Class Selector */}
          <div>
            <label className="form-label" style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span className="badge" style={{ padding: '2px 7px', fontSize: 11, background: 'var(--brand-primary)', color: '#fff' }}>2</span>
              Select Class
            </label>
            <select
              id="adjustment-class-select"
              className="form-input"
              value={selectedClass}
              onChange={e => {
                setSelectedClass(e.target.value);
                setStudentId('');
                setSelectedChargeId('');
                setCurrentLedger([]);
              }}
            >
              <option value="">-- Choose Class --</option>
              {schoolClassList.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* 3. Student Selector */}
          <div>
            <label className="form-label" style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span className="badge" style={{ padding: '2px 7px', fontSize: 11, background: 'var(--brand-primary)', color: '#fff' }}>3</span>
              Select Student
            </label>
            <select
              id="adjustment-student-select"
              className="form-input"
              disabled={!selectedClass}
              value={studentId}
              onChange={e => {
                setStudentId(e.target.value);
                setSelectedChargeId('');
              }}
              style={{
                opacity: !selectedClass ? 0.6 : 1,
                cursor: !selectedClass ? 'not-allowed' : 'pointer',
                borderColor: studentId ? 'var(--brand-primary)' : undefined
              }}
            >
              {!selectedClass ? (
                <option value="">Select Class first...</option>
              ) : classStudents.length === 0 ? (
                <option value="">No students found in {selectedClass}</option>
              ) : (
                <>
                  <option value="">-- Choose Student ({classStudents.length}) --</option>
                  {classStudents.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.roll ? `(Roll: ${s.roll})` : ''} {s.section ? `- ${s.section}` : ''}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>
        </div>

        {/* DETAILS AND CONCESSION FORM */}
        {!studentId ? (
          <div style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: 8 }}>
            <AlertCircle size={32} style={{ margin: '0 auto 12px', opacity: 0.6 }} />
            <p style={{ margin: 0, fontWeight: 600 }}>Please select a School, Class, and Student above to apply fee adjustments and concessions.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {selectedStudentObj && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 8, flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Student: <strong>{selectedStudentObj.name}</strong> | Class: <strong>{selectedStudentObj.class}</strong> {selectedStudentObj.section ? `(${selectedStudentObj.section})` : ''} {selectedStudentObj.roll ? `| Roll: ${selectedStudentObj.roll}` : ''}
                </span>
                <span className="badge" style={{ backgroundColor: 'var(--card-bg)', fontSize: 12 }}>
                  {SCHOOLS.find(s => s.id === currentSchool)?.name || currentSchool}
                </span>
              </div>
            )}

            {currentLedger.length > 0 ? (
              <>
                <div>
                  <label className="form-label" style={{ fontWeight: 700 }}>Select Unpaid Fee Charge</label>
                  <select className="form-input" value={selectedChargeId} onChange={e => setSelectedChargeId(e.target.value)}>
                    <option value="">-- Choose specific charge to discount --</option>
                    {currentLedger.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.label} (Net Due: ₹{c.netDue})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedChargeId && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16, background: 'var(--bg-secondary)', borderRadius: 8 }}>
                    <div>
                      <label className="form-label" style={{ fontWeight: 700 }}>Concession Amount (₹)</label>
                      <input
                        type="number"
                        className="form-input"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        placeholder="e.g. 500"
                      />
                    </div>

                    <div>
                      <label className="form-label" style={{ fontWeight: 700 }}>Reason / Justification</label>
                      <input
                        type="text"
                        className="form-input"
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        placeholder="e.g. Sibling discount approved by Principal"
                      />
                    </div>

                    <button className="btn-primary" onClick={handleAdjustment} disabled={isSaving} style={{ alignSelf: 'flex-start' }}>
                      {isSaving ? "Saving..." : "Apply Concession"}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: 'var(--text-secondary)', padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, textAlign: 'center' }}>
                Student has no unpaid active charges available for adjustments.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// RECEIPT HISTORY (INVOICES)
// ────────────────────────────────────────────────────────────────────────────
function InvoicesModule({ subOnNavigate, userPermissions, dict, selectedSchool }) {
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

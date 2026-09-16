import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, CreditCard, Briefcase, BarChart2, Plus, Download, Filter, AlertCircle, Phone, MessageSquare, Printer, Trash2, CheckCircle, Search, Layers, FileText, RotateCcw, Calendar, RefreshCcw } from 'lucide-react';
import { collection, getDocs, doc, runTransaction, query, where, orderBy, addDoc, getDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import SchoolExpensesReport from './SchoolExpensesReport';
import ProfitAndLossReport from './ProfitAndLossReport';
import RecycleBin from './RecycleBin';
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
  getCleanFeeLabel,
  getJSPSFeeComponents,
  getJSICFeeComponents,
  getSchoolDefaultFeeComponents
} from '../../utils/feeEngine';
import { generateFeeReceipt } from '../../utils/pdfGenerator';

const isUserAdminOrOwner = (user) => {
  if (!user) return true;
  if (user.email === 'jeevanshilporg@gmail.com') return true;
  const r = (user.role || '').toLowerCase();
  return r === 'owner' || r === 'director' || r === 'admin' || r === 'administrator' || r.includes('admin');
};

const isOwnerOnly = (user) => {
  if (!user) return false;
  if (user.email === 'jeevanshilporg@gmail.com') return true;
  const r = (user.role || '').toLowerCase();
  return r === 'owner' || r === 'director';
};

function getAcademicYear() {
  return "2026-2027";
}

const SCHOOL_OPTIONS = SCHOOLS.map(s => ({ id: s.id, name: s.name }));

export default function FinanceModule({ onNavigate, userPermissions, lang = 'en', selectedSchool, setSelectedSchool, classes = [], activeAcademicYearId = 'AY_2026_27', currentUser }) {
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
        <button className={activeTab === 'expenses' ? 'btn-primary' : 'btn-secondary'} onClick={() => setActiveTab('expenses')} style={{ padding: '10px 18px', fontSize: 13, fontWeight: 700 }}>
          <Briefcase size={16} /> School Expenses
        </button>
        <button className={activeTab === 'pnl' ? 'btn-primary' : 'btn-secondary'} onClick={() => setActiveTab('pnl')} style={{ padding: '10px 18px', fontSize: 13, fontWeight: 700 }}>
          <BarChart2 size={16} /> Profit & Loss
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
        {isUserAdminOrOwner(currentUser) && (
          <button
            type="button"
            className={activeTab === 'recycle' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setActiveTab('recycle')}
            style={{
              padding: '10px 18px',
              fontSize: 13,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: activeTab === 'recycle' ? '#fff' : 'var(--danger, #ef4444)'
            }}
            title="Recycle Bin for Deleted Receipts & Expenses"
          >
            <Trash2 size={16} /> Recycle Bin
          </button>
        )}
      </div>

      {activeTab === 'recycle' && (
        <RecycleBin
          currentUser={currentUser}
          selectedSchool={selectedSchool}
          onBackToInvoices={() => setActiveTab('invoices')}
        />
      )}
      {activeTab === 'expenses' && (
        <SchoolExpensesReport
          selectedSchool={selectedSchool}
          classes={classes}
          activeAcademicYearId={activeAcademicYearId}
          dict={dict}
          currentUser={currentUser}
        />
      )}
      {activeTab === 'pnl' && (
        <ProfitAndLossReport
          selectedSchool={selectedSchool}
          dict={dict}
        />
      )}
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
          lang={lang}
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
          currentUser={currentUser}
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

function ReceiptModal({ receiptData, lang, onClose, onPrintPDF }) {
  if (!receiptData) return null;
  const { invoice, student, schoolName } = receiptData;
  const isHi = lang === 'hi';
  const receiptNo = invoice.receiptId || invoice.receiptNo || invoice.id || 'N/A';
  const date = invoice.date ? new Date(invoice.date).toLocaleDateString(isHi ? 'hi-IN' : 'en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString();
  const amount = Number(invoice.amount || 0);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: 16
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        color: '#1e293b',
        borderRadius: 16,
        width: '100%',
        maxWidth: 620,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
        animation: 'fadeIn 0.2s ease-out'
      }}>
        {/* Header Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)',
          color: '#ffffff',
          padding: '24px 28px',
          textAlign: 'center',
          position: 'relative'
        }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: '0.5px' }}>{schoolName}</h2>
          <div style={{
            display: 'inline-block',
            marginTop: 8,
            padding: '4px 14px',
            borderRadius: 20,
            background: 'rgba(255, 255, 255, 0.15)',
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: '1px',
            textTransform: 'uppercase'
          }}>
            {isHi ? 'अधिकृत फीस रसीद' : 'Official Fee Receipt'}
          </div>
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '50%',
              width: 32,
              height: 32,
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16
            }}
          >
            ✕
          </button>
        </div>

        {/* Receipt Content */}
        <div style={{ padding: '24px 28px', maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Metadata Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: '14px 18px',
            marginBottom: 20,
            fontSize: 13
          }}>
            <div>
              <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                {isHi ? 'रसीद क्र.' : 'Receipt No.'}
              </div>
              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 14 }}>{receiptNo}</div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                {isHi ? 'दिनांक' : 'Date'}
              </div>
              <div style={{ fontWeight: 700, color: '#0f172a' }}>{date}</div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                {isHi ? 'विद्यार्थी का नाम' : 'Student Name'}
              </div>
              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 14 }}>{student?.name || 'N/A'}</div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                {isHi ? 'कक्षा एवं सेक्शन' : 'Class & Section'}
              </div>
              <div style={{ fontWeight: 700, color: '#0f172a' }}>
                {student?.class || 'N/A'} {student?.section ? `(${student.section})` : ''} {student?.roll ? `| Roll: ${student.roll}` : ''}
              </div>
            </div>
          </div>

          {/* Allocations Breakdown Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 800, color: '#334155' }}>
                  {isHi ? 'विवरण' : 'Fee Description'}
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#334155', width: 130 }}>
                  {isHi ? 'राशि (₹)' : 'Amount (₹)'}
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.isArray(invoice.allocations) && invoice.allocations.length > 0 ? (
                invoice.allocations.map((alloc, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #e2e8f0', background: i % 2 === 1 ? '#fafafa' : '#ffffff' }}>
                    <td style={{ padding: '10px 12px', color: '#1e293b', fontWeight: 600 }}>
                      {getCleanFeeLabel(alloc.label, lang, alloc.componentId)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                      ₹{Number(alloc.amount).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))
              ) : (
                <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '10px 12px', color: '#1e293b', fontWeight: 600 }}>
                    {getCleanFeeLabel(invoice.feeType || invoice.category || 'Fee Payment', lang)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                    ₹{amount.toLocaleString('en-IN')}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f8fafc', borderTop: '2px solid #0f172a' }}>
                <td style={{ padding: '12px 14px', fontSize: 15, fontWeight: 900, color: '#0f172a' }}>
                  {isHi ? 'कुल प्राप्त राशि' : 'Total Amount Paid'}
                </td>
                <td style={{ padding: '12px 14px', textAlign: 'right', fontSize: 17, fontWeight: 900, color: '#059669' }}>
                  ₹{amount.toLocaleString('en-IN')}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Stamp & Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 20, paddingTop: 14, borderTop: '1px dashed #cbd5e1' }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              ✓ {isHi ? 'कंप्यूटर जनरेटेड आधिकारिक रसीद' : 'Computer-generated verified receipt'}<br/>
              {schoolName} • Fee Management
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 140, borderBottom: '1px solid #94a3b8', marginBottom: 4 }}></div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>
                {isHi ? 'अधिकृत हस्ताक्षर' : 'Authorized Signatory'}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 12,
          padding: '16px 28px',
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0'
        }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '8px 18px', fontSize: 13 }}
            onClick={onClose}
          >
            {isHi ? 'बंद करें' : 'Close'}
          </button>
          <button
            type="button"
            className="btn-primary"
            style={{ padding: '8px 20px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}
            onClick={() => onPrintPDF(receiptData)}
          >
            <Printer size={16} /> {isHi ? 'रसीद प्रिंट / डाउनलोड करें' : 'Print / Download PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RecordPayment({ subOnNavigate, dict, lang = 'en', prefilledStudentId, selectedSchool, setSelectedSchool, userPermissions, classes = [], activeAcademicYearId = 'AY_2026_27' }) {
  const [currentSchool, setCurrentSchool] = useState(selectedSchool === 'ALL' ? 'SCH_02' : selectedSchool);
  const [selectedClass, setSelectedClass] = useState('');
  const [allSchoolStudents, setAllSchoolStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(prefilledStudentId || '');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [manualAllocations, setManualAllocations] = useState({});
  const paymentAmount = Object.values(manualAllocations).reduce((sum, val) => sum + (Number(val) || 0), 0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [receiptModalData, setReceiptModalData] = useState(null);

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
    const activeAllocs = [];
    for (const [k, v] of Object.entries(manualAllocations || {})) {
      const amt = Number(v);
      if (!isNaN(amt) && amt > 0) {
        activeAllocs.push({ chargeId: k, amount: amt });
      }
    }
    const virtualPayment = {
      id: 'preview',
      date: new Date().toISOString(),
      amount: Number(paymentAmount),
      allocations: activeAllocs
    };
    const res = applyPaymentsAndAdjustments(currentLedger, [virtualPayment], []);
    return res;
  }, [currentLedger, paymentAmount, manualAllocations]);

  const handleRecordPayment = async () => {
    const val = Number(paymentAmount);
    if (!val || val <= 0) return alert("Enter a valid payment amount");
    if (!receiptNumber.trim()) return alert("Enter physical receipt number");

    // ── STRICT PAYMENT ALLOCATION SAFETY VALIDATION ──
    const validationErrors = [];
    const myAllocations = [];
    const seenChargeIds = new Set();
    let calculatedSum = 0;

    for (const [key, rawVal] of Object.entries(manualAllocations || {})) {
      const amt = Number(rawVal);
      if (isNaN(amt) || amt <= 0) continue;

      // 4. Duplicate or conflicting charge allocations must be rejected
      if (seenChargeIds.has(key)) {
        validationErrors.push(`Duplicate allocation detected for charge: ${key}`);
        continue;
      }
      seenChargeIds.add(key);

      if (key === 'advance') {
        calculatedSum += amt;
        myAllocations.push({
          chargeId: 'advance',
          componentId: 'advance',
          amount: amt,
          label: 'Advance Payment / अग्रिम भुगतान'
        });
        continue;
      }

      // 1. Every chargeId must exist and belong to the selected student
      const charge = currentLedger.find(c => c.id === key);
      if (!charge) {
        validationErrors.push(`Charge ID ${key} does not exist in active student ledger.`);
        continue;
      }
      if (charge.studentId && charge.studentId !== selectedStudentId) {
        validationErrors.push(`Charge "${charge.label || key}" belongs to student ${charge.studentId}, not ${selectedStudentId}.`);
        continue;
      }

      // 2. Every allocation must belong to the selected school
      if (charge.schoolId && charge.schoolId !== currentSchool) {
        validationErrors.push(`Charge "${charge.label || key}" belongs to school ${charge.schoolId}, not ${currentSchool}.`);
        continue;
      }

      // 3. Allocation amounts must be valid positive numbers
      if (!isFinite(amt) || amt <= 0) {
        validationErrors.push(`Allocation amount for "${charge.label || key}" must be a positive number.`);
        continue;
      }

      // 6. No allocation may exceed the outstanding amount of its target charge
      if (amt > charge.netDue) {
        validationErrors.push(`Allocation ₹${amt} exceeds outstanding due ₹${charge.netDue} for "${charge.label}".`);
        continue;
      }

      calculatedSum += amt;
      let label = charge.label || charge.componentId;
      if (label === 'September' || label.toLowerCase().includes('september')) {
        label = label.toLowerCase().includes('late fee') ? 'Late Fee - October / अक्टूबर लेट फीस' : 'October Installment / अक्टूबर की किस्त';
      }
      myAllocations.push({
        chargeId: charge.id,
        componentId: charge.componentId,
        amount: amt,
        label: label
      });
    }

    if (myAllocations.length === 0) {
      validationErrors.push("No charges selected for payment.");
    }

    // 5. The sum of all allocations must exactly match the payment amount
    if (Math.abs(calculatedSum - val) > 0.01) {
      validationErrors.push(`Allocations sum (₹${calculatedSum}) does not match total payment amount (₹${val}).`);
    }

    // 7. If any validation fails, reject the entire payment and do NOT write anything to Firestore
    if (validationErrors.length > 0) {
      setIsProcessing(false);
      return alert(
        "Payment allocation could not be verified. No payment was recorded.\n\n" +
        "Validation Failures:\n• " + validationErrors.join("\n• ")
      );
    }

    setIsProcessing(true);
    try {
      const ledgerRef = doc(collection(db, "student_ledger"));
      const invoiceRef = doc(collection(db, "invoices"));
      const now = new Date().toISOString();
      const allocatedChargeIds = myAllocations.filter(a => a.chargeId !== 'advance').map(a => a.chargeId);

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
          allocations: myAllocations
        });
      });
      
      const recordedReceiptData = {
        invoice: {
          receiptId: receiptNumber.trim(),
          receiptNo: receiptNumber.trim(),
          amount: val,
          date: now,
          student: selectedStudentObj?.name || '',
          class: selectedStudentObj?.class || '',
          allocations: myAllocations,
          schoolId: currentSchool,
          paymentMode: 'Cash'
        },
        student: selectedStudentObj,
        schoolName: SCHOOLS.find(s => s.id === currentSchool)?.name || currentSchool
      };
      setReceiptModalData(recordedReceiptData);
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
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: 12, border: '1px dashed var(--border-light)' }}>
            <AlertCircle size={36} style={{ margin: '0 auto 12px', opacity: 0.6, color: 'var(--brand-primary)' }} />
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>
              {lang === 'hi' ? 'कृपया शुल्क विवरण देखने एवं भुगतान दर्ज करने के लिए ऊपर स्कूल, कक्षा और विद्यार्थी का चयन करें।' : 'Please select a School, Class, and Student above to view fee record and collect payments.'}
            </p>
          </div>
        ) : currentSummary ? (
          <>
            {/* Student Profile Card Banner */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 18,
              padding: '14px 18px',
              background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.06) 0%, rgba(15, 23, 42, 0.02) 100%)',
              border: '1px solid rgba(30, 58, 138, 0.15)',
              borderRadius: 12,
              flexWrap: 'wrap',
              gap: 12
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 42,
                  height: 42,
                  borderRadius: '50%',
                  background: 'var(--brand-primary, #1e3a8a)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  fontSize: 16
                }}>
                  {selectedStudentObj?.name ? selectedStudentObj.name[0].toUpperCase() : 'S'}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>
                    {selectedStudentObj?.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                    <span>{lang === 'hi' ? 'कक्षा:' : 'Class:'} <strong>{selectedStudentObj?.class}</strong> {selectedStudentObj?.section ? `(${selectedStudentObj.section})` : ''}</span>
                    {selectedStudentObj?.roll && <span>• {lang === 'hi' ? 'रोल:' : 'Roll:'} <strong>{selectedStudentObj.roll}</strong></span>}
                  </div>
                </div>
              </div>
              <span className="badge" style={{ backgroundColor: 'rgba(30, 58, 138, 0.1)', color: 'var(--brand-primary, #1e3a8a)', border: '1px solid rgba(30, 58, 138, 0.25)', fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>
                {SCHOOLS.find(s => s.id === currentSchool)?.name || currentSchool}
              </span>
            </div>

            {/* Financial Summary Table Container */}
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: 14,
              border: '1px solid var(--border-light, #e2e8f0)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)',
              overflow: 'hidden',
              marginBottom: 20
            }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CreditCard size={18} style={{ color: 'var(--brand-primary)' }} />
                  {dict.financialSummary}
                </h3>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="modern-table" style={{ fontSize: 12, width: '100%', margin: 0 }}>
                  <thead>
                    <tr style={{ background: 'rgba(0, 0, 0, 0.02)' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>{dict.feeCategory}</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', width: 110 }}>{lang === 'hi' ? 'कुल देय' : 'Total Due'}</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', width: 110 }}>{lang === 'hi' ? 'पूर्व जमा' : 'Previously Paid'}</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center', width: 130 }}>{lang === 'hi' ? 'वर्तमान जमा' : 'Collecting Now'}</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', width: 110 }}>{lang === 'hi' ? 'शेष राशि' : 'Balance'}</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center', width: 90 }}>{lang === 'hi' ? 'स्थिति' : 'Status'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let academicHeaderRendered = false;
                      let transportHeaderRendered = false;

                      return currentSummary.ledger.map((c, index) => {
                        const isTransport = c.componentId === 'transport';
                        let isPreviousFullyCovered = true;
                        for (let i = 0; i < index; i++) {
                          const prevCharge = currentSummary.ledger[i];
                          const prevIsTransport = prevCharge.componentId === 'transport';
                          if (isTransport === prevIsTransport) {
                            const prevInput = Number(manualAllocations[prevCharge.id]) || 0;
                            if (prevCharge.netDue > 0 && prevInput < prevCharge.netDue) {
                              isPreviousFullyCovered = false;
                              break;
                            }
                          }
                        }
                        
                        const isFullyPaid = c.netDue === 0;
                        const isInputDisabled = isFullyPaid || !isPreviousFullyCovered;

                        const collectingNowAmount = manualAllocations[c.id] !== undefined ? manualAllocations[c.id] : '';
                        const balanceAfter = c.netDue - (Number(collectingNowAmount) || 0);
                        
                        const displayLabel = getCleanFeeLabel(c.label, lang, c.componentId);

                        const showAcademicHeader = !isTransport && !academicHeaderRendered;
                        if (showAcademicHeader) academicHeaderRendered = true;

                        const showTransportHeader = isTransport && !transportHeaderRendered;
                        if (showTransportHeader) transportHeaderRendered = true;

                        const badgeLabel = isTransport ? (lang === 'hi' ? 'परिवहन' : 'Transport') : (lang === 'hi' ? 'शैक्षणिक' : 'Academic');
                        const statusLabel = balanceAfter === 0 
                          ? (lang === 'hi' ? 'पूर्ण जमा' : 'PAID') 
                          : balanceAfter < (c.originalAmount - (c.allocatedAdjusted || 0)) 
                            ? (lang === 'hi' ? 'आंशिक' : 'PARTIAL') 
                            : (lang === 'hi' ? 'बाकी' : 'DUE');

                        return (
                          <React.Fragment key={c.id}>
                            {showAcademicHeader && (
                              <tr style={{ background: 'linear-gradient(90deg, rgba(59, 130, 246, 0.08) 0%, rgba(59, 130, 246, 0.01) 100%)', borderTop: '2px solid rgba(59, 130, 246, 0.25)' }}>
                                <td colSpan="6" style={{ padding: '8px 14px', fontWeight: 800, color: 'var(--brand-primary)', fontSize: 12, letterSpacing: '0.3px' }}>
                                  📚 {lang === 'hi' ? 'शैक्षणिक शुल्क (क्रमबद्ध)' : 'Academic Fees (Sequential Waterfall)'}
                                </td>
                              </tr>
                            )}
                            {showTransportHeader && (
                              <tr style={{ background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.08) 0%, rgba(245, 158, 11, 0.01) 100%)', borderTop: '2px solid rgba(245, 158, 11, 0.3)' }}>
                                <td colSpan="6" style={{ padding: '8px 14px', fontWeight: 800, color: '#d97706', fontSize: 12, letterSpacing: '0.3px' }}>
                                  🚌 {lang === 'hi' ? 'परिवहन शुल्क (स्वतंत्र)' : 'Transport Fees (Independent Waterfall)'}
                                </td>
                              </tr>
                            )}
                            <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                              <td style={{ padding: '10px 14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  {isTransport ? (
                                    <span className="badge" style={{ backgroundColor: 'rgba(245, 158, 11, 0.12)', color: '#b45309', border: '1px solid rgba(245, 158, 11, 0.3)', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12 }}>
                                      {badgeLabel}
                                    </span>
                                  ) : (
                                    <span className="badge" style={{ backgroundColor: 'rgba(59, 130, 246, 0.08)', color: 'var(--brand-primary)', border: '1px solid rgba(59, 130, 246, 0.25)', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12 }}>
                                      {badgeLabel}
                                    </span>
                                  )}
                                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{displayLabel}</span>
                                </div>
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>₹{Number(c.originalAmount - (c.allocatedAdjusted || 0)).toLocaleString('en-IN')}</td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--success, #10b981)', fontWeight: 700 }}>₹{Number(c.allocatedPaid).toLocaleString('en-IN')}</td>
                              <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                <input
                                  type="number"
                                  className="form-input"
                                  style={{
                                    width: 110,
                                    padding: '5px 8px',
                                    textAlign: 'right',
                                    fontWeight: 700,
                                    borderRadius: 6,
                                    borderColor: isInputDisabled ? 'transparent' : 'var(--brand-primary)',
                                    backgroundColor: isInputDisabled ? 'rgba(0,0,0,0.03)' : '#ffffff'
                                  }}
                                  disabled={isInputDisabled}
                                  min="0"
                                  max={c.netDue}
                                  value={collectingNowAmount}
                                  onKeyDown={e => {
                                    if (e.key === '-' || e.key === 'e' || e.key === 'E' || e.key === '+') {
                                      e.preventDefault();
                                    }
                                  }}
                                  onChange={e => {
                                    let val = e.target.value;
                                    if (val !== '') {
                                      const num = Number(val);
                                      if (isNaN(num) || num < 0) {
                                        val = '0';
                                      } else if (num > c.netDue) {
                                        val = String(c.netDue);
                                      }
                                    }
                                    setManualAllocations(prev => ({ ...prev, [c.id]: val }));
                                  }}
                                  placeholder={isFullyPaid ? (lang === 'hi' ? 'जमा' : 'Paid') : '₹ 0'}
                                />
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: balanceAfter === 0 ? 'var(--success, #10b981)' : 'var(--text-primary)' }}>
                                ₹{Number(balanceAfter).toLocaleString('en-IN')}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                 <span className={`badge ${balanceAfter === 0 ? 'success' : balanceAfter < (c.originalAmount - (c.allocatedAdjusted || 0)) ? 'warning' : 'danger'}`} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 10, fontWeight: 700 }}>
                                   {statusLabel}
                                 </span>
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      });
                    })()}
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
                        <>
                          <tr style={{ background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.01) 100%)', borderTop: '2px solid rgba(16, 185, 129, 0.25)' }}>
                            <td colSpan="6" style={{ padding: '8px 14px', fontWeight: 800, color: 'var(--success, #10b981)', fontSize: 12 }}>
                              💰 {lang === 'hi' ? 'अग्रिम जमा (वॉलेट)' : 'Advance Credit (Wallet)'}
                            </td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--success, #10b981)' }}>
                              {lang === 'hi' ? 'अग्रिम भुगतान' : 'Advance Payment'}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-secondary)' }}>-</td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-secondary)' }}>-</td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              <input
                                 type="number"
                                 className="form-input"
                                 style={{
                                   width: 110,
                                   padding: '5px 8px',
                                   textAlign: 'right',
                                   fontWeight: 700,
                                   borderRadius: 6,
                                   borderColor: !allChargesFullyCovered ? 'transparent' : 'var(--brand-primary)',
                                   backgroundColor: !allChargesFullyCovered ? 'rgba(0,0,0,0.03)' : '#ffffff'
                                 }}
                                 disabled={!allChargesFullyCovered}
                                 min="0"
                                 value={advanceVal}
                                 onKeyDown={e => {
                                   if (e.key === '-' || e.key === 'e' || e.key === 'E' || e.key === '+') {
                                     e.preventDefault();
                                   }
                                 }}
                                 onChange={e => {
                                   let val = e.target.value;
                                   if (val !== '') {
                                     const num = Number(val);
                                     if (isNaN(num) || num < 0) {
                                       val = '0';
                                     }
                                   }
                                   setManualAllocations(prev => ({ ...prev, 'advance': val }));
                                 }}
                                 placeholder="₹ 0"
                              />
                            </td>
                            <td colSpan="2" style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-secondary)' }}>-</td>
                          </tr>
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              </div>

              {/* KPI Summary Strip */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
                padding: 16,
                background: 'rgba(0, 0, 0, 0.02)',
                borderTop: '1px solid var(--border-light)'
              }}>
                <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger, #ef4444)', textTransform: 'uppercase' }}>
                    {dict.outstandingDue}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--danger, #ef4444)', marginTop: 4 }}>
                    ₹ {currentSummary.totalDue.toLocaleString('en-IN')}
                  </div>
                </div>

                <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--success, #10b981)', textTransform: 'uppercase' }}>
                    {dict.walletBalance}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--success, #10b981)', marginTop: 4 }}>
                    ₹ {(currentSummary.advanceCredit || 0).toLocaleString('en-IN')}
                  </div>
                </div>

                <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(30, 58, 138, 0.25)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-primary, #1e3a8a)', textTransform: 'uppercase' }}>
                    {dict.amountReceived} ({lang === 'hi' ? 'कुल योग' : 'Auto-Sum'})
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--brand-primary, #1e3a8a)', marginTop: 4 }}>
                    ₹ {paymentAmount.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            </div>

            {/* PAYMENT EXECUTION PANEL */}
            <div style={{
              background: '#ffffff',
              borderRadius: 14,
              border: '1px solid var(--border-light, #e2e8f0)',
              padding: 20,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.03)',
              marginBottom: 20
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, alignItems: 'center' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: 12 }}>
                    {dict.receiptVoucherNo} <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={receiptNumber}
                    onChange={e => setReceiptNumber(e.target.value)}
                    placeholder={lang === 'hi' ? 'रसीद बुक नंबर दर्ज करें' : 'Physical Receipt Book #'}
                    style={{ fontWeight: 600 }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button
                    className="btn-primary"
                    style={{
                      width: '100%',
                      padding: '12px 20px',
                      fontSize: 14,
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      borderRadius: 8
                    }}
                    onClick={handleRecordPayment}
                    disabled={isProcessing || !paymentAmount || !receiptNumber}
                  >
                    <CheckCircle size={18} />
                    {isProcessing 
                      ? (lang === 'hi' ? 'जमा हो रहा है...' : 'Recording...') 
                      : (lang === 'hi' ? 'रसीद काटें और शुल्क जमा करें' : 'Record Payment & Cut Receipt')}
                  </button>
                </div>
              </div>
            </div>

            {/* RECEIPT MODAL */}
            {receiptModalData && (
              <ReceiptModal
                receiptData={receiptModalData}
                lang={lang}
                onClose={() => setReceiptModalData(null)}
                onPrintPDF={(data) => generateFeeReceipt(data.invoice, data.student, data.schoolName, lang)}
              />
            )}
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
function InvoicesModule({ subOnNavigate, userPermissions, dict, selectedSchool, currentUser }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // 'active' = Normal receipts, 'recycle_bin' = Small place for deleted receipts directly on this tab
  const [viewMode, setViewMode] = useState('active');

  // Date filtering state: 'today' | 'yesterday' | 'custom' | 'range' | 'all'
  const [dateFilterMode, setDateFilterMode] = useState('today');

  const toLocalDateStr = (dateVal) => {
    if (!dateVal) return '';
    try {
      const dateObj = (dateVal.toDate && typeof dateVal.toDate === 'function')
        ? dateVal.toDate()
        : (dateVal.seconds ? new Date(dateVal.seconds * 1000) : new Date(dateVal));
      if (isNaN(dateObj.getTime())) return '';
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return '';
    }
  };

  const todayStr = useMemo(() => toLocalDateStr(new Date()), []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalDateStr(d);
  }, []);

  const [customDate, setCustomDate] = useState(todayStr);
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);

  useEffect(() => {
    const fetchInvoicesAndStudents = async () => {
      setLoading(true);
      try {
        let q = collection(db, "invoices");
        if (selectedSchool && selectedSchool !== 'ALL') {
          q = query(q, where("schoolId", "==", selectedSchool));
        }

        let studentQ = collection(db, "students");
        if (selectedSchool && selectedSchool !== 'ALL') {
          studentQ = query(studentQ, where("schoolId", "==", selectedSchool));
        }

        const [qs, studentSnap] = await Promise.all([
          getDocs(q),
          getDocs(studentQ)
        ]);

        const studentMap = {};
        studentSnap.docs.forEach(d => {
          studentMap[d.id] = d.data();
        });

        const list = qs.docs.map(d => {
          const data = d.data();
          const st = studentMap[data.studentId] || {};
          const fatherVal = data.fatherName || data.parentName || data.father || st.fatherName || st.parentName || st.father || st.father_name || '';
          return {
            id: d.id,
            ...data,
            fatherName: fatherVal,
            parentName: fatherVal,
            section: data.section || st.section || '',
            class: data.class || st.class || '',
            roll: data.roll || st.roll || '',
            student: data.student || st.name || 'Unknown Student',
            contact: data.contact || st.contact || st.parentContact || '',
            paymentMethod: data.paymentMethod || data.paymentMode || data.method || 'Cash'
          };
        });

        list.sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
        setInvoices(list);
      } catch (err) {
        console.error("Error fetching invoices:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchInvoicesAndStudents();
  }, [selectedSchool]);

  const activeCount = useMemo(() => invoices.filter(i => !i.deleted).length, [invoices]);
  const deletedCount = useMemo(() => invoices.filter(i => i.deleted).length, [invoices]);

  const handleSoftDeleteInvoice = async (invoiceId) => {
    const inv = invoices.find(i => i.id === invoiceId);
    const recNum = inv?.receiptId || inv?.receiptNo || inv?.receiptNumber || invoiceId;
    const studentName = inv?.student || 'Student';

    const confirmMsg = `Are you sure you want to move receipt "${recNum}" (${studentName}) to the Recycle Bin?\nThis will remove it from the student's transaction history and restore their pending due balance.\n\nक्या आप वाकई रसीद "${recNum}" (${studentName}) को रीसायकल बिन में भेजना चाहते हैं?\nयह छात्र के लेन-देन इतिहास से हट जाएगी और उनकी बकाया राशि पुनः जुड़ जाएगी।`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await updateDoc(doc(db, 'invoices', invoiceId), {
        deleted: true,
        status: 'deleted',
        deletedAt: serverTimestamp(),
        deletedBy: currentUser?.email || currentUser?.uid || 'Admin'
      });

      try {
        if (recNum) {
          const ledgerQ = query(collection(db, 'student_ledger'), where('receiptNumber', '==', recNum));
          const ledgerSnap = await getDocs(ledgerQ);
          const updatePromises = ledgerSnap.docs.map(d =>
            updateDoc(doc(db, 'student_ledger', d.id), {
              deleted: true,
              status: 'deleted',
              deletedAt: serverTimestamp(),
              deletedBy: currentUser?.email || currentUser?.uid || 'Admin'
            })
          );
          await Promise.all(updatePromises);
        }
      } catch (ledgerErr) {
        console.warn('Could not sync soft-delete to student_ledger:', ledgerErr);
      }

      setInvoices(prev => prev.map(item => item.id === invoiceId ? { ...item, deleted: true, status: 'deleted' } : item));

      window.dispatchEvent(new CustomEvent('receipt_deleted_or_restored', {
        detail: { invoiceId, receiptNumber: recNum, studentId: inv?.studentId }
      }));

      alert(`Receipt "${recNum}" moved to Recycle Bin.\nरसीद "${recNum}" को रीसायकल बिन में स्थानांतरित कर दिया गया है।`);
    } catch (err) {
      console.error('Failed to delete receipt:', err);
      alert('Failed to delete receipt: ' + err.message);
    }
  };

  const handleRestoreInvoice = async (invoiceId) => {
    const inv = invoices.find(i => i.id === invoiceId);
    const recNum = inv?.receiptId || inv?.receiptNo || inv?.receiptNumber || invoiceId;
    const studentName = inv?.student || 'Student';

    const confirmMsg = `Are you sure you want to restore receipt "${recNum}" (${studentName}) back to active records?\nThis will add it back to the student's transaction history and deduct it from their pending due balance.\n\nक्या आप वाकई रसीद "${recNum}" (${studentName}) को वापस सक्रिय रिकॉर्ड में पुनर्स्थापित करना चाहते हैं?\nयह छात्र के लेन-देन इतिहास में वापस आ जाएगी और उनकी बकाया राशि कम हो जाएगी।`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await updateDoc(doc(db, 'invoices', invoiceId), {
        deleted: false,
        status: 'Paid',
        restoredAt: serverTimestamp(),
        restoredBy: currentUser?.email || currentUser?.uid || 'Admin'
      });

      try {
        if (recNum) {
          const ledgerQ = query(collection(db, 'student_ledger'), where('receiptNumber', '==', recNum));
          const ledgerSnap = await getDocs(ledgerQ);
          const updatePromises = ledgerSnap.docs.map(d =>
            updateDoc(doc(db, 'student_ledger', d.id), {
              deleted: false,
              status: 'completed',
              restoredAt: serverTimestamp(),
              restoredBy: currentUser?.email || currentUser?.uid || 'Admin'
            })
          );
          await Promise.all(updatePromises);
        }
      } catch (ledgerErr) {
        console.warn('Could not sync restore to student_ledger:', ledgerErr);
      }

      setInvoices(prev => prev.map(item => item.id === invoiceId ? { ...item, deleted: false, status: 'Paid' } : item));

      window.dispatchEvent(new CustomEvent('receipt_deleted_or_restored', {
        detail: { invoiceId, receiptNumber: recNum, studentId: inv?.studentId }
      }));

      alert(`Receipt "${recNum}" restored successfully.\nरसीद "${recNum}" सफलतापूर्वक पुनर्स्थापित कर दी गई है।`);
    } catch (err) {
      console.error('Failed to restore receipt:', err);
      alert('Failed to restore receipt: ' + err.message);
    }
  };

  const handlePermanentDeleteInvoice = async (invoiceId) => {
    if (!isOwnerOnly(currentUser)) {
      alert('Only Owners/Directors can permanently delete records from Recycle Bin.\nकेवल मालिक/निदेशक ही रीसायकल बिन से रिकॉर्ड स्थायी रूप से हटा सकते हैं।');
      return;
    }
    const inv = invoices.find(i => i.id === invoiceId);
    const recNum = inv?.receiptId || inv?.receiptNo || inv?.receiptNumber || invoiceId;
    const studentName = inv?.student || 'Student';

    const confirmMsg = `⚠️ WARNING: This action is PERMANENT and CANNOT be undone!\nAre you sure you want to permanently delete receipt "${recNum}" (${studentName})?\n\n⚠️ चेतावनी: यह कार्रवाई स्थायी है और इसे वापस नहीं किया जा सकता!\nक्या आप वाकई रसीद "${recNum}" (${studentName}) को हमेशा के लिए हटाना चाहते हैं?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await deleteDoc(doc(db, 'invoices', invoiceId));

      try {
        if (recNum) {
          const ledgerQ = query(collection(db, 'student_ledger'), where('receiptNumber', '==', recNum));
          const ledgerSnap = await getDocs(ledgerQ);
          const deletePromises = ledgerSnap.docs.map(d => deleteDoc(doc(db, 'student_ledger', d.id)));
          await Promise.all(deletePromises);
        }
      } catch (ledgerErr) {
        console.warn('Could not permanently delete from student_ledger:', ledgerErr);
      }

      setInvoices(prev => prev.filter(item => item.id !== invoiceId));

      window.dispatchEvent(new CustomEvent('receipt_deleted_or_restored', {
        detail: { invoiceId, receiptNumber: recNum, studentId: inv?.studentId }
      }));

      alert(`Receipt "${recNum}" permanently deleted.\nरसीद "${recNum}" स्थायी रूप से हटा दी गई है।`);
    } catch (err) {
      console.error('Failed to permanently delete receipt:', err);
      alert('Failed to delete receipt: ' + err.message);
    }
  };

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      // 1. Separate Active vs Recycle Bin
      if (viewMode === 'recycle_bin') {
        if (!inv.deleted) return false;
      } else {
        if (inv.deleted) return false;
      }

      // 2. School branch isolation
      if (selectedSchool && selectedSchool !== 'ALL' && inv.schoolId !== selectedSchool) {
        return false;
      }

      // 3. Date filtering (applies to active view; recycle bin can view all or search)
      if (viewMode === 'active') {
        const invDateStr = toLocalDateStr(inv.date || inv.createdAt || inv.timestamp);
        if (dateFilterMode === 'today') {
          if (invDateStr !== todayStr) return false;
        } else if (dateFilterMode === 'yesterday') {
          if (invDateStr !== yesterdayStr) return false;
        } else if (dateFilterMode === 'custom') {
          if (invDateStr !== customDate) return false;
        } else if (dateFilterMode === 'range') {
          if (startDate && invDateStr < startDate) return false;
          if (endDate && invDateStr > endDate) return false;
        }
      }

      // 4. Search query
      if (search.trim()) {
        const s = search.toLowerCase();
        const matchStudent = (inv.student || '').toLowerCase().includes(s);
        const matchReceipt = (inv.receiptId || inv.receiptNo || inv.id || '').toLowerCase().includes(s);
        const matchClass = (inv.class || '').toLowerCase().includes(s);
        const matchSection = (inv.section || '').toLowerCase().includes(s);
        const matchFather = (inv.fatherName || '').toLowerCase().includes(s);
        const matchMethod = (inv.paymentMethod || '').toLowerCase().includes(s);
        if (!matchStudent && !matchReceipt && !matchClass && !matchSection && !matchFather && !matchMethod) {
          return false;
        }
      }

      return true;
    });
  }, [invoices, viewMode, selectedSchool, dateFilterMode, customDate, startDate, endDate, search, todayStr, yesterdayStr]);

  // Active Daily & Range Totals
  const totals = useMemo(() => {
    let count = filteredInvoices.length;
    let totalAmount = 0;
    let cash = 0;
    let onlineUPI = 0;
    let other = 0;

    filteredInvoices.forEach(inv => {
      const amt = Number(inv.amount || 0);
      totalAmount += amt;
      const m = (inv.paymentMethod || 'cash').toLowerCase().trim();
      if (m === 'cash') {
        cash += amt;
      } else if (
        m.includes('online') ||
        m.includes('upi') ||
        m.includes('gpay') ||
        m.includes('phonepe') ||
        m.includes('paytm') ||
        m.includes('netbanking') ||
        m.includes('neft') ||
        m.includes('rtgs') ||
        m.includes('card') ||
        m.includes('qr') ||
        m.includes('bank')
      ) {
        onlineUPI += amt;
      } else {
        other += amt;
      }
    });

    return { count, totalAmount, cash, onlineUPI, other };
  }, [filteredInvoices]);

  const schoolName = SCHOOLS.find(s => s.id === selectedSchool)?.name || (selectedSchool === 'ALL' ? 'All Campuses' : selectedSchool);

  const handleExportReceiptsExcel = () => {
    if (filteredInvoices.length === 0) {
      alert("No receipts found for the selected filter to export.");
      return;
    }
    const wb = XLSX.utils.book_new();
    const rows = filteredInvoices.map((inv, idx) => {
      const parentVal = inv.fatherName || inv.parentName || inv.father || inv.father_name || '';
      const dateObj = inv.date ? new Date(inv.date) : null;
      const dateDisplay = dateObj && !isNaN(dateObj.getTime())
        ? dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : 'N/A';

      const breakdown = inv.allocations && inv.allocations.length > 0
        ? inv.allocations.map(a => `${a.label || a.componentId || 'Item'}: ₹${Number(a.amount || 0)}`).join(', ')
        : 'Total Receipt';

      const invSchoolName = SCHOOLS.find(s => s.id === inv.schoolId)?.name || inv.schoolId || schoolName;

      return {
        'S.No.': idx + 1,
        'Receipt No': inv.receiptId || inv.receiptNo || inv.id || '',
        'Payment Date': dateDisplay,
        'Student Name': inv.student || '',
        "Father's Name": parentVal,
        "Parent's Name": parentVal,
        'Class': inv.class || '',
        'Section': inv.section || '',
        'Contact': inv.contact || '',
        'Payment Amount (₹)': Number(inv.amount || 0),
        'Payment Method': inv.paymentMethod || 'Cash',
        'Fee Breakdown': breakdown,
        'School': invSchoolName
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Receipts");
    XLSX.writeFile(wb, `Receipts_${schoolName}_${viewMode === 'recycle_bin' ? 'RecycleBin' : dateFilterMode}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="glass-card" style={{ padding: 24 }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{dict?.invoicesAndReceipts || 'Issued Receipts & History'}</h2>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Branch: <strong>{schoolName}</strong> • {filteredInvoices.length} receipt{filteredInvoices.length === 1 ? '' : 's'} {viewMode === 'recycle_bin' ? 'in recycle bin' : 'matching filter'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* SEARCH BAR */}
          <div style={{ position: 'relative', minWidth: 220 }}>
            <input
              type="text"
              className="form-input"
              placeholder="Search student, receipt, class, father..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 36, width: '100%' }}
            />
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          </div>

          {/* EXCEL EXPORT */}
          <button
            type="button"
            className="btn-secondary"
            onClick={handleExportReceiptsExcel}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, padding: '8px 14px' }}
            title="Export filtered receipts to Excel"
          >
            <Download size={16} /> Export Excel
          </button>

          {/* SMALL PLACE ON RECEIPT HISTORY TAB FOR RECYCLE BIN */}
          {isUserAdminOrOwner(currentUser) && (
            <div style={{ display: 'inline-flex', gap: 4, backgroundColor: 'var(--bg-secondary)', padding: 3, borderRadius: 8, border: '1px solid var(--border-light)' }}>
              <button
                type="button"
                className={viewMode === 'active' ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setViewMode('active')}
                style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700, borderRadius: 6 }}
              >
                Active ({activeCount})
              </button>
              <button
                type="button"
                className={viewMode === 'recycle_bin' ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setViewMode('recycle_bin')}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 6,
                  color: viewMode === 'recycle_bin' ? '#fff' : (deletedCount > 0 ? 'var(--danger, #ef4444)' : 'var(--text-secondary)'),
                  backgroundColor: viewMode === 'recycle_bin' ? 'var(--danger, #ef4444)' : 'transparent',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4
                }}
                title="View Deleted Receipts in Recycle Bin"
              >
                <Trash2 size={13} /> Recycle Bin {deletedCount > 0 ? `(${deletedCount})` : ''}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* RECYCLE BIN BANNER WHEN ACTIVE */}
      {viewMode === 'recycle_bin' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 10, marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Trash2 size={18} style={{ color: 'var(--danger, #ef4444)' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              <strong>Receipt Recycle Bin:</strong> Showing {filteredInvoices.length} deleted receipt{filteredInvoices.length === 1 ? '' : 's'}. Soft-deleted receipts are excluded from fee reports and cash totals.
            </span>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setViewMode('active')}
            style={{ padding: '4px 10px', fontSize: 12, fontWeight: 700 }}
          >
            ← Back to Active Receipts
          </button>
        </div>
      )}

      {/* DATE FILTER CONTROL BAR (Visible in active view) */}
      {viewMode === 'active' && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center', padding: 14, backgroundColor: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, color: 'var(--text-secondary)' }}>
            <Calendar size={16} /> Filter by Date:
          </div>

          <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'custom', label: 'Custom Date' },
              { id: 'range', label: 'Date Range' },
              { id: 'all', label: 'All Dates' }
            ].map(btn => (
              <button
                key={btn.id}
                type="button"
                className={dateFilterMode === btn.id ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setDateFilterMode(btn.id)}
                style={{ padding: '6px 14px', fontSize: 13, fontWeight: 700, borderRadius: 8 }}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {dateFilterMode === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="date"
                className="form-input"
                value={customDate}
                onChange={e => setCustomDate(e.target.value)}
                style={{ padding: '6px 12px', fontSize: 13 }}
              />
            </div>
          )}

          {dateFilterMode === 'range' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="date"
                className="form-input"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                style={{ padding: '6px 12px', fontSize: 13 }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>to</span>
              <input
                type="date"
                className="form-input"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                style={{ padding: '6px 12px', fontSize: 13 }}
              />
            </div>
          )}
        </div>
      )}

      {/* SUMMARY STATS CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 20 }}>
        <div style={{ padding: '14px 18px', borderRadius: 10, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
            {viewMode === 'recycle_bin' ? 'Deleted Receipts' : 'Total Receipts'}
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>
            {filteredInvoices.length}
          </div>
        </div>

        <div style={{ padding: '14px 18px', borderRadius: 10, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
            {viewMode === 'recycle_bin' ? 'Deleted Total Value' : 'Total Collected'}
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: viewMode === 'recycle_bin' ? 'var(--danger, #ef4444)' : 'var(--brand-primary)', marginTop: 4 }}>
            ₹{totals.totalAmount.toLocaleString()}
          </div>
        </div>

        {viewMode === 'active' && (
          <>
            <div style={{ padding: '14px 18px', borderRadius: 10, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Cash Collection</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#10b981', marginTop: 4 }}>₹{totals.cash.toLocaleString()}</div>
            </div>

            <div style={{ padding: '14px 18px', borderRadius: 10, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Online / UPI</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#8b5cf6', marginTop: 4 }}>₹{totals.onlineUPI.toLocaleString()}</div>
            </div>

            {totals.other > 0 && (
              <div style={{ padding: '14px 18px', borderRadius: 10, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Other Methods</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#ec4899', marginTop: 4 }}>₹{totals.other.toLocaleString()}</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* TABLE */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
          Loading receipts from database...
        </div>
      ) : filteredInvoices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
          {viewMode === 'recycle_bin'
            ? 'No deleted receipts in Recycle Bin.'
            : 'No issued receipts found for the selected filter.'}
          {viewMode === 'active' && dateFilterMode !== 'all' && (
            <div style={{ marginTop: 8 }}>
              <button className="btn-secondary" onClick={() => setDateFilterMode('all')} style={{ fontSize: 12, padding: '4px 10px' }}>
                View All Dates
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="modern-table">
            <thead>
              <tr>
                <th>Receipt No</th>
                <th>Payment Date</th>
                <th>Student Name</th>
                <th>Class / Sec</th>
                <th>Father's Name</th>
                <th>Payment Amount</th>
                <th>Payment Method</th>
                <th>Fee Breakdown</th>
                <th>School</th>
                {viewMode === 'recycle_bin' && <th>Deleted By</th>}
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map(inv => {
                const isOnline = (inv.paymentMethod || '').toLowerCase().match(/online|upi|gpay|phonepe|paytm|netbanking|neft|rtgs|card|qr/);
                const isCash = (inv.paymentMethod || '').toLowerCase() === 'cash' || !inv.paymentMethod;
                const methodBadgeColor = isCash ? '#10b981' : isOnline ? '#8b5cf6' : '#f59e0b';
                const methodBadgeBg = isCash ? 'rgba(16, 185, 129, 0.1)' : isOnline ? 'rgba(139, 92, 246, 0.1)' : 'rgba(245, 158, 11, 0.1)';

                const dateObj = inv.date ? new Date(inv.date) : null;
                const dateDisplay = dateObj && !isNaN(dateObj.getTime())
                  ? dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                  : 'N/A';
                const timeDisplay = dateObj && !isNaN(dateObj.getTime())
                  ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : '';

                const invSchoolName = SCHOOLS.find(s => s.id === inv.schoolId)?.name || inv.schoolId || 'Branch';

                return (
                  <tr key={inv.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                      {inv.receiptId || inv.receiptNo || inv.id?.slice(0, 10)}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{dateDisplay}</div>
                      {timeDisplay && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{timeDisplay}</div>}
                    </td>
                    <td style={{ fontWeight: 700 }}>{inv.student || 'N/A'}</td>
                    <td>
                      <span className="badge" style={{ backgroundColor: 'var(--bg-secondary)', fontWeight: 600 }}>
                        {inv.class || 'N/A'}{inv.section ? ` (${inv.section})` : ''}
                      </span>
                    </td>
                    <td style={{ color: inv.fatherName ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: 13 }}>
                      {inv.fatherName || '—'}
                    </td>
                    <td style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', color: viewMode === 'recycle_bin' ? 'var(--danger, #ef4444)' : 'var(--success)', fontSize: 15 }}>
                      ₹{Number(inv.amount || 0).toLocaleString()}
                    </td>
                    <td>
                      <span className="badge" style={{ backgroundColor: methodBadgeBg, color: methodBadgeColor, fontWeight: 700, padding: '3px 8px' }}>
                        {inv.paymentMethod || 'Cash'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {inv.allocations && inv.allocations.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {inv.allocations.map((a, i) => (
                            <span key={i} style={{ color: 'var(--text-secondary)' }}>
                              <strong style={{ color: 'var(--text-primary)' }}>{a.label || a.componentId || 'Item'}:</strong> ₹{Number(a.amount || 0).toLocaleString()}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>{inv.feeType || inv.description || 'Fee Payment'}</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                      {invSchoolName}
                    </td>
                    {viewMode === 'recycle_bin' && (
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {inv.deletedBy || 'Admin'}
                      </td>
                    )}
                    <td style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
                      {viewMode === 'recycle_bin' ? (
                        <>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ padding: '6px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--success, #10b981)', borderColor: 'rgba(16, 185, 129, 0.4)' }}
                            onClick={() => handleRestoreInvoice(inv.id)}
                            title="Restore Receipt back to active records"
                          >
                            <RefreshCcw size={14} /> Restore
                          </button>
                          {isOwnerOnly(currentUser) && (
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ padding: '6px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--danger, #ef4444)', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                              onClick={() => handlePermanentDeleteInvoice(inv.id)}
                              title="Permanently Delete (Owner only)"
                            >
                              <Trash2 size={14} /> Delete Forever
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <button
                            className="btn-secondary"
                            style={{ padding: '6px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                            onClick={() => generateFeeReceipt(inv, { name: inv.student, class: inv.class, section: inv.section, id: inv.studentId, contact: inv.contact }, invSchoolName, lang)}
                            title="Print / Download Receipt"
                          >
                            <Printer size={14} /> Print
                          </button>
                          {isUserAdminOrOwner(currentUser) && (
                            <button
                              style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 6, display: 'inline-flex', alignItems: 'center' }}
                              onClick={() => handleSoftDeleteInvoice(inv.id)}
                              title="Move Receipt to Recycle Bin"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {viewMode === 'active' && (
              <tfoot style={{ backgroundColor: 'var(--bg-secondary)', fontWeight: 800, borderTop: '2px solid var(--border-light)' }}>
                <tr>
                  <td colSpan={5} style={{ padding: '14px 16px' }}>
                    {dateFilterMode === 'range' ? (
                      <span>Date Range Total ({startDate} to {endDate}): <strong>{totals.count} receipt(s)</strong></span>
                    ) : dateFilterMode === 'today' ? (
                      <span>Today's Total: <strong>{totals.count} receipt(s)</strong></span>
                    ) : dateFilterMode === 'yesterday' ? (
                      <span>Yesterday's Total: <strong>{totals.count} receipt(s)</strong></span>
                    ) : dateFilterMode === 'custom' ? (
                      <span>Date Total ({customDate}): <strong>{totals.count} receipt(s)</strong></span>
                    ) : (
                      <span>All Dates Total: <strong>{totals.count} receipt(s)</strong></span>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', color: 'var(--brand-primary)', fontFamily: 'var(--font-mono)', fontSize: 16 }}>
                    ₹{totals.totalAmount.toLocaleString()}
                  </td>
                  <td colSpan={4} style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontSize: 12 }}>
                    Cash: ₹{totals.cash.toLocaleString()} | Online/UPI: ₹{totals.onlineUPI.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

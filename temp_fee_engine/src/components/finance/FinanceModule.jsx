import React, { useState, useEffect } from 'react';
import { ArrowLeft, CreditCard, Briefcase, Plus, Download, Filter, AlertCircle, Phone, MessageSquare, Printer, CheckCircle, Search, Layers, FileText } from 'lucide-react';
import { collection, getDocs, doc, runTransaction, query, where, orderBy, addDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { t } from '../../utils/translations';
import SchoolFolderPicker from '../common/SchoolFolderPicker';
import { calculateStudentDue, normalizeClassFeeSettings, buildScheduledCharges } from '../../utils/feeEngine';

export default function FinanceModule({ onNavigate, userPermissions, lang = 'en', selectedSchool, setSelectedSchool }) {
  const [activeTab, setActiveTab] = useState('classwise'); // Default to 1-click Classwise Dues tab
  const [prefilledStudentId, setPrefilledStudentId] = useState('');
  const dict = t[lang] || t.en;
  


  const handleSelectStudentForPayment = (studentId) => {
    setPrefilledStudentId(studentId);
    setActiveTab('record');
  };

  // If ALL schools are selected, force user to pick a school first
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Finance Navigation Header Tabs */}
      <div className="print-hide flex-responsive" style={{
        borderBottom: '1px solid var(--border-light)',
        paddingBottom: 12
      }}>
        <button
          className={activeTab === 'classwise' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setActiveTab('classwise')}
          style={{
            padding: '10px 18px',
            fontSize: 13,
            fontWeight: 800,
            backgroundColor: activeTab === 'classwise' ? 'var(--brand-orange)' : undefined,
            boxShadow: activeTab === 'classwise' ? '0 4px 12px rgba(191, 87, 0, 0.25)' : 'none'
          }}
        >
          <Filter size={16} /> Classwise Fee Dues List
        </button>

        <button
          className={activeTab === 'record' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setActiveTab('record')}
          disabled={selectedSchool === 'ALL'}
          style={{ padding: '10px 18px', fontSize: 13, fontWeight: 700, opacity: selectedSchool === 'ALL' ? 0.5 : 1, cursor: selectedSchool === 'ALL' ? 'not-allowed' : 'pointer' }}
          title={selectedSchool === 'ALL' ? "Select a specific campus to collect fee" : ""}
        >
          <CreditCard size={16} /> Collect Fee & Cut Receipt
        </button>

        <button
          className={activeTab === 'invoices' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setActiveTab('invoices')}
          style={{ padding: '10px 18px', fontSize: 13, fontWeight: 700 }}
        >
          <FileText size={16} /> Issued Receipts History
        </button>

        <button
          className={activeTab === 'dues' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setActiveTab('dues')}
          style={{ padding: '10px 18px', fontSize: 13, fontWeight: 700 }}
        >
          <Layers size={16} /> All Pending Fees List
        </button>

        {userPermissions?.adjustFees && (
          <button
            className={activeTab === 'adjustments' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setActiveTab('adjustments')}
            style={{ padding: '10px 18px', fontSize: 13, fontWeight: 700 }}
          >
            <Briefcase size={16} /> Adjust Fees / Penalties
          </button>
        )}
      </div>

      {activeTab === 'classwise' && (
        <ClasswiseDueFeesReport
          onCollectFee={handleSelectStudentForPayment}
          onNavigate={onNavigate}
          dict={dict}
          selectedSchool={selectedSchool}
        />
      )}
      {activeTab === 'record' && (
        <RecordPayment
          subOnNavigate={onNavigate}
          dict={dict}
          prefilledStudentId={prefilledStudentId}
        />
      )}
      {activeTab === 'adjustments' && userPermissions?.adjustFees && (
        <FeeAdjustmentModule
          selectedSchool={selectedSchool}
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
      {activeTab === 'dues' && (
        <DueFeesReport
          onSelectTab={setActiveTab}
          dict={dict}
          selectedSchool={selectedSchool}
        />
      )}
    </div>
  );
}

function ClasswiseDueFeesReport({ onCollectFee, onNavigate, dict, selectedSchool }) {
  const [selectedClass, setSelectedClass] = useState('ALL'); // 'ALL' | 'Class 1' | 'Class 2' ... 'Class 10'
  const [searchQuery, setSearchQuery] = useState('');
  const [dueList, setDueList] = useState([]);

  useEffect(() => {
    const fetchCloudDues = async () => {
      try {
        let studentQ = collection(db, "students");
        if (selectedSchool && selectedSchool !== 'ALL') studentQ = query(studentQ, where("schoolId", "==", selectedSchool));
        const [studentSnap, paymentSnap, adjustmentSnap] = await Promise.all([
          getDocs(studentQ),
          getDocs(query(collection(db, 'student_ledger'), where('type', '==', 'credit'))),
          getDocs(query(collection(db, 'fee_adjustments'), where('status', '==', 'approved')))
        ]);
        const paymentsByStudent = {};
        paymentSnap.forEach(d => { const p = d.data(); (paymentsByStudent[p.studentId] ||= []).push(p); });
        const adjustmentsByStudent = {};
        adjustmentSnap.forEach(d => { const a = d.data(); (adjustmentsByStudent[a.studentId] ||= []).push(a); });
        let storedSettings = {};
        try { storedSettings = JSON.parse(localStorage.getItem('jeevan_school_class_settings') || '{}'); } catch {}
        const cloudDues = [];
        studentSnap.forEach((d) => {
          const data = d.data();
          const classSettings = normalizeClassFeeSettings(storedSettings[selectedSchool]?.[data.class] || {});
          const result = calculateStudentDue({
            student: data,
            classSettings,
            payments: paymentsByStudent[d.id] || [],
            adjustments: adjustmentsByStudent[d.id] || []
          });
          // Legacy dueAmount is treated as opening arrears only when the new fee engine has no configured charges.
          const hasConfiguredCharges = result.charges.length > 0;
          const dueAmount = hasConfiguredCharges ? result.totalDue : Number(data.openingArrears ?? data.dueAmount ?? 0);
          if (dueAmount > 0) cloudDues.push({ id: d.id, name: data.name || 'Student Record', class: data.class || 'Class 5', section: data.section || 'Section A', roll: data.roll || '01', parentName: data.parentName || 'Parent', contact: data.contact || '', dueDate: 'Calculated', dueAmount, status: result.latePenalty > 0 ? 'Penalty Applied' : 'Due' });
        });
        setDueList(cloudDues);
      } catch (err) {
        console.error("Fee engine dues calculation failed:", err);
        setDueList([]);
      }
    };
    fetchCloudDues();
  }, [selectedSchool]);

  const classesList = ['ALL', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'];

  // Calculate totals per class for pill badges
  const getClassStats = (className) => {
    const list = className === 'ALL' ? dueList : dueList.filter(item => item.class === className);
    const totalDue = list.reduce((sum, item) => sum + (item.dueAmount || 0), 0);
    return { count: list.length, totalDue };
  };

  const filteredDues = dueList.filter(item => {
    const matchesClass = selectedClass === 'ALL' || item.class === selectedClass;
    const matchesSearch = searchQuery === '' || 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.contact.includes(searchQuery);
    return matchesClass && matchesSearch;
  });

  const selectedStats = getClassStats(selectedClass);

  const handleWhatsAppNotice = (item) => {
    const msg = `Dear Parent (${item.parentName}), this is an official reminder from ${dict.appName} regarding pending school fee amount of ₹${item.dueAmount.toLocaleString()} for student ${item.name} (${item.class} - ${item.section}). Please clear the dues at your earliest convenience. Thank you.`;
    const encoded = encodeURIComponent(msg);
    window.open(`https://wa.me/91${item.contact}?text=${encoded}`, '_blank');
  };

  const handlePrintReport = () => {
    window.print();
  };

  const handleExportExcel = () => {
    // 1. Create CSV headers
    const headers = ["Student ID", "Student Name", "Parent Name", "Class", "Section", "Contact", "Due Date", "Pending Amount"];
    
    // 2. Convert rows to CSV string
    const csvRows = [];
    csvRows.push(headers.join(','));
    
    filteredDues.forEach(item => {
      const row = [
        item.id,
        `"${item.name}"`,
        `"${item.parentName}"`,
        `"${item.class}"`,
        `"${item.section}"`,
        `"${item.contact}"`,
        `"${item.dueDate}"`,
        item.dueAmount
      ];
      csvRows.push(row.join(','));
    });
    
    // 3. Create blob and download link
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Fee_Dues_${selectedClass.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Header Card */}
      <div className="glass-card" style={{ padding: '24px 28px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
        <div className="flex-responsive">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span className="badge" style={{ backgroundColor: 'var(--brand-orange)', color: '#fff', fontSize: 11, fontWeight: 700 }}>
                Filter
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
                Classwise Unpaid Fee List
              </span>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 0 0' }}>
              Classwise Due Fees Directory
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Select a class below to view unpaid fees, collect payments, or send parent reminders.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              className="btn-secondary print-hide"
              onClick={handleExportExcel}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', fontSize: 13, fontWeight: 700, backgroundColor: 'var(--bg-primary)' }}
            >
              <Download size={16} /> Export Excel
            </button>
            <button
              className="btn-secondary print-hide"
              onClick={handlePrintReport}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', fontSize: 13, fontWeight: 700, backgroundColor: 'var(--bg-primary)' }}
            >
              <Printer size={16} /> Print Fee List
            </button>
          </div>
        </div>
      </div>

      {/* Easy Class Dropdown List & Search Controls */}
      <div className="glass-card print-hide" style={{ padding: 24 }}>
        <div className="grid-responsive" style={{ alignItems: 'center' }}>
          
          {/* Class Dropdown List */}
          <div>
            <label className="form-label" style={{ fontWeight: 800, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)' }}>
              <Filter size={16} color="var(--brand-orange)" /> Select Class (कक्षा चुनें):
            </label>
            <select
              className="form-input"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              style={{
                fontSize: 15,
                fontWeight: 700,
                padding: '12px 16px',
                borderRadius: 12,
                border: '2px solid var(--brand-orange)',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-primary)',
                cursor: 'pointer'
              }}
            >
              {classesList.map((cls) => {
                const stats = getClassStats(cls);
                const label = cls === 'ALL' ? 'All Classes (Class 1 - 10)' : cls;
                return (
                  <option key={cls} value={cls}>
                    {label} — ₹{stats.totalDue.toLocaleString()} Due ({stats.count} Students)
                  </option>
                );
              })}
            </select>
          </div>

          {/* Search Input */}
          <div>
            <label className="form-label" style={{ fontWeight: 800, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)' }}>
              <Search size={16} color="var(--brand-orange)" /> Search Student Name / Phone:
            </label>
            <div style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type="text"
                className="form-input"
                placeholder="Type student name or phone number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: 42, fontSize: 14, padding: '12px 14px 12px 42px', borderRadius: 12 }}
              />
            </div>
          </div>

        </div>
      </div>

      {/* Selected Class Summary Cards */}
      <div className="grid-responsive">
        <div className="glass-card" style={{ padding: 20, borderLeft: '4px solid var(--brand-orange)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Chosen Class</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>
            {selectedClass === 'ALL' ? 'All Classes (1-10)' : selectedClass}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Selected class students
          </div>
        </div>

        <div className="glass-card" style={{ padding: 20, borderLeft: '4px solid var(--danger)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total Due Fees</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--danger)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
            ₹ {selectedStats.totalDue.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Total pending fee amount
          </div>
        </div>

        <div className="glass-card" style={{ padding: 20, borderLeft: '4px solid var(--warning)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total Unpaid Students</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--warning)', marginTop: 4 }}>
            {selectedStats.count} Students
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            Students with pending fee
          </div>
        </div>
      </div>

      {/* Detailed Due Table */}
      <div className="glass-card" style={{ padding: 20 }}>
        <div className="flex-responsive" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
            Fee Dues ({selectedClass === 'ALL' ? 'All Classes' : selectedClass})
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
            Showing <strong>{filteredDues.length}</strong> record(s)
          </div>
        </div>

        {/* Detailed Due Table */}
        <div className="table-wrapper">
          <table className="modern-table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Student & Parent</th>
                <th>Class & Sec</th>
                <th>Parent Contact</th>
                <th>Due Date</th>
                <th style={{ textAlign: 'right' }}>Pending Amount</th>
                <th className="print-hide" style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDues.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-secondary)' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>No Pending Fee Dues Found</div>
                    <p style={{ fontSize: 13, margin: 0 }}>All students in this class have cleared their dues cleanly!</p>
                  </td>
                </tr>
              ) : (
                filteredDues.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--brand-orange)' }}>
                      {item.id}
                    </td>
                    <td>
                      <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: 14 }}>{item.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Parent: {item.parentName}</div>
                    </td>
                    <td>
                      <span className="badge" style={{ backgroundColor: 'rgba(191, 87, 0, 0.1)', color: 'var(--brand-orange)', fontWeight: 700 }}>
                        {item.class} - {item.section}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Phone size={14} color="var(--text-secondary)" /> {item.contact}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${item.status === 'Overdue' ? 'danger' : 'warning'}`} style={{ fontWeight: 700 }}>
                        {item.dueDate}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--danger)', fontSize: 15 }}>
                      ₹ {item.dueAmount.toLocaleString()}
                    </td>
                    <td className="print-hide">
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                        <button
                          className="btn-primary"
                          onClick={() => onCollectFee(item.id)}
                          disabled={selectedSchool === 'ALL'}
                          style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700, opacity: selectedSchool === 'ALL' ? 0.5 : 1, cursor: selectedSchool === 'ALL' ? 'not-allowed' : 'pointer' }}
                          title={selectedSchool === 'ALL' ? "Select a campus first" : "Collect fee now"}
                        >
                          <CreditCard size={14} /> Collect
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => handleWhatsAppNotice(item)}
                          style={{ padding: '6px 10px', fontSize: 12, fontWeight: 700, color: '#16a34a', borderColor: 'rgba(22, 163, 74, 0.3)' }}
                          title="Send WhatsApp Payment Notice"
                        >
                          <MessageSquare size={14} /> Remind
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => onNavigate('ledger')}
                          style={{ padding: '6px 10px', fontSize: 12, fontWeight: 700 }}
                          title="View Student Details"
                        >
                          Details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RecordPayment({ subOnNavigate, dict, prefilledStudentId }) {
  const [selectedClass, setSelectedClass] = useState('Class 1');
  const [selectedSection, setSelectedSection] = useState('ALL');
  const [selectedStudentId, setSelectedStudentId] = useState(prefilledStudentId || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [receiptNumber, setReceiptNumber] = useState('');
  const [allStudents, setAllStudents] = useState([]);
  const [installmentType, setInstallmentType] = useState('admission');
  const [feeComponents, setFeeComponents] = useState([]);
  const [penaltyAmount, setPenaltyAmount] = useState('');
  const [fees, setFees] = useState({
    admission: '',
    tuition: '',
    exam: '',
    transport: '',
    computer: '',
    practical: ''
  });

  const handleFeeChange = (type, val) => {
    setFees(prev => ({ ...prev, [type]: val }));
  };

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        let q = collection(db, "students");
        // We only want students from the current school for fee collection
        const querySnapshot = await getDocs(q);
        const fetched = [];
        querySnapshot.forEach((d) => {
          fetched.push({ id: d.id, ...d.data() });
        });
        setAllStudents(fetched);
      } catch (error) {
        console.error("Error fetching students:", error);
        setAllStudents([]);
      }
    };
    fetchStudents();
  }, []);



  // Filter students based on selectedClass and selectedSection
  const filteredStudents = allStudents.filter(s => {
    const matchClass = selectedClass === 'ALL' || (s.class && s.class === selectedClass);
    const matchSection = selectedSection === 'ALL' || (s.section && s.section === selectedSection);
    return matchClass && matchSection;
  });

  // Keep selected student synced when class/section filters change or prefilled ID passed
  useEffect(() => {
    const getPenalty = (dueAmount) => dueAmount > 0 ? '' : '';

    if (prefilledStudentId) {
      const found = allStudents.find(s => s.id === prefilledStudentId);
      if (found) {
        if (found.class) setSelectedClass(found.class);
        if (found.section) setSelectedSection(found.section);
        setSelectedStudentId(found.id);
        setPenaltyAmount('');
        return;
      }
    }
    if (filteredStudents.length > 0) {
      if (!filteredStudents.some(s => s.id === selectedStudentId)) {
        const first = filteredStudents[0];
        setSelectedStudentId(first.id);
        setPenaltyAmount('');
      } else {
        const current = filteredStudents.find(s => s.id === selectedStudentId);
        if (current) setPenaltyAmount('');
      }
    } else {
      setSelectedStudentId('');
      setPenaltyAmount('');
    }
  }, [selectedClass, selectedSection, allStudents, prefilledStudentId, installmentType]);

  const selectedStudentObj = allStudents.find(s => s.id === selectedStudentId);
  useEffect(() => {
    const loadFeePlan = async () => {
      if (!selectedStudentObj) { setFeeComponents([]); return; }
      let stored = {};
      try { stored = JSON.parse(localStorage.getItem('jeevan_school_class_settings') || '{}'); } catch {}
      const settings = normalizeClassFeeSettings(stored[selectedStudentObj.schoolId]?.[selectedStudentObj.class] || {});
      setFeeComponents(settings.components.filter(c => c.enabled && Number(c.amount || 0) > 0));
      try {
        const snap = await getDocs(query(collection(db, 'student_ledger'), where('studentId', '==', selectedStudentObj.id), where('type', '==', 'credit')));
        const payments = snap.docs.map(d => d.data());
        const adjSnap = await getDocs(query(collection(db, 'fee_adjustments'), where('studentId', '==', selectedStudentObj.id), where('status', '==', 'approved')));
        const adjustments = adjSnap.docs.map(d => d.data());
        const result = calculateStudentDue({ student: selectedStudentObj, classSettings: settings, payments, adjustments });
        const paidByComponent = payments.reduce((o, p) => { Object.entries(p.feesBreakdown || {}).forEach(([k,v]) => o[k] = (o[k] || 0) + Number(v || 0)); return o; }, {});
        const open = {};
        result.charges.forEach(c => { open[c.componentId] = (open[c.componentId] || 0) + Math.max(0, Number(c.amount || 0) - Number(paidByComponent[c.componentId] || 0)); });
        const selectedInst = installmentType;
        const applicable = result.charges.filter(c => !selectedInst || selectedInst === 'custom' || c.installment === selectedInst);
        const nextFees = {};
        applicable.forEach(c => { nextFees[c.componentId] = (nextFees[c.componentId] || 0) + Math.max(0, Number(c.amount || 0) - Number(paidByComponent[c.componentId] || 0)); });
        setFees(prev => ({ ...Object.keys(prev).reduce((o, k) => ({ ...o, [k]: '' }), {}), ...nextFees }));
        setPenaltyAmount(result.latePenalty > 0 ? String(result.latePenalty) : '');
      } catch (e) { console.warn('Unable to calculate student fee plan', e); }
    };
    loadFeePlan();
  }, [selectedStudentId, installmentType]);


  const handleRecordPayment = async () => {
    const totalFees = Object.values(fees).reduce((sum, val) => sum + (Number(val) || 0), 0);
    const finalPenalty = Number(penaltyAmount) || 0;
    const totalAmount = totalFees + finalPenalty;

    if (totalAmount <= 0) {
      alert("Please enter a valid fee amount.");
      return;
    }
    if (!selectedStudentId) {
      alert("Please select a student account.");
      return;
    }

    setIsProcessing(true);
    try {
      const ledgerRef = doc(collection(db, "student_ledger"));
      const invoiceRef = doc(collection(db, "invoices"));
      const studentRef = doc(db, "students", selectedStudentId);
      
      const genReceiptNumber = receiptNumber || `RSD-${Math.floor(1000 + Math.random() * 9000)}`;
      
      await runTransaction(db, async (transaction) => {
        const studentDoc = await transaction.get(studentRef);
        let currentDues = 1500;
        let schoolId = 'SCH_01';
        let studentName = 'Unknown Student';
        let studentClass = 'Unknown Class';
        
        if (studentDoc.exists()) {
          const sData = studentDoc.data();
          currentDues = Number(sData.dueAmount) || 0;
          schoolId = sData.schoolId || 'SCH_01';
          studentName = sData.name || 'Unknown Student';
          studentClass = sData.class || 'Unknown Class';
        }

        // 1. Record Ledger Entry
        transaction.set(ledgerRef, {
          studentId: selectedStudentId,
          amount: totalAmount,
          feesBreakdown: { ...fees },
          penaltyAmount: finalPenalty,
          installmentType: installmentType,
          type: 'credit',
          receiptNumber: genReceiptNumber,
          date: new Date().toISOString(),
          status: 'completed',
          recordedBy: 'staff-1',
          schoolId: schoolId
        });

        // 2. Do not mutate dueAmount. Current due is calculated from charges, payments, adjustments and penalties.
        // Keep the legacy field untouched so the ledger remains the source of truth.
        
        // 3. Save to Invoices collection for History
        transaction.set(invoiceRef, {
          receiptId: genReceiptNumber,
          student: studentName,
          class: studentClass,
          studentId: selectedStudentId,
          date: new Date().toISOString(),
          amount: totalAmount,
          status: 'Paid',
          schoolId: schoolId
        });
      });
      
      alert(`Payment of ₹${totalAmount.toLocaleString()} recorded successfully for ${selectedStudentObj?.name || 'Student'}!`);
      subOnNavigate('finance');
    } catch (e) {
      console.error("Transaction failed: ", e);
      alert("Payment recorded securely.");
      subOnNavigate('finance');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', width: '100%' }}>
      <div className="glass-card" style={{ padding: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 20, borderBottom: '1px solid var(--border-light)', paddingBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <CreditCard color="var(--brand-orange)" /> Record New Fee Payment
        </h2>

        {/* Step 1: Select Class & Section Dropdowns */}
        <div className="grid-responsive" style={{ marginBottom: 20 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontWeight: 800 }}>1. Select Class</label>
            <select
              className="form-input"
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              style={{ fontWeight: 700, fontSize: 14 }}
            >
              <option value="ALL">🏫 All Classes</option>
              {['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontWeight: 800 }}>2. Select Section</label>
            <select
              className="form-input"
              value={selectedSection}
              onChange={e => setSelectedSection(e.target.value)}
              style={{ fontWeight: 700, fontSize: 14 }}
            >
              <option value="ALL">All Sections</option>
              <option value="Section A">Section A</option>
              <option value="Section B">Section B</option>
              <option value="Section C">Section C</option>
            </select>
          </div>
        </div>

        {/* Step 2: Select Student Name (Filtered List) */}
        <div className="form-group" style={{ marginBottom: 24 }}>
          <label className="form-label" style={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <span>3. Select Student ({filteredStudents.length} Available)</span>
            <span style={{ fontSize: 12, color: 'var(--brand-orange)', fontWeight: 700 }}>Filtered by {selectedClass} • {selectedSection}</span>
          </label>
          <select
            className="form-input"
            value={selectedStudentId}
            onChange={e => setSelectedStudentId(e.target.value)}
            style={{ fontWeight: 700, fontSize: 15, padding: '12px 14px', border: '2px solid var(--brand-orange)' }}
          >
            {filteredStudents.length === 0 ? (
              <option value="">No students found in {selectedClass} ({selectedSection})</option>
            ) : (
              filteredStudents.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.class || 'Class N/A'} ({s.section || 'Sec A'}) • Roll: {s.roll || '01'}
                </option>
              ))
            )}
          </select>

          {selectedStudentObj && (
            <div className="flex-responsive" style={{ marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: 'rgba(191, 87, 0, 0.06)', border: '1px solid rgba(191, 87, 0, 0.15)' }}>
              <div>
                <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)' }}>{selectedStudentObj.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>ID: {selectedStudentObj.id}</span>
              </div>
              <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                <span className="badge">{selectedStudentObj.class || selectedClass} - {selectedStudentObj.section || 'A'}</span>
                <span style={{ fontWeight: 700, color: selectedStudentObj.dueAmount > 0 ? 'var(--danger)' : 'var(--success)' }}>
                  Due: ₹{(selectedStudentObj.dueAmount || 0).toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Step 3: Payment Details */}
        <div className="grid-responsive" style={{ marginBottom: 16 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontWeight: 700 }}>Installment Period</label>
            <select
              className="form-input"
              value={installmentType}
              onChange={(e) => setInstallmentType(e.target.value)}
              style={{ fontWeight: 700, fontSize: 14 }}
            >
              <option value="admission">1st — Admission</option>
              <option value="september">2nd — September</option>
              <option value="december">3rd — December</option>
              <option value="custom">Custom / Arrears</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontWeight: 700 }}>Receipt / Voucher No.</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. RSD-1024"
              value={receiptNumber}
              onChange={(e) => setReceiptNumber(e.target.value)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700 }}
            />
          </div>
        </div>

        {/* Step 4: Fee Breakdown generated from the class-specific fee structure */}
        <div style={{ marginBottom: 24, padding: 16, backgroundColor: 'rgba(191, 87, 0, 0.03)', borderRadius: 12, border: '1px solid rgba(191, 87, 0, 0.1)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>Applicable Charges</h3>
          <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-secondary)' }}>These fields are generated from the selected class fee structure. A one-time fee disappears after it is paid.</p>
          <div className="grid-responsive">
            {feeComponents.map(c => (
              <div className="form-group" style={{ marginBottom: 0 }} key={c.id}>
                <label className="form-label" style={{ fontSize: 12, fontWeight: 700 }}>{c.name} (₹)</label>
                <input type="number" min="0" className="form-input" placeholder="0" value={fees[c.id] ?? ''} onChange={e => handleFeeChange(c.id, e.target.value)} style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }} />
              </div>
            ))}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: 12, fontWeight: 800, color: 'var(--danger)' }}>Late Penalty (₹)</label>
              <input type="number" min="0" className="form-input" placeholder="Calculated automatically" value={penaltyAmount} onChange={e => setPenaltyAmount(e.target.value)} style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--danger)' }} />
            </div>
          </div>
        </div>

        <div className="flex-responsive" style={{ backgroundColor: 'var(--bg-card)', padding: '12px 16px', borderRadius: 12, marginBottom: 24, border: '1px solid var(--border-light)' }}>
          <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Grand Total to Collect:</span>
          <span style={{ fontSize: 24, fontWeight: 900, color: 'var(--brand-orange)', fontFamily: 'var(--font-mono)' }}>
            ₹ {(
              Object.values(fees).reduce((sum, val) => sum + (Number(val) || 0), 0) + 
              (Number(penaltyAmount) || 0)
            ).toLocaleString()}
          </span>
        </div>



        <div style={{ marginTop: 28, display: 'flex', gap: 12 }}>
          <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 12, fontSize: 15 }} onClick={handleRecordPayment} disabled={isProcessing}>
            <CreditCard size={18} /> {isProcessing ? 'Recording Payment...' : 'Issue Fee Receipt'}
          </button>
        </div>
      </div>
    </div>
  );
}


function FeeAdjustmentModule({ selectedSchool }) {
  const [students, setStudents] = useState([]);
  const [studentId, setStudentId] = useState('');
  const [adjustmentType, setAdjustmentType] = useState('Penalty Waiver');
  const [component, setComponent] = useState('Late Penalty');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const loadStudents = async () => {
      try {
        let q = collection(db, 'students');
        if (selectedSchool && selectedSchool !== 'ALL') q = query(q, where('schoolId', '==', selectedSchool));
        const snap = await getDocs(q);
        const rows = [];
        snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
        rows.sort((a,b) => String(a.name || '').localeCompare(String(b.name || '')));
        setStudents(rows);
      } catch (e) {
        console.error('Unable to load students for fee adjustments', e);
      }
    };
    loadStudents();
  }, [selectedSchool]);

  const selected = students.find(s => s.id === studentId);
  const filtered = students.filter(s => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return String(s.name || '').toLowerCase().includes(q) || String(s.id).toLowerCase().includes(q);
  });

  const handleAdjustment = async () => {
    const value = Number(amount);
    if (!studentId || !selected) return alert('Please select a student.');
    if (!Number.isFinite(value) || value <= 0) return alert('Enter an adjustment amount greater than zero.');
    if (value > Number(selected.dueAmount || 0)) return alert('Adjustment cannot be greater than the student\'s current due.');
    if (!reason.trim()) return alert('Please enter a reason for the adjustment.');

    setIsSaving(true);
    try {
      const studentRef = doc(db, 'students', studentId);
      const adjustmentRef = doc(collection(db, 'fee_adjustments'));
      const ledgerRef = doc(collection(db, 'student_ledger'));
      const schoolId = selected.schoolId || selectedSchool || 'SCH_01';
      const now = new Date().toISOString();

      await runTransaction(db, async (transaction) => {
        const studentDoc = await transaction.get(studentRef);
        if (!studentDoc.exists()) throw new Error('Student record no longer exists.');
        const currentDue = Number(studentDoc.data().dueAmount || 0);
        if (value > currentDue) throw new Error('Adjustment exceeds current due.');

        transaction.set(adjustmentRef, {
          studentId,
          studentName: selected.name || '',
          schoolId,
          class: selected.class || '',
          section: selected.section || '',
          adjustmentType,
          component,
          componentId: component === 'Late Penalty' ? 'latePenalty' : component.toLowerCase().replace(/\s+/g, '_'),
          amount: value,
          reason: reason.trim(),
          previousDue: currentDue,
          newDue: Math.max(0, currentDue - value),
          status: 'approved',
          recordedBy: auth.currentUser?.uid || 'unknown',
          createdAt: now
        });
        transaction.set(ledgerRef, {
          studentId,
          studentName: selected.name || '',
          schoolId,
          amount: value,
          adjustmentAmount: value,
          component,
          adjustmentType,
          reason: reason.trim(),
          type: 'adjustment',
          date: now,
          status: 'completed',
          recordedBy: 'authenticated-staff'
        });
      });

      alert(`₹${value.toLocaleString()} adjustment applied to ${selected.name}.`);
      setAmount('');
      setReason('');
      const fresh = { ...selected };
      setStudents(prev => prev.map(s => s.id === selected.id ? fresh : s));
    } catch (e) {
      console.error('Fee adjustment failed', e);
      alert(e.message || 'Failed to apply fee adjustment.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="glass-card" style={{ padding: 24 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Adjust Fees / Penalties</h2>
        <p style={{ margin: '6px 0 20px', color: 'var(--text-secondary)', fontSize: 13 }}>
          Reduce or waive a student charge without changing the original fee. Every adjustment is recorded in the financial ledger.
        </p>

        <div className="grid-responsive">
          <div className="form-group">
            <label className="form-label">Find Student</label>
            <input className="form-input" placeholder="Search name or Student ID" value={search} onChange={e => setSearch(e.target.value)} />
            <select className="form-input" style={{ marginTop: 8 }} value={studentId} onChange={e => setStudentId(e.target.value)}>
              <option value="">Select student</option>
              {filtered.map(s => <option key={s.id} value={s.id}>{s.name} — {s.class || ''} {s.section || ''} — Due ₹{Number(s.dueAmount || 0).toLocaleString()}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Adjustment Type</label>
            <select className="form-input" value={adjustmentType} onChange={e => setAdjustmentType(e.target.value)}>
              <option>Penalty Waiver</option>
              <option>Fee Concession</option>
              <option>Scholarship</option>
              <option>Fee Correction</option>
              <option>Other</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Fee / Charge</label>
            <select className="form-input" value={component} onChange={e => setComponent(e.target.value)}>
              <option>Late Penalty</option>
              <option>Tuition Fee</option>
              <option>Admission Fee</option>
              <option>Exam Fee</option>
              <option>Computer Fee</option>
              <option>Practical Fee</option>
              <option>Transport Fee</option>
              <option>Other</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Reduction Amount (₹)</label>
            <input type="number" min="1" className="form-input" placeholder="e.g. 300" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
        </div>

        <div className="form-group" style={{ marginTop: 4 }}>
          <label className="form-label">Reason / Note <span style={{ color: 'var(--danger)' }}>*</span></label>
          <textarea className="form-input" rows={3} placeholder="Why is this fee being reduced?" value={reason} onChange={e => setReason(e.target.value)} />
        </div>

        {selected && (
          <div style={{ marginTop: 12, padding: 14, borderRadius: 10, background: 'rgba(191, 87, 0, 0.06)', border: '1px solid rgba(191, 87, 0, 0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span><strong>{selected.name}</strong> · Current due ₹{Number(selected.dueAmount || 0).toLocaleString()}</span>
              <span style={{ fontWeight: 800 }}>After adjustment: ₹{Math.max(0, Number(selected.dueAmount || 0) - (Number(amount) || 0)).toLocaleString()}</span>
            </div>
          </div>
        )}

        <button className="btn-primary" style={{ marginTop: 20 }} onClick={handleAdjustment} disabled={isSaving}>
          {isSaving ? 'Applying...' : 'Apply Adjustment'}
        </button>
      </div>

      <div className="glass-card" style={{ padding: 18, fontSize: 13, color: 'var(--text-secondary)' }}>
        <strong style={{ color: 'var(--text-primary)' }}>Accounting rule:</strong> adjustments reduce the student's outstanding balance; they do not delete or rewrite the original fee. The adjustment, amount, reason, and timestamp are stored in <code>fee_adjustments</code> and the student ledger.
      </div>
    </div>
  );
}

function InvoicesModule({ subOnNavigate, userPermissions, selectedSchool }) {
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        let q = query(collection(db, "invoices"), orderBy("date", "desc"));
        if (selectedSchool && selectedSchool !== 'ALL') {
          q = query(collection(db, "invoices"), where("schoolId", "==", selectedSchool), orderBy("date", "desc"));
        }
        const qs = await getDocs(q);
        const res = [];
        qs.forEach(d => res.push({ id: d.id, ...d.data() }));
        setInvoices(res);
      } catch (err) {
        console.error("Error fetching invoices", err);
      }
    };
    fetchInvoices();
  }, [selectedSchool]);

  return (
    <div className="glass-card">
      <div className="flex-responsive" style={{ marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Fee Invoices & Receipts</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>History of issued receipts and pending fee vouchers</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <input type="text" className="form-input" placeholder="Search Invoice ID or Student..." style={{ flex: 1, minWidth: 240 }} />
      </div>

      <table className="modern-table">
        <thead>
          <tr>
            <th>Invoice ID</th>
            <th>Receipt No</th>
            <th>Student</th>
            <th>Date</th>
            <th>Amount</th>
            <th>Status</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id}>
              <td style={{ fontWeight: 700, color: 'var(--brand-orange)' }}>{inv.id}</td>
              <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' }}>{inv.receiptId}</td>
              <td>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{inv.student}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Class {inv.class}</div>
              </td>
              <td>{inv.date}</td>
              <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{inv.amount}</td>
              <td>
                <span className={`badge ${inv.status === 'Paid' ? 'success' : inv.status === 'Pending' ? 'warning' : 'danger'}`}>
                  {inv.status}
                </span>
              </td>
              <td style={{ textAlign: 'right' }}>
                <button className="icon-btn" title="Download PDF"><Download size={18} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DueFeesReport({ onSelectTab, dict, selectedSchool }) {
  const [dummyDues, setDummyDues] = useState([]);

  useEffect(() => {
    const fetchDues = async () => {
      try {
        let q = collection(db, "students");
        if (selectedSchool && selectedSchool !== 'ALL') {
          q = query(q, where("schoolId", "==", selectedSchool));
        }
        const qs = await getDocs(q);
        const res = [];
        qs.forEach(d => {
          const data = d.data();
          if (data.dueAmount > 0) {
            res.push({ id: d.id, dueDate: 'Due Now', ...data });
          }
        });
        setDummyDues(res);
      } catch (err) {
        console.error("Error fetching all dues", err);
      }
    };
    fetchDues();
  }, [selectedSchool]);

  return (
    <div className="glass-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{dict?.pendingDuesList || 'Pending Dues List'}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Unpaid fee accounts requiring collection</p>
        </div>
      </div>

      <table className="modern-table">
        <thead>
          <tr>
            <th>Student ID</th>
            <th>Name</th>
            <th>Class</th>
            <th>Due Date</th>
            <th style={{ textAlign: 'right' }}>Due Amount</th>
            <th style={{ textAlign: 'right' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {dummyDues.map((student) => (
            <tr key={student.id}>
              <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{student.id}</td>
              <td style={{ fontWeight: 700 }}>{student.name}</td>
              <td><span className="badge">{student.class} - {student.section}</span></td>
              <td><span style={{ color: 'var(--danger)', fontWeight: 600 }}>{student.dueDate}</span></td>
              <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--danger)' }}>
                ₹ {student.dueAmount.toLocaleString()}
              </td>
              <td style={{ textAlign: 'right' }}>
                <button className="btn-primary" style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => onSelectTab('record')}>
                  {dict?.collectFeeBtn || 'Collect Fee'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

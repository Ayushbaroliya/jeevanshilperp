import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, FolderOpen, ChevronRight, Mic, Trash2, Edit2, X, AlertCircle, Sparkles, MessageCircle, Download, CreditCard, Calendar, BookOpen, Award, FileText, Receipt, RotateCcw, RefreshCw, ShieldAlert, Archive , BarChart2 } from 'lucide-react';
import { collection, addDoc, setDoc, getDocs, query, where, doc, deleteDoc, updateDoc, orderBy, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { t, SCHOOLS } from '../../utils/translations';
import SchoolFolderPicker from '../common/SchoolFolderPicker';
import { calculateStudentDue, normalizeClassFeeSettings, generateChargeSchedule, getJSPSFeeComponents, getJSICFeeComponents, getSchoolDefaultFeeComponents, applyPaymentsAndAdjustments, summarizeDues, getTransportRoutes } from '../../utils/feeEngine';
import { generateStudentProfilePDF, generateFeeReceipt } from '../../utils/pdfGenerator';
import * as XLSX from 'xlsx';

const normalizeSectionQuery = (sec) => {
  if (!sec) return '';
  return sec.replace(/^Section\s+/i, '').trim();
};

export const isUserAdminOrOwner = (user) => {
  if (!user) return true;
  if (user.email === 'jeevanshilporg@gmail.com') return true;
  const r = (user.role || '').toLowerCase();
  return r === 'admin' || r === 'owner' || r === 'director' || r === 'administrator' || r.includes('admin');
};

export function StudentsDirectory({ onNavigate, lang, classes, sections, userPermissions, currentUser, onSelectStudent, selectedSchool, setSelectedSchool, classSettings = {}, searchQuery = '', activeAcademicYearId = '2026-2027' }) {
  const isOwnerUser = (user) => {
    if (!user) return false;
    if (user.email === 'jeevanshilporg@gmail.com') return true;
    const r = (user.role || '').toLowerCase();
    return r === 'owner' || r === 'director';
  };
  const dict = t[lang] || t.en;
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedSection, setSelectedSection] = useState('All');
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    const handleReceiptChange = () => {
      setRefreshTrigger(prev => prev + 1);
    };
    window.addEventListener('receipt_deleted_or_restored', handleReceiptChange);
    window.addEventListener('refresh_financials', handleReceiptChange);
    return () => {
      window.removeEventListener('receipt_deleted_or_restored', handleReceiptChange);
      window.removeEventListener('refresh_financials', handleReceiptChange);
    };
  }, []);
  const [studentName, setStudentName] = useState('');
  const [address, setAddress] = useState('');
  const [isTransportApplied, setIsTransportApplied] = useState(false);
  const [transportRouteId, setTransportRouteId] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [parentContact, setParentContact] = useState('');
  const [addSection, setAddSection] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Deleted Students / Recycle Bin state
  const [viewMode, setViewMode] = useState('active'); // 'active' | 'recycleBin'
  const [deletedStudents, setDeletedStudents] = useState([]);
  const [isDeletedLoading, setIsDeletedLoading] = useState(false);
  const [deletedSearchQuery, setDeletedSearchQuery] = useState('');
  const [deletedClassFilter, setDeletedClassFilter] = useState('All');

  const [isExportingAll, setIsExportingAll] = useState(false);



  const [isNewAdmission, setIsNewAdmission] = useState(false);

  // Edit Student State
  const [editingStudent, setEditingStudent] = useState(null);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editIsTransportApplied, setEditIsTransportApplied] = useState(false);
  const [editTransportRouteId, setEditTransportRouteId] = useState('');
  const [editFatherName, setEditFatherName] = useState('');
  const [editRoll, setEditRoll] = useState('');
  const [editClass, setEditClass] = useState('');
  const [editSection, setEditSection] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editIsNewAdmission, setEditIsNewAdmission] = useState(false);

  const [teacherAssignments, setTeacherAssignments] = useState([]);

  useEffect(() => {
    if (currentUser?.role === 'Teacher' || currentUser?.role === 'Senior Teacher') {
      const fetchMyClasses = async () => {
        try {
          let q = query(collection(db, "class_assignments"), where("teacherId", "==", currentUser.id));
          if (currentUser?.schoolId) {
            q = query(collection(db, "class_assignments"), where("teacherId", "==", currentUser.id), where("schoolId", "==", currentUser.schoolId));
          }
          const querySnapshot = await getDocs(q);
          const assignments = [];
          querySnapshot.forEach(doc => assignments.push(doc.data()));
          setTeacherAssignments(assignments);
        } catch (err) {
          console.error("Error fetching assigned classes:", err);
        }
      };
      fetchMyClasses();
    }
  }, [currentUser]);

  const hasStudentEditPermission = (studentClass, studentSection) => {
    if (isUserAdminOrOwner(currentUser)) return true;
    if (userPermissions?.manageStudents === false) return false;
    if (selectedSchool === 'ALL') return false;
    if (currentUser?.role !== 'Teacher' && currentUser?.role !== 'Senior Teacher') return true;
    
    // For teachers, they must be assigned to this class and section
    return teacherAssignments.some(assignment => {
      const classMatch = assignment.class === studentClass;
      // If assignment has no section, or section is 'All', or section matches exactly
      const normalizedAssignmentSection = normalizeSectionQuery(assignment.section);
      const normalizedStudentSection = normalizeSectionQuery(studentSection);
      const sectionMatch = !assignment.section || assignment.section === 'All' || !studentSection || studentSection === 'All' || normalizedAssignmentSection === normalizedStudentSection;
      return classMatch && sectionMatch;
    });
  };

  // Cleanly reset class and student directory view upon switching schools
  useEffect(() => {
    setSelectedClass(null);
    setSelectedSection('All');
    setStudents([]);
    if (viewMode === 'recycleBin') {
      fetchDeletedStudents();
    }
  }, [selectedSchool]);

  const fetchDeletedStudents = async () => {
    setIsDeletedLoading(true);
    try {
      let q = collection(db, "students");
      if (selectedSchool && selectedSchool !== 'ALL') {
        q = query(q, where("schoolId", "==", selectedSchool));
      }
      const snap = await getDocs(q);
      const list = [];
      snap.forEach(docSnap => {
        const data = docSnap.data();
        if (data.status === 'Deleted' || data.isDeleted === true) {
          list.push({ id: docSnap.id, ...data });
        }
      });
      list.sort((a, b) => new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0));
      setDeletedStudents(list);
    } catch (err) {
      console.error("Error fetching deleted students:", err);
    } finally {
      setIsDeletedLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'recycleBin') {
      fetchDeletedStudents();
    }
  }, [viewMode, selectedSchool]);

  // Support Escape key to close modal windows
  useEffect(() => {
    const handleModalKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (editingStudent) setEditingStudent(null);
        if (isAddingStudent) setIsAddingStudent(false);
      }
    };
    window.addEventListener('keydown', handleModalKeyDown);
    return () => window.removeEventListener('keydown', handleModalKeyDown);
  }, [editingStudent, isAddingStudent]);

  useEffect(() => {
    if (isAddingStudent && sections && sections.length > 0 && !addSection) {
      setAddSection(sections[0]);
    }
  }, [isAddingStudent, sections, addSection]);

  useEffect(() => {
    if (selectedClass) {
      const fetchStudents = async () => {
        setIsLoading(true);
        try {
          let q = collection(db, "students");
          
          if (selectedSchool && selectedSchool !== 'ALL') {
            if (selectedSection === 'All') {
              q = query(q, where("schoolId", "==", selectedSchool), where("class", "==", selectedClass));
            } else {
              q = query(q, where("schoolId", "==", selectedSchool), where("class", "==", selectedClass), where("section", "==", normalizeSectionQuery(selectedSection)));
            }
          } else {
            if (selectedSection === 'All') {
              q = query(q, where("class", "==", selectedClass));
            } else {
              q = query(q, where("class", "==", selectedClass), where("section", "==", normalizeSectionQuery(selectedSection)));
            }
          }
          
          const canonicalYearId = activeAcademicYearId === '2026-2027' ? 'AY_2026_27' : (activeAcademicYearId || 'AY_2026_27');
          let chargeQuery = collection(db, 'fee_charges');
          if (selectedSchool && selectedSchool !== 'ALL') {
            chargeQuery = query(chargeQuery, where('schoolId', '==', selectedSchool), where('academicYearId', '==', canonicalYearId));
          } else {
            chargeQuery = query(chargeQuery, where('academicYearId', '==', canonicalYearId));
          }

          let invoiceQuery = collection(db, 'invoices');
          if (selectedSchool && selectedSchool !== 'ALL') {
            invoiceQuery = query(invoiceQuery, where('schoolId', '==', selectedSchool));
          }

          const queries = [
            getDocs(q),
            getDocs(query(collection(db, 'student_ledger'), where('type', '==', 'credit'))),
            getDocs(invoiceQuery),
            getDocs(query(collection(db, 'fee_adjustments'), where('status', '==', 'approved'))),
            getDocs(chargeQuery)
          ];

          const results = await Promise.all(queries);
          const querySnapshot = results[0];
          const paymentSnap = results[1];
          const invoiceSnap = results[2];
          const adjustmentSnap = results[3];
          const chargesSnap = results[4];

          // 1. Gather all deleted receipt numbers from both collections
          const deletedReceiptNums = new Set();
          invoiceSnap.forEach(d => {
            const data = d.data();
            const recNum = data.receiptId || data.receiptNo || data.receiptNumber;
            if (data.deleted || data.isDeleted || data.status === 'deleted') {
              if (recNum) deletedReceiptNums.add(recNum);
            }
          });
          paymentSnap.forEach(d => {
            const data = d.data();
            const recNum = data.receiptNumber || data.receiptId;
            if (data.deleted || data.isDeleted || data.status === 'deleted') {
              if (recNum) deletedReceiptNums.add(recNum);
            }
          });

          // 2. Build non-deleted payments per student
          const paymentsByStudent = {};
          const seenReceiptKeys = new Set();

          invoiceSnap.forEach(d => {
            const data = d.data();
            const recNum = data.receiptId || data.receiptNo || data.receiptNumber;
            if (!data.deleted && !data.isDeleted && data.status !== 'deleted' && (!recNum || !deletedReceiptNums.has(recNum))) {
              if (data.studentId) {
                (paymentsByStudent[data.studentId] ||= []).push({ id: d.id, ...data });
                if (recNum) seenReceiptKeys.add(`${data.studentId}_${recNum}`);
              }
            }
          });

          paymentSnap.forEach(d => {
            const data = d.data();
            const recNum = data.receiptNumber || data.receiptId;
            if (!data.deleted && !data.isDeleted && data.status !== 'deleted' && (!recNum || !deletedReceiptNums.has(recNum))) {
              if (data.studentId) {
                const key = recNum ? `${data.studentId}_${recNum}` : null;
                if (!key || !seenReceiptKeys.has(key)) {
                  (paymentsByStudent[data.studentId] ||= []).push({ id: d.id, ...data });
                  if (key) seenReceiptKeys.add(key);
                }
              }
            }
          });

          const adjustmentsByStudent = {};
          adjustmentSnap.forEach(d => {
            const a = d.data();
            if (!a.deleted && !a.isDeleted && a.status === 'approved') {
              (adjustmentsByStudent[a.studentId] ||= []).push(a);
            }
          });

          const chargesByStudent = {};
          if (chargesSnap) {
            chargesSnap.forEach(d => {
              const c = d.data();
              if (!c.deleted && !c.isDeleted && c.status !== 'deleted') {
                (chargesByStudent[c.studentId] ||= []).push({ id: d.id, ...c });
              }
            });
          }

          const loadedStudents = [];
          querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.status !== 'Deleted' && data.status !== 'archived' && !data.isDeleted) {
              const studentClass = data.class;
              const studentSchool = data.schoolId || selectedSchool;
              let rawSettings = classSettings[studentClass];
              if (!rawSettings || !rawSettings.components || rawSettings.components.length === 0) {
                rawSettings = {
                  components: getSchoolDefaultFeeComponents(studentSchool, studentClass, canonicalYearId)
                };
              }
              const sSettings = normalizeClassFeeSettings(rawSettings);
              const result = calculateStudentDue({
                student: { id: docSnap.id, ...data },
                charges: chargesByStudent[docSnap.id],
                classSettings: sSettings,
                payments: paymentsByStudent[docSnap.id] || [],
                adjustments: adjustmentsByStudent[docSnap.id] || []
              });
              const liveDue = result.totalDue;
              loadedStudents.push({ id: docSnap.id, ...data, liveDue });
            }
          });
          
          // Check if Teacher has assigned classes logic
          if (currentUser && currentUser.role === 'Teacher' && teacherAssignments.length > 0) {
            setStudents(loadedStudents.filter(student => hasStudentEditPermission(student.class, student.section)));
          } else {
            setStudents(loadedStudents);
          }
        } catch (error) {
          console.error("Error fetching students: ", error);
          setStudents([]);
        }
        setIsLoading(false);
      };
      fetchStudents();
    }
  }, [selectedClass, selectedSection, selectedSchool, teacherAssignments, classSettings, refreshTrigger]);

  // Filter loaded students by the global top search bar query
  const filteredStudents = searchQuery.trim()
    ? students.filter(s => {
        const q = searchQuery.trim().toLowerCase();
        return (
          (s.name || '').toLowerCase().includes(q) ||
          (s.roll || '').toString().toLowerCase().includes(q) ||
          (s.section || '').toLowerCase().includes(q) ||
          (s.contact || '').toLowerCase().includes(q)
        );
      })
    : students;

  // Filter soft-deleted students for Recycle Bin view
  const filteredDeletedStudents = deletedStudents.filter(s => {
    if (deletedClassFilter !== 'All' && s.class !== deletedClassFilter) return false;
    if (deletedSearchQuery.trim()) {
      const q = deletedSearchQuery.trim().toLowerCase();
      const matchName = (s.name || '').toLowerCase().includes(q);
      const matchRoll = String(s.roll || '').toLowerCase().includes(q);
      const matchId = (s.id || '').toLowerCase().includes(q);
      const matchFather = (s.fatherName || s.parentName || '').toLowerCase().includes(q);
      return matchName || matchRoll || matchId || matchFather;
    }
    return true;
  });

  // If ALL schools are selected, force user to pick a school first
  if (selectedSchool === 'ALL') {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <button className="icon-btn" onClick={() => onNavigate('dashboard')} style={{ backgroundColor: 'var(--bg-secondary)', padding: 10 }}>
            <ArrowLeft size={20} />
          </button>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Student Directory</h1>
        </div>
        <SchoolFolderPicker 
          title="Select Branch for Student Directory" 
          description="Please select a specific school branch to view and manage its students."
          onSelectSchool={(schoolId) => setSelectedSchool && setSelectedSchool(schoolId)}
        />
      </div>
    );
  }

  const handleSaveStudent = async (keepOpen = false) => {
    if (!studentName || !rollNumber) {
      alert("Name and Roll Number are required!");
      return;
    }

    const targetSchool = selectedSchool !== 'ALL' ? selectedSchool : 'SCH_01';
    const targetAcademicYear = activeAcademicYearId || 'AY_2026_27'; // Current academic year context
    const targetAcademicYearLabel = targetAcademicYear === 'AY_2026_27' ? '2026-2027' : '2025-2026';

    // ── 5-field Duplicate Roll-Number Guard (schoolId + academicYearId + class + section + roll) ──
    try {
      const dupQ = query(
        collection(db, "enrollments"),
        where("schoolId",       "==", targetSchool),
        where("academicYearId", "==", targetAcademicYear),
        where("class",          "==", selectedClass),
        where("section",        "==", normalizeSectionQuery(addSection)),
        where("roll",           "==", rollNumber)
      );
      const dupSnap = await getDocs(dupQ);
      const hasDup = dupSnap.docs.some(d => d.data().status !== 'Left' && d.data().status !== 'Withdrawn');
      if (hasDup) {
        alert(`Roll number "${rollNumber}" is already assigned to another student in ${selectedClass} (${addSection}) for ${targetAcademicYear}. Please use a different roll number.`);
        return;
      }
    } catch (dupErr) {
      console.error("Duplicate roll check failed:", dupErr);
    }
    // ────────────────────────────────────────────────────────────────

    try {
      // 1. Create Permanent Student Record
      const studentDocRef = await addDoc(collection(db, "students"), {
        name: studentName,
        fatherName: fatherName,
        roll: rollNumber,
        contact: parentContact,
        class: selectedClass,
        section: normalizeSectionQuery(addSection),
        schoolId: targetSchool,
        isNewAdmission: isNewAdmission,
        address: address,
        isTransportApplied: isTransportApplied,
        transportRouteId: transportRouteId,
        academicYear: targetAcademicYearLabel,
        status: 'active',
        createdAt: new Date().toISOString()
      });

      // 2. Create Yearly Enrollment Record
      await addDoc(collection(db, "enrollments"), {
        studentId: studentDocRef.id,
        schoolId: targetSchool,
        academicYearId: targetAcademicYear,
        class: selectedClass,
        section: normalizeSectionQuery(addSection),
        roll: rollNumber,
        fatherName: fatherName,
        status: 'Active',
        attendance: '100%',
        isNewAdmission: isNewAdmission,
        createdAt: new Date().toISOString()
      });

      // 3. Generate permanent fee_charges snapshot from class settings
      let classFeeConfig = classSettings?.[selectedClass];
      if (!classFeeConfig || !classFeeConfig.components || classFeeConfig.components.length === 0) {
        const defaultComps = getSchoolDefaultFeeComponents(targetSchool, selectedClass, targetAcademicYearLabel);
        classFeeConfig = { components: defaultComps };
      }
      const feeTemplate = normalizeClassFeeSettings(classFeeConfig, targetAcademicYearLabel);
      const mockStudent = {
        id: studentDocRef.id,
        isNewAdmission: isNewAdmission,
        academicYear: targetAcademicYearLabel
      };
      const initialCharges = generateChargeSchedule(mockStudent, feeTemplate, targetAcademicYearLabel);

      if (initialCharges && initialCharges.length > 0) {
        const chargeBatch = writeBatch(db);
        for (const charge of initialCharges) {
          const chargeRef = doc(collection(db, "fee_charges"));
          chargeBatch.set(chargeRef, {
            id: charge.id,
            studentId: studentDocRef.id,
            academicYear: targetAcademicYearLabel,
            academicYearId: targetAcademicYear,
            schoolId: targetSchool,
            class: selectedClass,
            section: normalizeSectionQuery(addSection),
            componentId: charge.componentId,
            label: charge.label,
            originalAmount: charge.originalAmount,
            dueDate: charge.dueDate,
            status: 'unpaid',
            allocatedPaid: 0,
            allocatedAdjusted: 0,
            netDue: charge.originalAmount,
            type: charge.type || 'standard',
            createdAt: new Date().toISOString()
          });
        }
        await chargeBatch.commit();
      }

      if (isTransportApplied && transportRouteId) {
        const tBatch = writeBatch(db);
        const routes = getTransportRoutes(targetSchool);
        const selectedRoute = routes.find(r => r.id === transportRouteId);
        if (selectedRoute) {
          const yr = targetAcademicYearLabel.split('-')[0] || '2026';
          const tCharges = [
            { dueDate: `${yr}-07-10`, amount: selectedRoute.inst1, label: '1st Installment' },
            { dueDate: `${yr}-10-10`, amount: selectedRoute.inst2, label: '2nd Installment' },
            { dueDate: `${yr}-12-10`, amount: selectedRoute.inst3, label: '3rd Installment' }
          ];
          for (let i = 0; i < tCharges.length; i++) {
            const chargeRef = doc(collection(db, "fee_charges"));
            tBatch.set(chargeRef, {
              id: `chg_${studentDocRef.id}_${targetAcademicYearLabel}_transport_${tCharges[i].dueDate}`,
              studentId: studentDocRef.id,
              academicYear: targetAcademicYearLabel,
              academicYearId: targetAcademicYear,
              schoolId: targetSchool,
              class: selectedClass,
              section: normalizeSectionQuery(addSection),
              componentId: 'transport',
              label: `Transport Fee (${selectedRoute.name}) - ${tCharges[i].label}`,
              originalAmount: tCharges[i].amount,
              dueDate: tCharges[i].dueDate,
              status: 'unpaid',
              allocatedPaid: 0,
              allocatedAdjusted: 0,
              netDue: tCharges[i].amount,
              type: 'standard',
              createdAt: new Date().toISOString()
            });
          }
          await tBatch.commit();
        }
      }
      
      if (!keepOpen) {
        setIsAddingStudent(false);
      } else {
        const btn = document.getElementById('save-next-btn');
        if (btn) {
          const originalText = btn.innerText;
          btn.innerText = '✅ Saved!';
          setTimeout(() => { btn.innerText = originalText; }, 1000);
        }
      }
      
      setStudentName('');
      setFatherName('');
      setRollNumber('');
      setParentContact('');
      setIsNewAdmission(false);
      setAddress('');
      setIsTransportApplied(false);
      setTransportRouteId('');

      if (selectedClass) {
        setIsLoading(true);
        let q;
        if (selectedSection === 'All') {
          q = query(collection(db, "students"), where("class", "==", selectedClass));
        } else {
          q = query(collection(db, "students"), where("class", "==", selectedClass), where("section", "==", normalizeSectionQuery(selectedSection)));
        }
        const canonicalYearId = activeAcademicYearId === '2026-2027' ? 'AY_2026_27' : (activeAcademicYearId || 'AY_2026_27');
        let chargeQuery = collection(db, 'fee_charges');
        if (targetSchool && targetSchool !== 'ALL') {
          chargeQuery = query(chargeQuery, where('schoolId', '==', targetSchool), where('academicYearId', '==', canonicalYearId));
        } else {
          chargeQuery = query(chargeQuery, where('academicYearId', '==', canonicalYearId));
        }

        let addInvoiceQuery = collection(db, 'invoices');
        if (targetSchool && targetSchool !== 'ALL') {
          addInvoiceQuery = query(addInvoiceQuery, where('schoolId', '==', targetSchool));
        }

        const [querySnapshot, paymentSnap, invoiceSnap, adjustmentSnap, chargeSnap] = await Promise.all([
          getDocs(q),
          getDocs(query(collection(db, 'student_ledger'), where('type', '==', 'credit'))),
          getDocs(addInvoiceQuery),
          getDocs(query(collection(db, 'fee_adjustments'), where('status', '==', 'approved'))),
          getDocs(chargeQuery)
        ]);

        const deletedReceiptNums = new Set();
        invoiceSnap.forEach(d => {
          const data = d.data();
          const recNum = data.receiptId || data.receiptNo || data.receiptNumber;
          if (data.deleted || data.isDeleted || data.status === 'deleted') {
            if (recNum) deletedReceiptNums.add(recNum);
          }
        });
        paymentSnap.forEach(d => {
          const data = d.data();
          const recNum = data.receiptNumber || data.receiptId;
          if (data.deleted || data.isDeleted || data.status === 'deleted') {
            if (recNum) deletedReceiptNums.add(recNum);
          }
        });

        const paymentsByStudent = {};
        const seenReceiptKeys = new Set();

        invoiceSnap.forEach(d => {
          const data = d.data();
          const recNum = data.receiptId || data.receiptNo || data.receiptNumber;
          if (!data.deleted && !data.isDeleted && data.status !== 'deleted' && (!recNum || !deletedReceiptNums.has(recNum))) {
            if (data.studentId) {
              (paymentsByStudent[data.studentId] ||= []).push({ id: d.id, ...data });
              if (recNum) seenReceiptKeys.add(`${data.studentId}_${recNum}`);
            }
          }
        });

        paymentSnap.forEach(d => {
          const data = d.data();
          const recNum = data.receiptNumber || data.receiptId;
          if (!data.deleted && !data.isDeleted && data.status !== 'deleted' && (!recNum || !deletedReceiptNums.has(recNum))) {
            if (data.studentId) {
              const key = recNum ? `${data.studentId}_${recNum}` : null;
              if (!key || !seenReceiptKeys.has(key)) {
                (paymentsByStudent[data.studentId] ||= []).push({ id: d.id, ...data });
                if (key) seenReceiptKeys.add(key);
              }
            }
          }
        });

        const adjustmentsByStudent = {};
        adjustmentSnap.forEach(d => {
          const a = d.data();
          if (!a.deleted && !a.isDeleted && a.status === 'approved') {
            (adjustmentsByStudent[a.studentId] ||= []).push(a);
          }
        });

        const chargesByStudent = {};
        chargeSnap.forEach(d => {
          const c = d.data();
          if (!c.deleted && !c.isDeleted && c.status !== 'deleted') {
            (chargesByStudent[c.studentId] ||= []).push({ id: d.id, ...c });
          }
        });

        const loadedStudents = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.status !== 'Deleted' && data.status !== 'archived' && !data.isDeleted) {
            const sSettings = normalizeClassFeeSettings(classSettings[data.class] || {});
            const result = calculateStudentDue({
              student: { id: doc.id, ...data },
              charges: chargesByStudent[doc.id],
              classSettings: sSettings,
              payments: paymentsByStudent[doc.id] || [],
              adjustments: adjustmentsByStudent[doc.id] || []
            });
            const liveDue = result.totalDue;
            
            loadedStudents.push({ id: doc.id, ...data, liveDue });
          }
        });
        setStudents(loadedStudents);
        setIsLoading(false);
      }
    } catch (e) {
      console.error("Error adding student: ", e);
      alert("Error adding student.");
    }
  };

  const handleBack = () => {
    if (isAddingStudent) {
      setIsAddingStudent(false);
    } else if (viewMode === 'recycleBin') {
      setViewMode('active');
    } else if (selectedClass) {
      setSelectedClass(null);
      setSelectedSection('All');
    } else {
      onNavigate('dashboard');
    }
  };

  const toggleVoiceTyping = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice typing is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    if (isListening) return;

    const recognition = new SpeechRecognition();
    recognition.lang = lang === 'hi' ? 'hi-IN' : 'en-US';
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const formatted = transcript.charAt(0).toUpperCase() + transcript.slice(1);
      setStudentName(formatted);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognition.start();
  };

  const handleSoftDeleteStudent = async (studentId, name, studentSchool) => {
    const confirmMsg = `Are you sure you want to move student "${name}" to Deleted Students (Recycle Bin)?\nThis will safely remove them from active student lists, searches, and rosters while keeping historical financial and attendance records intact.\n\nक्या आप वाकई छात्र "${name}" को हटाए गए छात्रों (रीसायकल बिन) में भेजना चाहते हैं?\nयह उन्हें सक्रिय छात्र सूची से हटा देगा, जबकि उनके पिछले रिकॉर्ड सुरक्षित रहेंगे।`;
    if (window.confirm(confirmMsg)) {
      try {
        await updateDoc(doc(db, "students", studentId), {
          status: 'Deleted',
          isDeleted: true,
          deletedAt: new Date().toISOString(),
          deletedBy: currentUser?.name || currentUser?.email || currentUser?.role || 'Admin'
        });

        try {
          const { logAuditAction } = await import('../../utils/auditLogger');
          await logAuditAction({
            action: 'STUDENT_SOFT_DELETED',
            performedBy: currentUser?.name || currentUser?.email || currentUser?.uid || 'Admin',
            schoolId: studentSchool || selectedSchool,
            details: { studentId, studentName: name }
          });
        } catch (e) {
          console.error("Audit log failed:", e);
        }

        setStudents(prev => prev.filter(s => s.id !== studentId));
        alert(`Student "${name}" moved to Deleted Students (Recycle Bin).`);
      } catch (err) {
        console.error("Error soft-deleting student:", err);
        alert("Failed to delete student: " + err.message);
      }
    }
  };

  const handleRestoreStudent = async (student) => {
    const confirmMsg = `Are you sure you want to restore student "${student.name}" back to active records in ${student.class || "their class"}?\n\nक्या आप वाकई छात्र "${student.name}" को वापस सक्रिय रिकॉर्ड में पुनर्स्थापित करना चाहते हैं?`;
    if (window.confirm(confirmMsg)) {
      try {
        await updateDoc(doc(db, "students", student.id), {
          status: 'Active',
          isDeleted: false,
          restoredAt: new Date().toISOString(),
          restoredBy: currentUser?.name || currentUser?.email || currentUser?.role || 'Admin'
        });

        try {
          const { logAuditAction } = await import('../../utils/auditLogger');
          await logAuditAction({
            action: 'STUDENT_RESTORED',
            performedBy: currentUser?.name || currentUser?.email || currentUser?.uid || 'Admin',
            schoolId: student.schoolId || selectedSchool,
            details: { studentId: student.id, studentName: student.name, class: student.class }
          });
        } catch (e) {
          console.error("Audit log failed:", e);
        }

        setDeletedStudents(prev => prev.filter(s => s.id !== student.id));
        alert(`Student "${student.name}" successfully restored to active records.`);
      } catch (err) {
        console.error("Error restoring student:", err);
        alert("Failed to restore student: " + err.message);
      }
    }
  };

  const handlePermanentDelete = async (student) => {
    const isAuthorized = isUserAdminOrOwner(currentUser);
    if (!isAuthorized) {
      alert("Unauthorized: Only Owner and Administrator roles can permanently delete student records.");
      return;
    }

    const confirmMsg = `⚠️ WARNING: This action is PERMANENT and CANNOT be undone!\nAre you sure you want to permanently delete student "${student.name}" and all their records?\n\n⚠️ चेतावनी: यह कार्रवाई स्थायी है और इसे वापस नहीं किया जा सकता!\nक्या आप वाकई छात्र "${student.name}" का रिकॉर्ड हमेशा के लिए हटाना चाहते हैं?`;
    const confirmed = window.confirm(confirmMsg);
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "students", student.id));

      try {
        const { logAuditAction } = await import('../../utils/auditLogger');
        await logAuditAction({
          action: 'STUDENT_PERMANENTLY_DELETED',
          performedBy: currentUser?.name || currentUser?.email || currentUser?.uid || 'Admin',
          schoolId: student.schoolId || selectedSchool,
          details: {
            studentId: student.id,
            studentName: student.name,
            class: student.class,
            roll: student.roll
          }
        });
      } catch (e) {
        console.error("Audit log failed:", e);
      }

      setDeletedStudents(prev => prev.filter(s => s.id !== student.id));
      alert(`Student record for "${student.name}" permanently deleted.`);
    } catch (err) {
      console.error("Error permanently deleting student:", err);
      alert("Failed to permanently delete student: " + err.message);
    }
  };

  const handleOpenEdit = (student, e) => {
    e.stopPropagation();
    setEditingStudent(student);
    setEditName(student.name || '');
    setEditAddress(student.address || student.legacyAddress || '');
    setEditIsTransportApplied(student.isTransportApplied || false);
    setEditTransportRouteId(student.transportRouteId || '');
    setEditFatherName(student.fatherName || student.parentName || '');
    setEditRoll(student.roll || '');
    setEditClass(student.class || selectedClass || 'Class 1');
    setEditSection(student.section || 'Section A');
    setEditContact(student.contact || '');
    setEditIsNewAdmission(student.isNewAdmission === true || student.admissionType === 'new');
  };

  const handleSaveStudentEdit = async (e) => {
    e.preventDefault();
    if (!editName.trim()) return;

    // ── Duplicate roll number guard (skip own record) ────────────────
    if (editRoll.trim()) {
      try {
        const q = query(collection(db, "students"), 
          where("schoolId", "==", editingStudent.schoolId || selectedSchool || 'SCH_01'),
          where("class",    "==", editClass),
          where("section",  "==", normalizeSectionQuery(editSection)),
          where("roll",     "==", editRoll.trim())
        );
        const dupSnap = await getDocs(q);
        const hasDup = dupSnap.docs.some(
          d => d.id !== editingStudent.id && d.data().status !== 'archived' && d.data().status !== 'Deleted' && !d.data().isDeleted
        );
        if (hasDup) {
          alert(`Roll number "${editRoll}" is already assigned to another student in ${editClass} (${editSection}). Please use a different roll number.`);
          return;
        }
      } catch (dupErr) {
        console.error("Duplicate roll check failed:", dupErr);
      }
    }
    // ────────────────────────────────────────────────────────────────

    try {
      if (editingStudent) {
        const targetSchool = editingStudent.schoolId || selectedSchool || 'SCH_01';
        const targetAcademicYear = activeAcademicYearId === '2026-2027' ? 'AY_2026_27' : (activeAcademicYearId || 'AY_2026_27');
        const targetAcademicYearLabel = targetAcademicYear === 'AY_2026_27' ? '2026-2027' : targetAcademicYear;

        // 1. Update the student document
        await updateDoc(doc(db, "students", editingStudent.id), {
          name: editName,
          fatherName: editFatherName,
          roll: editRoll,
          class: editClass,
          section: normalizeSectionQuery(editSection),
          contact: editContact,
          isNewAdmission: editIsNewAdmission,
          address: editAddress,
          isTransportApplied: editIsTransportApplied,
          transportRouteId: editTransportRouteId
        });

        // 2. Synchronize Admission Fee in fee_charges
        let admissionFeeDelta = 0;
        try {
          const chargeQ = query(collection(db, "fee_charges"), where("studentId", "==", editingStudent.id));
          const chargeSnap = await getDocs(chargeQ);
          const existingAdmissionDoc = chargeSnap.docs.find(d => d.data().componentId === 'admission');

          // Sync class / section updates on existing charges if changed
          const normSec = normalizeSectionQuery(editSection);
          chargeSnap.docs.forEach(d => {
            const cData = d.data();
            if (cData.class !== editClass || cData.section !== normSec) {
              updateDoc(doc(db, "fee_charges", d.id), {
                class: editClass,
                section: normSec
              }).catch(e => console.warn("Charge class/section sync error:", e));
            }
          });

          if (editIsNewAdmission) {
            // Marked as New Admission -> Ensure admission charge exists in fee_charges
            if (!existingAdmissionDoc) {
              let classFeeConfig = classSettings?.[editClass];
              if (!classFeeConfig || !classFeeConfig.components || classFeeConfig.components.length === 0) {
                const defaultComps = getSchoolDefaultFeeComponents(targetSchool, editClass, targetAcademicYearLabel);
                classFeeConfig = { components: defaultComps };
              }
              const feeTemplate = normalizeClassFeeSettings(classFeeConfig, targetAcademicYearLabel);
              const admissionComp = feeTemplate.components?.find(c => c.id === 'admission');
              const admissionAmt = Number(admissionComp?.amount ?? admissionComp?.schedule?.[0]?.amount ?? 500);

              if (admissionAmt > 0) {
                const startYear = targetAcademicYearLabel.split('-')[0] || '2026';
                const dueDate = admissionComp?.schedule?.[0]?.dueDate || `${startYear}-07-10`;
                const chargeId = `chg_${editingStudent.id}_${targetAcademicYearLabel}_admission_${dueDate}`;

                await addDoc(collection(db, "fee_charges"), {
                  id: chargeId,
                  studentId: editingStudent.id,
                  academicYear: targetAcademicYearLabel,
                  academicYearId: targetAcademicYear,
                  schoolId: targetSchool,
                  class: editClass,
                  section: normSec,
                  componentId: 'admission',
                  label: admissionComp?.name || 'Admission Fee - One Time',
                  originalAmount: admissionAmt,
                  dueDate: dueDate,
                  status: 'unpaid',
                  allocatedPaid: 0,
                  allocatedAdjusted: 0,
                  netDue: admissionAmt,
                  type: 'standard',
                  createdAt: new Date().toISOString()
                });
                admissionFeeDelta = admissionAmt;
              }
            }
          } else {
            // Unmarked New Admission -> Remove unpaid admission fee if it exists
            if (existingAdmissionDoc) {
              const admData = existingAdmissionDoc.data();
              if ((Number(admData.allocatedPaid) || 0) === 0) {
                await deleteDoc(doc(db, "fee_charges", existingAdmissionDoc.id));
                admissionFeeDelta = -(Number(admData.netDue) || Number(admData.originalAmount) || 0);
              }
            }
          }
        } catch (feeSyncErr) {
          console.error("Failed to sync admission charge in fee_charges:", feeSyncErr);
        }

        try {
          if (editIsTransportApplied && editTransportRouteId) {
            const chargeQ = query(collection(db, "fee_charges"), where("studentId", "==", editingStudent.id), where("componentId", "==", "transport"));
            const tSnap = await getDocs(chargeQ);
            if (tSnap.empty) {
              const routes = getTransportRoutes(targetSchool);
              const selectedRoute = routes.find(r => r.id === editTransportRouteId);
              if (selectedRoute) {
                const yr = targetAcademicYearLabel.split('-')[0] || '2026';
                const tBatch = writeBatch(db);
                const tCharges = [
                  { dueDate: `${yr}-07-10`, amount: selectedRoute.inst1, label: '1st Installment' },
                  { dueDate: `${yr}-10-10`, amount: selectedRoute.inst2, label: '2nd Installment' },
                  { dueDate: `${yr}-12-10`, amount: selectedRoute.inst3, label: '3rd Installment' }
                ];
                for (let i = 0; i < tCharges.length; i++) {
                  const chargeRef = doc(collection(db, "fee_charges"));
                  tBatch.set(chargeRef, {
                    id: `chg_${editingStudent.id}_${targetAcademicYearLabel}_transport_${tCharges[i].dueDate}`,
                    studentId: editingStudent.id,
                    academicYear: targetAcademicYearLabel,
                    academicYearId: targetAcademicYear,
                    schoolId: targetSchool,
                    class: editClass,
                    section: normalizeSectionQuery(editSection),
                    componentId: 'transport',
                    label: `Transport Fee (${selectedRoute.name}) - ${tCharges[i].label}`,
                    originalAmount: tCharges[i].amount,
                    dueDate: tCharges[i].dueDate,
                    status: 'unpaid',
                    allocatedPaid: 0,
                    allocatedAdjusted: 0,
                    netDue: tCharges[i].amount,
                    type: 'standard',
                    createdAt: new Date().toISOString()
                  });
                }
                await tBatch.commit();
              }
            }
          }
        } catch (tErr) {
          console.error("Failed to sync transport charges:", tErr);
        }


        // 3. Update local state with new details and adjusted liveDue
        setStudents(prev => prev.map(s => {
          if (s.id === editingStudent.id) {
            const currentLiveDue = Number(s.liveDue) || 0;
            return {
              ...s,
              name: editName,
              fatherName: editFatherName,
              roll: editRoll,
              class: editClass,
              section: normalizeSectionQuery(editSection),
              contact: editContact,
              isNewAdmission: editIsNewAdmission,
              liveDue: Math.max(0, currentLiveDue + admissionFeeDelta)
            };
          }
          return s;
        }));

        alert(editIsNewAdmission
          ? `Student updated successfully!\nAdmission Fee has been added to ${editName}'s account.`
          : "Student information updated successfully!");
        setEditingStudent(null);
      }
    } catch (err) {
      console.error("Error updating student:", err);
      alert("Failed to update student: " + err.message);
    }
  };

  // ────────────────────────────────────────────────────────────────────────────
  // EXCEL EXPORTS (Classwise & All Classes Multi-Tab Workbook)
  // ────────────────────────────────────────────────────────────────────────────
  const handleExportClassStudents = () => {
    if (!filteredStudents || filteredStudents.length === 0) {
      alert("No students found to export in this class.");
      return;
    }
    const schoolName = SCHOOLS.find(s => s.id === selectedSchool)?.name || selectedSchool;
    const wb = XLSX.utils.book_new();

    const rows = filteredStudents.map((s, idx) => {
      const parentVal = s.fatherName || s.parentName || s.father || s.father_name || '';
      return {
        'S.No.': idx + 1,
        'Roll No.': s.roll || '',
        'Student Name': s.name || '',
        "Father's Name": parentVal,
        "Parent's Name": parentVal,
        'Class': s.class || selectedClass || '',
        'Section': s.section || '',
        'Contact': s.contact || s.parentContact || '',
        'Admission Type': (s.isNewAdmission || s.admissionType === 'new') ? 'New' : 'Old',
        'Attendance': s.attendance || '100%',
        'Live Due (₹)': Number(s.liveDue || 0)
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const safeSheetName = (selectedClass || 'Class').slice(0, 31).replace(/[\\/?*[\]]/g, '');
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
    XLSX.writeFile(wb, `Students_${schoolName}_${selectedClass}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportAllClassesStudents = async () => {
    if (!selectedSchool || selectedSchool === 'ALL') {
      alert("Please select a specific school branch first.");
      return;
    }
    setIsExportingAll(true);
    try {
      const canonicalYearId = activeAcademicYearId === '2026-2027' ? 'AY_2026_27' : (activeAcademicYearId || 'AY_2026_27');

      // 1. Fetch active students for this school strictly
      const studentQ = query(
        collection(db, "students"),
        where("schoolId", "==", selectedSchool)
      );

      // 2. Fetch existing permanent fee charges, payments, and adjustments
      const chargeQ = query(
        collection(db, 'fee_charges'),
        where('schoolId', '==', selectedSchool),
        where('academicYearId', '==', canonicalYearId)
      );

      let exportInvoiceQuery = collection(db, 'invoices');
      if (selectedSchool && selectedSchool !== 'ALL') {
        exportInvoiceQuery = query(exportInvoiceQuery, where('schoolId', '==', selectedSchool));
      }

      const [studentSnap, paymentSnap, invoiceSnap, adjustmentSnap, chargesSnap] = await Promise.all([
        getDocs(studentQ),
        getDocs(query(collection(db, 'student_ledger'), where('type', '==', 'credit'))),
        getDocs(exportInvoiceQuery),
        getDocs(query(collection(db, 'fee_adjustments'), where('status', '==', 'approved'))),
        getDocs(chargeQ)
      ]);

      const deletedReceiptNums = new Set();
      invoiceSnap.forEach(d => {
        const data = d.data();
        const recNum = data.receiptId || data.receiptNo || data.receiptNumber;
        if (data.deleted || data.isDeleted || data.status === 'deleted') {
          if (recNum) deletedReceiptNums.add(recNum);
        }
      });
      paymentSnap.forEach(d => {
        const data = d.data();
        const recNum = data.receiptNumber || data.receiptId;
        if (data.deleted || data.isDeleted || data.status === 'deleted') {
          if (recNum) deletedReceiptNums.add(recNum);
        }
      });

      const paymentsByStudent = {};
      const seenReceiptKeys = new Set();

      invoiceSnap.forEach(d => {
        const data = d.data();
        const recNum = data.receiptId || data.receiptNo || data.receiptNumber;
        if (!data.deleted && !data.isDeleted && data.status !== 'deleted' && (!recNum || !deletedReceiptNums.has(recNum))) {
          if (data.studentId) {
            (paymentsByStudent[data.studentId] ||= []).push({ id: d.id, ...data });
            if (recNum) seenReceiptKeys.add(`${data.studentId}_${recNum}`);
          }
        }
      });

      paymentSnap.forEach(d => {
        const data = d.data();
        const recNum = data.receiptNumber || data.receiptId;
        if (!data.deleted && !data.isDeleted && data.status !== 'deleted' && (!recNum || !deletedReceiptNums.has(recNum))) {
          if (data.studentId) {
            const key = recNum ? `${data.studentId}_${recNum}` : null;
            if (!key || !seenReceiptKeys.has(key)) {
              (paymentsByStudent[data.studentId] ||= []).push({ id: d.id, ...data });
              if (key) seenReceiptKeys.add(key);
            }
          }
        }
      });

      const adjustmentsByStudent = {};
      adjustmentSnap.forEach(d => {
        const a = d.data();
        if (!a.deleted && !a.isDeleted && a.status === 'approved') {
          (adjustmentsByStudent[a.studentId] ||= []).push(a);
        }
      });

      const chargesByStudent = {};
      chargesSnap.forEach(d => {
        const c = d.data();
        if (!c.deleted && !c.isDeleted && c.status !== 'deleted') {
          (chargesByStudent[c.studentId] ||= []).push({ id: d.id, ...c });
        }
      });

      const allActiveStudents = [];
      studentSnap.forEach(docSnap => {
        const data = docSnap.data();
        if (data.status !== 'Deleted' && data.status !== 'archived' && !data.isDeleted) {
          const studentClass = data.class;
          let rawSettings = classSettings[studentClass];
          if (!rawSettings || !rawSettings.components || rawSettings.components.length === 0) {
            rawSettings = {
              components: getSchoolDefaultFeeComponents(selectedSchool, studentClass, canonicalYearId)
            };
          }
          const sSettings = normalizeClassFeeSettings(rawSettings);
          const feeRes = calculateStudentDue({
            student: { id: docSnap.id, ...data },
            charges: chargesByStudent[docSnap.id],
            classSettings: sSettings,
            payments: paymentsByStudent[docSnap.id] || [],
            adjustments: adjustmentsByStudent[docSnap.id] || []
          });
          const liveDue = feeRes?.totalDue || 0;
          allActiveStudents.push({
            id: docSnap.id,
            name: data.name || '',
            fatherName: data.fatherName || data.parentName || '',
            roll: data.roll || '',
            class: data.class || '',
            section: data.section || '',
            contact: data.contact || data.parentContact || '',
            admissionType: (data.isNewAdmission || data.admissionType === 'new') ? 'New' : 'Old',
            attendance: data.attendance || '100%',
            liveDue: Number(liveDue || 0)
          });
        }
      });

      if (allActiveStudents.length === 0) {
        alert("No active students found to export.");
        return;
      }

      // Sort by class, then roll, then name
      allActiveStudents.sort((a, b) => {
        if (a.class !== b.class) return (a.class || '').localeCompare(b.class || '');
        const rA = parseInt(a.roll, 10);
        const rB = parseInt(b.roll, 10);
        if (!isNaN(rA) && !isNaN(rB)) return rA - rB;
        return (a.roll || '').localeCompare(b.roll || '');
      });

      const schoolName = SCHOOLS.find(s => s.id === selectedSchool)?.name || selectedSchool;
      const wb = XLSX.utils.book_new();

      // Tab 1: All Students Summary
      const summaryRows = allActiveStudents.map((s, idx) => {
        const parentVal = s.fatherName || s.parentName || s.father || s.father_name || '';
        return {
          'S.No.': idx + 1,
          'Roll No.': s.roll || '',
          'Student Name': s.name || '',
          "Father's Name": parentVal,
          "Parent's Name": parentVal,
          'Class': s.class || '',
          'Section': s.section || '',
          'Contact': s.contact || s.parentContact || '',
          'Admission Type': s.admissionType || 'Old',
          'Attendance': s.attendance || '100%',
          'Live Due (₹)': s.liveDue
        };
      });
      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(wb, wsSummary, "All Students Summary");

      // Tab 2..N: One sheet for each class
      const classMap = {};
      allActiveStudents.forEach(s => {
        const c = s.class || 'Unassigned';
        (classMap[c] ||= []).push(s);
      });

      const orderedClasses = [...new Set([...(classes || []), ...Object.keys(classMap)])];
      orderedClasses.forEach(cls => {
        const list = classMap[cls];
        if (list && list.length > 0) {
          const classRows = list.map((s, idx) => {
            const parentVal = s.fatherName || s.parentName || s.father || s.father_name || '';
            return {
              'S.No.': idx + 1,
              'Roll No.': s.roll || '',
              'Student Name': s.name || '',
              "Father's Name": parentVal,
              "Parent's Name": parentVal,
              'Class': s.class || '',
              'Section': s.section || '',
              'Contact': s.contact || s.parentContact || '',
              'Admission Type': s.admissionType || 'Old',
              'Attendance': s.attendance || '100%',
              'Live Due (₹)': s.liveDue
            };
          });
          const wsClass = XLSX.utils.json_to_sheet(classRows);
          const safeName = cls.slice(0, 31).replace(/[\\/?*[\]]/g, '');
          XLSX.utils.book_append_sheet(wb, wsClass, safeName);
        }
      });

      XLSX.writeFile(wb, `Students_${schoolName}_All_Classes_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error("Error exporting all students:", err);
      alert("Failed to export students: " + (err.message || err));
    } finally {
      setIsExportingAll(false);
    }
  };

  return (
    <>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          {selectedClass || isAddingStudent || viewMode === 'recycleBin' ? (
            <button className="btn-secondary" onClick={handleBack} style={{ marginBottom: 16 }}>
              <ArrowLeft size={16} /> Back
            </button>
          ) : null}
          <h1 className="page-title">
            {isAddingStudent
              ? 'Add New Student'
              : viewMode === 'recycleBin'
                ? 'Deleted Students / Recycle Bin'
                : !selectedClass
                  ? 'Classes Directory'
                  : `${selectedClass} - Students`}
          </h1>
          <p className="page-subtitle">
            {isAddingStudent
              ? `Register a new student for ${selectedClass}`
              : viewMode === 'recycleBin'
                ? 'Review soft-deleted students, restore to active rosters, or permanently delete (Admin/Owner only)'
                : !selectedClass
                  ? 'Select a class to view its students'
                  : 'Filter by section, click a student to view details, or delete'}
          </p>
        </div>

        <div className="header-actions-responsive" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {!isAddingStudent && (
            <div style={{ display: 'inline-flex', backgroundColor: 'var(--bg-secondary)', borderRadius: 10, padding: 4, border: '1px solid var(--border-light)' }}>
              <button
                onClick={() => { setViewMode('active'); setSelectedClass(null); }}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: 'none',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  backgroundColor: viewMode === 'active' ? 'var(--bg-card)' : 'transparent',
                  color: viewMode === 'active' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  boxShadow: viewMode === 'active' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none'
                }}
              >
                Active Students
              </button>
              <button
                onClick={() => { setViewMode('recycleBin'); setSelectedClass(null); }}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: 'none',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.2s ease',
                  backgroundColor: viewMode === 'recycleBin' ? 'var(--bg-card)' : 'transparent',
                  color: viewMode === 'recycleBin' ? 'var(--danger)' : 'var(--text-secondary)',
                  boxShadow: viewMode === 'recycleBin' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none'
                }}
              >
                <Trash2 size={14} /> Recycle Bin / Deleted
              </button>
            </div>
          )}

          {!selectedClass && !isAddingStudent && viewMode === 'active' && selectedSchool !== 'ALL' && (
            <button
              className="btn-secondary"
              onClick={handleExportAllClassesStudents}
              disabled={isExportingAll}
              title="Download full classwise Excel workbook with separate tabs for every class"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, padding: '8px 16px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}
            >
              <Download size={16} /> {isExportingAll ? 'Generating Excel...' : 'Export All Classes (Excel)'}
            </button>
          )}

          {viewMode === 'active' && selectedClass && !isAddingStudent && hasStudentEditPermission(selectedClass, selectedSection) && (
            <button className="btn-info" onClick={() => setIsAddingStudent(true)}>
              <Plus size={18} /> Add Student
            </button>
          )}
        </div>
      </div>

      {selectedSchool === 'ALL' && !isAddingStudent && viewMode === 'active' && !selectedClass && (
        <div style={{ padding: '16px 20px', backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', borderRadius: 12, marginBottom: 24, border: '1px solid rgba(245, 158, 11, 0.3)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <AlertCircle size={24} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>Consolidated View Active</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>You are viewing data across all campuses. To add new students or perform operational tasks, please select a specific campus from the top navigation menu.</div>
          </div>
        </div>
      )}

      {isAddingStudent && (
        <div className="glass-card">
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>Student Registration Details</h2>
          <div className="grid-responsive">
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Aarav Patel"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  style={{ paddingRight: 40, width: '100%', borderColor: isListening ? 'var(--danger)' : undefined }}
                />
                <button
                  className={`icon-btn ${isListening ? 'mic-listening' : ''}`}
                  onClick={toggleVoiceTyping}
                  style={{ position: 'absolute', right: 8, color: isListening ? 'var(--danger)' : 'var(--text-secondary)', transition: 'all 0.3s ease' }}
                  title="Use Voice Typing"
                >
                  <Mic size={18} />
                </button>
              </div>
              {isListening && <span style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4, display: 'block', fontWeight: 600 }}>Listening... Speak now</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Father's Name / पिता का नाम</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Ramesh Patel"
                value={fatherName}
                onChange={(e) => setFatherName(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Roll Number</label>
              <input type="text" className="form-input" placeholder="e.g. 42" value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Parent Contact</label>
              <input type="text" className="form-input" placeholder="+91..." value={parentContact} onChange={(e) => setParentContact(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Section</label>
              <select className="form-input" value={addSection} onChange={(e) => setAddSection(e.target.value)}>
                {sections && sections.length > 0 ? sections.map(sec => <option key={sec} value={sec}>{sec}</option>) : <option>No Sections Available</option>}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Address / पता (Optional)</label>
              <input type="text" className="form-input" value={address} onChange={e => setAddress(e.target.value)} placeholder="Full Address" />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1', marginTop: 8, padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-light)' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 0 }}>
                <input type="checkbox" checked={isTransportApplied} onChange={e => setIsTransportApplied(e.target.checked)} style={{ width: 18, height: 18 }} />
                <span style={{ fontWeight: 600 }}>Transport Fee Applied / परिवहन शुल्क लागू है</span>
              </label>
              {isTransportApplied && (
                <div style={{ marginTop: 12 }}>
                  <label className="form-label">Transport Route / Village</label>
                  <select className="form-input" value={transportRouteId} onChange={e => setTransportRouteId(e.target.value)}>
                    <option value="">-- Select Route --</option>
                    {getTransportRoutes(selectedSchool !== 'ALL' ? selectedSchool : 'SCH_01').map(r => (
                      <option key={r.id} value={r.id}>{r.name} (₹{r.annual}/yr)</option>
                    ))}
                  </select>
                  {transportRouteId && (
                    <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                      {(() => {
                        const route = getTransportRoutes(selectedSchool !== 'ALL' ? selectedSchool : 'SCH_01').find(r => r.id === transportRouteId);
                        return route ? `Annual: ₹${route.annual} | 1st: ₹${route.inst1} | 2nd: ₹${route.inst2} | 3rd: ₹${route.inst3}` : '';
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1', marginTop: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={isNewAdmission}
                  onChange={(e) => setIsNewAdmission(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <span>☐ New Admission / नया प्रवेश</span>
              </label>
            </div>
          </div>

          <div className="header-actions-responsive" style={{ marginTop: 24, justifyContent: 'flex-end', display: 'flex', gap: 12 }}>
            <button className="btn-secondary" onClick={() => setIsAddingStudent(false)}>Cancel</button>
            <button id="save-next-btn" className="btn-secondary" onClick={() => handleSaveStudent(true)} style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}>Save & Add Next</button>
            <button className="btn-primary" onClick={() => handleSaveStudent(false)}>Save & Close</button>
          </div>
        </div>
      )}

      {!isAddingStudent && viewMode === 'active' && !selectedClass && (
        <div className="grid-responsive">
          {classes && classes.map(cls => (
            <div
              key={cls}
              className="glass-card"
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 20 }}
              onClick={() => setSelectedClass(cls)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <FolderOpen size={24} color="var(--accent-primary)" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>{cls}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                    Manage Enrollments
                  </div>
                </div>
              </div>
              <ChevronRight size={20} color="var(--text-secondary)" />
            </div>
          ))}
        </div>
      )}

      {!isAddingStudent && viewMode === 'active' && selectedClass && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Filter by Section:</span>
              <select 
                className="form-input" 
                style={{ width: 150, padding: '8px 12px' }} 
                value={selectedSection} 
                onChange={(e) => setSelectedSection(e.target.value)}
              >
                <option value="All">All Sections</option>
                {sections && sections.map(sec => (
                  <option key={sec} value={sec}>{sec}</option>
                ))}
              </select>
            </div>

            {filteredStudents.length > 0 && (
              <button
                type="button"
                className="btn-secondary"
                onClick={handleExportClassStudents}
                title={`Export ${selectedClass} students roster to Excel`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, padding: '8px 14px' }}
              >
                <Download size={16} /> Export {selectedClass} to Excel
              </button>
            )}
          </div>

          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading students...</div>
          ) : filteredStudents.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
              {searchQuery.trim() ? `No students match "${searchQuery}"` : `No students found in ${selectedSection === 'All' ? 'this class' : selectedSection}.`}
            </div>
          ) : (
            <div className="grid-responsive">
              {filteredStudents.map((student) => (
                <div
                  key={student.id}
                  className="glass-card flex-responsive"
                  onClick={() => {
                    if (onSelectStudent) onSelectStudent(student);
                    onNavigate('ledger');
                  }}
                  style={{ cursor: 'pointer', padding: 20 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: 'var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 'bold', color: 'var(--text-secondary)' }}>
                      {student.name.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>{student.name}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span>Roll: {student.roll}</span>
                        <span>Sec: {student.section}</span>
                        <span>{student.fatherName || student.parentName ? `Father: ${student.fatherName || student.parentName}` : 'No Father Name'}</span>
                        {student.contact && <span>📞 {student.contact}</span>}
                        <span className="badge" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--success)', padding: '2px 8px' }}>{student.attendance || '100%'}</span>
                        <span className="badge" style={{ backgroundColor: student.liveDue > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', color: student.liveDue > 0 ? 'var(--danger)' : 'var(--success)', padding: '2px 8px' }}>
                          Dues: ₹{student.liveDue || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    {hasStudentEditPermission(student.class, student.section) && (
                      <>
                        <button
                          type="button"
                          className="btn-secondary"
                          title="Edit Student Information / विवरण संपादित करें"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '8px 14px',
                            fontSize: 13,
                            fontWeight: 700,
                            color: 'var(--brand-orange)',
                            borderColor: 'rgba(249, 115, 22, 0.4)',
                            backgroundColor: 'rgba(249, 115, 22, 0.08)',
                            borderRadius: 8,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEdit(student, e);
                          }}
                        >
                          <Edit2 size={15} />
                          <span>Edit</span>
                        </button>

                        {isUserAdminOrOwner(currentUser) && (
                          <button
                            type="button"
                            className="btn-secondary"
                            title="Delete Student (Move to Recycle Bin) / छात्र हटाएं"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '8px 14px',
                              fontSize: 13,
                              fontWeight: 700,
                              color: 'var(--danger)',
                              borderColor: 'rgba(239, 68, 68, 0.4)',
                              backgroundColor: 'rgba(239, 68, 68, 0.08)',
                              borderRadius: 8,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSoftDeleteStudent(student.id, student.name, student.schoolId);
                            }}
                          >
                            <Trash2 size={15} />
                            <span>Delete</span>
                          </button>
                        )}
                      </>
                    )}
                    <div style={{ padding: 4, display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
                      <ChevronRight size={20} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recycle Bin / Deleted Students View */}
      {!isAddingStudent && viewMode === 'recycleBin' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Informational / Safety banner */}
          <div style={{
            padding: '16px 20px',
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <ShieldAlert size={24} color="var(--danger)" />
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)' }}>
                  Recycle Bin / Archived Students
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Soft-deleted students are hidden from active rosters, fee schedules, and attendance. All historical invoices, payment vouchers, and marks remain safely preserved.
                </div>
              </div>
            </div>
            <button
              className="btn-secondary"
              onClick={fetchDeletedStudents}
              disabled={isDeletedLoading}
              style={{ fontSize: 13, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={14} className={isDeletedLoading ? 'spin' : ''} /> Refresh
            </button>
          </div>

          {/* Search & Filter Bar */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 240px', minWidth: 200 }}>
              <input
                type="text"
                className="form-input"
                placeholder="Search deleted students by name, roll, or ID..."
                value={deletedSearchQuery}
                onChange={(e) => setDeletedSearchQuery(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ width: 180 }}>
              <select
                className="form-input"
                value={deletedClassFilter}
                onChange={(e) => setDeletedClassFilter(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="All">All Classes</option>
                {classes && classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Table / List */}
          {isDeletedLoading ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>
              Loading deleted students...
            </div>
          ) : filteredDeletedStudents.length === 0 ? (
            <div className="glass-card" style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>
              <Archive size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
              <div style={{ fontWeight: 700, fontSize: 16 }}>No Deleted Students Found</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                {deletedSearchQuery ? `No deleted students match "${deletedSearchQuery}".` : 'The recycle bin is currently empty.'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredDeletedStudents.map((st) => {
                const schoolObj = SCHOOLS.find(s => s.id === st.schoolId);
                const schoolLabel = schoolObj ? `${schoolObj.code} (${schoolObj.name})` : (st.schoolId || 'Unknown');
                const canPermanentDelete = isUserAdminOrOwner(currentUser);
                return (
                  <div
                    key={st.id}
                    className="glass-card flex-responsive"
                    style={{
                      padding: 18,
                      borderRadius: 14,
                      border: '1px solid var(--border-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 16
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{
                        width: 46,
                        height: 46,
                        borderRadius: '50%',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        color: 'var(--danger)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 18,
                        fontWeight: 'bold'
                      }}>
                        {st.name?.charAt(0) || '?'}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-primary)' }}>{st.name}</span>
                          <span className="badge" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', fontSize: 11, fontWeight: 700 }}>
                            DELETED
                          </span>
                          <span className="badge" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: 11 }}>
                            {schoolLabel}
                          </span>
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span>ID: <code style={{ fontWeight: 700 }}>{st.id}</code></span>
                          <span>Class: <strong>{st.class || 'N/A'}</strong> {st.section ? `(${st.section})` : ''}</span>
                          {st.roll && <span>Roll: {st.roll}</span>}
                          {(st.fatherName || st.parentName) && <span>Father: {st.fatherName || st.parentName}</span>}
                          <span>Deleted: {st.deletedAt ? new Date(st.deletedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown date'}</span>
                          {st.deletedBy && <span>By: <strong>{st.deletedBy}</strong></span>}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <button
                        className="btn-secondary"
                        onClick={() => handleRestoreStudent(st)}
                        title="Restore student to active class roster"
                        style={{
                          borderColor: '#10b981',
                          color: '#10b981',
                          fontWeight: 700,
                          fontSize: 13,
                          padding: '8px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <RotateCcw size={15} /> Restore
                      </button>

                      <button
                        className="btn-secondary"
                        onClick={() => handlePermanentDelete(st)}
                        disabled={!canPermanentDelete}
                        title={canPermanentDelete ? "Permanently delete this student from database" : "Only Administrator or Owner can permanently delete"}
                        style={{
                          borderColor: canPermanentDelete ? 'rgba(239, 68, 68, 0.5)' : 'var(--border-light)',
                          color: canPermanentDelete ? 'var(--danger)' : 'var(--text-secondary)',
                          opacity: canPermanentDelete ? 1 : 0.5,
                          cursor: canPermanentDelete ? 'pointer' : 'not-allowed',
                          fontWeight: 700,
                          fontSize: 13,
                          padding: '8px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <Trash2 size={15} /> Permanent Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Edit Student Info Modal */}
      {editingStudent && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setEditingStudent(null); }}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            overflowY: 'auto'
          }}
        >
          <div
            className="glass-card"
            style={{
              width: '100%',
              maxWidth: 540,
              maxHeight: 'min(90vh, 740px)',
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              position: 'relative',
              borderRadius: 16,
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
              overflow: 'hidden',
              backgroundColor: 'var(--bg-card)'
            }}
          >
            {/* Header - Sticky */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid var(--border-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--bg-secondary)',
              flexShrink: 0
            }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Edit2 size={20} color="var(--brand-orange)" /> Edit Student Record
              </h3>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  padding: 6,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSaveStudentEdit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div style={{ padding: '24px', overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' }}>
                <div className="grid-responsive">
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 700 }}>Full Name</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 700 }}>Father's Name</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editFatherName}
                      onChange={(e) => setEditFatherName(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 700 }}>Roll Number</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editRoll}
                      onChange={(e) => setEditRoll(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 700 }}>Class</label>
                    <select
                      className="form-input"
                      value={editClass}
                      onChange={(e) => setEditClass(e.target.value)}
                    >
                      {classes.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 700 }}>Section</label>
                    <select
                      className="form-input"
                      value={editSection}
                      onChange={(e) => setEditSection(e.target.value)}
                    >
                      {sections.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label" style={{ fontWeight: 700 }}>Parent Mobile Contact</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editContact}
                      onChange={(e) => setEditContact(e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label" style={{ fontWeight: 700 }}>Address / पता (Optional)</label>
                    <input type="text" className="form-input" value={editAddress} onChange={e => setEditAddress(e.target.value)} placeholder="Full Address" />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1', marginTop: 8, padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-light)' }}>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 0 }}>
                      <input type="checkbox" checked={editIsTransportApplied} onChange={e => setEditIsTransportApplied(e.target.checked)} style={{ width: 18, height: 18 }} />
                      <span style={{ fontWeight: 600 }}>Transport Fee Applied / परिवहन शुल्क लागू है</span>
                    </label>
                    {editIsTransportApplied && (
                      <div style={{ marginTop: 12 }}>
                        <label className="form-label">Transport Route / Village</label>
                        <select className="form-input" value={editTransportRouteId} onChange={e => setEditTransportRouteId(e.target.value)}>
                          <option value="">-- Select Route --</option>
                          {getTransportRoutes(editingStudent?.schoolId || selectedSchool || 'SCH_01').map(r => (
                            <option key={r.id} value={r.id}>{r.name} (₹{r.annual}/yr)</option>
                          ))}
                        </select>
                        {editTransportRouteId && (
                          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                            {(() => {
                              const route = getTransportRoutes(editingStudent?.schoolId || selectedSchool || 'SCH_01').find(r => r.id === editTransportRouteId);
                              return route ? `Annual: ₹${route.annual} | 1st: ₹${route.inst1} | 2nd: ₹${route.inst2} | 3rd: ₹${route.inst3}` : '';
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: 14,
                      padding: '12px 16px',
                      borderRadius: 10,
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-light)'
                    }}>
                      <input
                        type="checkbox"
                        checked={editIsNewAdmission}
                        onChange={(e) => setEditIsNewAdmission(e.target.checked)}
                        style={{ width: 18, height: 18, cursor: 'pointer' }}
                      />
                      <span>New Admission / नया प्रवेश (Applies Admission Fee)</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Sticky Footer with Action Buttons */}
              <div style={{
                padding: '16px 24px',
                borderTop: '1px solid var(--border-light)',
                display: 'flex',
                gap: 12,
                justifyContent: 'flex-end',
                background: 'var(--bg-secondary)',
                flexShrink: 0
              }}>
                <button className="btn-secondary" type="button" onClick={() => setEditingStudent(null)}>Cancel</button>
                <button className="btn-primary" type="submit">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// Senior Product Designer SaaS Redesign of Student Dashboard Profile
export function StudentLedger({ onNavigate, lang = 'en', activeStudent, userPermissions, currentUser, selectedSchool, activeAcademicYearId, classSettings = {} }) {
  const isOwnerUser = (user) => {
    if (!user) return false;
    if (user.email === 'jeevanshilporg@gmail.com') return true;
    const r = (user.role || '').toLowerCase();
    return r === 'owner' || r === 'director';
  };
  const dict = t[lang] || t.en;
  const [isEditingName, setIsEditingName] = useState(false);
  const [studentName, setStudentName] = useState(activeStudent?.name || 'Anjali Sharma');
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isReportCardModalOpen, setIsReportCardModalOpen] = useState(false);
  const [activeProfileTab, setActiveProfileTab] = useState('overview'); // 'overview' | 'tuition' | 'transport'
  const [tuitionDueAmount, setTuitionDueAmount] = useState(0);
  const [tuitionPaidAmount, setTuitionPaidAmount] = useState(0);
  const [transportDueAmount, setTransportDueAmount] = useState(0);
  const [transportPaidAmount, setTransportPaidAmount] = useState(0);
  const [transportAnnualFee, setTransportAnnualFee] = useState(0);

  // ── Real data state ──────────────────────────────────────────────
  const [attendanceStats, setAttendanceStats] = useState({ present: 0, absent: 0, late: 0, total: 0, percent: 0 });
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [marksData, setMarksData] = useState([]); // array of { subject, marks, total, grade }
  const [marksAvg, setMarksAvg] = useState(0);
  const [topSubject, setTopSubject] = useState(null);
  const [weakSubject, setWeakSubject] = useState(null);
  const [totalPaid, setTotalPaid] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [annualFee, setAnnualFee] = useState(0);
  const [annualTuitionFee, setAnnualTuitionFee] = useState(0);
  const [liveDue, setLiveDue] = useState(activeStudent?.liveDue ?? activeStudent?.openingArrears ?? activeStudent?.dueAmount ?? 0);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const [calendarDays, setCalendarDays] = useState([]);
  const [selectedExamView, setSelectedExamView] = useState('Quarterly');
  const examOptions = ['Quarterly', 'Half Yearly', 'Final Exam'];
  const [financialsRefreshTrigger, setFinancialsRefreshTrigger] = useState(0);

  useEffect(() => {
    const handleReceiptChange = () => {
      setFinancialsRefreshTrigger(c => c + 1);
    };
    window.addEventListener('receipt_deleted_or_restored', handleReceiptChange);
    window.addEventListener('refresh_financials', handleReceiptChange);
    return () => {
      window.removeEventListener('receipt_deleted_or_restored', handleReceiptChange);
      window.removeEventListener('refresh_financials', handleReceiptChange);
    };
  }, []);

  
  const handleDeleteReceipt = async (inv) => {
    if (!inv) return;
    const recNum = inv.receiptId || inv.receiptNo || inv.receiptNumber || inv.id || '';
    const confirmMsg = `Are you sure you want to move receipt "${recNum}" to the Recycle Bin?\nThis will remove it from the student's transaction history and restore their pending due balance.\n\nक्या आप वाकई रसीद "${recNum}" को रीसायकल बिन में भेजना चाहते हैं?\nयह छात्र के लेन-देन इतिहास से हट जाएगी और उनकी बकाया राशि पुनः जुड़ जाएगी।`;

    if (!window.confirm(confirmMsg)) return;

    try {
      if (inv.id && !inv.id.startsWith('WAIVER')) {
        try {
          await updateDoc(doc(db, 'invoices', inv.id), {
            deleted: true,
            status: 'deleted',
            deletedAt: serverTimestamp(),
            deletedBy: currentUser?.email || currentUser?.uid || 'Admin'
          });
        } catch (e) {
          console.warn('Could not update invoices doc directly:', e);
        }
      }

      if (recNum) {
        try {
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
        } catch (ledgerErr) {
          console.warn('Could not sync delete to student_ledger:', ledgerErr);
        }

        try {
          const invByIdQ = query(collection(db, 'invoices'), where('receiptId', '==', recNum));
          const invByIdSnap = await getDocs(invByIdQ);
          const invPromises = invByIdSnap.docs.map(d =>
            updateDoc(doc(db, 'invoices', d.id), {
              deleted: true,
              status: 'deleted',
              deletedAt: serverTimestamp(),
              deletedBy: currentUser?.email || currentUser?.uid || 'Admin'
            })
          );
          await Promise.all(invPromises);
        } catch (e) {}
      }

      window.dispatchEvent(new CustomEvent('receipt_deleted_or_restored', {
        detail: { receiptNumber: recNum, studentId: activeStudent?.id }
      }));

      setFinancialsRefreshTrigger(prev => prev + 1);

      alert(`Receipt "${recNum}" moved to Recycle Bin.\nरसीद "${recNum}" को रीसायकल बिन में स्थानांतरित कर दिया गया है।`);
    } catch (err) {
      console.error(err);
      alert('Error deleting receipt: ' + err.message);
    }
  };

  const handleProfileDelete = async () => {
    if (!activeStudent?.id) return;
    const confirmMsg = `Are you sure you want to move student "${studentName}" to Deleted Students (Recycle Bin)?\nThis will safely remove them from active student lists and fee rosters while preserving all historical payment receipts and attendance records.\n\nक्या आप वाकई छात्र "${studentName}" को हटाए गए छात्रों (रीसायकल बिन) में भेजना चाहते हैं?\nयह उन्हें सक्रिय छात्र सूची से हटा देगा, जबकि उनके पिछले सभी रिकॉर्ड सुरक्षित रहेंगे।`;
    if (window.confirm(confirmMsg)) {
      try {
        await updateDoc(doc(db, "students", activeStudent.id), {
          status: 'Deleted',
          isDeleted: true,
          deletedAt: new Date().toISOString(),
          deletedBy: currentUser?.name || currentUser?.email || currentUser?.role || 'Admin'
        });

        try {
          const { logAuditAction } = await import('../../utils/auditLogger');
          await logAuditAction({
            action: 'STUDENT_SOFT_DELETED',
            performedBy: currentUser?.name || currentUser?.email || currentUser?.uid || 'Admin',
            schoolId: activeStudent?.schoolId || selectedSchool,
            details: { studentId: activeStudent.id, studentName, class: activeStudent.class, fromProfile: true }
          });
        } catch (e) {
          console.error("Audit log failed:", e);
        }

        alert(`Student "${studentName}" moved to Deleted Students (Recycle Bin).`);
        onNavigate('students');
      } catch (err) {
        console.error("Error deleting student from profile:", err);
        alert("Failed to delete student: " + err.message);
      }
    }
  };

  useEffect(() => {
    if (activeStudent?.name) {
      setStudentName(activeStudent.name);
    }
  }, [activeStudent]);

  // ── Fetch attendance data ──────────────────────────────────────
  useEffect(() => {
    if (!activeStudent?.id) return;
    const fetchAttendance = async () => {
      try {
        const constraints = [where('studentId', '==', activeStudent.id)];
        if (activeStudent.schoolId) constraints.push(where('schoolId', '==', activeStudent.schoolId));
        const q = query(collection(db, 'attendance_logs'), ...constraints);
        const snap = await getDocs(q);
        const logs = [];
        let present = 0, absent = 0, late = 0;
        snap.forEach(d => {
          const data = d.data();
          logs.push({ id: d.id, ...data });
          const s = (data.status || '').toLowerCase();
          if (s === 'present') present++;
          else if (s === 'absent') absent++;
          else if (s === 'late' || s === 'half day') late++;
          else present++; // default to present
        });
        const total = present + absent + late;
        setAttendanceStats({ present, absent, late, total, percent: total > 0 ? Math.round((present / total) * 100) : 0 });
        setAttendanceLogs(logs);
      } catch (err) {
        console.error('Error fetching attendance:', err);
      }
    };
    fetchAttendance();
  }, [activeStudent?.id, activeStudent?.schoolId]);

  // ── Fetch exam marks ───────────────────────────────────────────
  useEffect(() => {
    if (!activeStudent?.id) return;
    const fetchMarks = async () => {
      try {
        const constraints = [where('studentId', '==', activeStudent.id)];
        if (activeStudent.schoolId) constraints.push(where('schoolId', '==', activeStudent.schoolId));
        const q = query(collection(db, 'exam_marks'), ...constraints);
        const snap = await getDocs(q);
        const all = [];
        snap.forEach(d => all.push({ id: d.id, ...d.data() }));
        setMarksData(all);

        // Compute stats from most recent exam marks
        if (all.length > 0) {
          const latestExam = all.filter(m => m.exam === selectedExamView);
          const pool = latestExam.length > 0 ? latestExam : all;
          const totalMarks = pool.reduce((sum, m) => sum + (Number(m.marks) || 0), 0);
          const totalMax = pool.reduce((sum, m) => sum + (Number(m.totalMarks) || Number(m.maxMarks) || 100), 0);
          const avg = totalMax > 0 ? Math.round((totalMarks / totalMax) * 100 * 10) / 10 : 0;
          setMarksAvg(avg);

          const subjectScores = pool.map(m => ({
            subject: m.subject,
            pct: (Number(m.totalMarks) || Number(m.maxMarks) || 100) > 0
              ? Math.round((Number(m.marks) || 0) / (Number(m.totalMarks) || Number(m.maxMarks) || 100) * 100)
              : 0,
            marks: Number(m.marks) || 0,
            total: Number(m.totalMarks) || Number(m.maxMarks) || 100
          }));
          if (subjectScores.length > 0) {
            const sorted = [...subjectScores].sort((a, b) => b.pct - a.pct);
            setTopSubject(sorted[0]);
            setWeakSubject(sorted[sorted.length - 1]);
          }
        } else {
          setMarksAvg(0);
          setTopSubject(null);
          setWeakSubject(null);
        }
      } catch (err) {
        console.error('Error fetching marks:', err);
      }
    };
    fetchMarks();
  }, [activeStudent?.id, activeStudent?.schoolId, selectedExamView]);

  // ── Fetch financial data (invoices / payments) ─────────────────
  useEffect(() => {
    if (!activeStudent?.id) return;

    const fetchFinancials = async () => {
      try {
        let invoiceQ = query(collection(db, 'invoices'), where('studentId', '==', activeStudent.id));
        if (activeStudent.schoolId) {
          invoiceQ = query(invoiceQ, where('schoolId', '==', activeStudent.schoolId));
        }

        let ledgerQ = query(collection(db, 'student_ledger'), where('studentId', '==', activeStudent.id), where('type', '==', 'credit'));
        if (activeStudent.schoolId) {
          ledgerQ = query(ledgerQ, where('schoolId', '==', activeStudent.schoolId));
        }

        const [snap, ledgerSnap] = await Promise.all([
          getDocs(invoiceQ),
          getDocs(ledgerQ)
        ]);

        // 1. Gather all deleted receipt numbers
        const deletedReceiptNums = new Set();
        snap.docs.forEach(d => {
          const dt = d.data();
          const recNum = dt.receiptId || dt.receiptNo || dt.receiptNumber;
          if (dt.deleted || dt.isDeleted || dt.status === 'deleted') {
            if (recNum) deletedReceiptNums.add(recNum);
          }
        });
        ledgerSnap.docs.forEach(d => {
          const dt = d.data();
          const recNum = dt.receiptNumber || dt.receiptId;
          if (dt.deleted || dt.isDeleted || dt.status === 'deleted') {
            if (recNum) deletedReceiptNums.add(recNum);
          }
        });

        // 2. Gather non-deleted invoices and non-deleted ledger credits
        const activeInvoices = [];
        const seenReceiptKeys = new Set();

        snap.docs.forEach(d => {
          const dt = d.data();
          const recNum = dt.receiptId || dt.receiptNo || dt.receiptNumber;
          if (!dt.deleted && !dt.isDeleted && dt.status !== 'deleted' && (!recNum || !deletedReceiptNums.has(recNum))) {
            activeInvoices.push({
              id: d.id,
              ...dt,
              receiptNo: recNum || d.id.slice(0, 10),
              receiptId: recNum || d.id.slice(0, 10),
              amount: dt.amount,
              date: dt.date,
              status: dt.status || 'Paid',
              allocations: dt.allocations || []
            });
            if (recNum) seenReceiptKeys.add(recNum);
          }
        });

        ledgerSnap.docs.forEach(d => {
          const dt = d.data();
          const recNum = dt.receiptNumber || dt.receiptId;
          if (!dt.deleted && !dt.isDeleted && dt.status !== 'deleted' && (!recNum || !deletedReceiptNums.has(recNum))) {
            if (!recNum || !seenReceiptKeys.has(recNum)) {
              activeInvoices.push({
                id: d.id,
                ...dt,
                receiptNo: recNum || d.id.slice(0, 10),
                receiptId: recNum || d.id.slice(0, 10),
                amount: dt.amount,
                date: dt.date,
                status: 'Paid',
                allocations: dt.allocations || []
              });
              if (recNum) seenReceiptKeys.add(recNum);
            }
          }
        });

        let invoices = activeInvoices;

        // Fetch fee adjustments (waivers) to include in the ledger history
        let adjustmentQ = query(collection(db, 'fee_adjustments'), where('studentId', '==', activeStudent.id), where('status', '==', 'approved'));
        if (activeStudent.schoolId) {
          adjustmentQ = query(adjustmentQ, where('schoolId', '==', activeStudent.schoolId));
        }
        const [adjSnap, chargeSnap] = await Promise.all([
          getDocs(adjustmentQ),
          getDocs(query(collection(db, 'fee_charges'), where('studentId', '==', activeStudent.id)))
        ]);

        const rawAdjustments = adjSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => !a.deleted && !a.isDeleted && a.status === 'approved');
        const adjustments = rawAdjustments.map(data => ({
          id: data.id,
          date: data.createdAt || data.date,
          description: `Fee Waiver (${data.reason || 'Reason not recorded'})`,
          feeType: `Fee Waiver (${data.reason || 'Reason not recorded'})`,
          amount: data.amount,
          status: 'Approved',
          type: 'waiver',
          receiptNo: 'WAIVER-' + data.id.slice(0, 5),
          receiptId: 'WAIVER-' + data.id.slice(0, 5)
        }));

        const combinedHistory = [...invoices, ...adjustments];
        combinedHistory.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        let paid = 0;
        invoices.forEach(inv => {
          paid += Number(inv.amount) || 0;
        });
        setTotalPaid(paid);
        setPaymentHistory(combinedHistory);

        const dbCharges = chargeSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !c.deleted && !c.isDeleted && c.status !== 'deleted');

        if (dbCharges.length > 0) {
          const res = applyPaymentsAndAdjustments(dbCharges, invoices, rawAdjustments);
          const summary = summarizeDues(activeStudent, res.ledger, res.advanceCredit);

          setLiveDue(summary.totalDue);
          setTotalPaid(summary.totalPaid);
          setWalletBalance(summary.advanceCredit);

          const totalChargesAmount = dbCharges.reduce((sum, c) => sum + (Number(c.originalAmount) || 0), 0);
          const totalTuitionAmount = dbCharges.filter(c => c.componentId !== 'transport').reduce((sum, c) => sum + (Number(c.originalAmount) || 0), 0);
          const totalTransportAmount = dbCharges.filter(c => c.componentId === 'transport').reduce((sum, c) => sum + (Number(c.originalAmount) || 0), 0);

          let tDue = 0, tPaid = 0, trDue = 0, trPaid = 0;
          res.ledger.forEach(item => {
            if (item.componentId === 'transport') {
              trDue += (Number(item.due) || 0);
              trPaid += (Number(item.paid) || 0);
            } else {
              tDue += (Number(item.due) || 0);
              tPaid += (Number(item.paid) || 0);
            }
          });

          setTuitionDueAmount(tDue);
          setTuitionPaidAmount(tPaid);
          setTransportDueAmount(trDue);
          setTransportPaidAmount(trPaid);
          setTransportAnnualFee(totalTransportAmount);

          setAnnualFee(totalChargesAmount);
          setAnnualTuitionFee(totalTuitionAmount);
        } else {
          // Fallback if no permanent charges exist (e.g. JSIC students before permanent charges generation)
          const studentClass = activeStudent?.class;
          const studentSchool = activeStudent?.schoolId || selectedSchool;
          let rawClassSettings = classSettings[studentClass];
          if (!rawClassSettings || !rawClassSettings.components || rawClassSettings.components.length === 0) {
            rawClassSettings = {
              components: getSchoolDefaultFeeComponents(studentSchool, studentClass, activeAcademicYearId || '2026-2027')
            };
          }
          const sSettings = normalizeClassFeeSettings(rawClassSettings, activeAcademicYearId || '2026-2027');
          const summary = calculateStudentDue({
            student: activeStudent,
            charges: null,
            classSettings: sSettings,
            payments: invoices,
            adjustments: rawAdjustments
          });
          setLiveDue(summary.totalDue);
          setTotalPaid(summary.totalPaid);
          setWalletBalance(summary.advanceCredit);

          const totalChargesAmount = summary.ledger.reduce((sum, c) => sum + (Number(c.originalAmount) || 0), 0);
          const totalTuitionAmount = summary.ledger.filter(c => c.componentId === 'tuition').reduce((sum, c) => sum + (Number(c.originalAmount) || 0), 0);
          setAnnualFee(totalChargesAmount);
          setAnnualTuitionFee(totalTuitionAmount);
        }
      } catch (err) {
        console.error('Error fetching financials:', err);
      }
    };
    fetchFinancials();
  }, [activeStudent?.id, activeStudent?.schoolId, financialsRefreshTrigger]);

  // ── Calendar data for modal ────────────────────────────────────
  useEffect(() => {
    if (!isCalendarModalOpen || !activeStudent?.id) return;
    const [year, month] = calendarMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDay = new Date(year, month - 1, 1).getDay();
    const days = [];
    // Fill leading blanks
    for (let i = 0; i < firstDay; i++) days.push(null);
    // Fill actual days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const log = attendanceLogs.find(l => l.date === dateStr);
      days.push({ day: d, status: log ? log.status : null, date: dateStr });
    }
    setCalendarDays(days);
  }, [isCalendarModalOpen, calendarMonth, attendanceLogs, activeStudent?.id]);

  const parentName = activeStudent?.parentName || "N/A";
  const parentContact = activeStudent?.contact || "N/A";
  const studentId = activeStudent?.id || "N/A";
  const studentClass = activeStudent?.class || "N/A";
  const dueAmount = liveDue;

  const handleSaveName = () => {
    setIsEditingName(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 1120, margin: '0 auto', paddingBottom: 40 }}>
      {/* 1. Header Navigation & High-Contrast Student Title */}
      <div>
        <button
          className="btn-secondary"
          onClick={() => onNavigate('students')}
          style={{ marginBottom: 16, padding: '6px 12px', fontSize: 13, fontWeight: 600 }}
        >
          <ArrowLeft size={16} /> {lang === 'hi' ? 'निर्देशिका पर वापस जाएं' : 'Back to Directory'}
        </button>

        <div className="flex-responsive" style={{ alignItems: 'flex-start' }}>
          {/* Group 1: Student Avatar & 32px Typography */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              backgroundColor: 'var(--brand-orange)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 30,
              fontWeight: 900,
              boxShadow: '0 8px 20px rgba(191, 87, 0, 0.25)'
            }}>
              {studentName.charAt(0)}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {isEditingName ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="text"
                      className="form-input"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      style={{ fontSize: 26, fontWeight: 900, padding: '4px 10px', width: 260 }}
                      autoFocus
                    />
                    <button className="btn-primary" onClick={handleSaveName} style={{ padding: '6px 14px' }}>{dict.save}</button>
                  </div>
                ) : (
                  <h1 style={{ fontSize: 32, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.5px' }}>
                    {studentName}
                  </h1>
                )}
                {!isEditingName && (
                  <button className="icon-btn" onClick={() => setIsEditingName(true)} title="Edit Student Name">
                    <Edit2 size={18} color="var(--text-secondary)" />
                  </button>
                )}
              </div>

              {/* Metadata Badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                <span className="badge" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontWeight: 800, fontSize: 13 }}>
                  {studentClass}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
                  ID: <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>{studentId}</span>
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>•</span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {dict.parentName}: <strong>{parentName}</strong> ({parentContact})
                </span>
              </div>
            </div>
          </div>

          {/* Group 2: Right Side CTAs Hierarchy */}
          <div className="header-actions-responsive">
            {/* Primary Action Button */}
            <button
              className="btn-primary"
              onClick={() => onNavigate('finance')}
              style={{
                backgroundColor: '#10b981',
                borderColor: '#10b981',
                color: '#ffffff',
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 800,
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)'
              }}
            >
              <Plus size={18} /> {dict.recordPayment}
            </button>

            {/* Secondary Action Button */}
            <button
              className="btn-secondary"
              onClick={() => window.open(`https://wa.me/919876543210?text=Hello%20${encodeURIComponent(parentName)},%20this%20is%20a%20notification%20regarding%20${encodeURIComponent(studentName)}'s%20school%20fees.`, '_blank')}
              style={{ borderColor: '#25D366', color: '#25D366', fontWeight: 700, padding: '10px 16px', fontSize: 13 }}
            >
              <MessageCircle size={18} /> {dict.whatsApp}
            </button>

            {/* Tertiary Action Button */}
            <button
              className="btn-secondary"
              title="Export Profile PDF"
              onClick={() => generateStudentProfilePDF(
                { name: studentName, id: studentId, class: studentClass, contact: parentContact, parentName },
                { attendancePercent: attendanceStats.percent, marksAvg, paid: totalPaid, due: annualFee - totalPaid }
              )}
              style={{ padding: '10px', color: 'var(--text-secondary)' }}
            >
              <Download size={18} />
            </button>

            {/* Delete Student Action Button */}
            {isUserAdminOrOwner(currentUser) && (
              <button
                className="btn-secondary"
                title="Delete Student (Move to Recycle Bin)"
                onClick={handleProfileDelete}
                style={{
                  borderColor: 'rgba(239, 68, 68, 0.4)',
                  color: 'var(--danger)',
                  fontWeight: 700,
                  padding: '10px 14px',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Trash2 size={16} /> {lang === 'hi' ? 'छात्र हटाएं' : 'Delete Student'}
              </button>
            )}
          </div>
        </div>
      </div>

            {/* --- PROFILE TABS --- */}
      <div style={{ display: 'flex', gap: 16, borderBottom: '2px solid var(--border-light)', marginBottom: 24, marginTop: 16 }}>
        <button 
          style={{ padding: '12px 24px', background: 'none', border: 'none', borderBottom: activeProfileTab === 'overview' ? '2px solid var(--brand-primary)' : '2px solid transparent', color: activeProfileTab === 'overview' ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: activeProfileTab === 'overview' ? 700 : 500, cursor: 'pointer', fontSize: 14 }}
          onClick={() => setActiveProfileTab('overview')}
        >
          Overview
        </button>
        <button 
          style={{ padding: '12px 24px', background: 'none', border: 'none', borderBottom: activeProfileTab === 'tuition' ? '2px solid var(--brand-primary)' : '2px solid transparent', color: activeProfileTab === 'tuition' ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: activeProfileTab === 'tuition' ? 700 : 500, cursor: 'pointer', fontSize: 14 }}
          onClick={() => setActiveProfileTab('tuition')}
        >
          Class Fees & Payments
        </button>
        {activeStudent?.isTransportApplied && (
          <button 
            style={{ padding: '12px 24px', background: 'none', border: 'none', borderBottom: activeProfileTab === 'transport' ? '2px solid var(--brand-primary)' : '2px solid transparent', color: activeProfileTab === 'transport' ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: activeProfileTab === 'transport' ? 700 : 500, cursor: 'pointer', fontSize: 14 }}
            onClick={() => setActiveProfileTab('transport')}
          >
            Transport Fees
          </button>
        )}
      </div>

      {activeProfileTab === 'overview' && (
        <div className="grid-responsive">
          {/* Summarized Attendance Card */}
          <div className="glass-card" style={{ padding: 24, borderRadius: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div className="flex-responsive" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'var(--bg-secondary)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Calendar size={20} />
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                    Attendance Summary
                  </h3>
                </div>
                <span className="badge" style={{ backgroundColor: 'var(--bg-secondary)', color: attendanceStats.total > 0 ? 'var(--success)' : 'var(--text-secondary)', fontSize: 16, fontWeight: 900 }}>
                  {attendanceStats.total > 0 ? `${attendanceStats.percent}% Overall` : 'No Data'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center', margin: '20px 0' }}>
                <div style={{ backgroundColor: 'var(--bg-secondary)', padding: 12, borderRadius: 12 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--success)' }}>{attendanceStats.present}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginTop: 2 }}>Present</div>
                </div>
                <div style={{ backgroundColor: 'var(--bg-secondary)', padding: 12, borderRadius: 12 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--danger)' }}>{attendanceStats.absent}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginTop: 2 }}>Absent</div>
                </div>
                <div style={{ backgroundColor: 'var(--bg-secondary)', padding: 12, borderRadius: 12 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--warning)' }}>{attendanceStats.late}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginTop: 2 }}>Late</div>
                </div>
              </div>

              {attendanceStats.total > 0 ? (
                <div style={{ height: 8, width: '100%', backgroundColor: 'var(--border-light)', borderRadius: 4, overflow: 'hidden', marginBottom: 20, display: 'flex' }}>
                  <div style={{ width: `${Math.round((attendanceStats.present / attendanceStats.total) * 100)}%`, backgroundColor: '#10b981' }} title={`Present ${Math.round((attendanceStats.present / attendanceStats.total) * 100)}%`} />
                  <div style={{ width: `${Math.round((attendanceStats.late / attendanceStats.total) * 100)}%`, backgroundColor: '#f59e0b' }} title={`Late ${Math.round((attendanceStats.late / attendanceStats.total) * 100)}%`} />
                  <div style={{ width: `${Math.round((attendanceStats.absent / attendanceStats.total) * 100)}%`, backgroundColor: '#ef4444' }} title={`Absent ${Math.round((attendanceStats.absent / attendanceStats.total) * 100)}%`} />
                </div>
              ) : (
                <div style={{ height: 8, width: '100%', backgroundColor: 'var(--border-light)', borderRadius: 4, marginBottom: 20 }} />
              )}
            </div>
          </div>

          {/* Academic Performance Card */}
          <div className="glass-card" style={{ padding: 24, borderRadius: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div className="flex-responsive" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'var(--bg-secondary)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <BarChart2 size={20} />
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                    Academic Performance
                  </h3>
                </div>
                {marksData.length > 0 && (
                  <span className="badge" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--brand-primary)', fontSize: 16, fontWeight: 900 }}>
                    {marksAvg}% Avg
                  </span>
                )}
              </div>

              {marksData.length > 0 ? (
                <div style={{ marginTop: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                    <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: `conic-gradient(var(--brand-primary) ${marksAvg}%, var(--border-light) 0)` }}>
                      <div style={{ width: 100, height: 100, borderRadius: '50%', backgroundColor: 'var(--bg-card)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-primary)' }}>{marksAvg}%</span>
                        <span style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Average</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
                  <FileText size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
                  <p style={{ margin: 0, fontWeight: 600 }}>No exam marks recorded</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeProfileTab === 'tuition' && (
        <>
          {/* Tuition Hero Financial Summary */}
          {userPermissions?.viewInvoices !== false && (
            <div className="glass-card" style={{ padding: 24, borderRadius: 20, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)', boxShadow: '0 10px 30px rgba(0, 0, 0, 0.04)', marginBottom: 24 }}>
              <div className="flex-responsive" style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'var(--bg-secondary)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CreditCard size={20} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                      Class Fees & Payments
                    </h2>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Tuition and Other Fees</span>
                  </div>
                </div>

                <button
                  className="btn-primary"
                  onClick={() => onNavigate('finance')}
                  style={{ backgroundColor: '#10b981', borderColor: '#10b981', fontSize: 13, fontWeight: 700, padding: '8px 16px' }}
                >
                  <CreditCard size={16} /> {dict.recordPayment}
                </button>
              </div>

              <div className="grid-responsive">
                <div style={{ backgroundColor: 'var(--bg-secondary)', padding: 16, borderRadius: 14, border: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: 12, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 800, marginBottom: 4 }}>
                    Tuition Outstanding Due
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--danger)' }}>
                    ₹ {tuitionDueAmount ? Number(tuitionDueAmount).toLocaleString() : '0'}.00
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--bg-secondary)', padding: 16, borderRadius: 14, border: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: 12, color: 'var(--success)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 800, marginBottom: 4 }}>
                    Tuition Paid
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>
                    ₹ {tuitionPaidAmount > 0 ? tuitionPaidAmount.toLocaleString() : '0'}.00
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--bg-secondary)', padding: 16, borderRadius: 14, border: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: 12, color: 'var(--brand-orange)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 800, marginBottom: 4 }}>
                    {dict.walletBalance}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--brand-orange)' }}>
                    ₹ {walletBalance > 0 ? walletBalance.toLocaleString() : '0'}.00
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--bg-secondary)', padding: 16, borderRadius: 14, border: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 800, marginBottom: 4 }}>
                    Tuition Annual Total
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                    ₹ {annualTuitionFee > 0 ? annualTuitionFee.toLocaleString() : '0'}.00
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Payment History List (Tuition Focus) */}
          <div className="glass-card" style={{ padding: 24, borderRadius: 20, marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 16 }}>Class Payments History</h3>
            {paymentHistory.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)', borderRadius: 12 }}>
                No payments recorded yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {paymentHistory.map((inv, idx) => {
                  let tuitionsAllocated = 0;
                  if (inv.allocations && inv.allocations.length > 0) {
                    tuitionsAllocated = inv.allocations.filter(a => a.componentId !== 'transport').reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
                  } else {
                    tuitionsAllocated = inv.amount;
                  }
                  
                  if (tuitionsAllocated <= 0 && inv.type !== 'waiver') return null;

                  return (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border-light)' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{inv.receiptId || inv.receiptNo || 'Receipt'}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                          {inv.date ? new Date(inv.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown Date'}
                          {inv.type === 'waiver' ? ' • Fee Waiver' : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--success)' }}>₹ {Number(tuitionsAllocated).toLocaleString()}</div>
                        {inv.amount > tuitionsAllocated && (
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Part of ₹{Number(inv.amount).toLocaleString()} total</div>
                        )}
                        <span className="badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', marginTop: 4, display: 'inline-block' }}>
                          {inv.status || 'Paid'}
                        </span>
                        {isUserAdminOrOwner(currentUser) && inv.type !== 'waiver' && (
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteReceipt(inv); }} style={{ marginLeft: 10, background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 4 }} title="Delete Receipt">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {activeProfileTab === 'transport' && activeStudent?.isTransportApplied && (
        <>
          {/* Transport Hero Financial Summary */}
          <div className="glass-card" style={{ padding: 24, borderRadius: 20, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)', boxShadow: '0 10px 30px rgba(0, 0, 0, 0.04)', marginBottom: 24 }}>
            <div className="flex-responsive" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'var(--bg-secondary)', color: 'var(--brand-orange)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Calendar size={20} />
                </div>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    Transport Fees & Route
                  </h2>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {(() => {
                      const route = getTransportRoutes(activeStudent?.schoolId || 'SCH_01').find(r => r.id === activeStudent?.transportRouteId);
                      return route ? route.name : 'Unknown Route';
                    })()}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid-responsive" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div style={{ backgroundColor: 'var(--bg-secondary)', padding: 16, borderRadius: 14, border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: 12, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 800, marginBottom: 4 }}>
                  Transport Outstanding Due
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--danger)' }}>
                  ₹ {transportDueAmount ? Number(transportDueAmount).toLocaleString() : '0'}.00
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--bg-secondary)', padding: 16, borderRadius: 14, border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: 12, color: 'var(--success)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 800, marginBottom: 4 }}>
                  Transport Paid
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>
                  ₹ {transportPaidAmount > 0 ? transportPaidAmount.toLocaleString() : '0'}.00
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--bg-secondary)', padding: 16, borderRadius: 14, border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 800, marginBottom: 4 }}>
                  Transport Annual Total
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  ₹ {transportAnnualFee > 0 ? transportAnnualFee.toLocaleString() : '0'}.00
                </div>
              </div>
            </div>
          </div>

          {/* Transport Payment History */}
          <div className="glass-card" style={{ padding: 24, borderRadius: 20, marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 16 }}>Transport Payments History</h3>
            {paymentHistory.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)', borderRadius: 12 }}>
                No transport payments recorded yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {paymentHistory.map((inv, idx) => {
                  let transportAllocated = 0;
                  if (inv.allocations && inv.allocations.length > 0) {
                    transportAllocated = inv.allocations.filter(a => a.componentId === 'transport').reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
                  }
                  
                  if (transportAllocated <= 0) return null;

                  return (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border-light)' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{inv.receiptId || inv.receiptNo || 'Receipt'}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                          {inv.date ? new Date(inv.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown Date'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--success)' }}>₹ {Number(transportAllocated).toLocaleString()}</div>
                        {inv.amount > transportAllocated && (
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Part of ₹{Number(inv.amount).toLocaleString()} total</div>
                        )}
                        <span className="badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', marginTop: 4, display: 'inline-block' }}>
                          {inv.status || 'Paid'}
                        </span>
                        {isUserAdminOrOwner(currentUser) && inv.type !== 'waiver' && (
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteReceipt(inv); }} style={{ marginLeft: 10, background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 4 }} title="Delete Receipt">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
      {/* End profile rendering */}
    </div>
  );
}

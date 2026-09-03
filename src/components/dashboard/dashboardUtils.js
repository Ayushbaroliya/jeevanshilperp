import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { calculateStudentDue } from '../../utils/feeEngine';

export async function fetchAuthoritativeFeeSummary(selectedSchool, activeAcademicYearId, classSettings) {
  try {
    let studentsQ = collection(db, 'students');
    let invoicesQ = collection(db, 'invoices');
    let adjustmentsQ = collection(db, 'fee_adjustments');

    if (selectedSchool !== 'ALL') {
      studentsQ = query(studentsQ, where('schoolId', '==', selectedSchool));
      invoicesQ = query(invoicesQ, where('schoolId', '==', selectedSchool));
      adjustmentsQ = query(adjustmentsQ, where('schoolId', '==', selectedSchool));
    }

    const [studentsSnap, invoicesSnap, adjustmentsSnap] = await Promise.all([
      getDocs(studentsQ),
      getDocs(invoicesQ),
      getDocs(adjustmentsQ)
    ]);

    const paymentsByStudent = {};
    const recentPayments = [];
    let totalFeeCollection = 0;

    invoicesSnap.forEach(d => {
      const p = { id: d.id, ...d.data() };
      if (!paymentsByStudent[p.studentId]) paymentsByStudent[p.studentId] = [];
      paymentsByStudent[p.studentId].push(p);
      const amt = Number(p.amount) || 0;
      totalFeeCollection += amt;
      recentPayments.push(p);
    });

    // Sort recent payments
    recentPayments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const adjustmentsByStudent = {};
    adjustmentsSnap.forEach(d => {
      const a = { id: d.id, ...d.data() };
      if (!adjustmentsByStudent[a.studentId]) adjustmentsByStudent[a.studentId] = [];
      adjustmentsByStudent[a.studentId].push(a);
    });

    let totalOutstanding = 0;
    
    studentsSnap.forEach(d => {
      const student = { id: d.id, ...d.data() };
      const sSchool = student.schoolId;
      const sClass = student.class;
      let sSettings = { components: [] };
      // Note: classSettings in App.jsx is structured as: { SCH_01: { "Class 1": {...} } }
      if (classSettings && classSettings[sSchool] && classSettings[sSchool][sClass]) {
        sSettings = classSettings[sSchool][sClass];
      }

      const summary = calculateStudentDue({
        student,
        classSettings: sSettings,
        payments: paymentsByStudent[student.id] || [],
        adjustments: adjustmentsByStudent[student.id] || []
      });

      if (summary && summary.totalDue > 0) {
        totalOutstanding += summary.totalDue;
      }
    });

    return {
      totalFeeCollection,
      totalOutstanding,
      recentPayments: recentPayments.slice(0, 5)
    };
  } catch (error) {
    console.error("Error fetching authoritative fee summary:", error);
    return { totalFeeCollection: 0, totalOutstanding: 0, recentPayments: [] };
  }
}

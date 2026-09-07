const admin = require('firebase-admin');
const fs = require('fs');

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'jeevanshilporg-51db8'
  });
}
const db = admin.firestore();

async function inspectPayroll() {
  try {
    const snap = await db.collection('payroll').get();
    console.log(`Total existing payroll records: ${snap.size}`);
    const sample = [];
    snap.forEach(d => {
      if (sample.length < 5) {
        sample.push({ id: d.id, ...d.data() });
      }
    });
    console.log('Sample payroll records:', JSON.stringify(sample, null, 2));

    // Also check class_assignments
    const assignSnap = await db.collection('class_assignments').get();
    console.log(`Total class_assignments: ${assignSnap.size}`);
    const assignSample = [];
    assignSnap.forEach(d => {
      if (assignSample.length < 5) {
        assignSample.push({ id: d.id, ...d.data() });
      }
    });
    console.log('Sample class_assignments:', JSON.stringify(assignSample, null, 2));
  } catch (err) {
    console.error('Error inspecting:', err);
  }
}

inspectPayroll();

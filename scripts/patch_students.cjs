const { initializeApp } = require('firebase/app');
const { getFirestore, writeBatch, collection, getDocs, doc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "demo",
  authDomain: "demo",
  projectId: "jeevanshilporg-51db8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function patchStudents() {
  console.log('Fetching enrollments...');
  const enrollSnap = await getDocs(collection(db, 'enrollments'));
  
  console.log(`Found ${enrollSnap.size} enrollments. Patching students...`);
  
  let batch = writeBatch(db);
  let count = 0;
  
  enrollSnap.forEach(eDoc => {
    const eData = eDoc.data();
    if (!eData.studentId) return;
    
    const studentRef = doc(db, 'students', eData.studentId);
    batch.update(studentRef, {
      class: eData.class || '',
      section: eData.section || '',
      roll: eData.roll || '',
      stream: eData.stream || ''
    });
    
    count++;
    if (count % 400 === 0) {
      batch.commit();
      batch = writeBatch(db);
      console.log(`Committed ${count} updates...`);
    }
  });
  
  if (count % 400 !== 0) {
    await batch.commit();
  }
  
  console.log(`Successfully patched ${count} students!`);
  process.exit(0);
}

patchStudents().catch(console.error);

const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, updateDoc } = require('firebase/firestore');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');

const firebaseConfig = {
  apiKey: "AIzaSyADdvQI-awTVAR9i9TWqSB-7iW1FJ1uZig",
  authDomain: "jeevanshilporg-51db8.firebaseapp.com",
  projectId: "jeevanshilporg-51db8",
  storageBucket: "jeevanshilporg-51db8.firebasestorage.app",
  messagingSenderId: "671231951469",
  appId: "1:671231951469:web:29fd475e64855fc5c6f564"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function updateSettings() {
  try {
    console.log('Signing in...');
    await signInWithEmailAndPassword(auth, 'jeevanshilporg@gmail.com', 'vikas12345');
    console.log('Successfully signed in!\n');
    
    const defaultClasses = [
      'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 
      'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 
      'Class 11 Art', 'Class 11 Science', 'Class 12 Art', 'Class 12 Science'
    ];

    const fallback = {};
    defaultClasses.forEach(c => {
      let admissionFee = 0;
      let julyFee = 0;
      let septFee = 0;
      let decFee = 0;
      let examFee = 0;
      let isEnabled = false;

      if (['Class 6', 'Class 7', 'Class 8'].includes(c)) {
        admissionFee = c === 'Class 6' ? 1200 : 1000;
        julyFee = 2000; septFee = 2000; decFee = 2000; examFee = 500; isEnabled = true;
      } else if (['Class 9', 'Class 10'].includes(c)) {
        admissionFee = 1500;
        julyFee = 2000; septFee = 2000; decFee = 2000; examFee = 500; isEnabled = true;
      } else if (['Class 11 Art', 'Class 12 Art'].includes(c)) {
        admissionFee = 1500;
        julyFee = 2000; septFee = 2000; decFee = 2000; examFee = 500; isEnabled = true;
      } else if (['Class 11 Science', 'Class 12 Science'].includes(c)) {
        admissionFee = 2000;
        julyFee = 3000; septFee = 2500; decFee = 2000; examFee = 1000; isEnabled = true;
      }

      fallback[c] = {
        academicYear: '2026-2027',
        duePolicy: {
          defaultDueDay: 10,
          septemberGraceDays: 5,
          septemberPenalty: 100,
          decemberGraceDays: 5,
          decemberPenalty: 500,
          decemberClearWaivesPenalty: true
        },
        components: [
          // Admission Fee — separate one-time component, NOT an installment
          { id: 'admission', name: 'Admission Fee', amount: admissionFee, enabled: admissionFee > 0, frequency: 'one_time', installments: [], dueDay: 10, penalty: 0, graceDays: 5,
            schedule: [{ dueDate: '2026-07-10', label: 'One Time' }] },
          // Tuition installments — July / September / December
          { id: 'july',      name: 'July Installment',      amount: julyFee, enabled: julyFee > 0, frequency: 'one_time', installments: ['july'],      dueDay: 10, penalty: 0,   graceDays: 5,
            schedule: [{ dueDate: '2026-07-10', label: 'July Installment' }] },
          { id: 'september', name: 'September Installment',  amount: septFee, enabled: septFee > 0, frequency: 'one_time', installments: ['september'], dueDay: 10, penalty: 100, graceDays: 5,
            schedule: [{ dueDate: '2026-09-10', label: 'September Installment' }] },
          { id: 'december',  name: 'December Installment',   amount: decFee,  enabled: decFee  > 0, frequency: 'one_time', installments: ['december'],  dueDay: 10, penalty: 500, graceDays: 5,
            schedule: [{ dueDate: '2026-12-10', label: 'December Installment' }] },
          // Optional components
          { id: 'exam',      name: 'Examination Fee', amount: examFee, enabled: examFee > 0, frequency: 'one_time', installments: ['december'], dueDay: 10, penalty: 0, graceDays: 5,
            schedule: [{ dueDate: '2026-12-10', label: 'December Installment' }] },
          { id: 'computer',  name: 'Computer Fee',    amount: 0,       enabled: false,        frequency: 'one_time', installments: ['july'],      dueDay: 10, penalty: 0, graceDays: 5,
            schedule: [{ dueDate: '2026-07-10', label: 'July Installment' }] },
          { id: 'practical', name: 'Practical Fee',   amount: 0,       enabled: false,        frequency: 'one_time', installments: ['december'],  dueDay: 10, penalty: 0, graceDays: 5,
            schedule: [{ dueDate: '2026-12-10', label: 'December Installment' }] },
          { id: 'transport', name: 'Transport Fee',   amount: 0,       enabled: false,        frequency: 'monthly',  installments: [],            dueDay: 10, penalty: 0, graceDays: 5,
            schedule: [] }
        ]
      };
    });

    console.log('Fetching current school_settings...');
    const settingsRef = doc(db, 'school_settings', 'settings');
    const docSnap = await getDoc(settingsRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      
      const newClasses = { ...data.schoolClasses };
      const newSettings = { ...data.schoolClassSettings };

      // Update SCH_02 specifically
      newClasses['SCH_02'] = defaultClasses;
      newSettings['SCH_02'] = fallback;

      console.log('Updating Firestore...');
      await updateDoc(settingsRef, {
        schoolClasses: newClasses,
        schoolClassSettings: newSettings
      });
      console.log('✅ Successfully updated Firestore with new classes and fee structures!');
    } else {
      console.log('No existing settings found in Firestore.');
    }

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    process.exit(0);
  }
}

updateSettings();

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, doc, setDoc } = require('firebase/firestore');

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

async function setupSchools() {
  try {
    await signInWithEmailAndPassword(auth, 'jeevanshilporg@gmail.com', 'vikas12345');
    
    // SCH_02 - JSIC
    const classesJSIC = ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11 Art', 'Class 11 Science', 'Class 12 Art', 'Class 12 Science'];
    const fallbackJSIC = {};
    classesJSIC.forEach(c => {
      let admissionFee = 0; let julyFee = 0; let octFee = 0; let decFee = 0; let examFee = 0;
      if (['Class 6', 'Class 7', 'Class 8'].includes(c)) { admissionFee = c === 'Class 6' ? 1200 : 1000; julyFee = 2000; octFee = 2000; decFee = 2000; examFee = 500; }
      else if (['Class 9', 'Class 10'].includes(c)) { admissionFee = 1500; julyFee = 2000; octFee = 2000; decFee = 2000; examFee = 500; }
      else if (['Class 11 Art', 'Class 12 Art'].includes(c)) { admissionFee = 1500; julyFee = 2000; octFee = 2000; decFee = 2000; examFee = 500; }
      else if (['Class 11 Science', 'Class 12 Science'].includes(c)) { admissionFee = 2000; julyFee = 3000; octFee = 2500; decFee = 2000; examFee = 1000; }

      fallbackJSIC[c] = {
        academicYear: '2026-2027', duePolicy: { defaultDueDay: 10, defaultGraceDays: 5, defaultPenalty: 100, maximumPenalty: 500, septemberPenalty: 100, decemberPenalty: 500, decemberClearWaivesPenalty: true }, components: [
          { id: 'tuition', name: 'Tuition', amount: 1500, enabled: false, frequency: 'every_installment', installments: ['admission','september','december'], dueDay: 10, penalty: 100, graceDays: 5 },
          { id: 'admission', name: 'Admission', amount: admissionFee, enabled: admissionFee > 0, frequency: 'one_time', installments: ['admission'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'exam', name: 'Exam', amount: examFee, enabled: examFee > 0, frequency: 'one_time', installments: ['december'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'july_inst', name: 'July Installment', amount: julyFee, enabled: julyFee > 0, frequency: 'one_time', installments: ['admission'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'october_inst', name: 'October Installment', amount: octFee, enabled: octFee > 0, frequency: 'one_time', installments: ['september'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'december_inst', name: 'December Installment', amount: decFee, enabled: decFee > 0, frequency: 'one_time', installments: ['december'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'registration', name: 'Registration', amount: 0, enabled: false, frequency: 'one_time', installments: ['admission'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'test', name: 'Test Fee', amount: 0, enabled: false, frequency: 'one_time', installments: ['september'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'computer', name: 'Computer', amount: 0, enabled: false, frequency: 'one_time', installments: ['september'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'practical', name: 'Practical', amount: 0, enabled: false, frequency: 'one_time', installments: ['december'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'transport', name: 'Transport', amount: 0, enabled: false, frequency: 'monthly', installments: [], dueDay: 10, penalty: 0, graceDays: 5 }
        ]
      };
    });

    // SCH_01 - JSPS
    const classesJSPS = ['LKG', 'UKG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8'];
    const fallbackJSPS = {};
    classesJSPS.forEach(c => {
      // User says default to 0 for unknown fees, same structure (installments).
      fallbackJSPS[c] = {
        academicYear: '2026-2027', duePolicy: { defaultDueDay: 10, defaultGraceDays: 5, defaultPenalty: 100, maximumPenalty: 500, septemberPenalty: 100, decemberPenalty: 500, decemberClearWaivesPenalty: true }, components: [
          { id: 'tuition', name: 'Tuition', amount: 1500, enabled: false, frequency: 'every_installment', installments: ['admission','september','december'], dueDay: 10, penalty: 100, graceDays: 5 },
          { id: 'admission', name: 'Admission', amount: 0, enabled: true, frequency: 'one_time', installments: ['admission'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'exam', name: 'Exam', amount: 0, enabled: true, frequency: 'one_time', installments: ['december'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'july_inst', name: 'July Installment', amount: 0, enabled: true, frequency: 'one_time', installments: ['admission'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'october_inst', name: 'October Installment', amount: 0, enabled: true, frequency: 'one_time', installments: ['september'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'december_inst', name: 'December Installment', amount: 0, enabled: true, frequency: 'one_time', installments: ['december'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'registration', name: 'Registration', amount: 0, enabled: false, frequency: 'one_time', installments: ['admission'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'test', name: 'Test Fee', amount: 0, enabled: false, frequency: 'one_time', installments: ['september'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'computer', name: 'Computer', amount: 0, enabled: false, frequency: 'one_time', installments: ['september'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'practical', name: 'Practical', amount: 0, enabled: false, frequency: 'one_time', installments: ['december'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'transport', name: 'Transport', amount: 0, enabled: false, frequency: 'monthly', installments: [], dueDay: 10, penalty: 0, graceDays: 5 }
        ]
      };
    });

    // SCH_03 - JSAS
    const classesJSAS = ['LKG', 'UKG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8'];
    const fallbackJSAS = {};
    classesJSAS.forEach(c => {
      // User says default to 0 for unknown fees, same structure (installments).
      fallbackJSAS[c] = {
        academicYear: '2026-2027', duePolicy: { defaultDueDay: 10, defaultGraceDays: 5, defaultPenalty: 100, maximumPenalty: 500, septemberPenalty: 100, decemberPenalty: 500, decemberClearWaivesPenalty: true }, components: [
          { id: 'tuition', name: 'Tuition', amount: 1500, enabled: false, frequency: 'every_installment', installments: ['admission','september','december'], dueDay: 10, penalty: 100, graceDays: 5 },
          { id: 'admission', name: 'Admission', amount: 0, enabled: true, frequency: 'one_time', installments: ['admission'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'exam', name: 'Exam', amount: 0, enabled: true, frequency: 'one_time', installments: ['december'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'july_inst', name: 'July Installment', amount: 0, enabled: true, frequency: 'one_time', installments: ['admission'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'october_inst', name: 'October Installment', amount: 0, enabled: true, frequency: 'one_time', installments: ['september'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'december_inst', name: 'December Installment', amount: 0, enabled: true, frequency: 'one_time', installments: ['december'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'registration', name: 'Registration', amount: 0, enabled: false, frequency: 'one_time', installments: ['admission'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'test', name: 'Test Fee', amount: 0, enabled: false, frequency: 'one_time', installments: ['september'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'computer', name: 'Computer', amount: 0, enabled: false, frequency: 'one_time', installments: ['september'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'practical', name: 'Practical', amount: 0, enabled: false, frequency: 'one_time', installments: ['december'], dueDay: 10, penalty: 0, graceDays: 5 },
          { id: 'transport', name: 'Transport', amount: 0, enabled: false, frequency: 'monthly', installments: [], dueDay: 10, penalty: 0, graceDays: 5 }
        ]
      };
    });

    const defaultSections = ['Section A', 'Section B', 'Section C'];

    await setDoc(doc(db, 'school_settings', 'settings'), {
      schoolClasses: {
        SCH_01: classesJSPS,
        SCH_02: classesJSIC,
        SCH_03: classesJSAS
      },
      schoolSections: {
        SCH_01: defaultSections,
        SCH_02: defaultSections,
        SCH_03: defaultSections
      },
      schoolClassSettings: {
        SCH_01: fallbackJSPS,
        SCH_02: fallbackJSIC,
        SCH_03: fallbackJSAS
      }
    });

    console.log('✅ Successfully set independent configurations for SCH_01, SCH_02, and SCH_03!');
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

setupSchools();

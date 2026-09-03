const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

admin.initializeApp({ projectId: 'jeevanshilporg-51db8' });

async function seed() {
  const db = getFirestore();
  const auth = getAuth();

  // Create Owner
  try {
    const userRecord = await auth.createUser({
      email: 'owner@test.local',
      password: 'password',
      uid: 'e2e-owner-uid'
    });
    console.log('Successfully created new user:', userRecord.uid);
  } catch(e) {
    console.log('User already exists, updating password.');
    await auth.updateUser('e2e-owner-uid', { password: 'password' }).catch(() => {});
  }
  
  await db.collection('users').doc('e2e-owner-uid').set({
    role: 'Owner',
    name: 'Group Owner / Super Admin',
    schoolId: 'ALL'
  });

  // Create Administrator
  try {
    const adminUser = await auth.createUser({
      email: 'admin@test.local',
      password: 'password',
      uid: 'e2e-admin-uid'
    });
    console.log('Created Admin:', adminUser.uid);
  } catch(e) {
    await auth.updateUser('e2e-admin-uid', { password: 'password' }).catch(() => {});
  }
  await db.collection('staff').doc('e2e-admin-uid').set({
    role: 'Administrator',
    name: 'E2E Admin',
    schoolId: 'SCH_01'
  });

  // Create Accountant
  try {
    const accountantUser = await auth.createUser({
      email: 'accountant@test.local',
      password: 'password',
      uid: 'e2e-accountant-uid'
    });
    console.log('Created Accountant:', accountantUser.uid);
  } catch(e) {
    await auth.updateUser('e2e-accountant-uid', { password: 'password' }).catch(() => {});
  }
  await db.collection('staff').doc('e2e-accountant-uid').set({
    role: 'Accountant',
    name: 'E2E Accountant',
    schoolId: 'SCH_01'
  });

  // Create Teacher
  try {
    const teacherUser = await auth.createUser({
      email: 'teacher@test.local',
      password: 'password',
      uid: 'e2e-teacher-uid'
    });
    console.log('Created Teacher:', teacherUser.uid);
  } catch(e) {
    await auth.updateUser('e2e-teacher-uid', { password: 'password' }).catch(() => {});
  }
  await db.collection('staff').doc('e2e-teacher-uid').set({
    role: 'Teacher',
    name: 'Meena Sharma',
    schoolId: 'SCH_01'
  });

  
  // Also seed some initial school settings so the UI can load them
  await db.collection('school_settings').doc('settings').set({
    classes: ['Class 5'],
    sections: ['Section A']
  });
  
  console.log('Seeded DB');
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

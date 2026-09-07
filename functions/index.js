const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Ensure only authenticated Admins or Owners can call this
const checkAdminRole = async (context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  
  const userRecord = await admin.firestore().collection('users').doc(context.auth.uid).get();
  if (!userRecord.exists) {
    throw new functions.https.HttpsError('permission-denied', 'User profile not found.');
  }

  const role = userRecord.data().role;
  if (role !== 'Administrator' && role !== 'Owner') {
    throw new functions.https.HttpsError('permission-denied', 'Requires Administrator privileges.');
  }
};

exports.adminUpdateUserPassword = functions.https.onCall(async (data, context) => {
  await checkAdminRole(context);
  
  const { uid, newPassword } = data;
  if (!uid || !newPassword) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing uid or newPassword.');
  }

  try {
    await admin.auth().updateUser(uid, {
      password: newPassword
    });
    return { success: true, message: 'Password updated successfully.' };
  } catch (error) {
    throw new functions.https.HttpsError('internal', `Failed to update password: ${error.message}`);
  }
});

exports.adminDeactivateStaff = functions.https.onCall(async (data, context) => {
  await checkAdminRole(context);

  const { uid } = data;
  if (!uid) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing uid.');
  }

  try {
    await admin.auth().updateUser(uid, {
      disabled: true
    });
    return { success: true, message: 'User deactivated successfully.' };
  } catch (error) {
    throw new functions.https.HttpsError('internal', `Failed to deactivate user: ${error.message}`);
  }
});

// Automated Daily Database Backup
const firestore = require('@google-cloud/firestore');
const client = new firestore.v1.FirestoreAdminClient();

exports.scheduledFirestoreExport = functions.pubsub
  .schedule('0 2 * * *')
  .timeZone('Asia/Kolkata')
  .onRun(async (context) => {
    const projectId = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;
    const databaseName = client.databasePath(projectId, '(default)');
    const bucket = 'gs://jeevanshilporg-51db8-backups';

    try {
      const responses = await client.exportDocuments({
        name: databaseName,
        outputUriPrefix: bucket,
        collectionIds: [] // Empty array means export all collections
      });
      const response = responses[0];
      console.log(`Operation Name: ${response['name']}`);
      return { success: true };
    } catch (err) {
      console.error(err);
      throw new Error('Export operation failed');
    }
  });

exports.tempPatchStudents = functions.https.onRequest(async (req, res) => {
  if (req.query.secret !== '1234abcd') return res.status(403).send('Forbidden');
  try {
    const db = admin.firestore();
    const enrollSnap = await db.collection('enrollments').get();
    const studentsSnap = await db.collection('students').get();
    
    const studentIds = new Set();
    studentsSnap.forEach(doc => studentIds.add(doc.id));
    
    const missingStudents = [];
    enrollSnap.forEach(eDoc => {
      const eData = eDoc.data();
      if (eData.studentId && !studentIds.has(eData.studentId)) {
        missingStudents.push(eData.studentId);
      }
    });
    
    if (missingStudents.length > 0) {
      return res.status(400).json({ error: \Validation failed: \ enrollments have missing students.\ });
    }
    
    const batchArray = [];
    let batch = db.batch();
    let count = 0;
    
    enrollSnap.forEach(eDoc => {
      const eData = eDoc.data();
      if (!eData.studentId) return;
      
      const studentRef = db.collection('students').doc(eData.studentId);
      batch.update(studentRef, {
        class: eData.class || '',
        section: eData.section || '',
        stream: eData.stream || '',
        roll: eData.roll || ''
      });
      
      count++;
      if (count % 400 === 0) {
        batchArray.push(batch.commit());
        batch = db.batch();
      }
    });
    
    if (count % 400 !== 0) {
      batchArray.push(batch.commit());
    }
    
    await Promise.all(batchArray);
    res.json({ success: true, count: count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

exports.tempVerifyStudents = functions.https.onRequest(async (req, res) => {
  if (req.query.secret !== '1234abcd') return res.status(403).send('Forbidden');
  try {
    const db = admin.firestore();
    const studentsSnap = await db.collection('students').get();
    const enrollSnap = await db.collection('enrollments').get();
    
    let missingClass = 0;
    let missingSection = 0;
    let jsps = 0;
    let jsic = 0;
    let jsps68 = 0;
    let jsic68 = 0;
    let streams = 0;
    
    studentsSnap.forEach(doc => {
      const data = doc.data();
      if (!data.class) missingClass++;
      
      if (!data.section && data.class && !data.class.includes('11') && !data.class.includes('12')) {
        missingSection++;
      }
      if (data.class && (data.class.includes('11') || data.class.includes('12')) && data.stream) {
        streams++;
      }
      
      if (data.schoolId === 'SCH_01') {
        jsps++;
        if (['Class 6', 'Class 7', 'Class 8'].includes(data.class)) jsps68++;
      }
      if (data.schoolId === 'SCH_02') {
        jsic++;
        if (['Class 6', 'Class 7', 'Class 8'].includes(data.class)) jsic68++;
      }
    });
    
    res.json({
      students: studentsSnap.size,
      enrollments: enrollSnap.size,
      missingClass,
      missingSection,
      jsps,
      jsic,
      jsps68,
      jsic68,
      streams
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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


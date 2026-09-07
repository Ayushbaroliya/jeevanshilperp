const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
admin.initializeApp({ projectId: 'jeevanshilporg-51db8' });
const db = getFirestore();
db.collection('test').limit(1).get().then(() => console.log('Success')).catch(e => console.error('Error:', e));

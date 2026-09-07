import React, { useState } from 'react';
import { collection, getDocs, doc, writeBatch, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { AlertCircle, CheckCircle, XCircle } from 'lucide-react';

export default function DataPatchMaintenance({ currentUser }) {
  const [status, setStatus] = useState('idle'); // idle, validating, patching, verifying, success, error
  const [logs, setLogs] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [verifyResults, setVerifyResults] = useState(null);

  const addLog = (msg) => {
    setLogs(prev => [...prev, msg]);
    console.log("[DataPatch]", msg);
  };

  const handleRunPatch = async () => {
    if (!window.confirm("This will update 1,249 student records in the live database. Continue?")) {
      return;
    }

    setStatus('validating');
    setLogs([]);
    setErrorMsg('');
    setVerifyResults(null);

    try {
      addLog("Fetching enrollments for JSPS and JSIC...");
      const enrollQ1 = query(collection(db, 'enrollments'), where('schoolId', '==', 'SCH_01'));
      const enrollQ2 = query(collection(db, 'enrollments'), where('schoolId', '==', 'SCH_02'));
      const [eSnap1, eSnap2] = await Promise.all([getDocs(enrollQ1), getDocs(enrollQ2)]);
      
      const allEnrollments = [];
      eSnap1.forEach(d => allEnrollments.push(d));
      eSnap2.forEach(d => allEnrollments.push(d));
      
      addLog(`Found ${allEnrollments.length} enrollments. Fetching all students...`);
      
      const studQ1 = query(collection(db, 'students'), where('schoolId', '==', 'SCH_01'));
      const studQ2 = query(collection(db, 'students'), where('schoolId', '==', 'SCH_02'));
      const [sSnap1, sSnap2] = await Promise.all([getDocs(studQ1), getDocs(studQ2)]);
      
      const allStudents = [];
      sSnap1.forEach(d => allStudents.push(d));
      sSnap2.forEach(d => allStudents.push(d));
      
      addLog(`Found ${allStudents.length} students.`);

      const studentMap = new Map();
      allStudents.forEach(doc => studentMap.set(doc.id, doc.data()));

      // 1. Validation Phase
      const missingIds = [];
      const updates = [];

      allEnrollments.forEach(eDoc => {
        const eData = eDoc.data();
        if (!eData.studentId || !studentMap.has(eData.studentId)) {
          missingIds.push(eData.studentId || 'MISSING_ID');
        } else {
          updates.push({
            studentId: eData.studentId,
            class: eData.class || '',
            section: eData.section || '',
            stream: eData.stream || '',
            roll: eData.roll || ''
          });
        }
      });

      if (missingIds.length > 0) {
        throw new Error(`VALIDATION FAILED: ${missingIds.length} enrollments have missing or invalid student IDs. Example ID: ${missingIds[0]}`);
      }

      addLog(`Validation passed. All ${updates.length} enrollments have matching students. Starting patch...`);
      
      // 2. Patch Phase
      setStatus('patching');
      const batchPromises = [];
      let currentBatch = writeBatch(db);
      let count = 0;

      for (const update of updates) {
        const ref = doc(db, 'students', update.studentId);
        currentBatch.update(ref, {
          class: update.class,
          section: update.section,
          stream: update.stream,
          roll: update.roll
        });

        count++;
        if (count % 400 === 0) {
          batchPromises.push(currentBatch.commit());
          currentBatch = writeBatch(db);
          addLog(`Queued batch for ${count} students...`);
        }
      }

      if (count % 400 !== 0) {
        batchPromises.push(currentBatch.commit());
      }

      addLog("Awaiting all batch commits to Firestore...");
      await Promise.all(batchPromises);
      addLog("All batch writes completed successfully!");

      // 3. Verification Phase
      setStatus('verifying');
      addLog("Running post-patch verification...");
      
      const [nStud1, nStud2, nEnr1, nEnr2] = await Promise.all([
        getDocs(query(collection(db, 'students'), where('schoolId', '==', 'SCH_01'))),
        getDocs(query(collection(db, 'students'), where('schoolId', '==', 'SCH_02'))),
        getDocs(query(collection(db, 'enrollments'), where('schoolId', '==', 'SCH_01'))),
        getDocs(query(collection(db, 'enrollments'), where('schoolId', '==', 'SCH_02')))
      ]);
      
      const newStudents = [];
      nStud1.forEach(d => newStudents.push(d));
      nStud2.forEach(d => newStudents.push(d));

      const totalStudentsCount = nStud1.size + nStud2.size;
      const totalEnrollCount = nEnr1.size + nEnr2.size;

      let missingClass = 0;
      let missingSection = 0;
      let jsps = 0;
      let jsic = 0;
      let streams = 0;
      let jsps68 = 0;
      let jsic68 = 0;

      newStudents.forEach(d => {
        const data = d.data();
        if (!data.class) missingClass++;
        
        // JSPS (Class 1-8) requires section
        if (!data.section && data.class && !data.class.includes('11') && !data.class.includes('12')) {
          missingSection++;
        }
        
        if (data.schoolId === 'SCH_01') {
          jsps++;
          if (['Class 6', 'Class 7', 'Class 8'].includes(data.class)) jsps68++;
        }
        if (data.schoolId === 'SCH_02') {
          jsic++;
          if (['Class 6', 'Class 7', 'Class 8'].includes(data.class)) jsic68++;
        }

        if (data.stream) streams++;
      });

      const verification = {
        students: totalStudentsCount,
        enrollments: totalEnrollCount,
        missingClass,
        missingSection,
        jsps,
        jsic,
        jsps68,
        jsic68,
        streams
      };

      setVerifyResults(verification);
      
      if (verification.students !== 1249 || verification.missingClass !== 0) {
        throw new Error("Verification failed! Data looks inconsistent.");
      }

      setStatus('success');
      addLog("Patch completed and verified successfully!");

    } catch (err) {
      console.error(err);
      setErrorMsg(err.message);
      setStatus('error');
    }
  };

  // Ensure ONLY Owner or Director can see this
  if (currentUser?.role !== 'Owner' && currentUser?.role !== 'Director') {
    return null;
  }

  return (
    <div style={{ padding: 24, margin: '20px 0', backgroundColor: '#fff0f0', border: '2px solid #ff4444', borderRadius: 12 }}>
      <h2 style={{ color: '#ff4444', display: 'flex', alignItems: 'center', gap: 10, marginTop: 0 }}>
        <AlertCircle /> TEMPORARY MAINTENANCE ACTION
      </h2>
      <p style={{ color: '#666', marginBottom: 20 }}>
        This module will patch missing student classes and sections by syncing from the enrollments collection. 
        It applies batch updates safely.
      </p>

      {status === 'idle' && (
        <button 
          onClick={handleRunPatch}
          style={{ padding: '12px 24px', backgroundColor: '#ff4444', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}
        >
          Run Database Patch
        </button>
      )}

      {status !== 'idle' && (
        <div style={{ marginTop: 20, padding: 16, backgroundColor: '#1a1a1a', color: '#00ff00', borderRadius: 8, fontFamily: 'monospace', maxHeight: 300, overflowY: 'auto' }}>
          {logs.map((l, i) => <div key={i}>{l}</div>)}
          
          {status === 'patching' && <div>Patching in progress...</div>}
          {status === 'verifying' && <div style={{ color: '#ffb86c' }}>Verifying...</div>}
          
          {status === 'error' && (
            <div style={{ color: '#ff5555', marginTop: 16, fontWeight: 'bold' }}>
              <XCircle size={16} style={{ display: 'inline', verticalAlign: 'middle' }} /> ERROR: {errorMsg}
            </div>
          )}

          {status === 'success' && verifyResults && (
            <div style={{ color: '#8be9fd', marginTop: 16 }}>
              <div style={{ color: '#50fa7b', fontWeight: 'bold', marginBottom: 10 }}>
                <CheckCircle size={16} style={{ display: 'inline', verticalAlign: 'middle' }} /> SUCCESS - VERIFICATION PASSED
              </div>
              <div>Students: {verifyResults.students} (Expected: 1249)</div>
              <div>Enrollments: {verifyResults.enrollments} (Expected: 1249)</div>
              <div>Missing Class: {verifyResults.missingClass} (Expected: 0)</div>
              <div>Missing Section: {verifyResults.missingSection} (Expected: 0)</div>
              <div>JSPS Students: {verifyResults.jsps} (Expected: 257)</div>
              <div>JSIC Students: {verifyResults.jsic} (Expected: 992)</div>
              <div>JSPS Class 6-8: {verifyResults.jsps68}</div>
              <div>JSIC Class 6-8: {verifyResults.jsic68}</div>
              <div>Students with Streams: {verifyResults.streams}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

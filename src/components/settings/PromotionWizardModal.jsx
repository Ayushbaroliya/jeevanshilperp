import React, { useState, useEffect, useMemo } from 'react';
import { X, CheckCircle, AlertTriangle, ArrowRight, RotateCcw, ShieldAlert, Sparkles, RefreshCw, Layers, CheckSquare, Square, FileText } from 'lucide-react';
import { collection, getDocs, query, where, doc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { SCHOOLS } from '../../utils/translations';
import { auditLogGovernance } from '../../utils/audit';
import { normalizeClassFeeSettings, generateChargeSchedule, getSchoolDefaultFeeComponents } from '../../utils/feeEngine';

export const isOwnerUser = (user) => {
  if (!user) return false;
  if (user.email === 'jeevanshilporg@gmail.com') return true;
  const r = (user.role || '').toLowerCase();
  return r === 'owner' || r === 'director';
};

export default function PromotionWizardModal({
  isOpen,
  onClose,
  currentUser,
  selectedSchool,
  classes = [],
  sections = [],
  academicYearsList = [],
  activeAcademicYearId = 'AY_2026_27',
  classSettings = {},
  onPromotionComplete
}) {
  const [step, setStep] = useState('select'); // 'select' | 'preview'
  const [sourceYear, setSourceYear] = useState('');
  const [targetYear, setTargetYear] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [students, setStudents] = useState([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [decisions, setDecisions] = useState({}); // { [studentId]: { action: 'PROMOTED'|'REPEATED'|'SUPPLEMENTARY'|'LEFT', targetClass, targetSection, targetRoll } }
  const [generateFees, setGenerateFees] = useState(false); // Default: OFF
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitProgress, setCommitProgress] = useState(null);

  const canExecute = isOwnerUser(currentUser);

  // Initialize source and target academic years
  useEffect(() => {
    if (!isOpen) return;
    setStep('select');
    setCommitProgress(null);

    // Pick active year as source, or earliest
    const currentActive = activeAcademicYearId || (academicYearsList[0]?.id || 'AY_2025_26');
    setSourceYear(currentActive);

    // Pick target year (different from source)
    const nextYearObj = academicYearsList.find(y => y.id !== currentActive) || academicYearsList[1] || academicYearsList[0];
    setTargetYear(nextYearObj ? nextYearObj.id : 'AY_2026_27');
  }, [isOpen, activeAcademicYearId, academicYearsList]);

  // Fetch active students in this school
  useEffect(() => {
    if (!isOpen || !selectedSchool || selectedSchool === 'ALL') return;

    let isMounted = true;
    setIsLoadingStudents(true);

    getDocs(query(collection(db, 'students'), where('schoolId', '==', selectedSchool)))
      .then((snap) => {
        if (!isMounted) return;
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(s => s.status !== 'Deleted' && s.status !== 'archived' && !s.isDeleted && s.status !== 'Left');
        setStudents(list);

        // Compute default decisions
        const initial = {};
        list.forEach(student => {
          const currentClassIdx = classes.indexOf(student.class);
          const isLastClass = currentClassIdx !== -1 && currentClassIdx === classes.length - 1;
          const nextClass = (currentClassIdx !== -1 && currentClassIdx < classes.length - 1)
            ? classes[currentClassIdx + 1]
            : student.class;

          initial[student.id] = {
            action: isLastClass ? 'LEFT' : 'PROMOTED',
            targetClass: isLastClass ? student.class : nextClass,
            targetSection: student.section || sections[0] || 'Section A',
            targetRoll: student.roll || ''
          };
        });
        setDecisions(initial);
      })
      .catch((err) => {
        console.error("Error fetching students for promotion:", err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingStudents(false);
      });

    return () => { isMounted = false; };
  }, [isOpen, selectedSchool, classes, sections]);

  // Helper to get next class
  const getNextClass = (cls) => {
    const idx = classes.indexOf(cls);
    if (idx !== -1 && idx < classes.length - 1) {
      return classes[idx + 1];
    }
    return cls;
  };

  // Filtered student list
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      if (selectedClassFilter !== 'ALL' && s.class !== selectedClassFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const nameMatch = (s.name || '').toLowerCase().includes(q);
        const fatherMatch = (s.fatherName || '').toLowerCase().includes(q);
        const rollMatch = (s.roll || '').toLowerCase().includes(q);
        if (!nameMatch && !fatherMatch && !rollMatch) return false;
      }
      return true;
    });
  }, [students, selectedClassFilter, searchQuery]);

  // Bulk actions for visible students
  const handleBulkSetAction = (action) => {
    setDecisions(prev => {
      const updated = { ...prev };
      filteredStudents.forEach(s => {
        const currentDecision = updated[s.id] || {};
        let targetClass = s.class;
        if (action === 'PROMOTED') {
          targetClass = getNextClass(s.class);
        }
        updated[s.id] = {
          ...currentDecision,
          action,
          targetClass,
          targetSection: currentDecision.targetSection || s.section || 'Section A',
          targetRoll: currentDecision.targetRoll || s.roll || ''
        };
      });
      return updated;
    });
  };

  const handleUpdateStudentDecision = (studentId, updates) => {
    setDecisions(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        ...updates
      }
    }));
  };

  // Summary counts for Dry-Run Preview
  const summaryCounts = useMemo(() => {
    let promoted = 0;
    let repeated = 0;
    let supplementary = 0;
    let left = 0;

    filteredStudents.forEach(s => {
      const dec = decisions[s.id];
      const action = dec?.action || 'PROMOTED';
      if (action === 'PROMOTED') promoted++;
      else if (action === 'REPEATED') repeated++;
      else if (action === 'SUPPLEMENTARY') supplementary++;
      else if (action === 'LEFT') left++;
    });

    return { total: filteredStudents.length, promoted, repeated, supplementary, left };
  }, [filteredStudents, decisions]);

  // Commit Rollover
  const handleCommitRollover = async () => {
    if (!canExecute) {
      alert("Unauthorized: Only Group Owner or Director can execute year-end promotion.");
      return;
    }

    if (sourceYear === targetYear) {
      alert("Source Academic Year and Target Academic Year must be different.");
      return;
    }

    const confirmMsg = `CONFIRM SESSION ROLLOVER:\n\n` +
      `School: ${SCHOOLS.find(s => s.id === selectedSchool)?.name || selectedSchool}\n` +
      `Source Year: ${sourceYear}\n` +
      `Target Year: ${targetYear}\n` +
      `Total Students: ${summaryCounts.total}\n` +
      `• Promoted: ${summaryCounts.promoted}\n` +
      `• Repeated: ${summaryCounts.repeated}\n` +
      `• Supplementary: ${summaryCounts.supplementary}\n` +
      `• Left: ${summaryCounts.left}\n` +
      `• Initial Fee Generation: ${generateFees ? 'ENABLED' : 'DISABLED'}\n\n` +
      `Are you sure you want to commit this rollover?`;

    if (!window.confirm(confirmMsg)) return;

    setIsCommitting(true);
    setCommitProgress('Preparing database batch operations...');

    try {
      const targetYearObj = academicYearsList.find(y => y.id === targetYear);
      const targetYearLabel = targetYearObj?.name || targetYear.replace('AY_', '').replace('_', '-');

      // Process in batches of 200 students to respect Firestore's 500-op limit
      const CHUNK_SIZE = 200;
      const chunks = [];
      for (let i = 0; i < filteredStudents.length; i += CHUNK_SIZE) {
        chunks.push(filteredStudents.slice(i, i + CHUNK_SIZE));
      }

      let processedCount = 0;

      for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
        const chunk = chunks[cIdx];
        const batch = writeBatch(db);

        chunk.forEach(student => {
          const dec = decisions[student.id] || { action: 'PROMOTED', targetClass: getNextClass(student.class) };
          const action = dec.action || 'PROMOTED';
          const targetClass = dec.targetClass || student.class;
          const targetSection = dec.targetSection || student.section || 'Section A';
          const targetRoll = dec.targetRoll || student.roll || '';

          // Deterministic & Idempotent document ID
          const enrollmentId = `${selectedSchool}_${targetYear}_${student.id}`;

          if (action === 'LEFT') {
            // Update student status to Left
            batch.update(doc(db, "students", student.id), {
              status: 'Left',
              leftDate: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });

            // Note: We do NOT delete historical enrollments! Past years remain completely intact.
          } else {
            // Promoted / Repeated / Supplementary
            // 1. Create or update target year enrollment
            const statusLabel = action === 'PROMOTED' ? 'Active' : action === 'REPEATED' ? 'Repeated' : 'Supplementary';

            batch.set(doc(db, "enrollments", enrollmentId), {
              studentId: student.id,
              schoolId: selectedSchool,
              academicYearId: targetYear,
              class: targetClass,
              section: targetSection,
              roll: String(targetRoll),
              fatherName: student.fatherName || '',
              studentName: student.name || '',
              status: statusLabel,
              promotionType: action,
              promotedFromClass: student.class,
              promotedFromYear: sourceYear,
              attendance: '100%',
              updatedAt: new Date().toISOString(),
              createdAt: new Date().toISOString()
            }, { merge: true });

            // 2. Update Student Master Record current class, section, roll and academicYear
            batch.update(doc(db, "students", student.id), {
              class: targetClass,
              section: targetSection,
              roll: String(targetRoll),
              academicYear: targetYearLabel,
              status: 'active',
              lastPromotionDate: new Date().toISOString(),
              lastPromotionAction: action
            });

            // 3. Optional: Initial fee charge generation
            if (generateFees) {
              let classFeeConfig = classSettings?.[targetClass];
              if (!classFeeConfig || !classFeeConfig.components || classFeeConfig.components.length === 0) {
                const defaultComps = getSchoolDefaultFeeComponents(selectedSchool, targetClass, targetYearLabel);
                classFeeConfig = { components: defaultComps };
              }
              const feeTemplate = normalizeClassFeeSettings(classFeeConfig, targetYearLabel);
              const mockStudent = {
                id: student.id,
                isNewAdmission: false,
                academicYear: targetYearLabel
              };
              const initialCharges = generateChargeSchedule(mockStudent, feeTemplate, targetYearLabel);

              if (initialCharges && initialCharges.length > 0) {
                initialCharges.forEach(charge => {
                  // Deterministic charge ID
                  const chargeId = `${student.id}_${targetYear}_${charge.componentId}_${charge.installment || 'all'}`;
                  batch.set(doc(db, "fee_charges", chargeId), {
                    ...charge,
                    studentId: student.id,
                    schoolId: selectedSchool,
                    academicYearId: targetYear,
                    createdAt: new Date().toISOString()
                  }, { merge: true });
                });
              }
            }
          }
        });

        setCommitProgress(`Committing batch ${cIdx + 1} of ${chunks.length}...`);
        await batch.commit();
        processedCount += chunk.length;
      }

      // Log governance audit trail
      await auditLogGovernance({
        userId: currentUser?.id || currentUser?.uid,
        role: currentUser?.role || 'Owner',
        schoolId: selectedSchool,
        action: 'SESSION_ROLLOVER_PROMOTION',
        oldValue: `Source Year: ${sourceYear}`,
        newValue: `Target Year: ${targetYear}, Processed: ${processedCount}, Promoted: ${summaryCounts.promoted}, Repeated: ${summaryCounts.repeated}, Supplementary: ${summaryCounts.supplementary}, Left: ${summaryCounts.left}`
      });

      alert(`Session Rollover completed successfully!\n\n${processedCount} student records processed for ${targetYear}.`);
      if (onPromotionComplete) onPromotionComplete();
      onClose();
    } catch (err) {
      console.error("Session rollover failed:", err);
      alert("Session rollover error: " + err.message);
    } finally {
      setIsCommitting(false);
      setCommitProgress(null);
    }
  };

  if (!isOpen) return null;

  const schoolName = SCHOOLS.find(s => s.id === selectedSchool)?.name || selectedSchool;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: 16
    }}>
      <div style={{
        width: '100%',
        maxWidth: 1050,
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        borderRadius: 16,
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
        border: '1px solid var(--border-light)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-secondary)'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>🎓 Year-End Bulk Promotion & Session Rollover</h2>
              <span className="badge" style={{ backgroundColor: 'rgba(191, 87, 0, 0.1)', color: 'var(--brand-orange)', fontSize: 12 }}>
                {schoolName}
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              Idempotent session rollover: promotes students to the next academic session while preserving 100% of historical records.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isCommitting}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 6 }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Owner Authorization Guard Banner */}
        {!canExecute && (
          <div style={{
            margin: 16,
            padding: 14,
            borderRadius: 10,
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--danger)',
            color: 'var(--danger)',
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}>
            <ShieldAlert size={22} />
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              Access Restricted: Year-End Bulk Promotion and Session Rollover can only be committed by the Group Owner or Director.
            </div>
          </div>
        )}

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* Top Configuration Controls */}
          <div className="grid-responsive" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, backgroundColor: 'var(--bg-secondary)', padding: 16, borderRadius: 14 }}>
            <div>
              <label className="form-label" style={{ fontWeight: 700, fontSize: 12 }}>Source Academic Year</label>
              <select
                className="form-input"
                value={sourceYear}
                onChange={e => setSourceYear(e.target.value)}
                disabled={step === 'preview' || isCommitting}
              >
                {academicYearsList.map(y => (
                  <option key={y.id} value={y.id}>{y.name} ({y.id})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 700, fontSize: 12 }}>Target Academic Year (Destination)</label>
              <select
                className="form-input"
                value={targetYear}
                onChange={e => setTargetYear(e.target.value)}
                disabled={step === 'preview' || isCommitting}
                style={{ borderColor: 'var(--brand-orange)' }}
              >
                {academicYearsList.map(y => (
                  <option key={y.id} value={y.id}>{y.name} ({y.id})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 700, fontSize: 12 }}>Filter by Current Class</label>
              <select
                className="form-input"
                value={selectedClassFilter}
                onChange={e => setSelectedClassFilter(e.target.value)}
                disabled={step === 'preview' || isCommitting}
              >
                <option value="ALL">All Classes ({students.length})</option>
                {classes.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 700, fontSize: 12 }}>Search Student</label>
              <input
                type="text"
                className="form-input"
                placeholder="Search name, roll, father..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                disabled={step === 'preview' || isCommitting}
              />
            </div>
          </div>

          {/* STEP 1: SELECT & DECIDE */}
          {step === 'select' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>
                  Showing {filteredStudents.length} Students in Scope
                </span>
                
                {/* Batch Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleBulkSetAction('PROMOTED')}
                    style={{ fontSize: 12, padding: '6px 12px' }}
                  >
                    🟢 Set All as Promoted
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleBulkSetAction('REPEATED')}
                    style={{ fontSize: 12, padding: '6px 12px' }}
                  >
                    🔴 Set All as Repeat
                  </button>
                </div>
              </div>

              {isLoadingStudents ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                  Loading students for {schoolName}...
                </div>
              ) : filteredStudents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: 12 }}>
                  No active students found matching the selected class filter or search.
                </div>
              ) : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--border-light)', borderRadius: 12 }}>
                  <table className="modern-table" style={{ fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Current Class</th>
                        <th>Roll</th>
                        <th style={{ minWidth: 170 }}>Promotion Action</th>
                        <th style={{ minWidth: 150 }}>Target Class</th>
                        <th style={{ minWidth: 120 }}>Target Sec</th>
                        <th style={{ minWidth: 80 }}>Target Roll</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map(student => {
                        const dec = decisions[student.id] || { action: 'PROMOTED', targetClass: getNextClass(student.class), targetSection: student.section || 'Section A', targetRoll: student.roll || '' };
                        const isLeft = dec.action === 'LEFT';

                        return (
                          <tr key={student.id} style={{ opacity: isLeft ? 0.6 : 1 }}>
                            <td>
                              <div style={{ fontWeight: 700 }}>{student.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>F: {student.fatherName || 'N/A'}</div>
                            </td>
                            <td>
                              <span className="badge" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                                {student.class} {student.section ? `(${student.section})` : ''}
                              </span>
                            </td>
                            <td>{student.roll || '—'}</td>
                            <td>
                              <select
                                className="form-input"
                                value={dec.action}
                                onChange={e => {
                                  const act = e.target.value;
                                  let nextCls = student.class;
                                  if (act === 'PROMOTED') nextCls = getNextClass(student.class);
                                  handleUpdateStudentDecision(student.id, {
                                    action: act,
                                    targetClass: nextCls
                                  });
                                }}
                                style={{
                                  padding: '6px 10px',
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: dec.action === 'PROMOTED' ? '#10b981' : dec.action === 'REPEATED' ? '#ef4444' : dec.action === 'SUPPLEMENTARY' ? '#f59e0b' : '#64748b'
                                }}
                              >
                                <option value="PROMOTED">🟢 Promoted (Pass)</option>
                                <option value="REPEATED">🔴 Failed / Repeat</option>
                                <option value="SUPPLEMENTARY">🟡 Supplementary</option>
                                <option value="LEFT">⚪ Left / TC Issued</option>
                              </select>
                            </td>
                            <td>
                              {isLeft ? (
                                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>Will be marked Left</span>
                              ) : (
                                <select
                                  className="form-input"
                                  value={dec.targetClass}
                                  onChange={e => handleUpdateStudentDecision(student.id, { targetClass: e.target.value })}
                                  style={{ padding: '6px 10px', fontSize: 12 }}
                                >
                                  {classes.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td>
                              {!isLeft && (
                                <select
                                  className="form-input"
                                  value={dec.targetSection || student.section || 'Section A'}
                                  onChange={e => handleUpdateStudentDecision(student.id, { targetSection: e.target.value })}
                                  style={{ padding: '6px 8px', fontSize: 12 }}
                                >
                                  {sections.map(sec => (
                                    <option key={sec} value={sec}>{sec}</option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td>
                              {!isLeft && (
                                <input
                                  type="text"
                                  className="form-input"
                                  value={dec.targetRoll !== undefined ? dec.targetRoll : (student.roll || '')}
                                  onChange={e => handleUpdateStudentDecision(student.id, { targetRoll: e.target.value })}
                                  style={{ padding: '6px 8px', fontSize: 12, width: 70 }}
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: DRY-RUN PREVIEW */}
          {step === 'preview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Summary Cards */}
              <div className="grid-responsive" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <div style={{ padding: 14, textAlign: 'center', borderRadius: 10, border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-secondary)' }}>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{summaryCounts.total}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Total in Scope</div>
                </div>
                <div style={{ padding: 14, textAlign: 'center', borderRadius: 10, border: '1px solid rgba(16, 185, 129, 0.3)', backgroundColor: 'rgba(16, 185, 129, 0.08)' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#10b981' }}>{summaryCounts.promoted}</div>
                  <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>Promoted to Next Class</div>
                </div>
                <div style={{ padding: 14, textAlign: 'center', borderRadius: 10, border: '1px solid rgba(239, 68, 68, 0.3)', backgroundColor: 'rgba(239, 68, 68, 0.08)' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#ef4444' }}>{summaryCounts.repeated}</div>
                  <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>Failed / Repeat Class</div>
                </div>
                <div style={{ padding: 14, textAlign: 'center', borderRadius: 10, border: '1px solid rgba(245, 158, 11, 0.3)', backgroundColor: 'rgba(245, 158, 11, 0.08)' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#f59e0b' }}>{summaryCounts.supplementary}</div>
                  <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>Supplementary / Back</div>
                </div>
                <div style={{ padding: 14, textAlign: 'center', borderRadius: 10, border: '1px solid rgba(100, 116, 139, 0.3)', backgroundColor: 'rgba(100, 116, 139, 0.08)' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#64748b' }}>{summaryCounts.left}</div>
                  <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Left / TC Issued</div>
                </div>
              </div>

              {/* Safeguards & Verification Notice */}
              <div style={{ padding: 16, borderRadius: 12, backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle size={18} color="#10b981" />
                  Protection Guarantees Before Commit:
                </div>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <li><strong>Historical Immutability:</strong> Previous enrollments in <code>{sourceYear}</code>, past fee records, receipts, attendance logs, and marks will <strong>NOT</strong> be modified or deleted.</li>
                  <li><strong>Idempotency:</strong> Every target enrollment uses a deterministic ID (<code>{selectedSchool}_{targetYear}_[studentId]</code>). Running this again will update safely without duplicating records.</li>
                  <li><strong>School Scoping:</strong> Strictly operates on <strong>{schoolName}</strong> only.</li>
                </ul>
              </div>

              {/* Optional Fee Generation Toggle (Default: OFF) */}
              <div style={{ padding: 16, borderRadius: 12, border: '1px solid var(--border-light)', backgroundColor: generateFees ? 'rgba(191, 87, 0, 0.08)' : 'var(--bg-secondary)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={generateFees}
                    onChange={e => setGenerateFees(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: 'var(--brand-orange)' }}
                  />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      Generate initial fee charges schedule for {targetYear} (Optional)
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      If unchecked, fees will only be initialized when you save class fee configurations or manually collect fees.
                    </div>
                  </div>
                </label>
              </div>

              {commitProgress && (
                <div style={{ padding: 12, textAlign: 'center', color: 'var(--brand-orange)', fontWeight: 600, fontSize: 13, backgroundColor: 'rgba(191, 87, 0, 0.1)', borderRadius: 8 }}>
                  {commitProgress}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer Navigation */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-secondary)'
        }}>
          <div>
            {step === 'preview' && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setStep('select')}
                disabled={isCommitting}
              >
                ← Back to Adjustments
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isCommitting}
            >
              Cancel
            </button>

            {step === 'select' ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  if (filteredStudents.length === 0) {
                    alert("No students in current view to preview.");
                    return;
                  }
                  if (sourceYear === targetYear) {
                    alert("Source Academic Year and Target Academic Year must be different.");
                    return;
                  }
                  setStep('preview');
                }}
                disabled={filteredStudents.length === 0}
              >
                Dry-Run Preview →
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary"
                onClick={handleCommitRollover}
                disabled={!canExecute || isCommitting}
                style={{ backgroundColor: 'var(--brand-orange)', borderColor: 'var(--brand-orange)', fontWeight: 700 }}
              >
                {isCommitting ? 'Committing...' : `Commit Rollover (${summaryCounts.total} Students)`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

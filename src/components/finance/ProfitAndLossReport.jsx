import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Filter } from 'lucide-react';

export default function ProfitAndLossReport({ selectedSchool, dict }) {
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState('this_month'); // today, this_month, prev_month, current_year, custom
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  
  const [financials, setFinancials] = useState({
    totalIncome: 0,
    totalExpenses: 0,
    netProfit: 0,
    incomeBreakdown: {},
    expenseBreakdown: {},
    monthlyData: []
  });

  const getDateRange = () => {
    const now = new Date();
    let start, end;
    
    if (period === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (period === 'this_month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (period === 'prev_month') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else if (period === 'current_year') {
      // Assuming Academic Year starts in April
      const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      start = new Date(startYear, 3, 1);
      end = new Date(startYear + 1, 2, 31, 23, 59, 59, 999);
    } else if (period === 'custom') {
      start = customStart ? new Date(customStart) : new Date(now.getFullYear(), now.getMonth(), 1);
      end = customEnd ? new Date(customEnd) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      if (customEnd) {
        end.setHours(23, 59, 59, 999);
      }
    }
    
    return { start, end };
  };

  const fetchFinancials = async () => {
    setIsLoading(true);
    try {
      const { start, end } = getDateRange();
      const startDateStr = start.toISOString();
      const endDateStr = end.toISOString();

      let incomeTotal = 0;
      let expensesTotal = 0;
      const incBreakdown = { Tuition: 0, Transport: 0, Admission: 0, Other: 0 };
      const expBreakdown = {};
      const monthlyMap = {}; 
      const monthNames = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
      
      // Initialize monthly map for chart
      monthNames.forEach(m => {
        monthlyMap[m] = { month: m, Income: 0, Expenses: 0 };
      });

      // 1. Fetch Invoices (Income)
      const invoicesSnap = await getDocs(collection(db, 'invoices'));
      invoicesSnap.forEach(doc => {
        const data = doc.data();
        if (selectedSchool !== 'ALL' && data.schoolId !== selectedSchool) return;
        
        const d = new Date(data.date || data.createdAt);
        if (isNaN(d.getTime())) return;
        
        const amt = Number(data.amount) || 0;
        
        // Add to monthly chart if within Current Academic Year broadly (just mapping by month name)
        const mName = new Date(0, d.getMonth()).toLocaleString('en-US', { month: 'short' });
        if (monthlyMap[mName]) {
          monthlyMap[mName].Income += amt;
        }

        // Add to period totals if within range
        if (d >= start && d <= end) {
          incomeTotal += amt;
          
          // Classify breakdown
          if (data.feeComponents && Array.isArray(data.feeComponents)) {
            data.feeComponents.forEach(comp => {
              const compAmt = Number(comp.paid) || 0;
              const nameLower = (comp.name || '').toLowerCase();
              if (nameLower.includes('tuition')) {
                incBreakdown.Tuition += compAmt;
              } else if (nameLower.includes('transport')) {
                incBreakdown.Transport += compAmt;
              } else if (nameLower.includes('admission')) {
                incBreakdown.Admission += compAmt;
              } else {
                incBreakdown.Other += compAmt;
              }
            });
          } else {
            incBreakdown.Other += amt;
          }
        }
      });

      // 2. Fetch School Expenses (Expenses)
      try {
        const expensesSnap = await getDocs(collection(db, 'school_expenses'));
        expensesSnap.forEach(doc => {
          const data = doc.data();
          if (data.deleted || data.isDeleted || data.status === 'deleted') return;
          if (selectedSchool !== 'ALL' && data.schoolId !== selectedSchool) return;
          
          const d = new Date(data.expenseDate || data.createdAt);
          if (isNaN(d.getTime())) return;
          
          const amt = Number(data.amount) || 0;
          
          const mName = new Date(0, d.getMonth()).toLocaleString('en-US', { month: 'short' });
          if (monthlyMap[mName]) {
            monthlyMap[mName].Expenses += amt;
          }

          if (d >= start && d <= end) {
            expensesTotal += amt;
            const cat = data.category || 'Other';
            expBreakdown[cat] = (expBreakdown[cat] || 0) + amt;
          }
        });
      } catch (err) {
        console.warn('Failed to fetch school_expenses. Missing firestore.rules?', err);
      }

      // 3. Fetch Payroll (Expenses)
      const payrollSnap = await getDocs(collection(db, 'payroll'));
      payrollSnap.forEach(doc => {
        const data = doc.data();
        if (selectedSchool !== 'ALL' && data.schoolId !== selectedSchool) return;
        
        const mParts = (data.month || '').split('-');
        if (mParts.length !== 2) return;
        
        // Approximate date for payroll is end of the given month
        const d = new Date(Number(mParts[0]), Number(mParts[1]), 0);
        if (isNaN(d.getTime())) return;
        
        const amt = Number(data.netPay) || 0;
        
        const mName = new Date(0, d.getMonth()).toLocaleString('en-US', { month: 'short' });
        if (monthlyMap[mName]) {
          monthlyMap[mName].Expenses += amt;
        }

        if (d >= start && d <= end) {
          expensesTotal += amt;
          const cat = 'Salary/Staff Related';
          expBreakdown[cat] = (expBreakdown[cat] || 0) + amt;
        }
      });

      const netProfit = incomeTotal - expensesTotal;
      
      setFinancials({
        totalIncome: incomeTotal,
        totalExpenses: expensesTotal,
        netProfit,
        incomeBreakdown: incBreakdown,
        expenseBreakdown: expBreakdown,
        monthlyData: monthNames.map(m => monthlyMap[m])
      });
      
    } catch (err) {
      console.error('Error computing P&L:', err);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchFinancials();
  }, [selectedSchool, period, customStart, customEnd]);

  const { totalIncome, totalExpenses, netProfit, incomeBreakdown, expenseBreakdown, monthlyData } = financials;

  let profitStatus = 'BREAK-EVEN';
  let profitColor = 'var(--text-primary)';
  if (netProfit > 0) {
    profitStatus = 'NET PROFIT';
    profitColor = 'var(--success)';
  } else if (netProfit < 0) {
    profitStatus = 'NET LOSS';
    profitColor = 'var(--danger)';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Filter Bar */}
      <div className="glass-card" style={{ padding: '16px 24px', display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>Period</label>
          <select className="form-input" value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 200 }}>
            <option value="today">Today</option>
            <option value="this_month">This Month</option>
            <option value="prev_month">Previous Month</option>
            <option value="current_year">Current Academic Year</option>
            <option value="custom">Custom Date Range</option>
          </select>
        </div>
        
        {period === 'custom' && (
          <>
            <div>
              <label className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>Start Date</label>
              <input type="date" className="form-input" value={customStart} onChange={e => setCustomStart(e.target.value)} />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>End Date</label>
              <input type="date" className="form-input" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
            </div>
          </>
        )}
        
        <div>
          <label className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>Branch</label>
          <div style={{ padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6, fontWeight: 600, fontSize: 14 }}>
            {selectedSchool === 'ALL' ? 'All Branches' : selectedSchool}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="glass-card" style={{ padding: 40, textAlign: 'center' }}>Loading Profit & Loss Data...</div>
      ) : (
        <>
          {/* Top Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
            <div className="glass-card" style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8 }}>TOTAL INCOME</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--success)' }}>₹{totalIncome.toLocaleString()}</div>
            </div>
            <div className="glass-card" style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8 }}>TOTAL EXPENSES</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--danger)' }}>₹{totalExpenses.toLocaleString()}</div>
            </div>
            <div className="glass-card" style={{ padding: 24, textAlign: 'center', borderBottom: `4px solid ${profitColor}` }}>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8 }}>{profitStatus}</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: profitColor }}>₹{Math.abs(netProfit).toLocaleString()}</div>
            </div>
          </div>

          {/* Breakdown Area */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
            {/* Income Breakdown */}
            <div className="glass-card" style={{ padding: 24 }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: 16, borderBottom: '1px solid var(--border-light)', paddingBottom: 8 }}>Income Breakdown</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Object.entries(incomeBreakdown).filter(([_, amt]) => amt > 0).length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No income recorded for this period.</div>
                ) : (
                  Object.entries(incomeBreakdown)
                    .filter(([_, amt]) => amt > 0)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, amt]) => (
                      <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{cat}</span>
                        <span style={{ fontWeight: 700, color: 'var(--success)' }}>₹{amt.toLocaleString()}</span>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* Expenses Breakdown */}
            <div className="glass-card" style={{ padding: 24 }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: 16, borderBottom: '1px solid var(--border-light)', paddingBottom: 8 }}>Expense Breakdown</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Object.entries(expenseBreakdown).filter(([_, amt]) => amt > 0).length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No expenses recorded for this period.</div>
                ) : (
                  Object.entries(expenseBreakdown)
                    .filter(([_, amt]) => amt > 0)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, amt]) => (
                      <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{cat}</span>
                        <span style={{ fontWeight: 700, color: 'var(--danger)' }}>₹{amt.toLocaleString()}</span>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>

          {/* Monthly Chart */}
          <div className="glass-card" style={{ padding: 24 }}>
            <h3 style={{ margin: '0 0 24px 0', fontSize: 16 }}>Monthly Profit & Loss (Academic Year)</h3>
            <div style={{ height: 350 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                  <XAxis dataKey="month" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(val) => `₹${val/1000}k`} />
                  <Tooltip 
                    cursor={{ fill: 'var(--bg-secondary)', opacity: 0.4 }}
                    contentStyle={{ backgroundColor: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border-light)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    formatter={(value) => [`₹${value.toLocaleString()}`]}
                  />
                  <Legend wrapperStyle={{ paddingTop: 20 }} />
                  <Bar dataKey="Income" fill="#10b981" radius={[4, 4, 0, 0]} name="Total Income" maxBarSize={40} />
                  <Bar dataKey="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="Total Expenses" maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

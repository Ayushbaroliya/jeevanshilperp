export const PERMISSION_KEYS = {
  viewDashboardStats: { key: 'viewDashboardStats', label: 'Financial Stats & Revenue', desc: 'View collection stats, dues, revenue trends & financial charts' },
  viewStudents: { key: 'viewStudents', label: 'Student Directory & Records', desc: 'View student list, student profiles, and classes' },
  manageStudents: { key: 'manageStudents', label: 'Add / Edit / Remove Students', desc: 'Register new students, update student info or remove records' },
  recordPayments: { key: 'recordPayments', label: 'Record Fee Payments', desc: 'Collect student fee payments, generate vouchers and receipts' },
  viewInvoices: { key: 'viewInvoices', label: 'View Invoices & Due Fees', desc: 'Access unpaid fee lists, invoice history and due fee reports' },
  manageInvoices: { key: 'manageInvoices', label: 'Delete / Cancel Invoices', desc: 'Permission to alter, void, or delete fee invoice records' },
  adjustFees: { key: 'adjustFees', label: 'Adjust Fees & Penalties', desc: 'Reduce or waive student fees, penalties, and other charges with an audit reason' },
  academics: { key: 'academics', label: 'Academics & Class Attendance', desc: 'Mark student attendance, input subject exam scores & gradebook' },
  staffSalary: { key: 'staffSalary', label: 'Staff & Salary Management', desc: 'View employee salaries, process payouts & manage staff passwords' },
  settings: { key: 'settings', label: 'School Settings & System Rules', desc: 'Manage class fees, section structures, and access control settings' }
};

export const DEFAULT_ROLE_PERMISSIONS = {
  Administrator: {
    viewDashboardStats: true,
    viewStudents: true,
    manageStudents: true,
    recordPayments: true,
    viewInvoices: true,
    manageInvoices: true,
    adjustFees: true,
    academics: true,
    staffSalary: true,
    settings: true
  },
  Principal: {
    viewDashboardStats: false,
    viewStudents: true,
    manageStudents: true,
    recordPayments: false,
    viewInvoices: false,
    manageInvoices: false,
    adjustFees: false,
    academics: true,
    staffSalary: false,
    settings: true
  },
  Accountant: {
    viewDashboardStats: false,
    viewStudents: true,
    manageStudents: true,
    recordPayments: true,
    viewInvoices: true,
    manageInvoices: true,
    adjustFees: true,
    academics: false,
    staffSalary: false,
    settings: false
  },
  Teacher: {
    viewDashboardStats: false,
    viewStudents: true,
    manageStudents: true,
    recordPayments: false,
    viewInvoices: false,
    manageInvoices: false,
    adjustFees: false,
    academics: true,
    staffSalary: false,
    settings: false
  },
  'Senior Teacher': {
    viewDashboardStats: false,
    viewStudents: true,
    manageStudents: true,
    recordPayments: false,
    viewInvoices: false,
    manageInvoices: false,
    adjustFees: false,
    academics: true,
    staffSalary: false,
    settings: false
  },
  Peon: {
    viewDashboardStats: false, viewStudents: false, manageStudents: false, recordPayments: false, viewInvoices: false, manageInvoices: false, adjustFees: false, academics: false, staffSalary: false, settings: false
  },
  Driver: {
    viewDashboardStats: false, viewStudents: false, manageStudents: false, recordPayments: false, viewInvoices: false, manageInvoices: false, adjustFees: false, academics: false, staffSalary: false, settings: false
  },
  Watchman: {
    viewDashboardStats: false, viewStudents: false, manageStudents: false, recordPayments: false, viewInvoices: false, manageInvoices: false, adjustFees: false, academics: false, staffSalary: false, settings: false
  }
};

export const getUserPermissions = (user) => {
  if (!user) {
    return DEFAULT_ROLE_PERMISSIONS.Administrator;
  }
  const roleName = user.role || 'Administrator';
  const defaultPerms = DEFAULT_ROLE_PERMISSIONS[roleName] || DEFAULT_ROLE_PERMISSIONS.Administrator;
  
  if (user.customPermissions) {
    return { ...defaultPerms, ...user.customPermissions };
  }
  return defaultPerms;
};

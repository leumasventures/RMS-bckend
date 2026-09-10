/**
 * settingsController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles all business logic for the Settings module.
 * Covers: School Info, Grading & Domains, Classes & Arms,
 *         Attendance & Calendar, General Settings, Roles & Privileges,
 *         and Data Management.
 *
 * Depends on:
 *   • App.data          – global in-memory data store
 *   • saveAppData()     – persists App.data (localStorage / server)
 *   • toast(msg, type)  – UI notification helper
 *   • renderSettings()  – re-renders the full settings page
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   1.  SCHOOL INFO
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Reads and validates the School Info form, then persists.
 * Called by the form's onsubmit handler.
 * @param {Event} e  – the form submit event
 */
function saveSchoolInfo(e) {
  if (e) e.preventDefault();

  const name = _val('set-name').trim();
  if (!name) return toast('School name is required.', 'error');

  const session = _val('set-session').trim();
  if (!session) return toast('Current session is required (e.g. 2025/2026).', 'error');

  App.data.schoolInfo = {
    ...(App.data.schoolInfo || {}),
    name,
    address:        _val('set-address').trim(),
    logo:           _val('set-logo').trim(),
    session,
    term:           _val('set-term'),
    principal:      _val('set-principal').trim(),
    email:          _val('set-email').trim(),
    phone:          _val('set-phone').trim(),
    website:        _val('set-website').trim(),
    resumptionDate: _val('set-resumption'),
    announcements:  _val('set-announcements').trim(),
    motto:          _val('set-motto').trim(),
    updatedAt:      new Date().toISOString(),
  };

  _persist('School settings saved successfully.');
}


/* ═══════════════════════════════════════════════════════════════════════════
   2.  GRADING SCALE & DOMAIN ASSESSMENT
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Default Nigerian WAEC-aligned grading scale.
 * @returns {Array<{min, max, grade, remark, gpa}>}
 */
function defaultGradingScale() {
  return [
    { min: 75, max: 100, grade: 'A1', remark: 'Excellent',  gpa: 5.0 },
    { min: 70, max: 74,  grade: 'B2', remark: 'Very Good',  gpa: 4.0 },
    { min: 65, max: 69,  grade: 'B3', remark: 'Good',       gpa: 3.5 },
    { min: 60, max: 64,  grade: 'C4', remark: 'Credit',     gpa: 3.0 },
    { min: 55, max: 59,  grade: 'C5', remark: 'Credit',     gpa: 2.5 },
    { min: 50, max: 54,  grade: 'C6', remark: 'Credit',     gpa: 2.0 },
    { min: 45, max: 49,  grade: 'D7', remark: 'Pass',       gpa: 1.5 },
    { min: 40, max: 44,  grade: 'E8', remark: 'Weak Pass',  gpa: 1.0 },
    { min: 0,  max: 39,  grade: 'F9', remark: 'Fail',       gpa: 0.0 },
  ];
}

/**
 * Default domain assessment labels (1 = best).
 * @param {number} score 1–5
 * @returns {string}
 */
function getDefaultDomainLabel(score) {
  return ({ 1: 'Excellent', 2: 'Very Good', 3: 'Good', 4: 'Fair', 5: 'Poor' })[score] || '';
}

/**
 * Ensures App.data.gradingScale is initialised.
 */
function initGradingScale() {
  if (!App.data.gradingScale || !App.data.gradingScale.length) {
    App.data.gradingScale = defaultGradingScale();
  }
}

/**
 * Reads the grading table, domain label inputs, and score breakdown inputs,
 * validates them, then persists.
 */
function saveGradingAndDomains() {
  // ── Grading rows ─────────────────────────────────────────────────────────
  const rows   = document.querySelectorAll('#grading-table tbody tr');
  const scale  = [];
  let hasError = false;

  rows.forEach((row, idx) => {
    const inputs = row.querySelectorAll('input');
    const min    = Number(inputs[0].value);
    const max    = Number(inputs[1].value);
    const grade  = inputs[2].value.trim();
    const remark = inputs[3].value.trim();
    const gpa    = parseFloat(inputs[4].value);

    if (!grade) { hasError = true; return; }          // skip blank rows silently
    if (isNaN(min) || isNaN(max)) {
      toast(`Row ${idx + 1}: min/max must be numbers.`, 'error');
      hasError = true;
      return;
    }
    if (min > max) {
      toast(`Row ${idx + 1}: min (${min}) cannot exceed max (${max}).`, 'error');
      hasError = true;
      return;
    }
    scale.push({ min, max, grade, remark, gpa: isNaN(gpa) ? null : gpa });
  });

  if (hasError) return;
  if (!scale.length) return toast('At least one grading row is required.', 'error');

  // Check for overlapping ranges
  const sorted = [...scale].sort((a, b) => a.min - b.min);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].min <= sorted[i - 1].max) {
      return toast(
        `Overlapping grade ranges detected: ${sorted[i - 1].grade} and ${sorted[i].grade}.`,
        'error'
      );
    }
  }

  App.data.gradingScale = sorted.reverse(); // store high → low

  // ── Domain labels ────────────────────────────────────────────────────────
  App.data.domainLabels = {};
  [1, 2, 3, 4, 5].forEach(s => {
    const val = _val(`domain-label-${s}`).trim();
    App.data.domainLabels[s] = val || getDefaultDomainLabel(s);
  });

  // ── Score breakdown ──────────────────────────────────────────────────────
  const breakdown = {};
  let breakdownSum = 0;
  document.querySelectorAll('[data-breakdown]').forEach(inp => {
    const key = inp.dataset.breakdown;
    const val = parseInt(inp.value) || 0;
    breakdown[key]   = val;
    breakdownSum    += val;
  });

  if (breakdownSum !== 100) {
    return toast(`Score breakdown must sum to 100%. Current total: ${breakdownSum}%.`, 'error');
  }
  App.data.scoreBreakdown = breakdown;

  _persist('Grading scale & domain settings saved.');
}

/**
 * Appends a blank row to the grading scale table.
 */
function addGradingRow() {
  const tbody = document.querySelector('#grading-table tbody');
  if (!tbody) return;

  const row = document.createElement('tr');
  row.innerHTML = `
    <td><input type="number" min="0" max="100" style="${inputStyle('sm')}"></td>
    <td><input type="number" min="0" max="100" style="${inputStyle('sm')}"></td>
    <td><input maxlength="2"                   style="${inputStyle('sm')}"></td>
    <td><input                                 style="${inputStyle('sm')}"></td>
    <td><input type="number" step="0.1" min="0" max="5" placeholder="—" style="${inputStyle('sm')}"></td>
    <td><button onclick="removeGradingRow(this)" style="${btnStyle('danger','xs')}">×</button></td>
  `;
  tbody.appendChild(row);
}

/**
 * Removes the grading row that contains `btn`.
 * @param {HTMLButtonElement} btn
 */
function removeGradingRow(btn) {
  btn.closest('tr').remove();
}

/**
 * Recalculates and displays the current score-breakdown sum.
 */
function updateBreakdownSum() {
  const inputs = document.querySelectorAll('[data-breakdown]');
  let sum = 0;
  inputs.forEach(i => (sum += parseInt(i.value) || 0));

  const notice = document.getElementById('breakdown-sum-notice');
  if (!notice) return;

  if (sum === 100) {
    notice.style.color   = '#16a34a';
    notice.textContent   = '✓ Breakdown sums to 100%';
  } else {
    notice.style.color   = '#dc2626';
    notice.textContent   = `⚠ Current total: ${sum}% — must equal 100%`;
  }
}

/**
 * Looks up the grade string for a raw score using the stored grading scale.
 * @param {number} score
 * @returns {{ grade: string, remark: string, gpa: number|null } | null}
 */
function resolveGrade(score) {
  const scale = App.data.gradingScale || defaultGradingScale();
  return (
    scale.find(g => score >= g.min && score <= g.max) || null
  );
}


/* ═══════════════════════════════════════════════════════════════════════════
   3.  CLASSES & ARMS
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Prompts for a class name and adds it to App.data.classes.
 */
function addNewClass() {
  const name = prompt('Enter new class name (e.g. JSS 1, SSS 2):')?.trim();
  if (!name) return;

  App.data.classes = App.data.classes || [];
  if (App.data.classes.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    return toast('A class with that name already exists.', 'warning');
  }

  App.data.classes.push({ name, arms: [], createdAt: new Date().toISOString() });
  _persist('Class added.');
  renderClassesList();
}

/**
 * Deletes a class and all its associated arms after confirmation.
 * @param {string} className
 */
function deleteClass(className) {
  if (!confirm(`Delete class "${className}" and all related arms?\nThis cannot be undone.`)) return;

  App.data.classes = (App.data.classes || []).filter(c => c.name !== className);
  _persist('Class removed.');
  renderClassesList();
}

/**
 * Adds an arm to the given class.
 * @param {string} className
 */
function addArm(className) {
  const input = document.getElementById(`new-arm-${className}`);
  const arm   = input?.value.trim();
  if (!arm) return toast('Enter an arm name.', 'warning');

  const cls = (App.data.classes || []).find(c => c.name === className);
  if (!cls) return toast('Class not found.', 'error');

  cls.arms = cls.arms || [];
  if (cls.arms.some(a => a.toLowerCase() === arm.toLowerCase())) {
    return toast(`Arm "${arm}" already exists in ${className}.`, 'warning');
  }

  cls.arms.push(arm);
  input.value = '';
  _persist('Arm added.');
  renderClassesList();
}

/**
 * Removes a specific arm from a class.
 * @param {string} className
 * @param {string} arm
 */
function removeArm(className, arm) {
  const cls = (App.data.classes || []).find(c => c.name === className);
  if (!cls) return;

  cls.arms = (cls.arms || []).filter(a => a !== arm);
  _persist('Arm removed.');
  renderClassesList();
}


/* ═══════════════════════════════════════════════════════════════════════════
   4.  ATTENDANCE & SCHOOL CALENDAR
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Reads and validates all Attendance & Calendar tab fields, then persists.
 */
function saveAttendanceSettings() {
  const termStart = _val('att-term-start');
  const termEnd   = _val('att-term-end');

  if (termStart && termEnd && termStart > termEnd) {
    return toast('Term start date must be before term end date.', 'error');
  }

  const minPct = parseInt(_val('att-min-pct')) || 75;
  if (minPct < 0 || minPct > 100) {
    return toast('Minimum attendance percentage must be between 0 and 100.', 'error');
  }

  const workingDays = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
    .filter(day => document.getElementById(`wd-${day}`)?.checked);

  if (!workingDays.length) {
    return toast('At least one working day must be selected.', 'error');
  }

  App.data.attendanceSettings = {
    ...(App.data.attendanceSettings || {}),
    termStart,
    termEnd,
    expectedDays:           parseInt(_val('att-expected-days')) || null,
    workingDays,
    openTime:               _val('att-open-time')  || '07:30',
    closeTime:              _val('att-close-time') || '14:30',
    lateAfter:              _val('att-late-time')  || '08:00',
    minAttendancePct:       minPct,
    consecutiveAbsentAlert: parseInt(_val('att-absent-alert'))    || 3,
    lateMarkThreshold:      parseInt(_val('att-late-threshold'))  || 3,
    allowExcused:           _checked('att-allow-excused'),
    countExcusedAsPresent:  _checked('att-count-excused'),
    showOnReport:           _checked('att-show-on-report'),
    updatedAt:              new Date().toISOString(),
  };

  _persist('Attendance & calendar settings saved.');
}

/**
 * Adds a single special day to the calendar.
 * Validates uniqueness and required fields.
 */
function addSpecialDay() {
  const date  = _val('sd-date');
  const label = _val('sd-label').trim();
  const type  = _val('sd-type');

  if (!date)  return toast('Please select a date.',         'warning');
  if (!label) return toast('Please enter a description.',   'warning');

  _ensureAttendanceSettings();
  const days = App.data.attendanceSettings.specialDays;

  if (days.some(d => d.date === date)) {
    return toast('This date already has a special day entry.', 'warning');
  }

  days.push({ date, label, type, addedAt: new Date().toISOString() });
  _clearFields(['sd-date', 'sd-label']);
  toast('Special day added.', 'success');
  renderSpecialDaysList();
}

/**
 * Adds every date within a start–end range as special days.
 * Skips dates already present; reports how many were added.
 */
function addSpecialDayRange() {
  const start = _val('sd-range-start');
  const end   = _val('sd-range-end');
  const label = _val('sd-range-label').trim();
  const type  = _val('sd-range-type');

  if (!start || !end) return toast('Please select both start and end dates.', 'warning');
  if (start > end)    return toast('Start date must be before end date.', 'warning');
  if (!label)         return toast('Please enter a label for this range.', 'warning');

  _ensureAttendanceSettings();
  const days    = App.data.attendanceSettings.specialDays;
  const existing = new Set(days.map(d => d.date));
  const cursor   = new Date(start + 'T00:00');
  const endDate  = new Date(end   + 'T00:00');
  let added = 0;

  while (cursor <= endDate) {
    const iso = cursor.toISOString().substring(0, 10);
    if (!existing.has(iso)) {
      days.push({ date: iso, label, type, addedAt: new Date().toISOString() });
      existing.add(iso);
      added++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  _clearFields(['sd-range-start', 'sd-range-end', 'sd-range-label']);
  toast(`Added ${added} day${added !== 1 ? 's' : ''} to the calendar.`, 'success');
  renderSpecialDaysList();
}

/**
 * Removes the special day matching the given ISO date string.
 * @param {string} date  e.g. "2025-10-01"
 */
function removeSpecialDay(date) {
  if (!App.data.attendanceSettings?.specialDays) return;
  App.data.attendanceSettings.specialDays =
    App.data.attendanceSettings.specialDays.filter(d => d.date !== date);
  toast('Special day removed.', 'warning');
  renderSpecialDaysList();
}

/**
 * Clears all special days after confirmation.
 */
function clearSpecialDays() {
  if (!confirm('Remove ALL special days from the calendar? This cannot be undone.')) return;
  _ensureAttendanceSettings();
  App.data.attendanceSettings.specialDays = [];
  toast('All special days cleared.', 'warning');
  renderSpecialDaysList();
}

/**
 * Recalculates attendance percentages for all students.
 * Hooks into the attendance calculation engine.
 */
function recalculateAttendanceSummary() {
  if (!confirm('Recalculate attendance percentages for ALL students based on current calendar settings?')) return;

  const settings   = App.data.attendanceSettings || {};
  const records    = App.data.attendanceRecords  || [];
  const specialDays = new Set((settings.specialDays || []).map(d => d.date));
  const workingDays = settings.workingDays ||
    ['Monday','Tuesday','Wednesday','Thursday','Friday'];

  // Determine total expected school days between termStart and termEnd
  let expectedDays = settings.expectedDays;
  if (!expectedDays && settings.termStart && settings.termEnd) {
    expectedDays = _countWorkingDays(
      settings.termStart, settings.termEnd, workingDays, specialDays
    );
  }

  if (!expectedDays) {
    return toast('Cannot recalculate: no term dates or expected days configured.', 'error');
  }

  // Group records by student
  const byStudent = {};
  records.forEach(r => {
    if (!byStudent[r.studentId]) byStudent[r.studentId] = { present: 0, late: 0, excused: 0, absent: 0 };
    const bucket = byStudent[r.studentId];
    if (r.status === 'present')  bucket.present++;
    else if (r.status === 'late') bucket.late++;
    else if (r.status === 'excused') bucket.excused++;
    else bucket.absent++;
  });

  const lateThreshold = settings.lateMarkThreshold || 3;
  const countExcused  = settings.countExcusedAsPresent || false;

  App.data.attendanceSummary = {};
  Object.entries(byStudent).forEach(([id, counts]) => {
    const effectiveLateAbsents = Math.floor(counts.late / lateThreshold);
    const effectivePresent     = counts.present +
      (countExcused ? counts.excused : 0) +
      (counts.late - effectiveLateAbsents * lateThreshold); // remaining lates counted present
    const pct = expectedDays > 0
      ? Math.round((effectivePresent / expectedDays) * 100 * 10) / 10
      : 0;

    App.data.attendanceSummary[id] = {
      present: counts.present,
      late:    counts.late,
      excused: counts.excused,
      absent:  counts.absent,
      expectedDays,
      attendancePct:  pct,
      eligible:       pct >= (settings.minAttendancePct ?? 75),
      recalculatedAt: new Date().toISOString(),
    };
  });

  _persist('Attendance summaries recalculated.');
}

/**
 * Counts working school days between two ISO date strings.
 * @param {string}  start
 * @param {string}  end
 * @param {string[]} workingDays  e.g. ['Monday','Tuesday',...]
 * @param {Set<string>} specialDays  dates to exclude
 * @returns {number}
 */
function _countWorkingDays(start, end, workingDays, specialDays) {
  const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const cursor  = new Date(start + 'T00:00');
  const endDate = new Date(end   + 'T00:00');
  let count = 0;

  while (cursor <= endDate) {
    const iso  = cursor.toISOString().substring(0, 10);
    const name = DAY_NAMES[cursor.getDay()];
    if (workingDays.includes(name) && !specialDays.has(iso)) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}


/* ═══════════════════════════════════════════════════════════════════════════
   5.  GENERAL SETTINGS
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Reads all General Settings tab controls and persists.
 */
function saveGeneralSettings() {
  const maxScore = parseInt(_val('gen-max-score')) || 100;
  const passMark = parseInt(_val('gen-pass-mark')) || 40;

  if (passMark >= maxScore) {
    return toast('Pass mark must be less than the maximum score.', 'error');
  }

  const sessionTimeout = parseInt(_val('gen-session-timeout')) || 60;
  if (sessionTimeout < 5 || sessionTimeout > 480) {
    return toast('Session timeout must be between 5 and 480 minutes.', 'error');
  }

  App.data.generalSettings = {
    // Report card & display
    resultMode:        _val('gen-result-mode'),
    positionMode:      _val('gen-position-mode'),
    decimalPlaces:     parseInt(_val('gen-decimal-places')) ?? 1,
    reportFooter:      _val('gen-report-footer'),
    commentCharLimit:  parseInt(_val('gen-comment-limit')) || 150,
    showPhoto:         _checked('gen-show-photo'),
    showGPA:           _checked('gen-show-gpa'),
    showClassAvg:      _checked('gen-show-class-avg'),
    showDomain:        _checked('gen-show-domain'),
    showAttendance:    _checked('gen-show-attendance'),
    cumulativeResults: _checked('gen-cumulative-results'),
    // Score entry
    scoreEntryMode:    _val('gen-entry-mode'),
    maxScore,
    passMark,
    allowScoreEdit:    _checked('gen-allow-score-edit'),
    lockPublished:     _checked('gen-lock-published'),
    autoGrade:         _checked('gen-auto-grade'),
    validateRange:     _checked('gen-validate-range'),
    absentAutoZero:    _checked('gen-allow-absent-zero'),
    // Notifications
    notifyAbsent:      _checked('gen-notify-absent'),
    notifyLowScore:    _checked('gen-notify-low-score'),
    notifyFees:        _checked('gen-notify-fees'),
    notifyResults:     _checked('gen-notify-results'),
    notifyResumption:  _checked('gen-notify-resumption'),
    // Portal access
    portalParent:      _checked('gen-portal-parent'),
    portalStudent:     _checked('gen-portal-student'),
    portalTeacher:     _checked('gen-portal-teacher'),
    resultsPublic:     _checked('gen-results-public'),
    feesPortal:        _checked('gen-fees-portal'),
    timetablePublic:   _checked('gen-timetable-public'),
    // Locale
    dateFormat:        _val('gen-date-format'),
    currency:          _val('gen-currency') || '₦',
    locale:            _val('gen-locale'),
    yearStartMonth:    parseInt(_val('gen-year-start')) || 9,
    // System behaviour
    autoSave:          _checked('gen-auto-save'),
    confirmDelete:     _checked('gen-confirm-delete'),
    auditLog:          _checked('gen-audit-log'),
    darkMode:          _checked('gen-dark-mode'),
    compactTables:     _checked('gen-compact-tables'),
    printWatermark:    _checked('gen-print-watermark'),
    sessionTimeout,
    updatedAt:         new Date().toISOString(),
  };

  _persist('General settings saved.');

  // Apply dark mode immediately
  _applyDarkMode(App.data.generalSettings.darkMode);
}

/**
 * Applies or removes the dark-mode CSS class on <body>.
 * @param {boolean} enabled
 */
function _applyDarkMode(enabled) {
  document.body.classList.toggle('dark-mode', !!enabled);
}


/* ═══════════════════════════════════════════════════════════════════════════
   6.  ROLES & PRIVILEGES
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Reads the roles & privileges checkboxes and persists.
 * Structure: App.data.rolePermissions[roleName][permKey] = boolean
 */
function saveRolePermissions() {
  const ROLES = [
    'Admin', 'Principal', 'Vice Principal',
    'Teacher', 'Bursar', 'Parent', 'Student',
  ];
  const PERMISSIONS = [
    'canAccessSettings',
    'canEnterResults',
    'canTakeAttendance',
    'canViewAllReports',
    'canManageFees',
    'canViewOwnReports',
    'canPrintReports',
    'canManageUsers',
  ];

  const perms = {};
  ROLES.forEach(role => {
    perms[role] = {};
    PERMISSIONS.forEach(perm => {
      const id = `perm-${role.replace(/\s+/g, '-').toLowerCase()}-${perm}`;
      perms[role][perm] = document.getElementById(id)?.checked ?? false;
    });
    // Admin always has all permissions (enforced server-side too)
    if (role === 'Admin') {
      PERMISSIONS.forEach(p => (perms[role][p] = true));
    }
  });

  App.data.rolePermissions = perms;
  _persist('Role permissions saved.');
}

/**
 * Checks whether a user (by role) has a given permission.
 * @param {string} role
 * @param {string} perm
 * @returns {boolean}
 */
function hasPermission(role, perm) {
  if (role === 'Admin') return true;
  return App.data.rolePermissions?.[role]?.[perm] ?? false;
}


/* ═══════════════════════════════════════════════════════════════════════════
   7.  DATA MANAGEMENT
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Exports the full App.data object as a timestamped JSON file.
 */
function exportData() {
  const json     = JSON.stringify(App.data, null, 2);
  const blob     = new Blob([json], { type: 'application/json' });
  const filename = `school_backup_${_timestamp()}.json`;
  _triggerDownload(blob, filename);
  toast('Full data exported.', 'success');
}

/**
 * Exports students as a CSV file.
 */
function exportStudentsCSV() {
  const headers = ['Name', 'Admission No', 'Class', 'Arm', 'Gender', 'DOB'];
  const rows    = (App.data.students || []).map(s => [
    s.name, s.admissionNo, s.class, s.arm, s.gender, s.dob || '',
  ]);
  _downloadCSV([headers, ...rows], `students_${_timestamp()}.csv`);
  toast('Students exported.', 'success');
}

/**
 * Exports academic results as a CSV file.
 */
function exportResultsCSV() {
  const headers = ['Student', 'Admission No', 'Class', 'Subject', 'CA1', 'CA2', 'Exam', 'Total', 'Grade'];
  const rows    = (App.data.results || []).map(r => [
    r.studentName, r.admissionNo, r.class, r.subject,
    r.ca1 ?? '', r.ca2 ?? '', r.exam ?? '', r.total ?? '', r.grade ?? '',
  ]);
  _downloadCSV([headers, ...rows], `results_${_timestamp()}.csv`);
  toast('Results exported.', 'success');
}

/**
 * Reads a JSON backup file and merges it into App.data.
 * @param {File} file
 */
function handleImportJSON(file) {
  if (!file) return;
  _readFile(file, 'text', content => {
    let imported;
    try {
      imported = JSON.parse(content);
    } catch {
      return toast('Import failed — invalid JSON file.', 'error');
    }

    if (typeof imported !== 'object' || Array.isArray(imported)) {
      return toast('Import failed — JSON must be an object.', 'error');
    }

    if (!confirm('This will MERGE the imported data with current data.\n\nContinue?')) return;

    Object.assign(App.data, imported);
    _persist('Data imported from JSON backup.');
    renderSettings();
  });
}

/**
 * Reads a CSV file and imports students into App.data.students.
 * Required columns: name, class. Optional: admissionno, arm, gender, dob.
 * @param {File} file
 */
function handleImportStudentsCSV(file) {
  if (!file) return;
  _readFile(file, 'text', content => {
    try {
      const lines   = content.split('\n').map(l => l.trim()).filter(Boolean);
      if (!lines.length) return toast('CSV is empty.', 'error');

      const headers = _parseCSVRow(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ''));
      if (!headers.includes('name') || !headers.includes('class')) {
        return toast('CSV must include "name" and "class" columns.', 'error');
      }

      App.data.students = App.data.students || [];
      const existingNos = new Set(App.data.students.map(s => s.admissionNo).filter(Boolean));
      let added = 0, skipped = 0;

      for (let i = 1; i < lines.length; i++) {
        const vals = _parseCSVRow(lines[i]);
        const obj  = {};
        headers.forEach((h, idx) => (obj[h] = vals[idx]?.trim() || ''));

        if (!obj.name) { skipped++; continue; }

        const admNo = obj.admissionno || obj.admissionno || '';
        if (admNo && existingNos.has(admNo)) { skipped++; continue; }

        App.data.students.push({
          id:          `s_import_${Date.now()}_${i}`,
          name:        obj.name,
          admissionNo: admNo,
          class:       obj.class,
          arm:         obj.arm   || '',
          gender:      obj.gender || '',
          dob:         obj.dob   || '',
          importedAt:  new Date().toISOString(),
        });
        if (admNo) existingNos.add(admNo);
        added++;
      }

      _persist(`${added} student(s) imported, ${skipped} skipped.`);
    } catch (err) {
      console.error('CSV import error:', err);
      toast('CSV import failed — check file format.', 'error');
    }
  });
}

/**
 * Deletes all academic results after confirmation.
 */
function clearResults() {
  if (!confirm('Delete ALL academic results for the current session?\n\nThis cannot be undone.')) return;
  App.data.results = [];
  _persist('All academic results cleared.', 'warning');
}

/**
 * Deletes all attendance records after confirmation.
 */
function clearAttendance() {
  if (!confirm('Delete ALL attendance records?\n\nThis cannot be undone.')) return;
  App.data.attendanceRecords = [];
  App.data.attendanceSummary = {};
  _persist('Attendance records cleared.', 'warning');
}

/**
 * Full database reset — triple-confirmation required.
 */
function resetAllData() {
  if (!confirm(
    'PERMANENTLY DELETE ALL school data?\n\n' +
    'Students, results, attendance, classes, teachers, and all records will be lost.\n\n' +
    'Continue?'
  )) return toast('Reset cancelled.', 'info');

  const phrase = prompt('Type exactly:\n\n   RESET DATABASE NOW\n\n(case-sensitive)');
  if (phrase !== 'RESET DATABASE NOW') return toast('Reset aborted — phrase did not match.', 'warning');

  if (!confirm('Last chance. This CANNOT be undone.\n\nProceed with full reset?')) {
    return toast('Reset cancelled.', 'info');
  }

  try {
    App.data = {
      students:           [],
      results:            [],
      attendanceRecords:  [],
      attendanceSummary:  {},
      attendance:         [],
      remarks:            [],
      classes:            [],
      teachers:           [],
      domainAssessments:  [],
      users:              App.data.users      || [],   // preserve user accounts
      schoolInfo:         App.data.schoolInfo || {},   // preserve basic school info
      gradingScale:       defaultGradingScale(),
      domainLabels:       {},
      scoreBreakdown:     { 'CA 1': 10, 'CA 2': 10, 'Exam': 80 },
      attendanceSettings: {},
      generalSettings:    {},
      rolePermissions:    {},
      resetAt:            new Date().toISOString(),
    };

    saveAppData?.();
    toast('Full database reset completed.', 'warning');
    renderSettings();
  } catch (err) {
    console.error('Reset failed:', err);
    toast('Reset failed — see console for details.', 'error');
  }
}


/* ═══════════════════════════════════════════════════════════════════════════
   8.  TAB NAVIGATION
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Activates the given settings tab and deactivates all others.
 * @param {string} tabId  e.g. 'school' | 'grading' | 'classes' | etc.
 */
function showSettingsTab(tabId) {
  document.querySelectorAll('.settings-tab').forEach(t => (t.style.display = 'none'));
  document.querySelectorAll('.settings-tab-btn').forEach(b => {
    b.style.color            = '#64748b';
    b.style.borderBottomColor = 'transparent';
  });

  const tabEl = document.getElementById(`tab-${tabId}`);
  const btnEl = document.getElementById(`stab-${tabId}`);
  if (tabEl) tabEl.style.display = 'block';
  if (btnEl) {
    btnEl.style.color            = '#1e40af';
    btnEl.style.borderBottomColor = '#1e40af';
  }

  // Lazy-render sub-views on first activation
  if (tabId === 'classes')    renderClassesList();
  if (tabId === 'attendance') renderSpecialDaysList();
  if (tabId === 'grading')    updateBreakdownSum();
}


/* ═══════════════════════════════════════════════════════════════════════════
   9.  RENDER HELPERS
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Re-renders the special days list panel.
 */
function renderSpecialDaysList() {
  const container = document.getElementById('special-days-list');
  if (!container) return;

  const days = [...(App.data.attendanceSettings?.specialDays || [])]
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!days.length) {
    container.innerHTML = '<p style="color:#9ca3af; text-align:center; padding:1.5rem;">No special days added yet.</p>';
    return;
  }

  const TYPE_COLORS = {
    holiday:  '#fee2e2:#dc2626',
    'half-day':'#fef9c3:#b45309',
    break:    '#ffedd5:#ea580c',
    exam:     '#dbeafe:#1d4ed8',
    closed:   '#f1f5f9:#475569',
    event:    '#dcfce7:#16a34a',
    sports:   '#ede9fe:#7c3aed',
    custom:   '#f1f5f9:#64748b',
  };
  const TYPE_ICONS = {
    holiday:'🔴', 'half-day':'🟡', break:'🟠', exam:'🔵',
    closed:'⚫', event:'🟢', sports:'🟣', custom:'⚪',
  };

  // Group by month
  const byMonth = {};
  days.forEach(d => {
    const key = d.date.substring(0, 7);
    (byMonth[key] = byMonth[key] || []).push(d);
  });

  container.innerHTML = `
    <div style="max-height:400px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:8px;">
      ${Object.entries(byMonth).map(([month, mDays]) => `
        <div style="padding:0.5rem 0.75rem; background:#f8fafc; border-bottom:1px solid #e2e8f0;
                    font-weight:600; font-size:0.82rem; color:#475569; position:sticky; top:0;">
          ${new Date(month + '-01').toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })}
          <span style="font-weight:400; margin-left:0.5rem;">(${mDays.length})</span>
        </div>
        ${mDays.map(d => {
          const [bg, fg] = (TYPE_COLORS[d.type] || TYPE_COLORS.custom).split(':');
          const dateStr  = new Date(d.date + 'T00:00')
            .toLocaleDateString('en-NG', { weekday:'short', day:'numeric', month:'short' });
          return `
            <div style="display:flex; align-items:center; gap:0.75rem; padding:0.6rem 0.75rem;
                        border-bottom:1px solid #f1f5f9; font-size:0.88rem;">
              <span style="background:${bg}; color:${fg}; padding:0.2rem 0.6rem; border-radius:999px;
                           font-size:0.78rem; white-space:nowrap; min-width:90px; text-align:center;">
                ${TYPE_ICONS[d.type] || '⚪'} ${d.type}
              </span>
              <span style="font-weight:600; min-width:90px; color:#334155;">${dateStr}</span>
              <span style="flex:1; color:#475569;">${_esc(d.label)}</span>
              <button onclick="settingsController.removeSpecialDay('${d.date}')"
                style="border:none; background:none; color:#ef4444; cursor:pointer;
                       font-size:1.1rem; line-height:1; padding:0.2rem;">×</button>
            </div>
          `;
        }).join('')}
      `).join('')}
    </div>
    <div style="margin-top:0.5rem; font-size:0.82rem; color:#64748b; text-align:right;">
      Total: <strong>${days.length}</strong> special day(s) configured
    </div>
  `;
}

/**
 * Re-renders the classes & arms panel.
 */
function renderClassesList() {
  const container = document.getElementById('classes-list');
  if (!container) return;

  const classes = App.data.classes || [];
  if (!classes.length) {
    container.innerHTML = '<p style="color:#9ca3af; text-align:center; padding:2rem;">No classes defined yet.</p>';
    return;
  }

  container.innerHTML = classes.map(cls => `
    <div style="border:1px solid #e2e8f0; border-radius:8px; padding:1rem; margin-bottom:1rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
        <strong style="font-size:1.05rem;">${_esc(cls.name)}</strong>
        <button onclick="settingsController.deleteClass('${_esc(cls.name)}')"
          style="${btnStyle('danger','sm')}">Delete Class</button>
      </div>
      <strong style="font-size:0.85rem; color:#64748b;">Arms / Sections:</strong>
      <div style="display:flex; flex-wrap:wrap; gap:0.5rem; margin-top:0.5rem;">
        ${(cls.arms || []).map(arm => `
          <span style="background:#e0f2fe; padding:0.3rem 0.7rem; border-radius:999px;
                       font-size:0.88rem; display:flex; align-items:center; gap:0.4rem;">
            ${_esc(arm)}
            <button onclick="settingsController.removeArm('${_esc(cls.name)}','${_esc(arm)}')"
              style="border:none;background:none;color:#ef4444;font-size:1rem;line-height:1;cursor:pointer;padding:0;">×</button>
          </span>
        `).join('') || '<span style="color:#9ca3af; font-size:0.85rem;">No arms defined</span>'}
      </div>
      <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.75rem;">
        <input id="new-arm-${_esc(cls.name)}" placeholder="Arm name (e.g. A)"
          style="${inputStyle('sm')}; width:160px;">
        <button onclick="settingsController.addArm('${_esc(cls.name)}')"
          style="${btnStyle('success','sm')}">+ Add Arm</button>
      </div>
    </div>
  `).join('');
}


/* ═══════════════════════════════════════════════════════════════════════════
   10.  PRIVATE UTILITIES
═══════════════════════════════════════════════════════════════════════════ */

/** Reads an input's value by element ID. */
function _val(id) {
  return document.getElementById(id)?.value ?? '';
}

/** Reads a checkbox's checked state by element ID. */
function _checked(id) {
  return document.getElementById(id)?.checked ?? false;
}

/** Clears the value of multiple input elements by ID. */
function _clearFields(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

/** Saves App.data and shows a success toast. */
function _persist(msg, type = 'success') {
  saveAppData?.();
  toast(msg, type);
}

/** Ensures attendanceSettings and its specialDays array exist. */
function _ensureAttendanceSettings() {
  App.data.attendanceSettings            = App.data.attendanceSettings            || {};
  App.data.attendanceSettings.specialDays = App.data.attendanceSettings.specialDays || [];
}

/** HTML-escapes a value. */
function _esc(val) {
  if (val == null) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Returns a YYYYMMDD_HHmmss timestamp string for filenames. */
function _timestamp() {
  return new Date().toISOString().replace(/[-:T]/g, '').substring(0, 15);
}

/** Triggers a browser file download from a Blob. */
function _triggerDownload(blob, filename) {
  const a  = document.createElement('a');
  a.href   = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Converts a 2-D array to CSV and triggers download. */
function _downloadCSV(rows, filename) {
  const csv  = rows
    .map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  _triggerDownload(blob, filename);
}

/** Reads a File object as text, then calls callback(content). */
function _readFile(file, mode, callback) {
  const reader = new FileReader();
  reader.onload = e => callback(e.target.result);
  reader.onerror = () => toast('Failed to read file.', 'error');
  if (mode === 'text') reader.readAsText(file);
  else                 reader.readAsDataURL(file);
}

/**
 * Parses a single CSV row, handling quoted fields.
 * @param {string} line
 * @returns {string[]}
 */
function _parseCSVRow(line) {
  const result = [];
  let current  = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/* ── Style helpers (mirrors renderSettings.js for standalone use) ── */
function labelStyle() {
  return 'display:block; font-size:0.82rem; font-weight:600; color:#475569; margin-bottom:0.35rem;';
}
function inputStyle(size) {
  const pad = size === 'sm' ? '0.35rem 0.6rem' : '0.55rem 0.85rem';
  const fz  = size === 'sm' ? '0.82rem'         : '0.9rem';
  return `width:100%; padding:${pad}; font-size:${fz}; border:1.5px solid #d1d5db;
          border-radius:6px; outline:none; box-sizing:border-box; transition:border-color .15s;`;
}
function btnStyle(variant, size) {
  const pad = size === 'xs' ? '0.25rem 0.6rem'  :
              size === 'sm' ? '0.4rem 0.85rem'   : '0.6rem 1.25rem';
  const fz  = size === 'xs' ? '0.78rem' : size === 'sm' ? '0.82rem' : '0.9rem';
  const base = `padding:${pad}; font-size:${fz}; font-weight:600; border:none;
                border-radius:7px; cursor:pointer; display:inline-flex;
                align-items:center; gap:0.4rem; transition:opacity .15s;`;
  const map = {
    primary:  'background:#2563eb; color:#fff;',
    secondary:'background:#f1f5f9; color:#334155; border:1.5px solid #d1d5db;',
    success:  'background:#16a34a; color:#fff;',
    danger:   'background:#ef4444; color:#fff;',
    outline:  'background:#fff; color:#2563eb; border:1.5px solid #2563eb;',
  };
  return base + (map[variant] || map.secondary);
}


/* ═══════════════════════════════════════════════════════════════════════════
   11.  PUBLIC API — exposed as a single namespace object
═══════════════════════════════════════════════════════════════════════════ */

const settingsController = {
  // School info
  saveSchoolInfo,

  // Grading
  defaultGradingScale,
  getDefaultDomainLabel,
  initGradingScale,
  saveGradingAndDomains,
  addGradingRow,
  removeGradingRow,
  updateBreakdownSum,
  resolveGrade,

  // Classes
  addNewClass,
  deleteClass,
  addArm,
  removeArm,

  // Attendance
  saveAttendanceSettings,
  addSpecialDay,
  addSpecialDayRange,
  removeSpecialDay,
  clearSpecialDays,
  recalculateAttendanceSummary,

  // General
  saveGeneralSettings,

  // Roles
  saveRolePermissions,
  hasPermission,

  // Data management
  exportData,
  exportStudentsCSV,
  exportResultsCSV,
  handleImportJSON,
  handleImportStudentsCSV,
  clearResults,
  clearAttendance,
  resetAllData,

  // Navigation & render
  showSettingsTab,
  renderSpecialDaysList,
  renderClassesList,
};

// Also expose each method globally so inline onclick="..." HTML still works
Object.entries(settingsController).forEach(([key, fn]) => {
  if (typeof fn === 'function') window[key] = fn;
});
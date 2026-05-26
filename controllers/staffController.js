'use strict';
const db = require('../config/db');
const fail = (res, s, m) => res.status(s).json({ success: false, message: m });
const ok   = (res, data, meta = {}, s = 200) => res.status(s).json({ success: true, ...meta, data });

async function generateStaffId() {
  const rows = await db.query('SELECT id FROM staff');
  const existing = new Set(rows.map(s => s.id));
  let n = existing.size + 1, id;
  do { id = `S${String(n).padStart(3, '0')}`; n++; } while (existing.has(id));
  return id;
}

const parseStaff = (row) => ({
  ...row,
  assignments: row.assignments ? (typeof row.assignments === 'string' ? JSON.parse(row.assignments) : row.assignments) : [],
  tasks:       row.tasks       ? (typeof row.tasks === 'string'       ? JSON.parse(row.tasks)       : row.tasks)       : [],
  credentials: row.credentials ? (typeof row.credentials === 'string' ? JSON.parse(row.credentials) : row.credentials) : [],
  classUnit:   row.class_name  || '',
  class:       row.class_name  || '',
  dateJoined:  row.date_joined || '',
});

exports.getAll = async (req, res) => {
  try {
    const { category, status, department, subject, search } = req.query;
    let sql = `SELECT st.*, c.name AS class_name FROM staff st LEFT JOIN classes c ON c.id=st.class_id WHERE 1=1`;
    const p = [];
    if (category)   { sql += ' AND st.category=?';  p.push(category); }
    if (status)     { sql += ' AND st.status=?';     p.push(status); }
    if (department) { sql += ' AND st.department=?'; p.push(department); }
    if (subject)    { sql += ' AND st.subject=?';    p.push(subject); }
    if (search)     { sql += ' AND (st.name LIKE ? OR st.position LIKE ? OR st.subject LIKE ?)';
                      p.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    sql += ' ORDER BY st.name';
    const rows = await db.query(sql, p);
    return ok(res, rows.map(parseStaff), { count: rows.length });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.getOne = async (req, res) => {
  try {
    const row = await db.query1(
      `SELECT st.*, c.name AS class_name FROM staff st LEFT JOIN classes c ON c.id=st.class_id WHERE st.id=?`,
      [req.params.id]);
    if (!row) return fail(res, 404, 'Staff not found.');
    return ok(res, parseStaff(row));
  } catch (e) { return fail(res, 500, e.message); }
};


exports.create = async (req, res) => {
  try {
    const { name, category, position, email, gender, phone, date_joined,
            status = 'Active', department, subject, qualification, experience,
            notes, id: rawId, classUnit, arm,
            assignments, tasks } = req.body ?? {};
    if (!name)     return fail(res, 400, 'name is required.');
    if (!category) return fail(res, 400, 'category is required.');
    if (!position) return fail(res, 400, 'position is required.');

    const id = rawId || await generateStaffId();
    const exists = await db.query1('SELECT id FROM staff WHERE id=?', [id]);
    if (exists) return fail(res, 409, `Staff ID "${id}" already exists.`);
    if (email) {
      const emailEx = await db.query1('SELECT id FROM staff WHERE email=?', [email]);
      if (emailEx) return fail(res, 409, 'Email already in use.');
    }

    // Resolve primary class_id from first assignment or legacy classUnit
    let classId = null;
    const primaryClass = (Array.isArray(assignments) && assignments[0]?.cls !== 'N/A')
      ? assignments[0]?.cls : (classUnit && classUnit !== 'N/A' ? classUnit : null);
    const primaryArm   = (Array.isArray(assignments) && assignments[0]?.arm !== 'N/A')
      ? assignments[0]?.arm : (arm && arm !== 'N/A' ? arm : null);
    const primarySubject = (Array.isArray(assignments) && assignments[0]?.subject !== 'N/A')
      ? assignments[0]?.subject : (subject || null);

    if (primaryClass) {
      const cls = await db.query1('SELECT id FROM classes WHERE name=?', [primaryClass]);
      classId = cls?.id || null;
    }

    const assignmentsJson = assignments ? JSON.stringify(assignments) : null;
    const tasksJson       = tasks       ? JSON.stringify(tasks)       : null;

    await db.run(
      `INSERT INTO staff (id, name, category, position, email, gender, phone, date_joined,
        status, department, subject, qualification, experience, notes, class_id, arm,
        assignments, tasks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, category, position, email || null, gender || null, phone || null,
       date_joined || null, status, department || null, primarySubject || null,
       qualification || null, experience || null, notes || null,
       classId, primaryArm || null, assignmentsJson, tasksJson]
    );

    const saved = await db.query1(
      `SELECT st.*, c.name AS class_name FROM staff st LEFT JOIN classes c ON c.id=st.class_id WHERE st.id=?`,
      [id]
    );

    const staff = {
      id, name, category, position, email, gender, phone,
      dateJoined: date_joined, status, department,
      subject: primarySubject,
      qualification, experience, notes,
      classUnit: saved?.class_name || '', class: saved?.class_name || '',
      assignedClass: saved?.class_name || '',
      arm: saved?.arm || '', assignedArm: saved?.arm || '',
      assignments: assignments || [],
      tasks:       tasks       || [],
      credentials: []
    };
    db.staff.push(staff);
    if (['Academic', 'Leadership'].includes(category)) db.teachers.push(staff);

    return ok(res, staff, {}, 201);
  } catch (e) { return fail(res, 500, e.message); }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await db.query1('SELECT * FROM staff WHERE id=?', [id]);
    if (!row) return fail(res, 404, 'Staff not found.');

    const fields = ['name','category','position','email','gender','phone','date_joined',
                    'status','department','subject','qualification','experience','notes'];
    const updates = []; const values = [];
    fields.forEach(f => {
      if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); }
    });

    // Handle assignments and tasks as JSON
    if (req.body.assignments !== undefined) {
      updates.push('assignments=?');
      values.push(JSON.stringify(req.body.assignments));
      // Also update primary subject from first assignment
      const first = Array.isArray(req.body.assignments) && req.body.assignments[0];
      if (first && first.subject && first.subject !== 'N/A') {
        if (!updates.includes('subject=?')) { updates.push('subject=?'); values.push(first.subject); }
      }
    }
    if (req.body.tasks !== undefined) {
      updates.push('tasks=?');
      values.push(JSON.stringify(req.body.tasks));
    }

    if (!updates.length) return fail(res, 400, 'No fields to update.');
    values.push(id);

    await db.run(`UPDATE staff SET ${updates.join(',')} WHERE id=?`, values);

    // Update primary class from first assignment
    if (req.body.assignments !== undefined) {
      const first = Array.isArray(req.body.assignments) && req.body.assignments[0];
      if (first && first.cls && first.cls !== 'N/A') {
        const cls = await db.query1('SELECT id FROM classes WHERE name=?', [first.cls]);
        if (cls) {
          const arm = (first.arm && first.arm !== 'N/A') ? first.arm : null;
          await db.run('UPDATE staff SET class_id=?, arm=? WHERE id=?', [cls.id, arm, id]);
        }
      }
    }

    const cached = db.staff.find(s => s.id === id);
    if (cached) {
      Object.assign(cached, req.body);
      if (req.body.assignments) cached.assignments = req.body.assignments;
      if (req.body.tasks)       cached.tasks       = req.body.tasks;
    }

    return ok(res, { id, ...req.body });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body ?? {};
    if (!['Active','On Leave','Suspended','Resigned'].includes(status))
      return fail(res, 400, 'Invalid status.');
    const row = await db.query1('SELECT id FROM staff WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Staff not found.');
    await db.run('UPDATE staff SET status=? WHERE id=?', [status, req.params.id]);
    const cached = db.staff.find(s => s.id === req.params.id);
    if (cached) cached.status = status;
    return ok(res, { id: req.params.id, status });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.assignClass = async (req, res) => {
  try {
    const { classUnit, arm } = req.body ?? {};
    const row = await db.query1('SELECT id FROM staff WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Staff not found.');
    const cls = classUnit ? await db.query1('SELECT id FROM classes WHERE name=?', [classUnit]) : null;
    await db.run('UPDATE staff SET class_id=?, arm=? WHERE id=?', [cls?.id || null, arm || null, req.params.id]);
    const cached = db.staff.find(s => s.id === req.params.id);
    if (cached) { cached.class = classUnit || ''; cached.arm = arm || ''; }
    return ok(res, { id: req.params.id, assignedClass: classUnit, assignedArm: arm });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.assignSubject = async (req, res) => {
  try {
    const { subject_id } = req.body ?? {};
    const row = await db.query1('SELECT id FROM staff WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Staff not found.');
    const subj = subject_id ? await db.query1('SELECT name FROM subjects WHERE id=?', [subject_id]) : null;
    await db.run('UPDATE staff SET subject=? WHERE id=?', [subj?.name || null, req.params.id]);
    const cached = db.staff.find(s => s.id === req.params.id);
    if (cached) cached.subject = subj?.name || '';
    return ok(res, { id: req.params.id, subject: subj?.name });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.addCredentials = async (req, res) => {
  try {
    const { credentials = [] } = req.body ?? {};
    const row = await db.query1('SELECT id FROM staff WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Staff not found.');
    for (const c of credentials) {
      await db.run('INSERT INTO staff_credentials (staff_id, file_name, file_size, file_type) VALUES (?, ?, ?, ?)',
        [req.params.id, c.name, c.size || null, c.type || null]);
    }
    const creds = await db.query('SELECT * FROM staff_credentials WHERE staff_id=?', [req.params.id]);
    return ok(res, creds);
  } catch (e) { return fail(res, 500, e.message); }
};

exports.removeCredential = async (req, res) => {
  try {
    const creds = await db.query('SELECT * FROM staff_credentials WHERE staff_id=? ORDER BY id', [req.params.id]);
    const idx   = parseInt(req.params.credIndex);
    if (isNaN(idx) || idx < 0 || idx >= creds.length) return fail(res, 404, 'Credential not found.');
    await db.run('DELETE FROM staff_credentials WHERE id=?', [creds[idx].id]);
    return ok(res, { deleted: true, credIndex: idx });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.getStudents = async (req, res) => {
  try {
    const staff = await db.query1(`SELECT st.*, c.name AS class_name FROM staff st
      LEFT JOIN classes c ON c.id=st.class_id WHERE st.id=?`, [req.params.id]);
    if (!staff) return fail(res, 404, 'Staff not found.');
    if (!staff.class_id) return ok(res, [], { count: 0 });
    const rows = await db.query(
      'SELECT s.*, c.name AS class_name FROM students s LEFT JOIN classes c ON c.id=s.class_id WHERE s.class_id=? AND s.active=1 ORDER BY s.name',
      [staff.class_id]);
    return ok(res, rows, { count: rows.length });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.exportStaff = async (req, res) => {
  try {
    const rows = await db.query('SELECT st.*, c.name AS class_name FROM staff st LEFT JOIN classes c ON c.id=st.class_id ORDER BY st.name');
    const lines = ['ID,Name,Category,Position,Email,Gender,Phone,Status,Department,Subject,Class,Arm'];
    rows.forEach(s => lines.push([s.id,s.name,s.category,s.position,s.email||'',s.gender||'',s.phone||'',s.status,s.department||'',s.subject||'',s.class_name||'',s.arm||''].join(',')));
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename="staff.csv"');
    return res.send(lines.join('\n'));
  } catch (e) { return fail(res, 500, e.message); }
};

exports.remove = async (req, res) => {
  try {
    const row = await db.query1('SELECT id, name FROM staff WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Staff not found.');
    await db.run('DELETE FROM staff WHERE id=?', [req.params.id]);
    db.staff    = db.staff.filter(s => s.id !== req.params.id);
    db.teachers = db.teachers.filter(s => s.id !== req.params.id);
    return ok(res, { id: req.params.id, deleted: true, name: row.name });
  } catch (e) { return fail(res, 500, e.message); }
};
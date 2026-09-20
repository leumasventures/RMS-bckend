const Student = require('../models/Student');   // adjust path/name to match your project
const Result  = require('../models/Result');    // adjust path/name to match your project

/**
 * GET /api/transcript?studentId=SAHARCO/20260531/0205&session=2025/2026
 * Admin-only. Returns all results for a student, optionally filtered by session.
 */
exports.getTranscript = async (req, res) => {
  try {
    const { studentId, session } = req.query;

    if (!studentId) {
      return res.status(400).json({ success: false, message: 'studentId is required' });
    }

    // Adjust the lookup field (`id` vs `_id` vs `studentId`) to match your Student schema
    const student = await Student.findOne({ id: studentId }).lean();
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const query = { studentId };
    if (session) query.session = session;

    const results = await Result.find(query)
      .sort({ session: -1, term: 1, subject_name: 1 })
      .lean();

    return res.json({ success: true, data: results });
  } catch (err) {
    console.error('[transcript] getTranscript error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to generate transcript' });
  }
};

/**
 * GET /api/transcript/profile?studentId=...&term=...&session=...
 * Returns everything generateProfile() in transcript.js needs in one call:
 * bio (student), results, attendance, domain assessment, remarks.
 */
exports.getProfile = async (req, res) => {
  try {
    const { studentId, term, session } = req.query;
    if (!studentId) {
      return res.status(400).json({ success: false, message: 'studentId is required' });
    }

    const student = await Student.findOne({ id: studentId }).lean();
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const filter = { studentId };
    if (term)    filter.term    = term;
    if (session) filter.session = session;

    // Adjust model names to whatever you actually call these collections
    const Attendance      = require('../models/Attendance');
    const DomainAssessment= require('../models/DomainAssessment');
    const Remark          = require('../models/Remark');

    const [results, attendance, domains, remark] = await Promise.all([
      Result.find(filter).lean(),
      Attendance.find(filter).lean(),
      DomainAssessment.findOne(filter).lean(),
      Remark.findOne(filter).lean(),
    ]);

    return res.json({
      success: true,
      data: { student, results, attendance, domains: domains || null, remarks: remark || {} },
    });
  } catch (err) {
    console.error('[transcript] getProfile error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to generate profile' });
  }
};
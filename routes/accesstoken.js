'use strict';

const express              = require('express');
const tokenController      = require('../controllers/accessTokenController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

/* ══════════════════════════════════════════════════════════════════════════════
   PUBLIC ROUTE — no authentication required
   Parents have no school system account; they enter a code on the portal.
   This must be declared BEFORE router.use(authenticate) so it is reachable
   without a JWT.
══════════════════════════════════════════════════════════════════════════════ */

// POST /api/access-tokens/validate
// Body: { code }
// Validates a parent-entered code, consumes a use, and returns the student's
// result payload. Mirrors validateAccessToken() + submitPortalCode() in the frontend.
router.post('/validate', tokenController.validate);

/* ══════════════════════════════════════════════════════════════════════════════
   ALL REMAINING ROUTES require a valid JWT
══════════════════════════════════════════════════════════════════════════════ */
router.use(authenticate);

/* ── Named / aggregate routes — must come BEFORE /:code ─────────────────────
   Without this ordering Express would match "class-list", "export", and
   "bulk" as the :code param and call getOne() instead.
   ─────────────────────────────────────────────────────────────────────────── */

// GET /api/access-tokens/class-list?class=&arm=
// One row per student with their latest active token — powers openTokenListModal().
router.get('/class-list', tokenController.getClassList);

// GET /api/access-tokens/export/csv?class=&arm=
// Streams a CSV file — mirrors downloadTokensCSV() in the frontend.
router.get('/export/csv', tokenController.exportCSV);

// GET /api/access-tokens/student/:studentId
// All tokens for one student — mirrors getStudentTokens() + openStudentTokenHistory().
router.get('/student/:studentId', tokenController.getByStudent);

/* ── Bulk generation ─────────────────────────────────────────────────────── */

// POST /api/access-tokens/bulk
// Body: { class, arm, expiryDays?, term?, session?, maxUses? }
// Mirrors openBulkTokenModal → confirmBulkTokenGenerate → bulkGenerateTokens().
router.post(
  '/bulk',
  authorize('Admin', 'Teacher'),
  tokenController.bulkGenerate
);

/* ── Collection read ─────────────────────────────────────────────────────── */

// GET /api/access-tokens?studentId=&class=&arm=&status=
// Full token list with optional filters. Admin / assigned Teacher.
router.get('/', tokenController.getAll);

/* ── Single token generation ─────────────────────────────────────────────── */

// POST /api/access-tokens
// Body: { studentId, expiryDays?, term?, session?, maxUses?, label? }
// Mirrors openSingleTokenModal → confirmGenerateSingleToken → generateAccessToken().
router.post(
  '/',
  authorize('Admin', 'Teacher'),
  tokenController.generate
);

/* ── Per-token operations (/:code must come after all named routes) ────────── */

// GET /api/access-tokens/:code
// Fetch a single token record. Admin / assigned Teacher.
router.get('/:code', tokenController.getOne);

// PATCH /api/access-tokens/:code/revoke
// Mirrors revokeAccessToken() + revokeAndRefresh() in the frontend.
router.patch(
  '/:code/revoke',
  authorize('Admin', 'Teacher'),
  tokenController.revoke
);

// POST /api/access-tokens/:code/revoke  (alias — some clients prefer POST)
router.post(
  '/:code/revoke',
  authorize('Admin', 'Teacher'),
  tokenController.revokePost
);

// DELETE /api/access-tokens/:code  —  Admin only (hard delete, use sparingly)
router.delete(
  '/:code',
  authorize('Admin'),
  tokenController.remove
);

module.exports = router;
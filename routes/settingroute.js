/**
 * settingsRoutes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Declarative route registry for the Settings module.
 *
 * Each route entry describes:
 *   • action   – the string key used to dispatch (matches onclick / form IDs)
 *   • handler  – the settingsController method to invoke
 *   • guard    – optional permission check before the handler runs
 *   • confirm  – optional confirmation prompt before the handler runs
 *
 * Usage
 * ─────
 *   // Programmatic dispatch (anywhere in the app):
 *   settingsRouter.dispatch('saveSchoolInfo', event);
 *
 *   // The router also wires itself to form submits and button clicks
 *   // via data-action attributes, so plain HTML like:
 *   //   <button data-action="addGradingRow">+ Row</button>
 *   // will just work once settingsRouter.init() has been called.
 *
 * Permission guards
 * ─────────────────
 *   Guards are functions that receive the current user object and return
 *   true (allowed) or false (blocked). The router calls toast() and aborts
 *   if a guard returns false.
 *
 * Dependencies
 * ────────────
 *   • settingsController  – the controller namespace object
 *   • App.currentUser     – { role, name, ... }
 *   • toast(msg, type)    – UI notification helper
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   GUARD FACTORY HELPERS
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Builds a guard that allows access only to the listed roles.
 * @param {...string} roles
 * @returns {function(user): boolean}
 */
function _allowRoles(...roles) {
  return user => roles.includes(user?.role);
}

/** Always-allow guard (no restriction). */
const _open = () => true;

/** Super-admin only. */
const _superAdmin = _allowRoles('Admin');

/** Admin or Principal. */
const _adminOrPrincipal = _allowRoles('Admin', 'Principal');

/** Admin, Principal, or Vice Principal. */
const _senior = _allowRoles('Admin', 'Principal', 'Vice Principal');


/* ═══════════════════════════════════════════════════════════════════════════
   ROUTE DEFINITIONS
═══════════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} SettingsRoute
 * @property {string}             action    Unique action key
 * @property {Function}           handler   Controller method to invoke
 * @property {Function}           guard     (user) => boolean
 * @property {string|null}        confirm   Confirmation message, or null
 * @property {string}             tab       Which settings tab this belongs to
 * @property {string}             label     Human-readable description (for audit logs)
 */

/** @type {SettingsRoute[]} */
const SETTINGS_ROUTES = [

  /* ── TAB NAVIGATION ──────────────────────────────────────────────────── */
  {
    action:  'showSettingsTab',
    handler: settingsController.showSettingsTab,
    guard:   _open,
    confirm: null,
    tab:     '*',
    label:   'Switch settings tab',
  },

  /* ── SCHOOL INFO ─────────────────────────────────────────────────────── */
  {
    action:  'saveSchoolInfo',
    handler: settingsController.saveSchoolInfo,
    guard:   _adminOrPrincipal,
    confirm: null,
    tab:     'school',
    label:   'Save school information',
  },

  /* ── GRADING & DOMAINS ───────────────────────────────────────────────── */
  {
    action:  'saveGradingAndDomains',
    handler: settingsController.saveGradingAndDomains,
    guard:   _adminOrPrincipal,
    confirm: null,
    tab:     'grading',
    label:   'Save grading scale & domain settings',
  },
  {
    action:  'addGradingRow',
    handler: settingsController.addGradingRow,
    guard:   _adminOrPrincipal,
    confirm: null,
    tab:     'grading',
    label:   'Add grading row',
  },
  {
    action:  'removeGradingRow',
    handler: settingsController.removeGradingRow,
    guard:   _adminOrPrincipal,
    confirm: null,
    tab:     'grading',
    label:   'Remove grading row',
  },
  {
    action:  'updateBreakdownSum',
    handler: settingsController.updateBreakdownSum,
    guard:   _open,
    confirm: null,
    tab:     'grading',
    label:   'Update score breakdown sum display',
  },

  /* ── CLASSES & ARMS ──────────────────────────────────────────────────── */
  {
    action:  'addNewClass',
    handler: settingsController.addNewClass,
    guard:   _adminOrPrincipal,
    confirm: null,
    tab:     'classes',
    label:   'Add new class',
  },
  {
    action:  'deleteClass',
    handler: settingsController.deleteClass,
    guard:   _superAdmin,
    confirm: 'Delete this class and all its arms?',
    tab:     'classes',
    label:   'Delete class',
  },
  {
    action:  'addArm',
    handler: settingsController.addArm,
    guard:   _adminOrPrincipal,
    confirm: null,
    tab:     'classes',
    label:   'Add arm to class',
  },
  {
    action:  'removeArm',
    handler: settingsController.removeArm,
    guard:   _adminOrPrincipal,
    confirm: null,
    tab:     'classes',
    label:   'Remove arm from class',
  },

  /* ── ATTENDANCE & CALENDAR ───────────────────────────────────────────── */
  {
    action:  'saveAttendanceSettings',
    handler: settingsController.saveAttendanceSettings,
    guard:   _adminOrPrincipal,
    confirm: null,
    tab:     'attendance',
    label:   'Save attendance & calendar settings',
  },
  {
    action:  'addSpecialDay',
    handler: settingsController.addSpecialDay,
    guard:   _adminOrPrincipal,
    confirm: null,
    tab:     'attendance',
    label:   'Add special day',
  },
  {
    action:  'addSpecialDayRange',
    handler: settingsController.addSpecialDayRange,
    guard:   _adminOrPrincipal,
    confirm: null,
    tab:     'attendance',
    label:   'Add special day range',
  },
  {
    action:  'removeSpecialDay',
    handler: settingsController.removeSpecialDay,
    guard:   _adminOrPrincipal,
    confirm: null,
    tab:     'attendance',
    label:   'Remove special day',
  },
  {
    action:  'clearSpecialDays',
    handler: settingsController.clearSpecialDays,
    guard:   _superAdmin,
    confirm: 'Remove ALL special days from the calendar?',
    tab:     'attendance',
    label:   'Clear all special days',
  },
  {
    action:  'recalculateAttendanceSummary',
    handler: settingsController.recalculateAttendanceSummary,
    guard:   _senior,
    confirm: 'Recalculate attendance for all students?',
    tab:     'attendance',
    label:   'Recalculate attendance summaries',
  },

  /* ── GENERAL SETTINGS ────────────────────────────────────────────────── */
  {
    action:  'saveGeneralSettings',
    handler: settingsController.saveGeneralSettings,
    guard:   _superAdmin,
    confirm: null,
    tab:     'general',
    label:   'Save general system settings',
  },

  /* ── ROLES & PRIVILEGES ──────────────────────────────────────────────── */
  {
    action:  'saveRolePermissions',
    handler: settingsController.saveRolePermissions,
    guard:   _superAdmin,
    confirm: null,
    tab:     'roles',
    label:   'Save role permissions',
  },

  /* ── DATA MANAGEMENT ─────────────────────────────────────────────────── */
  {
    action:  'exportData',
    handler: settingsController.exportData,
    guard:   _superAdmin,
    confirm: null,
    tab:     'data',
    label:   'Export full data (JSON)',
  },
  {
    action:  'exportStudentsCSV',
    handler: settingsController.exportStudentsCSV,
    guard:   _adminOrPrincipal,
    confirm: null,
    tab:     'data',
    label:   'Export students (CSV)',
  },
  {
    action:  'exportResultsCSV',
    handler: settingsController.exportResultsCSV,
    guard:   _adminOrPrincipal,
    confirm: null,
    tab:     'data',
    label:   'Export results (CSV)',
  },
  {
    action:  'handleImportJSON',
    handler: settingsController.handleImportJSON,
    guard:   _superAdmin,
    confirm: null,           // confirm is inside the handler (merges data)
    tab:     'data',
    label:   'Import data from JSON backup',
  },
  {
    action:  'handleImportStudentsCSV',
    handler: settingsController.handleImportStudentsCSV,
    guard:   _adminOrPrincipal,
    confirm: null,
    tab:     'data',
    label:   'Import students from CSV',
  },
  {
    action:  'clearResults',
    handler: settingsController.clearResults,
    guard:   _superAdmin,
    confirm: 'Delete ALL academic results? This cannot be undone.',
    tab:     'data',
    label:   'Clear all academic results',
  },
  {
    action:  'clearAttendance',
    handler: settingsController.clearAttendance,
    guard:   _superAdmin,
    confirm: 'Delete ALL attendance records? This cannot be undone.',
    tab:     'data',
    label:   'Clear all attendance records',
  },
  {
    action:  'resetAllData',
    handler: settingsController.resetAllData,
    guard:   _superAdmin,
    confirm: null,           // triple-confirmation is inside the handler
    tab:     'data',
    label:   'Reset entire database',
  },
];


/* ═══════════════════════════════════════════════════════════════════════════
   ROUTE INDEX  (action → route)
═══════════════════════════════════════════════════════════════════════════ */

/** @type {Map<string, SettingsRoute>} */
const _routeIndex = new Map(SETTINGS_ROUTES.map(r => [r.action, r]));


/* ═══════════════════════════════════════════════════════════════════════════
   ROUTER CORE
═══════════════════════════════════════════════════════════════════════════ */

const settingsRouter = {

  /**
   * Dispatch an action by name, enforcing its guard and confirm prompt.
   *
   * @param {string}    action    The action key (e.g. 'saveSchoolInfo')
   * @param {...*}      args      Arguments forwarded to the handler
   * @returns {*}                 Return value from the handler, or undefined
   */
  dispatch(action, ...args) {
    const route = _routeIndex.get(action);

    if (!route) {
      console.warn(`[settingsRouter] Unknown action: "${action}"`);
      toast(`Unknown settings action: ${action}`, 'error');
      return;
    }

    // ── Permission check ─────────────────────────────────────────────────
    const user = App.currentUser || {};
    if (!route.guard(user)) {
      toast('You do not have permission to perform this action.', 'error');
      return;
    }

    // ── Optional confirm ─────────────────────────────────────────────────
    if (route.confirm && !confirm(route.confirm)) {
      toast('Action cancelled.', 'info');
      return;
    }

    // ── Audit log ────────────────────────────────────────────────────────
    if (App.data?.generalSettings?.auditLog) {
      _logAuditEntry(user, route);
    }

    // ── Invoke handler ───────────────────────────────────────────────────
    try {
      return route.handler(...args);
    } catch (err) {
      console.error(`[settingsRouter] Handler error for "${action}":`, err);
      toast(`An error occurred while executing: ${route.label}`, 'error');
    }
  },

  /**
   * Returns the route definition for a given action key (read-only).
   * @param {string} action
   * @returns {SettingsRoute|undefined}
   */
  getRoute(action) {
    return _routeIndex.get(action);
  },

  /**
   * Returns all routes for a given tab (or all routes if tab is '*').
   * @param {string} tab
   * @returns {SettingsRoute[]}
   */
  getRoutesForTab(tab) {
    return SETTINGS_ROUTES.filter(r => r.tab === tab || r.tab === '*');
  },

  /**
   * Returns all routes the current user is permitted to use.
   * Useful for building dynamic menus or disabling buttons.
   * @returns {SettingsRoute[]}
   */
  getAllowedRoutes() {
    const user = App.currentUser || {};
    return SETTINGS_ROUTES.filter(r => r.guard(user));
  },

  /**
   * Checks whether the current user can dispatch a given action.
   * @param {string} action
   * @returns {boolean}
   */
  can(action) {
    const route = _routeIndex.get(action);
    if (!route) return false;
    return route.guard(App.currentUser || {});
  },

  /**
   * Wires all elements with a [data-action] attribute inside `root`
   * to dispatch through this router. Call after renderSettings().
   *
   * @param {HTMLElement} [root=document]  The DOM subtree to scan
   */
  init(root = document) {
    root.querySelectorAll('[data-action]').forEach(el => {
      const action = el.dataset.action;
      const arg    = el.dataset.arg;   // optional single string argument

      // Avoid double-binding
      if (el._routerBound) return;
      el._routerBound = true;

      const event = el.tagName === 'FORM' ? 'submit' : 'click';

      el.addEventListener(event, e => {
        if (event === 'submit') e.preventDefault();
        settingsRouter.dispatch(action, ...(arg !== undefined ? [arg, e] : [e]));
      });

      // Visually disable controls the user cannot use
      if (!settingsRouter.can(action) && el.tagName !== 'FORM') {
        el.disabled         = true;
        el.title            = 'You do not have permission to perform this action.';
        el.style.opacity    = '0.4';
        el.style.cursor     = 'not-allowed';
      }
    });
  },

  /**
   * Full list of registered routes (read-only snapshot).
   * @returns {SettingsRoute[]}
   */
  get routes() {
    return [...SETTINGS_ROUTES];
  },
};


/* ═══════════════════════════════════════════════════════════════════════════
   AUDIT LOGGER
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Appends an audit log entry to App.data.auditLog.
 * @param {{ role: string, name: string }} user
 * @param {SettingsRoute}                  route
 */
function _logAuditEntry(user, route) {
  App.data.auditLog = App.data.auditLog || [];
  App.data.auditLog.push({
    timestamp:   new Date().toISOString(),
    user:        user.name || 'Unknown',
    role:        user.role || 'Unknown',
    action:      route.action,
    label:       route.label,
    tab:         route.tab,
  });

  // Keep log capped at 500 entries to avoid bloating localStorage
  if (App.data.auditLog.length > 500) {
    App.data.auditLog = App.data.auditLog.slice(-500);
  }
}


/* ═══════════════════════════════════════════════════════════════════════════
   CONVENIENCE SHORTHAND  (optional — mirrors the old global onclick style)
   Lets legacy inline handlers like onclick="saveSchoolInfo(event)" still work
   by routing through the permission + audit layer.
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Generates proxied globals for every route action so that existing
 * inline onclick="action(args)" handlers are automatically guarded.
 *
 * Call once, after both controller and router are loaded:
 *   settingsRouter.exposeGlobals();
 */
settingsRouter.exposeGlobals = function () {
  SETTINGS_ROUTES.forEach(route => {
    window[route.action] = (...args) => settingsRouter.dispatch(route.action, ...args);
  });
};


/* ═══════════════════════════════════════════════════════════════════════════
   MODULE EXPORT
═══════════════════════════════════════════════════════════════════════════ */

// Expose router globally
window.settingsRouter = settingsRouter;

// Auto-expose guarded globals (replaces the raw controller globals)
settingsRouter.exposeGlobals();
'use strict';
const nodemailer = require('nodemailer');

const ENABLED = process.env.EMAIL_ENABLED === 'true';

let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: { user: process.env.EMAIL_USER || '', pass: process.env.EMAIL_PASS || '' },
    tls: { rejectUnauthorized: false },
  });
  return _transporter;
}

const FROM = () => `"${process.env.EMAIL_FROM || 'Sacred Heart College Eziukwu Aba'}" <${process.env.EMAIL_USER || 'noreply@sacredheartcollegeaba.com'}>`;

async function sendEmail({ to, subject, html, text }) {
  if (!ENABLED) {
    console.log(`[email] DEV — would send to ${to}: "${subject}"`);
    return { messageId: 'dev-mode', accepted: [to] };
  }
  if (!to || !subject || !html) throw new Error('to, subject, html required.');
  try {
    const info = await getTransporter().sendMail({
      from: FROM(), to, subject, html,
      text: text || html.replace(/<[^>]+>/g, ''),
    });
    console.log(`[email] Sent to ${to}: ${info.messageId}`);
    return info;
  } catch (e) {
    console.error(`[email] Failed to ${to}:`, e.message);
    throw e;
  }
}

async function sendBulk(recipients, subject, htmlFn, options = {}) {
  const { delayMs = 400, onProgress } = options;
  const results = { sent: [], failed: [], total: recipients.length };
  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    if (!r.email) { results.failed.push({ ...r, error: 'No email' }); continue; }
    try {
      await sendEmail({ to: r.email, subject, html: htmlFn(r) });
      results.sent.push({ name: r.name, email: r.email });
    } catch (e) {
      results.failed.push({ name: r.name, email: r.email, error: e.message });
    }
    if (onProgress) onProgress(i + 1, recipients.length, r);
    if (delayMs && i < recipients.length - 1) await new Promise(res => setTimeout(res, delayMs));
  }
  console.log(`[email/bulk] ${results.sent.length} sent, ${results.failed.length} failed of ${results.total}`);
  return results;
}

const BASE = `font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;max-width:600px;margin:0 auto;`;

function hdr(school) {
  return `<div style="background:#1e3a5f;padding:18px 24px;display:flex;align-items:center;gap:12px;">
    <div style="width:42px;height:42px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">✝</div>
    <div>
      <div style="color:#fff;font-size:15px;font-weight:700;">${school.name || 'Sacred Heart College Eziukwu Aba'}</div>
      <div style="color:#93c5fd;font-size:11px;">${school.address || 'Aba, Abia State, Nigeria'}</div>
    </div></div>`;
}

function ftr(school) {
  return `<div style="background:#f1f5f9;padding:12px 24px;text-align:center;font-size:11px;color:#6b7280;border-top:1px solid #e2e8f0;">
    <div>${school.name || 'Sacred Heart College Eziukwu Aba'} · ${school.phone || ''}</div>
    <div style="margin-top:3px;">This is an automated message — please do not reply.</div></div>`;
}

const templates = {

  admissionAcknowledgement(adm, school = {}) {
    const name    = [adm.first_name, adm.last_name].filter(Boolean).join(' ') || 'Applicant';
    const guardian= adm.parent_name || adm.guardian_name || 'Parent/Guardian';
    const cls     = adm.class_apply || adm.applying_for_class || '';
    const sess    = adm.acad_session || adm.session || '';
    const appNo   = adm.applicationNo || adm.application_no || `ADM-${adm.id}`;
    return {
      subject: `Application Received — ${name} | ${school.name || 'Sacred Heart College'}`,
      html: `<div style="${BASE}">${hdr(school)}
        <div style="padding:24px;">
          <p>Dear <strong>${guardian}</strong>,</p>
          <p>Thank you for applying to <strong>${school.name || 'Sacred Heart College Eziukwu Aba'}</strong>. We confirm receipt of the application for:</p>
          <div style="background:#eff6ff;border-left:4px solid #1e3a5f;border-radius:0 8px 8px 0;padding:14px 18px;margin:16px 0;">
            <div style="font-size:16px;font-weight:700;color:#1e3a5f;">${name}</div>
            <table style="margin-top:8px;font-size:13px;width:100%;"><tbody>
              <tr><td style="color:#6b7280;width:150px;padding:2px 0;">Application Number</td><td><strong>${appNo}</strong></td></tr>
              <tr><td style="color:#6b7280;padding:2px 0;">Class Applied For</td><td><strong>${cls}</strong></td></tr>
              <tr><td style="color:#6b7280;padding:2px 0;">Academic Session</td><td><strong>${sess}</strong></td></tr>
              <tr><td style="color:#6b7280;padding:2px 0;">Status</td><td><span style="background:#fef3c7;color:#92400e;padding:2px 10px;border-radius:4px;font-size:12px;font-weight:600;">⏳ Pending Review</span></td></tr>
            </tbody></table>
          </div>
          <p><strong>Next steps:</strong></p>
          <ol style="padding-left:18px;line-height:2;">
            <li>Our admissions team will review the application.</li>
            <li>You will be contacted to schedule an entrance assessment if required.</li>
            <li>You will receive a decision email once review is complete.</li>
          </ol>
          <p>Please keep your <strong>Application Number (${appNo})</strong> for future reference.</p>
          <p>For enquiries: <a href="mailto:${school.email || ''}">${school.email || ''}</a> | ${school.phone || ''}</p>
          <p style="margin-top:20px;">God bless,<br><strong>${school.principal || 'The Principal'}</strong><br>${school.name || 'Sacred Heart College Eziukwu Aba'}</p>
        </div>${ftr(school)}</div>`,
    };
  },

  admissionApproved(adm, school = {}) {
    const name = [adm.first_name, adm.last_name].filter(Boolean).join(' ');
    const guardian = adm.parent_name || adm.guardian_name || 'Parent/Guardian';
    const cls  = adm.assigned_class || adm.class_apply || '';
    const arm  = adm.assigned_arm   || adm.preferred_arm || '';
    const appNo= adm.applicationNo  || `ADM-${adm.id}`;
    return {
      subject: `Application Approved — ${name} | ${school.name || 'Sacred Heart College'}`,
      html: `<div style="${BASE}">${hdr(school)}
        <div style="padding:24px;">
          <div style="background:#dcfce7;border:1.5px solid #16a34a;border-radius:8px;padding:14px;margin-bottom:20px;text-align:center;">
            <div style="font-size:28px;">🎉</div>
            <div style="font-size:16px;font-weight:700;color:#166534;">Application Approved!</div>
          </div>
          <p>Dear <strong>${guardian}</strong>,</p>
          <p>We are delighted to inform you that <strong>${name}</strong>'s application has been <strong style="color:#16a34a;">APPROVED</strong>.</p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;margin:16px 0;">
            <table style="font-size:13px;width:100%;"><tbody>
              <tr><td style="color:#6b7280;width:130px;padding:3px 0;">Student Name</td><td><strong>${name}</strong></td></tr>
              <tr><td style="color:#6b7280;padding:3px 0;">Application No</td><td><strong>${appNo}</strong></td></tr>
              <tr><td style="color:#6b7280;padding:3px 0;">Assigned Class</td><td><strong style="color:#1e3a5f;">${cls} ${arm}</strong></td></tr>
            </tbody></table>
          </div>
          <p>Please visit the school to complete enrollment and collect the required items list.</p>
          <p style="margin-top:20px;">God bless,<br><strong>${school.principal || 'The Principal'}</strong><br>${school.name || 'Sacred Heart College Eziukwu Aba'}</p>
        </div>${ftr(school)}</div>`,
    };
  },

  custom(recipient, subject, body, school = {}) {
    const name = recipient.name || recipient.studentName || 'Parent/Guardian';
    return {
      subject,
      html: `<div style="${BASE}">${hdr(school)}
        <div style="padding:24px;">
          <p>Dear <strong>${name}</strong>,</p>
          <div style="line-height:1.9;">${body.replace(/\n/g, '<br>')}</div>
          <p style="margin-top:24px;">God bless,<br><strong>${school.principal || 'The Principal'}</strong><br>${school.name || 'Sacred Heart College Eziukwu Aba'}</p>
        </div>${ftr(school)}</div>`,
    };
  },

  prospective(recipient, body, school = {}) {
    const name = recipient.name || 'Parent/Guardian';
    return {
      subject: `Admissions Open — ${school.name || 'Sacred Heart College Eziukwu Aba'}`,
      html: `<div style="${BASE}">${hdr(school)}
        <div style="padding:24px;">
          <p>Dear <strong>${name}</strong>,</p>
          <div style="line-height:1.9;">${body.replace(/\n/g, '<br>')}</div>
          <div style="margin:24px 0;text-align:center;">
            <a href="${school.website || 'https://sacredheartcollegeaba.com'}/enroll.html"
              style="background:#1e3a5f;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;">
              Apply Now →
            </a>
          </div>
          <p>God bless,<br><strong>${school.principal || 'The Principal'}</strong><br>${school.name || 'Sacred Heart College Eziukwu Aba'}</p>
        </div>${ftr(school)}</div>`,
    };
  },
};

module.exports = { sendEmail, sendBulk, templates, isEnabled: () => ENABLED };
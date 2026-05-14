/**
 * seed_admin.js — run once on Render shell to create the admin user
 * Usage: node seed_admin.js
 */
require('dotenv').config();
const mysql  = require('mysql2/promise');
const bcrypt = require('bcryptjs');

(async () => {
  const pool = mysql.createPool({
    host:     process.env.DB_HOST,
    user:     process.env.DB_USER,
    password: process.env.DB_PASS || process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl:      { rejectUnauthorized: false },
  });

  try {
    const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM users');
    const count  = rows[0].cnt;

    if (count > 0) {
      console.log(`ℹ️  ${count} user(s) already exist. No seed needed.`);
      console.log('   If you need to reset the admin password, run:');
      console.log('   node seed_admin.js --force');
      if (!process.argv.includes('--force')) { await pool.end(); return; }
    }

    const hash = await bcrypt.hash('admin1234', 10);
    await pool.query(
      `INSERT INTO users (name, email, role, password_hash, active)
       VALUES (?, ?, 'Admin', ?, 1)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), active = 1`,
      ['SAHARCO Admin', 'admin@sacredheartcollegeaba.com', hash]
    );

    // Seed default settings
    const settings = [
      ['school_name',     'Sacred Heart College Eziukwu Aba'],
      ['current_session', '2025/2026'],
      ['current_term',    'Second Term'],
      ['principal_name',  'Rev. Fr. Sullivan Obinna Achilihu'],
    ];
    for (const [k, v] of settings) {
      await pool.query(
        `INSERT INTO school_settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [k, v]
      );
    }

    console.log('\n✅ Admin user created successfully!');
    console.log('   Email:    admin@sacredheartcollegeaba.com');
    console.log('   Password: admin1234');
    console.log('   Role:     Admin');
    console.log('\n✅ Default school settings seeded.');
    console.log('\n⚠️  Change the admin password after first login!\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err);
  } finally {
    await pool.end();
  }
})();
/* =========================================================
   config/db.js
   إنشاء اتصال (Pool) واحد مع قاعدة بيانات MySQL
   يُستخدم في كل المشروع لتنفيذ الاستعلامات
   ========================================================= */

const mysql = require("mysql2/promise");

// خيار 1: رابط اتصال كامل (يوفّره Railway تلقائياً عند إضافة MySQL)
// خيار 2: متغيرات منفصلة (للتشغيل المحلي إن رغبت)
//
// ملاحظة مهمة: mysql2 لا يطبّق dateStrings تلقائياً عند تمرير
// رابط الاتصال كنص مباشر، لذلك نحوّله دائماً إلى كائن إعدادات
// عبر new URL() لضمان تفعيل الخيار في كل الحالات.
let poolConfig;

if (process.env.DATABASE_URL) {
  const parsed = new URL(process.env.DATABASE_URL);
  poolConfig = {
    host: parsed.hostname,
    port: parsed.port || 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
  };
} else {
  poolConfig = {
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "qayrawan_club",
  };
}

const pool = mysql.createPool({
  ...poolConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true, // نسترجع التواريخ كنص بسيط (YYYY-MM-DD) بدل كائن Date
});

module.exports = pool;

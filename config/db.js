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
  try {
    const parsed = new URL(process.env.DATABASE_URL);
    const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";

    // تفعيل SSL تلقائياً للاتصالات السحابية (Railway, TiDB, Aiven...) إلا إذا عُطّل صراحة
    const sslParam = parsed.searchParams.get("ssl");
    const sslModeParam = parsed.searchParams.get("ssl-mode");
    const wantsSSL = process.env.DB_SSL === "true" ||
      sslParam === "true" ||
      sslModeParam === "REQUIRED" ||
      (!isLocal && process.env.DB_SSL !== "false");

    poolConfig = {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 3306,
      user: decodeURIComponent(parsed.username || ""),
      password: decodeURIComponent(parsed.password || ""),
      database: parsed.pathname.replace(/^\//, ""),
      ssl: wantsSSL ? { rejectUnauthorized: false } : undefined,
    };
  } catch (err) {
    console.error("❌ خطأ في قراءة DATABASE_URL:", err.message);
  }
}

if (!poolConfig) {
  const isLocal = !process.env.DB_HOST || process.env.DB_HOST === "localhost" || process.env.DB_HOST === "127.0.0.1";
  poolConfig = {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "qayrawan_club",
    ssl: (process.env.DB_SSL === "true" || (!isLocal && process.env.DB_SSL !== "false"))
      ? { rejectUnauthorized: false }
      : undefined,
  };
}

const pool = mysql.createPool({
  ...poolConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true, // نسترجع التواريخ كنص بسيط (YYYY-MM-DD) بدل كائن Date
  connectTimeout: 10000,
});

module.exports = pool;

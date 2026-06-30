/* =========================================================
   tests/helpers/globalSetup.js
   يُشغَّل مرة واحدة فقط قبل بدء كل ملفات الاختبار (Jest globalSetup)
   مهمته:
   1) تحميل متغيرات .env.test
   2) إعادة إنشاء جداول قاعدة بيانات الاختبار من الصفر (schema.sql)
   هذا يضمن أن كل تشغيل لمجموعة الاختبارات يبدأ من حالة نظيفة ومعروفة
   ========================================================= */

const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

module.exports = async function globalSetup() {
  // نحمّل .env.test ونتأكد أنها تطغى على أي قيم موجودة مسبقاً في البيئة
  dotenv.config({
    path: path.join(__dirname, "..", "..", ".env.test"),
    override: true,
  });

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "❌ DATABASE_URL غير موجود. تأكد من وجود ملف .env.test في جذر المشروع قبل تشغيل الاختبارات."
    );
  }

  // أمان إضافي: نمنع تشغيل الاختبارات بالخطأ على قاعدة بيانات الإنتاج/التطوير
  if (!process.env.DATABASE_URL.includes("_test")) {
    throw new Error(
      "❌ رفض التشغيل: DATABASE_URL في .env.test لا يحتوي على '_test' في اسم القاعدة.\n" +
      "   هذا إجراء أمان لمنع تشغيل الاختبارات (التي تحذف الجداول) على قاعدة بيانات حقيقية."
    );
  }

  const connection = await mysql.createConnection(
    process.env.DATABASE_URL + "?multipleStatements=true"
  );

  try {
    const schemaPath = path.join(__dirname, "..", "..", "config", "schema.sql");
    const schemaSql = fs.readFileSync(schemaPath, "utf8");
    await connection.query(schemaSql);
  } finally {
    await connection.end();
  }
};

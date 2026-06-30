/* =========================================================
   tests/helpers/authHelper.js
   مساعد لإنشاء "agent" من supertest مسجَّل دخوله كمشرف مسبقاً
   (يحافظ على الكوكي بين الطلبات تلقائياً)، لتجنّب تكرار خطوات
   تسجيل الدخول داخل كل ملف اختبار يحتاج صلاحية مشرف
   ========================================================= */

const supertest = require("supertest");

/**
 * يرجع agent مسجّل دخوله بالفعل كمشرف (الكوكي محفوظة داخل الـ agent)
 * @param {import('express').Express} app
 * @param {string} [accessCode] رمز الدخول، الافتراضي يطابق SUPERVISOR_ACCESS_CODE في .env.test
 */
async function loginAsSupervisor(app, accessCode = process.env.SUPERVISOR_ACCESS_CODE || "991") {
  const agent = supertest.agent(app);
  await agent.post("/supervisor/login").send({ accessCode });
  return agent;
}

module.exports = { loginAsSupervisor };

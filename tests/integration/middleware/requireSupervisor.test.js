/* =========================================================
   tests/integration/middleware/requireSupervisor.test.js
   اختبار middleware/requireSupervisor.js بشكل منعزل
   (بدون الحاجة لتشغيل خادم كامل، نحاكي req/res/next يدوياً)
   ========================================================= */

const {
  requireSupervisorPage,
  requireSupervisorApi,
} = require("../../../middleware/requireSupervisor");

function mockRes() {
  return {
    redirectedTo: null,
    statusCode: null,
    jsonBody: null,
    redirect(url) {
      this.redirectedTo = url;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.jsonBody = body;
      return this;
    },
  };
}

describe("requireSupervisorPage", () => {
  test("يستدعي next() عندما الجلسة تحتوي isSupervisor=true", () => {
    const req = { session: { isSupervisor: true } };
    const res = mockRes();
    const next = jest.fn();

    requireSupervisorPage(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.redirectedTo).toBeNull();
  });

  test("يعيد التوجيه لصفحة تسجيل الدخول عند عدم وجود جلسة مشرف", () => {
    const req = { session: {} };
    const res = mockRes();
    const next = jest.fn();

    requireSupervisorPage(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.redirectedTo).toBe("/supervisor/login");
  });

  test("لا ينكسر إذا كانت req.session غير موجودة أصلاً (undefined)", () => {
    const req = {};
    const res = mockRes();
    const next = jest.fn();

    expect(() => requireSupervisorPage(req, res, next)).not.toThrow();
    expect(res.redirectedTo).toBe("/supervisor/login");
  });
});

describe("requireSupervisorApi", () => {
  test("يستدعي next() عندما الجلسة تحتوي isSupervisor=true", () => {
    const req = { session: { isSupervisor: true } };
    const res = mockRes();
    const next = jest.fn();

    requireSupervisorApi(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test("يرجع 401 مع رسالة JSON عند عدم وجود جلسة مشرف (لا إعادة توجيه)", () => {
    const req = { session: {} };
    const res = mockRes();
    const next = jest.fn();

    requireSupervisorApi(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.jsonBody).toEqual({
      success: false,
      message: "يجب تسجيل الدخول كمشرف أولاً",
    });
  });

  test("لا ينكسر إذا كانت req.session غير موجودة أصلاً (undefined)", () => {
    const req = {};
    const res = mockRes();
    const next = jest.fn();

    expect(() => requireSupervisorApi(req, res, next)).not.toThrow();
    expect(res.statusCode).toBe(401);
  });

  test("جلسة موجودة لكن isSupervisor=false ترفض الطلب أيضاً", () => {
    const req = { session: { isSupervisor: false } };
    const res = mockRes();
    const next = jest.fn();

    requireSupervisorApi(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});

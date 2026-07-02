/* =========================================================
   public/js/supervisor.js
   منطق لوحة المشرفين:
   - إضافة / خصم نقاط (AJAX)
   - تسجيل حضور يدوي (AJAX)
   - عرض/طباعة باركود QR لكل طالب
   - تشغيل الكاميرا ومسح الباركود لتسجيل حضور تلقائي (AJAX)
   ========================================================= */

let qrStream = null;
let qrAnimationFrame = null;
let qrScannerActive = false;

document.addEventListener("DOMContentLoaded", () => {
  setupStudentSearchSelects();
  setupPointsForm();
  setupAttendanceForm();
  setupKnowledgeTasksPanel();
  setupBarcodeModal();
  setupScanner();
});

/* =========================================================
   0) قائمة بحث سريعة بالكتابة لاختيار الطالب
   تُستخدم بدل القائمة المنسدلة الطويلة في نموذجي النقاط والحضور
   ========================================================= */
function setupStudentSearchSelects() {
  const dataEl = document.getElementById("studentsDataJson");
  if (!dataEl) return;

  const students = JSON.parse(dataEl.textContent)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));

  setupStudentSearchSelect("pointsStudentSearch", "pointsStudentResults", "pointsStudentSelect", students);
  setupStudentSearchSelect("attendanceStudentSearch", "attendanceStudentResults", "attendanceStudentSelect", students);
  setupStudentSearchSelect("tasksStudentSearch", "tasksStudentResults", "tasksStudentSelect", students, (id) => {
    loadKnowledgeTasks(id);
  });
}

function setupStudentSearchSelect(inputId, resultsId, hiddenId, students, onSelect) {
  const input = document.getElementById(inputId);
  const resultsBox = document.getElementById(resultsId);
  const hidden = document.getElementById(hiddenId);
  if (!input || !resultsBox || !hidden) return;

  input.addEventListener("input", () => {
    hidden.value = "";
    hidden.dataset.name = "";
    const query = input.value.trim().toLocaleLowerCase("ar");

    if (!query) {
      resultsBox.innerHTML = "";
      resultsBox.classList.remove("visible");
      return;
    }

    const matches = students.filter((s) => s.name.toLocaleLowerCase("ar").includes(query));

    if (!matches.length) {
      resultsBox.innerHTML = `<div class="search-empty">لا يوجد طالب بهذا الاسم</div>`;
      resultsBox.classList.add("visible");
      return;
    }

    resultsBox.innerHTML = matches.map((s) => `
      <div class="search-item" data-id="${s.id}" data-name="${s.name}">
        <span>${s.name}</span>
        <span class="search-item-group">${s.group}</span>
      </div>
    `).join("");
    resultsBox.classList.add("visible");

    resultsBox.querySelectorAll(".search-item").forEach((item) => {
      item.addEventListener("click", () => {
        hidden.value = item.dataset.id;
        hidden.dataset.name = item.dataset.name;
        input.value = item.dataset.name;
        resultsBox.innerHTML = "";
        resultsBox.classList.remove("visible");
        if (onSelect) onSelect(item.dataset.id);
      });
    });
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.value = "";
      input.dispatchEvent(new Event("input"));
    }
  });

  document.addEventListener("click", (e) => {
    if (!input.contains(e.target) && !resultsBox.contains(e.target)) {
      resultsBox.classList.remove("visible");
    }
  });
}

/* =========================================================
   1) إضافة / خصم النقاط
   ========================================================= */
function setupPointsForm() {
  const addBtn = document.getElementById("addPointsBtn");
  const subtractBtn = document.getElementById("subtractPointsBtn");
  const msg = document.getElementById("pointsMsg");

  addBtn.addEventListener("click", () => submitPoints("add"));
  subtractBtn.addEventListener("click", () => submitPoints("subtract"));

  async function submitPoints(mode) {
    const studentId = document.getElementById("pointsStudentSelect").value;
    const program = document.getElementById("programSelect").value;
    const amount = Number(document.getElementById("pointsAmount").value);
    const reason = document.getElementById("pointsReason").value.trim();
    const studentName = document.getElementById("pointsStudentSelect").dataset.name;

    if (!studentId) {
      showMsg(msg, "اختر طالباً أولاً", "error");
      return;
    }

    if (!amount || amount <= 0) {
      showMsg(msg, "أدخل عدد نقاط صحيح", "error");
      return;
    }

    try {
      const res = await fetch("/api/supervisor/points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, program, amount, reason, mode }),
      });
      const data = await res.json();

      if (!data.success) {
        showMsg(msg, data.message || "حدث خطأ", "error");
        return;
      }

      const actionLabel = mode === "subtract" ? "خصم" : "إضافة";
      showMsg(msg, `تم ${actionLabel} ${amount} نقطة لـ ${studentName} بنجاح ✅`, "success");
      document.getElementById("pointsAmount").value = "";
      document.getElementById("pointsReason").value = "";

      updateStudentRowInTable(data.student);
    } catch (err) {
      showMsg(msg, "حدث خطأ في الاتصال بالخادم", "error");
    }
  }
}

/* =========================================================
   2) تسجيل حضور يدوي لجلسة محددة
   ========================================================= */
function setupAttendanceForm() {
  const submitBtn = document.getElementById("attendanceSubmitBtn");
  const msg = document.getElementById("attendanceMsg");

  submitBtn.addEventListener("click", async () => {
    const studentId = document.getElementById("attendanceStudentSelect").value;
    const sessionId = document.getElementById("attendanceSessionSelect").value;
    const status = document.getElementById("attendanceStatusSelect").value;
    const studentName = document.getElementById("attendanceStudentSelect").dataset.name;

    if (!studentId) {
      showMsg(msg, "اختر طالباً أولاً", "error");
      return;
    }

    try {
      const res = await fetch("/api/supervisor/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, status, sessionId }),
      });
      const data = await res.json();

      if (!data.success) {
        showMsg(msg, data.message || "حدث خطأ", "error");
        return;
      }

      const statusMsg = status === "غايب" ? `تم تسجيل غياب ${studentName} ✅`
        : status === "متأخر" ? `تم تسجيل تأخر ${studentName} ✅`
        : `تم تسجيل حضور ${studentName} ✅`;
      showMsg(msg, statusMsg, "success");
    } catch (err) {
      showMsg(msg, "حدث خطأ في الاتصال بالخادم", "error");
    }
  });
}

/* =========================================================
   2.5) تقييم متطلبات البرنامج المعرفي
   المشرف هو من يحدّد إنجاز كل متطلب (الطالب يخبره شخصياً)
   ========================================================= */
function setupKnowledgeTasksPanel() {
  loadTaskConfig();
  const saveBtn = document.getElementById("saveTaskConfigBtn");
  if (saveBtn) saveBtn.addEventListener("click", saveTaskConfig);
}

/* تحميل إعدادات نقاط المتطلبات وعرضها في القسم العالمي */
async function loadTaskConfig() {
  const configBox = document.getElementById("taskConfigList");
  if (!configBox) return;

  try {
    const res = await fetch("/api/supervisor/task-config");
    const data = await res.json();
    if (!data.success) return;

    configBox.innerHTML = data.config.map((t) => `
      <div class="task-config-row">
        <span class="task-config-title">${t.title}</span>
        <input type="number" class="task-config-input" data-title="${t.title}"
          min="1" placeholder="0" value="${t.points > 0 ? t.points : ""}">
        <span class="task-points-label">نقطة</span>
      </div>
    `).join("");
  } catch (e) {
    configBox.innerHTML = `<p class="form-msg error">تعذر تحميل الإعدادات</p>`;
  }
}

/* حفظ إعدادات النقاط عالمياً */
async function saveTaskConfig() {
  const inputs = document.querySelectorAll(".task-config-input");
  const saveBtn = document.getElementById("saveTaskConfigBtn");
  const msg = document.getElementById("taskConfigMsg");

  const configs = Array.from(inputs).map((inp) => ({
    title: inp.dataset.title,
    points: Number(inp.value) || 0,
  }));

  if (configs.some((c) => c.points <= 0)) {
    showMsg(msg, "أدخل قيمة نقاط لكل متطلب", "error");
    return;
  }

  saveBtn.disabled = true;
  try {
    const res = await fetch("/api/supervisor/task-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ configs }),
    });
    const data = await res.json();
    showMsg(msg, data.success ? "تم حفظ النقاط بنجاح ✅" : "حدث خطأ", data.success ? "success" : "error");
  } catch (e) {
    showMsg(msg, "حدث خطأ في الاتصال", "error");
  } finally {
    saveBtn.disabled = false;
  }
}

async function loadKnowledgeTasks(studentId) {
  const list = document.getElementById("knowledgeTasksList");
  const msg = document.getElementById("tasksMsg");
  list.innerHTML = "جارٍ التحميل...";
  msg.textContent = "";

  try {
    const res = await fetch(`/api/students/${studentId}`);
    const data = await res.json();

    if (!data.success) {
      list.innerHTML = "";
      showMsg(msg, "تعذر تحميل متطلبات هذا الطالب", "error");
      return;
    }

    const tasks = data.student.knowledge_tasks;
    if (!tasks.length) {
      list.innerHTML = `<p class="empty-note">لا توجد متطلبات معرَّفة لهذا الطالب</p>`;
      return;
    }

    list.innerHTML = tasks.map((t) => `
      <div class="task-toggle-item">
        <input type="checkbox" class="task-toggle-checkbox" data-task-id="${t.id}" ${t.done ? "checked" : ""}>
        <span class="task-toggle-title">${t.title}</span>
        ${t.done && t.points ? `<span class="task-done-points">${t.points} نقطة</span>` : ""}
      </div>
    `).join("");

    list.querySelectorAll(".task-toggle-checkbox").forEach((checkbox) => {
      checkbox.addEventListener("change", async () => {
        const taskId = checkbox.dataset.taskId;
        const done = checkbox.checked;
        checkbox.disabled = true;
        try {
          const res = await fetch("/api/supervisor/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId, done }),
          });
          const data = await res.json();
          if (!data.success) {
            checkbox.checked = !done;
            showMsg(msg, data.message || "حدث خطأ", "error");
          } else {
            const action = done ? "تم إنجاز" : "تم إلغاء إنجاز";
            const pts = data.task && data.task.points;
            showMsg(msg, action + " [" + data.task.title + "]" + (done && pts ? " (+" + pts + " نقطة) ✅" : " ✅"), "success");
            const sid = document.getElementById("tasksStudentSelect").value;
            if (sid) loadKnowledgeTasks(sid);
          }
        } catch (err) {
          checkbox.checked = !done;
          showMsg(msg, "حدث خطأ في الاتصال بالخادم", "error");
        } finally {
          checkbox.disabled = false;
        }
      });
    });
  } catch (err) {
    list.innerHTML = "";
    showMsg(msg, "حدث خطأ في الاتصال بالخادم", "error");
  }
}

/* =========================================================
   مساعد: عرض رسالة نجاح/خطأ في النماذج
   ========================================================= */
function showMsg(el, text, type) {
  el.textContent = text;
  el.className = "form-msg " + type;
}

/* =========================================================
   مساعد: تحديث صف الطالب في الجدول بعد تعديل نقاطه
   ========================================================= */
function updateStudentRowInTable(student) {
  const row = document.querySelector(`tr[data-student-id="${student.id}"]`);
  if (!row) return;

  row.querySelector(".cell-knowledge").textContent = student.knowledge_points;
  row.querySelector(".cell-sports").textContent = student.sports_points;
  row.querySelector(".cell-cultural").textContent = student.cultural_points;
  row.querySelector(".cell-total").innerHTML = `<strong>${student.total_points}</strong>`;
}

/* =========================================================
   3) عرض / طباعة باركود QR لكل طالب (من جدول المشرف)
   ========================================================= */
function setupBarcodeModal() {
  const modal = document.getElementById("barcodeModal");
  const closeBtn = document.getElementById("closeBarcodeModal");
  const nameEl = document.getElementById("barcodeModalName");
  const codeEl = document.getElementById("barcodeModalCode");
  const canvasHolder = document.getElementById("barcodeModalCanvas");
  const printBtn = document.getElementById("printBarcodeBtn");

  let currentStudent = null;

  document.querySelectorAll(".btn-show-barcode").forEach((btn) => {
    btn.addEventListener("click", () => {
      const barcode = btn.dataset.barcode;
      const name = btn.dataset.name;
      currentStudent = { barcode, name };

      nameEl.textContent = name;
      codeEl.textContent = barcode;
      canvasHolder.innerHTML = "";

      new QRCode(canvasHolder, {
        text: barcode,
        width: 180,
        height: 180,
        colorDark: "#1B4332",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H,
      });

      modal.classList.remove("hidden");
    });
  });

  closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });

  printBtn.addEventListener("click", () => {
    if (!currentStudent) return;
    printSingleBarcode(currentStudent);
  });
}

function printSingleBarcode(student) {
  const win = window.open("", "_blank", "width=420,height=560");
  win.document.write(`
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>باركود ${student.name}</title>
      <style>
        body { font-family: 'Tajawal', Arial, sans-serif; text-align:center; padding:30px; }
        h2 { color:#1B4332; margin-bottom:4px; }
        p { color:#555; margin:4px 0; }
        #qrPrint { margin:20px auto; }
        .code { font-size:18px; font-weight:bold; letter-spacing:1px; margin-top:10px; }
      </style>
    </head>
    <body>
      <h2>نادي القيروان</h2>
      <p>${student.name}</p>
      <div id="qrPrint"></div>
      <div class="code">${student.barcode}</div>
    </body>
    </html>
  `);
  win.document.close();

  const script = win.document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js";
  script.onload = () => {
    new win.QRCode(win.document.getElementById("qrPrint"), {
      text: student.barcode,
      width: 200,
      height: 200,
      colorDark: "#1B4332",
      colorLight: "#ffffff",
    });
    setTimeout(() => win.print(), 400);
  };
  win.document.body.appendChild(script);
}

/* =========================================================
   4) تشغيل الكاميرا ومسح الباركود لتسجيل حضور تلقائي
   ========================================================= */
function setupScanner() {
  const scanBtn = document.getElementById("startScanBtn");
  if (!scanBtn) return;

  scanBtn.addEventListener("click", () => {
    if (!qrScannerActive) {
      document.getElementById("scannerWrapper").classList.remove("hidden");
      scanBtn.textContent = "إيقاف الكاميرا";
      startBarcodeScanner(handleScannedAttendance);
    } else {
      stopBarcodeScanner();
      document.getElementById("scannerWrapper").classList.add("hidden");
      scanBtn.textContent = "تشغيل الكاميرا لمسح الباركود";
      document.getElementById("scannerResult").innerHTML = "";
    }
  });
}

function startBarcodeScanner(onScanSuccess) {
  const video = document.getElementById("scannerVideo");
  const canvas = document.getElementById("scannerCanvas");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("scannerStatus");

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    statusEl.textContent = "المتصفح لا يدعم الوصول للكاميرا. جرّب متصفح آخر أو فعّل الأذونات.";
    statusEl.className = "scanner-status error";
    return;
  }

  navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
    .then((stream) => {
      qrStream = stream;
      video.srcObject = stream;
      video.setAttribute("playsinline", true);
      video.play();
      qrScannerActive = true;
      statusEl.textContent = "وجّه الكاميرا نحو باركود الطالب...";
      statusEl.className = "scanner-status";
      requestAnimationFrame(() => tickScanner(video, canvas, ctx, onScanSuccess));
    })
    .catch((err) => {
      console.error(err);
      statusEl.textContent = "تعذّر الوصول إلى الكاميرا. تأكد من السماح بالصلاحية.";
      statusEl.className = "scanner-status error";
    });
}

function tickScanner(video, canvas, ctx, onScanSuccess) {
  if (!qrScannerActive) return;

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.height = video.videoHeight;
    canvas.width = video.videoWidth;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });

    if (code && code.data) {
      qrScannerActive = false; // نوقف القراءة لحظياً لحين معالجة النتيجة
      onScanSuccess(code.data);
      return;
    }
  }

  qrAnimationFrame = requestAnimationFrame(() => tickScanner(video, canvas, ctx, onScanSuccess));
}

function stopBarcodeScanner() {
  qrScannerActive = false;
  if (qrAnimationFrame) cancelAnimationFrame(qrAnimationFrame);
  if (qrStream) {
    qrStream.getTracks().forEach((track) => track.stop());
    qrStream = null;
  }
  const video = document.getElementById("scannerVideo");
  if (video) video.srcObject = null;
}

/* عند نجاح مسح الباركود: نرسله للخادم ليُسجَّل الحضور تلقائياً */
async function handleScannedAttendance(code) {
  const statusEl = document.getElementById("scannerStatus");
  const resultEl = document.getElementById("scannerResult");

  try {
    const res = await fetch("/api/supervisor/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ barcode: code }),
    });
    const data = await res.json();

    if (!data.success) {
      statusEl.textContent = data.message || "لم يُعثر على طالب بهذا الباركود.";
      statusEl.className = "scanner-status error";
      resultEl.innerHTML = "";
      resumeScanningAfter(1500);
      return;
    }

    const student = data.student;

    if (data.alreadyMarked) {
      statusEl.textContent = `تم تسجيل حضور ${student.name} مسبقاً اليوم.`;
      statusEl.className = "scanner-status warning";
    } else {
      statusEl.textContent = "تم تسجيل الحضور بنجاح ✅";
      statusEl.className = "scanner-status success";
    }

    resultEl.innerHTML = `
      <div class="scan-result-card">
        <div class="scan-result-name">${student.name}</div>
        <div class="scan-result-group">${student.group_name}</div>
      </div>
    `;

    resumeScanningAfter(2000);
  } catch (err) {
    statusEl.textContent = "حدث خطأ في الاتصال بالخادم";
    statusEl.className = "scanner-status error";
    resumeScanningAfter(1500);
  }
}

/* إعادة تشغيل قراءة الكاميرا بعد فترة (إن كانت لا تزال مفتوحة) */
function resumeScanningAfter(delay) {
  setTimeout(() => {
    const video = document.getElementById("scannerVideo");
    const canvas = document.getElementById("scannerCanvas");
    if (video && video.srcObject) {
      qrScannerActive = true;
      const ctx = canvas.getContext("2d");
      tickScanner(video, canvas, ctx, handleScannedAttendance);
    }
  }, delay);
}

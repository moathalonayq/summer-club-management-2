/* =========================================================
   public/js/guardian.js
   منطق بوابة ولي الأمر: بحث AJAX عن الطالب + عرض تفاصيله
   مع إضافة "ترتيبه داخل مجموعته"
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("guardianSearchInput");
  const resultsBox = document.getElementById("guardianSearchResults");
  const detailsBox = document.getElementById("guardianDetails");

  let debounceTimer = null;

  // إذا وصلنا من رابط طالب محدد (مثلاً من صفحة المجموعات) نعرض ملفه التعريفي مباشرة
  const presetStudentId = new URLSearchParams(window.location.search).get("student");
  if (presetStudentId) {
    loadStudentProfile(presetStudentId);
  }

  input.addEventListener("input", () => {
    const query = input.value.trim();
    detailsBox.innerHTML = "";

    clearTimeout(debounceTimer);

    if (!query) {
      resultsBox.innerHTML = "";
      resultsBox.classList.remove("visible");
      return;
    }

    debounceTimer = setTimeout(() => searchStudents(query), 250);
  });

  async function searchStudents(query) {
    try {
      const res = await fetch(`/api/students/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (!data.success || !data.results.length) {
        resultsBox.innerHTML = `<div class="search-empty">لا يوجد طالب بهذا الاسم</div>`;
        resultsBox.classList.add("visible");
        return;
      }

      resultsBox.innerHTML = data.results.map(s => `
        <div class="search-item" data-id="${s.id}">
          <span>${s.name}</span>
          <span class="search-item-group">${s.group_name}</span>
        </div>
      `).join("");
      resultsBox.classList.add("visible");

      resultsBox.querySelectorAll(".search-item").forEach(item => {
        item.addEventListener("click", () => {
          const id = item.dataset.id;
          loadStudentProfile(id);
          resultsBox.classList.remove("visible");
          input.value = item.querySelector("span").textContent;
        });
      });
    } catch (err) {
      resultsBox.innerHTML = `<div class="search-empty">حدث خطأ في البحث، حاول مرة أخرى</div>`;
      resultsBox.classList.add("visible");
    }
  }

  async function loadStudentProfile(id) {
    try {
      const res = await fetch(`/api/students/${id}`);
      const data = await res.json();

      if (!data.success) {
        detailsBox.innerHTML = `<p class="empty-note">تعذر عرض بيانات الطالب</p>`;
        return;
      }

      renderStudentProfile(data.student, data.groupRank, data.groupSize, data.overallRank, data.totalStudents, detailsBox);
    } catch (err) {
      detailsBox.innerHTML = `<p class="empty-note">حدث خطأ أثناء جلب بيانات الطالب</p>`;
    }
  }

  function formatDateArabic(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
  }

  function getAttendanceRate(attendance) {
    // نتجاهل الجلسات التي لم تُسجَّل لها حالة بعد (status=null) عند حساب النسبة
    const recorded = (attendance || []).filter(a => a.status !== null);
    if (!recorded.length) return { rate: 0, present: 0, late: 0, absent: 0 };

    const present = recorded.filter(a => a.status === "حاضر").length;
    const late = recorded.filter(a => a.status === "متأخر").length;
    const absent = recorded.filter(a => a.status === "غايب").length;
    const rate = Math.round(((present + late * 0.5) / recorded.length) * 100);
    return { rate, present, late, absent };
  }

  function renderStudentProfile(student, groupRank, groupSize, overallRank, totalStudents, container) {
    const att = getAttendanceRate(student.attendance);
    const recordedSessions = student.attendance.filter(a => a.status !== null);
    const lastStatus = recordedSessions.length
      ? recordedSessions[recordedSessions.length - 1].status
      : "لا يوجد سجل بعد";

    const statusClass = lastStatus === "حاضر" ? "badge-success"
      : lastStatus === "متأخر" ? "badge-warning"
      : lastStatus === "غايب" ? "badge-danger" : "badge-muted";

    const doneTasks = student.knowledge_tasks.filter(t => t.done).length;
    const totalTasks = student.knowledge_tasks.length;

    container.innerHTML = `
      <div class="profile-card">
        <div class="profile-header">
          <div>
            <h3>${student.name}</h3>
            <p class="profile-sub">${student.group_name} • رمز الباركود: ${student.barcode}</p>
          </div>
          <div class="profile-rank">
            <span class="rank-number">#${groupRank}</span>
            <span class="rank-label">ترتيبه بين ${groupSize} في مجموعته</span>
            <span class="rank-number" style="font-size:18px; margin-top:6px;">#${overallRank}</span>
            <span class="rank-label">ترتيبه العام بين ${totalStudents} طالب</span>
          </div>
        </div>

        <div class="profile-grid">
          <div class="info-box">
            <div class="info-title">آخر حالة حضور</div>
            <span class="badge ${statusClass}">${lastStatus}</span>
            <div class="info-detail">نسبة الحضور: ${att.rate}% (${att.present} حاضر، ${att.late} متأخر، ${att.absent} غايب)</div>
          </div>

          <div class="info-box">
            <div class="info-title">إجمالي النقاط</div>
            <div class="big-number">${student.total_points}</div>
          </div>
        </div>

        <div class="points-breakdown">
          <div class="point-item knowledge">
            <span class="point-label">البرنامج المعرفي</span>
            <span class="point-value">${student.knowledge_points}</span>
          </div>
          <div class="point-item sports">
            <span class="point-label">البرنامج الرياضي</span>
            <span class="point-value">${student.sports_points}</span>
          </div>
          <div class="point-item cultural">
            <span class="point-label">البرنامج الترفيهي</span>
            <span class="point-value">${student.cultural_points}</span>
          </div>
        </div>

        <div class="section-block">
          <h4>متطلبات البرنامج المعرفي (${doneTasks}/${totalTasks})</h4>
          <ul class="task-list">
            ${student.knowledge_tasks.map(t => `
              <li class="${t.done ? "task-done" : "task-pending"}">
                <span class="task-icon">${t.done ? "✔" : "○"}</span> ${t.title}
              </li>
            `).join("")}
          </ul>
        </div>

        <div class="section-block">
          <h4>المبادرات والأعمال المميزة</h4>
          ${student.initiatives.length ? `
            <ul class="initiative-list">
              ${student.initiatives.map(i => `
                <li>
                  <span>${i.title}</span>
                  <span class="initiative-points">${i.points >= 0 ? "+" : ""}${i.points} نقطة</span>
                  <span class="initiative-date">${formatDateArabic(i.created_at)}</span>
                </li>
              `).join("")}
            </ul>
          ` : `<p class="empty-note">لا توجد مبادرات مسجلة حتى الآن</p>`}
        </div>

        <div class="section-block">
          <h4>سجل الحضور (3 أسابيع × 3 أيام: الاثنين، الثلاثاء، الأربعاء)</h4>
          <div class="attendance-weeks">
            ${(() => {
              const today = new Date().toISOString().slice(0, 10);
              // نعرض فقط الأيام الماضية والحالية — تسجيل حضور ليوم لم يأتِ بعد غير منطقي
              const pastOrToday = student.attendance.filter(a => a.session_date <= today);

              if (!pastOrToday.length) {
                return `<p class="empty-note">لم تبدأ أي جلسة بعد</p>`;
              }

              return [1, 2, 3].map(weekNum => {
                const weekSessions = pastOrToday.filter(a => a.week_number === weekNum);
                if (!weekSessions.length) return "";

                return `
                  <div class="attendance-week">
                    <div class="attendance-week-title">الأسبوع ${weekNum}</div>
                    <div class="attendance-grid">
                      ${weekSessions.map(a => {
                        const cls = a.status === "حاضر" ? "att-present"
                          : a.status === "متأخر" ? "att-late"
                          : a.status === "غايب" ? "att-absent"
                          : "att-pending";
                        const label = a.status || "لم تُسجَّل بعد";
                        return `
                          <div class="att-chip ${cls}" title="${a.session_date}">
                            <span class="att-chip-day">${a.day_name}</span>
                            <span class="att-chip-status">${label}</span>
                          </div>
                        `;
                      }).join("")}
                    </div>
                  </div>
                `;
              }).join("");
            })()}
          </div>
        </div>
      </div>
    `;
  }
});

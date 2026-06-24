const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);
const money = (value) => Number(value).toLocaleString("ru-RU") + " ₽";
const cats = { enduro: "Эндуро", naked: "Нейкед", touring: "Туризм", sport: "Спорт", classic: "Классика" };
const fallbackImage = "/placeholder-moto.svg";

let allLeads = [];
let allReviews = [];
let reviewFilterStatus = '';

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: options.body instanceof FormData ? {} : { "Content-Type": "application/json" },
    ...options,
  });
  if (response.status === 401) location.href = "/control";
  if (!response.ok) throw new Error((await response.json()).error || "Ошибка сервера");
  return response.json();
}

function toast(text, error = false) {
  const el = $("#toast");
  el.textContent = text;
  el.style.borderColor = error ? "var(--red)" : "var(--green)";
  el.style.background = error ? "rgba(227,6,19,0.14)" : "rgba(24,164,93,0.14)";
  el.style.color = error ? "#ffb6bb" : "#a5f0c9";
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3500);
}

function getFilteredLeads() {
  const search = ($("#filter-search")?.value || "").toLowerCase().trim();
  const type = $("#filter-type")?.value || "";
  const status = $("#filter-status")?.value || "";
  const from = $("#filter-date-from")?.value;
  const to = $("#filter-date-to")?.value;

  return allLeads.filter(lead => {
    if (search) {
      const name = (lead.name || "").toLowerCase();
      const phone = (lead.phone || "").toLowerCase();
      const msg = (lead.message || "").toLowerCase();
      const model = (lead.model || "").toLowerCase();
      if (!name.includes(search) && !phone.includes(search) && !msg.includes(search) && !model.includes(search)) return false;
    }
    if (type && lead.type !== type) return false;
    if (status && lead.status !== status) return false;
    if (from || to) {
      const created = lead.created_at ? new Date(lead.created_at) : null;
      if (!created) return false;
      if (from) {
        const fromDate = new Date(from);
        fromDate.setHours(0,0,0,0);
        if (created < fromDate) return false;
      }
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23,59,59,999);
        if (created > toDate) return false;
      }
    }
    return true;
  });
}

async function renderLeads() {
  if (allLeads.length === 0) {
    allLeads = await api("/api/admin/leads");
  }
  const groups = {
    "Новые": allLeads.filter(l => l.status === "Новая").length,
    "В работе": allLeads.filter(l => l.status === "В работе").length,
    "Всего": allLeads.length,
  };
  $("#leadStats").innerHTML = Object.entries(groups).map(([k, v]) =>
    `<div class="metric"><b>${v}</b><span>${k}</span></div>`
  ).join("");

  const filtered = getFilteredLeads();
  $("#leads").innerHTML = filtered.length ?
    filtered.map(lead => `
      <article class="row">
        <div>
          <h3>${lead.name} · ${lead.phone}</h3>
          <p>${lead.created_display || lead.created_at || ""}<br>Тип: ${lead.type}. Модель: ${lead.model || "не выбрана"}.<br>${lead.message || "Без комментария"}</p>
        </div>
        <div class="actions">
          <select class="status" data-lead-status="${lead.id}">
            ${["Новая", "В работе", "Завершена"].map(s => `<option ${lead.status === s ? "selected" : ""}>${s}</option>`).join("")}
          </select>
          <button class="danger" data-delete-lead="${lead.id}">Удалить</button>
        </div>
      </article>
    `).join("") :
    `<div class="empty">Заявок с такими фильтрами не найдено.</div>`;
}

async function exportToExcel() {
  if (allLeads.length === 0) {
    try { allLeads = await api("/api/admin/leads"); } catch(e) { toast("Не удалось загрузить заявки", true); return; }
  }
  let data = getFilteredLeads();
  if (data.length === 0) {
    if (allLeads.length === 0) toast("Нет заявок для экспорта", true);
    else toast("Нет заявок, соответствующих фильтрам", true);
    return;
  }
  const headers = ["ID", "Дата создания", "Имя", "Телефон", "Тип", "Модель", "Комментарий", "Статус"];
  const rows = data.map(l => [
    l.id || "",
    l.created_display || l.created_at || "",
    `"${(l.name || "").replace(/"/g, '""')}"`,
    `"${(l.phone || "").replace(/"/g, '""')}"`,
    `"${(l.type || "").replace(/"/g, '""')}"`,
    `"${(l.model || "не выбрана").replace(/"/g, '""')}"`,
    `"${(l.message || "Без комментария").replace(/\n/g, " ").replace(/"/g, '""')}"`,
    `"${(l.status || "").replace(/"/g, '""')}"`
  ]);
  const csv = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `leads_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  toast("Файл скачан!");
}

async function renderMotos() {
  const motos = await api("/api/admin/motos");
  $("#motos").innerHTML = motos.length ?
    motos.map(moto => {
      const images = Array.isArray(moto.image) ? moto.image : (moto.image ? String(moto.image).split(',').map(s => s.trim()) : []);
      const preview = images.length ? images[0] : fallbackImage;
      return `
        <article class="row">
          <div>
            <h3>Motoland ${moto.name} · ${money(moto.price)}</h3>
            <p>${cats[moto.category] || moto.category}, ${moto.engine}, ${moto.power}<br>${moto.description}</p>
          </div>
          <div class="actions">
            <img class="moto-image" src="${preview}" alt="" onerror="this.onerror=null;this.src='${fallbackImage}'">
            <button class="danger" data-delete-moto="${moto.id}">Скрыть</button>
          </div>
        </article>
      `;
    }).join("") :
    `<div class="empty">Моделей нет.</div>`;
}

$("#imageFiles")?.addEventListener("change", function() {
  const preview = $("#filePreview");
  preview.innerHTML = "";
  if (this.files) {
    Array.from(this.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = document.createElement("img");
        img.src = e.target.result;
        preview.appendChild(img);
      };
      reader.readAsDataURL(file);
    });
  }
});

async function renderReviews() {
  const url = `/api/admin/reviews${reviewFilterStatus ? '?status='+reviewFilterStatus : ''}`;
  allReviews = await api(url);
  const list = document.getElementById('reviewsAdminList');
  if (!list) return;
  if (allReviews.length === 0) {
    list.innerHTML = `<div class="empty">Нет отзывов</div>`;
    return;
  }
  list.innerHTML = allReviews.map(r => `
    <article class="row">
      <div>
        <h3>${r.name} · ${'★'.repeat(r.rating)}</h3>
        <p>${r.text}</p>
        <small>${r.created_display || ''} · Статус: <strong>${r.status}</strong></small>
      </div>
      <div class="actions">
        ${r.status === 'pending' ? `
          <button class="green-btn" data-review-action="${r.id}" data-status="approved">✅ Принять</button>
          <button class="danger" data-review-action="${r.id}" data-status="rejected">❌ Отклонить</button>
        ` : `
          <button class="danger" data-review-action="${r.id}" data-status="delete">🗑 Удалить</button>
        `}
      </div>
    </article>
  `).join('');
}

async function boot() {
  await api("/api/admin/session");
  allLeads = [];
  await renderLeads();
  await renderMotos();
  await renderReviews();

  const filterInputs = ["filter-search", "filter-type", "filter-status", "filter-date-from", "filter-date-to"];
  filterInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", renderLeads);
      el.addEventListener("change", renderLeads);
    }
  });
  $("#filter-reset")?.addEventListener("click", () => {
    filterInputs.forEach(id => { const el = document.getElementById(id); if(el) el.value = ""; });
    renderLeads();
  });
  $("#export-excel")?.addEventListener("click", exportToExcel);

  // Фильтры для отзывов
  document.querySelectorAll('[data-filter-status]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter-status]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      reviewFilterStatus = btn.dataset.filterStatus || '';
      renderReviews();
    });
  });
}

$$(".tab").forEach(tab => tab.addEventListener("click", () => {
  $$(".tab").forEach(t => t.classList.remove("active"));
  $$(".view").forEach(v => v.classList.remove("active"));
  tab.classList.add("active");
  const view = document.getElementById("view-" + tab.dataset.view);
  if (view) view.classList.add("active");
  document.getElementById("pageTitle").textContent = tab.textContent;
}));

document.addEventListener("change", async (event) => {
  const statusEl = event.target.closest("[data-lead-status]");
  if (!statusEl) return;
  await api(`/api/admin/leads/${statusEl.dataset.leadStatus}`, {
    method: "PATCH",
    body: JSON.stringify({ status: statusEl.value }),
  });
  toast("Статус обновлён");
  allLeads = [];
  await renderLeads();
});

document.addEventListener("click", async (event) => {
  const leadBtn = event.target.closest("[data-delete-lead]");
  if (leadBtn && confirm("Удалить заявку?")) {
    await api(`/api/admin/leads/${leadBtn.dataset.deleteLead}`, { method: "DELETE" });
    toast("Заявка удалена");
    allLeads = [];
    await renderLeads();
  }
  const motoBtn = event.target.closest("[data-delete-moto]");
  if (motoBtn && confirm("Скрыть модель?")) {
    await api(`/api/admin/motos/${motoBtn.dataset.deleteMoto}`, { method: "DELETE" });
    toast("Модель скрыта");
    await renderMotos();
  }
  const reviewBtn = event.target.closest("[data-review-action]");
  if (reviewBtn) {
    const id = reviewBtn.dataset.reviewAction;
    const status = reviewBtn.dataset.status;
    if (status === 'delete') {
      if (!confirm('Удалить отзыв?')) return;
      await api(`/api/admin/reviews/${id}`, { method: 'DELETE' });
      toast('Отзыв удалён');
    } else {
      await api(`/api/admin/reviews/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      toast('Статус обновлён');
    }
    await renderReviews();
  }
});

$("#motoForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  try {
    await api("/api/admin/motos", {
      method: "POST",
      body: formData,
    });
    form.reset();
    $("#filePreview").innerHTML = "";
    toast("Модель добавлена");
    await renderMotos();
  } catch (error) {
    toast(error.message, true);
  }
});

$("#logout").addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST" });
  location.href = "/control";
});

boot().catch(error => toast(error.message, true));
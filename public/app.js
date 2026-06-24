const state = { motos: [], filter: "all", sort: "default", selected: null, currentImageIndex: 0 };
const cats = { all: "Все", enduro: "Эндуро", naked: "Нейкед", touring: "Туризм", sport: "Спорт", classic: "Классика" };
const money = (value) => Number(value).toLocaleString("ru-RU") + " ₽";
const fallbackImage = "/placeholder-moto.svg";
const $ = (selector) => document.querySelector(selector);

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  if (!response.ok) throw new Error((await response.json()).error || "Ошибка сервера");
  return response.json();
}

function motosForView() {
  let list = state.filter === "all" ? [...state.motos] : state.motos.filter((m) => m.category === state.filter);
  if (state.sort === "price-asc") list.sort((a, b) => a.price - b.price);
  if (state.sort === "price-desc") list.sort((a, b) => b.price - a.price);
  if (state.sort === "name") list.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return list;
}

function renderFilters() {
  $("#filters").innerHTML = Object.entries(cats).map(([key, label]) =>
    `<button class="${state.filter === key ? "active" : ""}" data-filter="${key}">${label}</button>`
  ).join("");
}

function renderCatalog() {
  renderFilters();
  const heroCount = document.querySelector('.hero-stats strong:first-child');
  if (heroCount) heroCount.textContent = state.motos.length;
  $("#modelSelect").innerHTML = `<option value="">Не выбрано</option>` +
    state.motos.map((m) => `<option value="Motoland ${m.name}">Motoland ${m.name}</option>`).join("");

  const list = motosForView();
  $("#catalogGrid").innerHTML = list.map((m) => {
    const images = Array.isArray(m.image) ? m.image : (m.image ? String(m.image).split(',').map(s => s.trim()) : []);
    const mainImage = images.length > 0 ? images[0] : fallbackImage;
    return `
    <article class="card" data-id="${m.id}">
      <div class="card-image"><img src="${mainImage}" alt="Motoland ${m.name}" loading="lazy" onerror="this.onerror=null;this.src='${fallbackImage}'">${m.badge ? `<span class="badge">${m.badge}</span>` : ""}</div>
      <div class="card-body">
        <span class="card-category">${cats[m.category] || m.category}</span>
        <h3>Motoland ${m.name}</h3>
        <div class="specs">
          <div><b>${m.engine}</b><span>Объем</span></div>
          <div><b>${m.power}</b><span>Мощность</span></div>
          <div><b>${m.weight}</b><span>Масса</span></div>
          <div><b>${m.speed}</b><span>Скорость</span></div>
        </div>
        <div class="card-foot">
          <div class="price">${m.old_price ? `<span class="old">${money(m.old_price)}</span>` : ""}${money(m.price)}</div>
          <button class="btn secondary" data-moto="${m.id}">Подробнее</button>
        </div>
      </div>
    </article>`;
  }).join("");
}

function openMoto(id) {
  const moto = state.motos.find((m) => m.id === id);
  if (!moto) return;
  state.selected = moto;
  state.currentImageIndex = 0;
  const images = Array.isArray(moto.image) ? moto.image : (moto.image ? String(moto.image).split(',').map(s => s.trim()) : []);
  const displayImages = images.length > 0 ? images : [fallbackImage];
  const dialog = $("#motoDialog");
  dialog.dataset.images = JSON.stringify(displayImages);
  showImage(0);
  $("#dialogCategory").textContent = cats[moto.category] || moto.category;
  $("#dialogName").textContent = "Motoland " + moto.name;
  $("#dialogPrice").textContent = money(moto.price);
  $("#dialogDesc").textContent = moto.description;
  $("#dialogSpecs").innerHTML = [
    ["Объем", moto.engine],
    ["Мощность", moto.power],
    ["Масса", moto.weight],
    ["Скорость", moto.speed]
  ].map(([label, value]) => `<div><b>${value}</b><span>${label}</span></div>`).join("");
  dialog.showModal();
}

function showImage(index) {
  const dialog = $("#motoDialog");
  const images = JSON.parse(dialog.dataset.images || '[]');
  if (!images.length) return;
  if (index < 0) index = images.length - 1;
  if (index >= images.length) index = 0;
  state.currentImageIndex = index;
  const img = $("#dialogImage");
  img.src = images[index];
  img.onerror = () => { img.onerror = null; img.src = fallbackImage; };
  img.alt = "Motoland " + (state.selected ? state.selected.name : "");
  const dots = $("#dialogDots");
  dots.innerHTML = images.map((_, i) => `<span class="${i === index ? 'active' : ''}" data-index="${i}"></span>`).join("");
}

// Анимация заголовка
function animateHeadline() {
  const headline = document.getElementById('headline');
  if (!headline) return;
  const text = headline.innerText.trim();
  headline.innerHTML = '';
  const chars = text.split('');
  chars.forEach((char, index) => {
    const span = document.createElement('span');
    span.className = 'letter';
    span.textContent = char === ' ' ? '\u00A0' : char;
    span.style.animationDelay = (0.05 * index) + 's';
    headline.appendChild(span);
  });
}

// Маска телефона
function setupPhoneMask() {
  const phoneInput = document.querySelector('input[name="phone"]');
  if (!phoneInput) return;
  const mask = IMask(phoneInput, {
    mask: '+{7} (000) 000-00-00',
    lazy: false,
    placeholderChar: '_'
  });
  phoneInput._imask = mask;
}

// Уведомления
function showNotice(text, error = false) {
  const notice = $("#notice");
  notice.textContent = text;
  notice.className = `notice show${error ? " error" : ""}`;
  setTimeout(() => notice.classList.remove("show"), 4500);
}

// ---- ОТЗЫВЫ ----
async function loadReviews() {
  try {
    const reviews = await api('/api/reviews');
    const grid = document.getElementById('reviewsGrid');
    if (!grid) return;
    if (reviews.length === 0) {
      grid.innerHTML = `<div class="empty-reviews">Пока нет отзывов. Будьте первым!</div>`;
      return;
    }
    grid.innerHTML = reviews.map(r => `
      <div class="review-card">
        <div class="review-header">
          <strong>${r.name}</strong>
          <span class="review-rating">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
        </div>
        <p>${r.text}</p>
        <span class="review-date">${new Date(r.created_at).toLocaleDateString('ru-RU')}</span>
      </div>
    `).join('');
  } catch (e) {
    console.error('Ошибка загрузки отзывов:', e);
  }
}

function showReviewForm(show) {
  const wrapper = document.getElementById('reviewFormWrapper');
  if (wrapper) wrapper.style.display = show ? 'block' : 'none';
}

async function submitReview(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  if (!data.name.trim() || !data.text.trim() || !data.rating) {
    alert('Заполните все поля');
    return;
  }
  try {
    await api('/api/reviews', { method: 'POST', body: JSON.stringify(data) });
    form.reset();
    showReviewForm(false);
    alert('Спасибо! Ваш отзыв отправлен на модерацию.');
  } catch (e) {
    alert(e.message || 'Ошибка отправки');
  }
}

function initReviews() {
  const openBtn = document.getElementById('openReviewForm');
  const closeBtn = document.getElementById('closeReviewForm');
  const form = document.getElementById('reviewForm');
  if (openBtn) openBtn.addEventListener('click', () => showReviewForm(true));
  if (closeBtn) closeBtn.addEventListener('click', () => showReviewForm(false));
  if (form) form.addEventListener('submit', submitReview);
}

// ---- Обработчики событий ----
document.addEventListener("click", (event) => {
  const filter = event.target.closest("[data-filter]");
  if (filter) {
    state.filter = filter.dataset.filter;
    renderCatalog();
  }
  const motoBtn = event.target.closest("[data-moto]");
  if (motoBtn) openMoto(motoBtn.dataset.moto);
  const prev = event.target.closest(".prev");
  if (prev) showImage(state.currentImageIndex - 1);
  const next = event.target.closest(".next");
  if (next) showImage(state.currentImageIndex + 1);
  const dot = event.target.closest("#dialogDots span");
  if (dot) showImage(parseInt(dot.dataset.index));
});

$("#sort").addEventListener("change", (event) => {
  state.sort = event.target.value;
  renderCatalog();
});

$("#closeDialog").addEventListener("click", () => $("#motoDialog").close());
$("#dialogLead").addEventListener("click", () => {
  if (state.selected) $("#modelSelect").value = `Motoland ${state.selected.name}`;
  $("#motoDialog").close();
  $("#contact").scrollIntoView({ behavior: "smooth" });
});

$("#leadForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  if (!data.name.trim()) return showNotice("Введите имя.", true);
  const phoneInput = document.querySelector('input[name="phone"]');
  const maskInstance = phoneInput?._imask;
  let rawPhone = maskInstance ? maskInstance.unmaskedValue : (data.phone || '').replace(/\D/g, '');
  let normalized = rawPhone;
  if (normalized.length === 10) normalized = '7' + normalized;
  else if (normalized.length === 11 && normalized.startsWith('8')) normalized = '7' + normalized.slice(1);
  if (normalized.length !== 11 || !normalized.startsWith('7')) {
    return showNotice("Введите корректный номер телефона (11 цифр).", true);
  }
  data.phone = normalized;
  try {
    await api("/api/leads", { method: "POST", body: JSON.stringify(data) });
    form.reset();
    if (maskInstance) maskInstance.updateValue('');
    showNotice("Заявка отправлена. Менеджер скоро свяжется с вами.");
  } catch (error) {
    showNotice(error.message, true);
  }
});

// ---- Загрузка данных ----
(async () => {
  try {
    state.motos = await api("/api/motos");
    renderCatalog();
    setupPhoneMask();
    animateHeadline();
    await loadReviews();
    initReviews();
  } catch (e) {
    console.error(e);
  }
})();
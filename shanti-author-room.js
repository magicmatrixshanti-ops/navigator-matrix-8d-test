(() => {
  'use strict';
  const SHANTI_UID = '872421a4-70fd-4612-9c41-53389612d06d';
  const $ = id => document.getElementById(id);
  const cfg = window.NAVIGATOR_8D_SUPABASE_CONFIG;
  let db = null;
  let user = null;

  function today() { return new Date().toISOString().slice(0, 10); }
  function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;' })[char]); }
  function showMessage(id, text, ok = false) { const box = $(id); box.textContent = text; box.className = 'message' + (ok ? ' ok' : ''); }
  function setBusy(button, busy) { button.disabled = busy; }
  function initDates() { ['thought-date', 'note-date', 'event-date'].forEach(id => { $(id).value = today(); }); }

  function showLogin(text) {
    $('session-status').textContent = text;
    $('login').hidden = false;
    $('logout').hidden = true;
    $('author-content').hidden = true;
  }
  function showDenied() {
    $('session-status').textContent = 'Вход выполнен, но этот экран доступен только автору Шанти.';
    $('login').hidden = true;
    $('logout').hidden = false;
    $('author-content').hidden = true;
  }
  function showAuthor() {
    $('session-status').textContent = 'Авторский вход подтверждён: Шанти.';
    $('login').hidden = true;
    $('logout').hidden = false;
    $('author-content').hidden = false;
    initDates();
  }

  async function sendMagicLink() {
    const email = window.prompt('Введите e-mail, на который приходит авторская ссылка Шанти:');
    if (!email) return;
    $('login').disabled = true;
    $('session-status').textContent = 'Отправляем ссылку для входа…';
    const { error } = await db.auth.signInWithOtp({ email, options: { emailRedirectTo: cfg.magicLinkRedirectTo } });
    $('login').disabled = false;
    if (error) { showLogin('Не удалось отправить ссылку: ' + error.message); return; }
    showLogin('Ссылка для входа отправлена. После перехода по ней откройте эту авторскую страницу снова.');
  }

  async function signOut() { await db.auth.signOut(); showLogin('Авторский вход завершён.'); }

  async function refreshSession() {
    const { data, error } = await db.auth.getUser();
    if (error || !data.user) { showLogin('Войдите по Magic Link Шанти, чтобы открыть авторскую комнату.'); return; }
    user = data.user;
    if (user.id !== SHANTI_UID) { showDenied(); return; }
    showAuthor();
  }
  async function saveThought(publish) {
    const button = publish ? $('thought-publish') : $('thought-save');
    const thoughtDate = $('thought-date').value;
    const title = $('thought-title').value.trim();
    const body = $('thought-body').value.trim();
    if (!thoughtDate || !title || !body) { showMessage('thought-message', 'Заполните дату, заголовок и текст мысли.'); return; }
    setBusy(button, true); showMessage('thought-message', publish ? 'Публикуем мысль…' : 'Сохраняем черновик…');
    const { error } = await db.from('daily_thoughts').upsert({ author_id: user.id, thought_date: thoughtDate, title, body, is_published: publish }, { onConflict: 'thought_date' });
    setBusy(button, false);
    if (error) { showMessage('thought-message', 'Не удалось сохранить: ' + error.message); return; }
    showMessage('thought-message', publish ? 'Мысль опубликована для гостей тестовой гостиной.' : 'Черновик мысли сохранён только для автора.', true);
  }

  async function saveNote() {
    const noteDate = $('note-date').value, title = $('note-title').value.trim(), body = $('note-body').value.trim();
    if (!noteDate || !title || !body) { showMessage('note-message', 'Заполните дату, название и текст заметки.'); return; }
    setBusy($('note-save'), true); showMessage('note-message', 'Сохраняем личную заметку…');
    const { error } = await db.from('author_notes').insert({ author_id: user.id, note_date: noteDate, title, body, visibility: 'closed' });
    setBusy($('note-save'), false);
    if (error) { showMessage('note-message', 'Не удалось сохранить: ' + error.message); return; }
    $('note-title').value = ''; $('note-body').value = '';
    showMessage('note-message', 'Личная заметка сохранена. Гости её не видят.', true);
  }

  async function saveEvent() {
    const title = $('event-title').value.trim(), eventDate = $('event-date').value;
    if (!eventDate || !title) { showMessage('event-message', 'Заполните дату и название события.'); return; }
    setBusy($('event-save'), true); showMessage('event-message', 'Сохраняем закрытую заготовку…');
    const { error } = await db.from('author_event_drafts').insert({
      author_id: user.id, event_date: eventDate, event_time: $('event-time').value || null,
      title, event_format: $('event-format').value, place_or_format: $('event-place').value.trim() || null,
      preparation_note: $('event-note').value.trim() || null, visibility: 'closed'
    });
    setBusy($('event-save'), false);
    if (error) { showMessage('event-message', 'Не удалось сохранить: ' + error.message); return; }
    ['event-title', 'event-time', 'event-place', 'event-note'].forEach(id => { $(id).value = ''; });
    showMessage('event-message', 'Закрытая заготовка события сохранена. Гости её не видят.', true);
  }

  function reviewItem(kind, title, meta, body, action = '') {
    return `<article class="item"><div class="meta">${escapeHtml(kind)} · ${escapeHtml(meta)}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body || 'Описание пока не добавлено.').replace(/\n/g, '<br>')}</p>${action}</article>`;
  }
  async function publishEvent(id, button) {
    if (!window.confirm('Открыть это событие для гостей тестовой гостиной? Закрытые заметки и другие события не изменятся.')) return;
    setBusy(button, true);
    const { error } = await db.from('author_event_drafts').update({ visibility: 'open' }).eq('id', id).eq('author_id', user.id).eq('visibility', 'closed');
    if (error) { setBusy(button, false); window.alert('Не удалось опубликовать событие: ' + error.message); return; }
    await loadReview();
  }
  async function loadReview() {
    const out = $('review-items'); out.innerHTML = '<div class="empty">Обновляем записи из тестовой базы…</div>';
    const [thoughts, notes, events] = await Promise.all([
      db.from('daily_thoughts').select('thought_date,title,body,is_published').eq('author_id', user.id).order('thought_date', { ascending: false }).limit(20),
      db.from('author_notes').select('note_date,title,body,visibility,created_at').eq('author_id', user.id).order('created_at', { ascending: false }).limit(20),
      db.from('author_event_drafts').select('id,event_date,event_time,title,event_format,place_or_format,preparation_note,visibility,created_at').eq('author_id', user.id).order('created_at', { ascending: false }).limit(20)
    ]);
    const errors = [thoughts.error, notes.error, events.error].filter(Boolean);
    if (errors.length) { out.innerHTML = `<div class="empty">Не удалось загрузить записи: ${escapeHtml(errors[0].message)}</div>`; return; }
    const items = [
      ...thoughts.data.map(x => reviewItem(x.is_published ? 'Мысль дня · опубликовано для гостей' : 'Мысль дня · черновик', x.title, x.thought_date, x.body)),
      ...notes.data.map(x => reviewItem('Личная заметка · закрыта', x.title, x.note_date, x.body)),
      ...events.data.map(x => reviewItem(x.visibility === 'open' ? 'Событие · открыто гостям' : 'Заготовка события · закрыта', x.title, [x.event_date, x.event_time, x.event_format, x.place_or_format].filter(Boolean).join(' · '), x.preparation_note, x.visibility === 'closed' ? `<button class="button primary event-publish" type="button" data-event-id="${escapeHtml(x.id)}">Опубликовать для гостей</button>` : ''))
    ];
    out.innerHTML = items.length ? items.join('') : '<div class="empty">Пока нет сохранённых записей. Ничего не создано автоматически.</div>';
    out.querySelectorAll('.event-publish').forEach(button => button.addEventListener('click', () => publishEvent(button.dataset.eventId, button)));
  }
  function bindTabs() {
    document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', async () => {
      document.querySelectorAll('[data-tab]').forEach(item => item.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(item => item.classList.add('hidden'));
      button.classList.add('active'); $(button.dataset.tab).classList.remove('hidden');
      if (button.dataset.tab === 'review') await loadReview();
    }));
  }
  async function start() {
    if (!cfg || !window.supabase) { showLogin('Не найдены настройки тестового Supabase. Экран не может продолжить работу.'); return; }
    db = window.supabase.createClient(cfg.url, cfg.publishableKey);
    $('login').addEventListener('click', sendMagicLink);
    $('logout').addEventListener('click', signOut);
    $('thought-save').addEventListener('click', () => saveThought(false));
    $('thought-publish').addEventListener('click', () => saveThought(true));
    $('note-save').addEventListener('click', saveNote);
    $('event-save').addEventListener('click', saveEvent);
    bindTabs();
    db.auth.onAuthStateChange(() => { void refreshSession(); });
    await refreshSession();
  }
  document.addEventListener('DOMContentLoaded', start);
})();

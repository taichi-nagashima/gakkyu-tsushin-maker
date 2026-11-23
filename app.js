/* ==========================================================
   HOME 学級通信メーカー - Main Application Logic
   ========================================================== */

(() => {
  'use strict';

  const STORAGE_KEY_STATE = 'home_newsletter_state_v1';
  const STORAGE_KEY_DEFAULT_SCHEDULE = 'home_newsletter_default_schedule_v1';
  const STORAGE_KEY_HISTORY = 'home_newsletter_history_v1';
  const STORAGE_KEY_API = 'home_newsletter_gemini_api_key_v1';

  const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
  const FLAG_CYCLE = ['〇', '×', '△', '－'];

  // フォーマット（3年3組）の標準時間割プリセット
  const BUILTIN_DEFAULT_SCHEDULE = [
    { periods: ['学活', '保体', '数学', '社臼', '国語', '理永'], lunch: '〇', clean: '〇', club: '〇', note: '帰学終了予定' },
    { periods: ['理鈴', '数学', '英語', '理永', '社臼', '国語'], lunch: '〇', clean: '×', club: '〇', note: '帰学終了予定' },
    { periods: ['国語', '保体', '英語', '数学', '道徳', '×'], lunch: '〇', clean: '〇', club: '〇', note: '帰学終了予定' },
    { periods: ['総合', '音楽', '社臼', '英語', '保体', '美術'], lunch: '〇', clean: '×', club: '〇', note: '帰学終了予定' },
    { periods: ['理鈴', '数学', '技家', '社窪', '英語', '総合'], lunch: '〇', clean: '〇', club: '〇', note: '帰学終了予定' }
  ];

  // ---------- Utility Functions ----------
  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function formatDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseDateISO(str) {
    if (!str) return null;
    const parts = str.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function getNearestFriday(baseDate = new Date()) {
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
    const day = d.getDay(); // 0=Sun ... 5=Fri, 6=Sat
    const diff = day <= 5 ? (5 - day) : 6; // 土曜なら翌週金曜、それ以外は今週金曜
    d.setDate(d.getDate() + diff);
    return d;
  }

  function getNextMonday(fromDate) {
    const d = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
    const day = d.getDay(); // 0=Sun, 1=Mon...
    const daysToAdd = day === 0 ? 1 : (8 - day);
    d.setDate(d.getDate() + daysToAdd);
    return d;
  }

  function formatJapaneseEraDate(isoStr) {
    const d = parseDateISO(isoStr);
    if (!d) return '令和8年〇〇月〇〇日(金) 発行';
    const year = d.getFullYear();
    const reiwa = year - 2018;
    const eraStr = reiwa >= 1 ? `令和${reiwa === 1 ? '元' : reiwa}年` : `${year}年`;
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const wd = WEEKDAYS[d.getDay()];
    return `${eraStr}${m}月${day}日(${wd}) 発行`;
  }

  function getWeekDates(startIso) {
    const start = parseDateISO(startIso);
    if (!start) {
      return [
        { month: '〇〇', dayLabel: '〇〇(月)' },
        { month: '〇〇', dayLabel: '〇〇(火)' },
        { month: '〇〇', dayLabel: '〇〇(水)' },
        { month: '〇〇', dayLabel: '〇〇(木)' },
        { month: '〇〇', dayLabel: '〇〇(金)' }
      ];
    }
    const list = [];
    for (let i = 0; i < 5; i++) {
      const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      list.push({
        monthNum: cur.getMonth() + 1,
        dayNum: cur.getDate(),
        month: String(cur.getMonth() + 1),
        dayLabel: `${cur.getDate()}(${WEEKDAYS[cur.getDay()]})`
      });
    }
    return list;
  }

  function formatPeriodText(text) {
    const t = (text || '').trim();
    if (!t) return '';
    if (t.includes('\n')) return t;
    if (t.length === 2) return `${t[0]}\n${t[1]}`;
    if (t.length === 3) return `${t.slice(0, 2)}\n${t.slice(2)}`;
    if (t.length === 4) return `${t.slice(0, 2)}\n${t.slice(2)}`;
    return t;
  }

  function getSavedDefaultSchedule() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_DEFAULT_SCHEDULE);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === 5) return parsed;
      }
    } catch (_) {}
    return clone(BUILTIN_DEFAULT_SCHEDULE);
  }

  function createInitialState() {
    const friday = getNearestFriday();
    const nextMon = getNextMonday(friday);
    return {
      logoText: 'HOME',
      schoolName: '川崎市立野川中学校',
      className: '３年３組 学級通信',
      publisherName: '永嶋 裕太',
      issueNumber: 1,
      issueDate: formatDateISO(friday),
      articleTitle: '',
      articleBody: '',
      articleFontSize: '13.5',
      photoCornerTitle: 'フォトコーナー',
      photos: [], // { id, dataUrl, caption }
      parentsNote: '',
      parentsFontSize: '12',
      scheduleStartDate: formatDateISO(nextMon),
      apronGroups: '1・2・3',
      schedule: getSavedDefaultSchedule()
    };
  }

  function loadState() {
    const fallback = createInitialState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY_STATE);
      if (!raw) return fallback;
      const saved = JSON.parse(raw);
      return {
        ...fallback,
        ...saved,
        photos: Array.isArray(saved.photos) ? saved.photos : [],
        schedule: Array.isArray(saved.schedule) && saved.schedule.length === 5
          ? saved.schedule
          : fallback.schedule
      };
    } catch (_) {
      return fallback;
    }
  }

  let state = loadState();
  let zoomMode = 'fit'; // 'fit' or number
  let manualZoom = 0.85;

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(state));
    } catch (err) {
      console.warn('localStorage save failed (maybe quota exceeded):', err);
      showToast('保存容量の上限に近づいています。写真の枚数や履歴を整理してください。', true);
    }
  }

  // ---------- Toast ----------
  let toastTimer = null;
  function showToast(msg, isError = false) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.style.background = isError ? '#b91c1c' : '#0f172a';
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
  }

  // ---------- DOM References ----------
  const els = {
    issueNumber: document.getElementById('issueNumber'),
    issueDate: document.getElementById('issueDate'),
    issueDateDisplay: document.getElementById('issueDateDisplay'),
    articleTitle: document.getElementById('articleTitle'),
    articleBody: document.getElementById('articleBody'),
    articleFontSize: document.getElementById('articleFontSize'),
    articleCharCount: document.getElementById('articleCharCount'),
    parentsNote: document.getElementById('parentsNote'),
    parentsFontSize: document.getElementById('parentsFontSize'),
    parentsCharCount: document.getElementById('parentsCharCount'),
    logoText: document.getElementById('logoText'),
    schoolName: document.getElementById('schoolName'),
    className: document.getElementById('className'),
    publisherName: document.getElementById('publisherName'),
    photoCornerTitle: document.getElementById('photoCornerTitle'),
    photoDropzone: document.getElementById('photoDropzone'),
    photoInput: document.getElementById('photoInput'),
    photoList: document.getElementById('photoList'),
    scheduleStartDate: document.getElementById('scheduleStartDate'),
    apronGroups: document.getElementById('apronGroups'),
    scheduleEditorList: document.getElementById('scheduleEditorList'),
    // AI
    aiArticleMemo: document.getElementById('aiArticleMemo'),
    aiParentsMemo: document.getElementById('aiParentsMemo'),
    aiTone: document.getElementById('aiTone'),
    aiLength: document.getElementById('aiLength'),
    geminiApiKey: document.getElementById('geminiApiKey'),
    aiStatus: document.getElementById('aiStatus'),
    aiPasteResult: document.getElementById('aiPasteResult'),
    // Preview
    previewViewport: document.getElementById('previewViewport'),
    sheetWrapper: document.getElementById('sheetWrapper'),
    zoomLabel: document.getElementById('zoomLabel'),
    pvLogoText: document.getElementById('pvLogoText'),
    pvSchoolName: document.getElementById('pvSchoolName'),
    pvClassIssue: document.getElementById('pvClassIssue'),
    pvPublisher: document.getElementById('pvPublisher'),
    pvIssueDate: document.getElementById('pvIssueDate'),
    pvArticleTitle: document.getElementById('pvArticleTitle'),
    pvArticleBody: document.getElementById('pvArticleBody'),
    pvPhotoTitle: document.getElementById('pvPhotoTitle'),
    pvPhotoGrid: document.getElementById('pvPhotoGrid'),
    pvParentsBody: document.getElementById('pvParentsBody'),
    pvScheduleBanner: document.getElementById('pvScheduleBanner'),
    pvScheduleBody: document.getElementById('pvScheduleBody'),
    // Modal
    historyModal: document.getElementById('historyModal'),
    historyList: document.getElementById('historyList')
  };

  // ---------- Render Editor Fields from State ----------
  function syncInputsFromState() {
    els.issueNumber.value = state.issueNumber;
    els.issueDate.value = state.issueDate;
    els.articleTitle.value = state.articleTitle;
    els.articleBody.value = state.articleBody;
    els.articleFontSize.value = state.articleFontSize;
    els.parentsNote.value = state.parentsNote;
    els.parentsFontSize.value = state.parentsFontSize;
    els.logoText.value = state.logoText;
    els.schoolName.value = state.schoolName;
    els.className.value = state.className;
    els.publisherName.value = state.publisherName;
    els.photoCornerTitle.value = state.photoCornerTitle;
    els.scheduleStartDate.value = state.scheduleStartDate;
    els.apronGroups.value = state.apronGroups;

    renderPhotoEditorList();
    renderScheduleEditor();
  }

  // ---------- Render Live A4 Preview ----------
  function computeScheduleBannerText() {
    const week = getWeekDates(state.scheduleStartDate);
    let rangeStr = '〇〇月〇〇日～〇〇月〇〇日';
    if (week[0].monthNum && week[4].monthNum) {
      rangeStr = `${week[0].monthNum}月${week[0].dayNum}日～${week[4].monthNum}月${week[4].dayNum}日`;
    }
    const apron = (state.apronGroups || '').trim();
    const apronPart = apron ? `　要エプロン持参${apron}班` : '';
    return `来週の予定(${rangeStr})${apronPart}`;
  }

  function renderPreview() {
    const dateStr = formatJapaneseEraDate(state.issueDate);
    els.issueDateDisplay.textContent = dateStr;

    els.pvLogoText.textContent = state.logoText || 'HOME';
    els.pvSchoolName.textContent = state.schoolName || '';
    els.pvClassIssue.textContent = `${state.className || ''} 第${state.issueNumber || '〇'}号`;
    els.pvPublisher.textContent = `発行者 ${state.publisherName || ''}`;
    els.pvIssueDate.textContent = dateStr;

    els.pvArticleTitle.textContent = state.articleTitle || 'タイトル';
    els.pvArticleBody.textContent = state.articleBody || '';
    els.pvArticleBody.style.fontSize = `${state.articleFontSize}px`;
    els.articleCharCount.textContent = `${(state.articleBody || '').length}文字`;

    els.pvPhotoTitle.textContent = state.photoCornerTitle || 'フォトコーナー';
    renderPreviewPhotos();

    els.pvParentsBody.textContent = state.parentsNote || '';
    els.pvParentsBody.style.fontSize = `${state.parentsFontSize}px`;
    els.parentsCharCount.textContent = `${(state.parentsNote || '').length}文字`;

    els.pvScheduleBanner.textContent = computeScheduleBannerText();
    renderPreviewSchedule();
  }

  function renderPreviewPhotos() {
    const grid = els.pvPhotoGrid;
    grid.innerHTML = '';
    const count = state.photos.length;
    grid.className = `photo-grid count-${count}`;

    if (count === 0) {
      const hint = document.createElement('div');
      hint.className = 'photo-empty-hint no-print-placeholder';
      hint.textContent = '左の「📷 写真」タブから写真を追加できます';
      grid.appendChild(hint);
      return;
    }

    state.photos.forEach((photo) => {
      const card = document.createElement('div');
      card.className = 'pv-photo-card';
      const img = document.createElement('img');
      img.src = photo.dataUrl;
      img.alt = photo.caption || 'フォトコーナー写真';
      card.appendChild(img);

      if (photo.caption && photo.caption.trim()) {
        const cap = document.createElement('div');
        cap.className = 'pv-photo-caption';
        cap.textContent = photo.caption.trim();
        card.appendChild(cap);
      }
      grid.appendChild(card);
    });
  }

  function getMonthSpans(weekDates) {
    // 月列の縦結合（同じ月が連続すればまとめる）
    const spans = new Array(weekDates.length).fill(0);
    let i = 0;
    while (i < weekDates.length) {
      let j = i + 1;
      while (j < weekDates.length && weekDates[j].month === weekDates[i].month) {
        j++;
      }
      spans[i] = j - i;
      i = j;
    }
    return spans;
  }

  function renderPreviewSchedule() {
    const tbody = els.pvScheduleBody;
    tbody.innerHTML = '';
    const weekDates = getWeekDates(state.scheduleStartDate);
    const spans = getMonthSpans(weekDates);

    state.schedule.forEach((row, idx) => {
      const tr = document.createElement('tr');

      if (spans[idx] > 0) {
        const tdMonth = document.createElement('td');
        tdMonth.className = 'cell-month';
        tdMonth.rowSpan = spans[idx];
        tdMonth.textContent = weekDates[idx].month;
        tr.appendChild(tdMonth);
      }

      const tdDay = document.createElement('td');
      tdDay.className = 'cell-day';
      tdDay.textContent = weekDates[idx].dayLabel;
      tr.appendChild(tdDay);

      for (let p = 0; p < 6; p++) {
        const tdP = document.createElement('td');
        tdP.className = 'cell-period';
        tdP.textContent = formatPeriodText(row.periods[p]);
        tr.appendChild(tdP);
      }

      ['lunch', 'clean', 'club'].forEach((key) => {
        const tdF = document.createElement('td');
        tdF.className = 'cell-flag';
        tdF.textContent = row[key] || '';
        tr.appendChild(tdF);
      });

      const tdNote = document.createElement('td');
      tdNote.className = 'cell-note';
      tdNote.textContent = row.note || '';
      tr.appendChild(tdNote);

      tbody.appendChild(tr);
    });
  }

  // ---------- Schedule Editor UI ----------
  function renderScheduleEditor() {
    const container = els.scheduleEditorList;
    container.innerHTML = '';
    const weekDates = getWeekDates(state.scheduleStartDate);

    state.schedule.forEach((row, dayIdx) => {
      const card = document.createElement('div');
      card.className = 'day-editor-card';

      const top = document.createElement('div');
      top.className = 'day-editor-top';

      const label = document.createElement('span');
      label.className = 'day-label-badge';
      label.textContent = `${weekDates[dayIdx].month}月${weekDates[dayIdx].dayLabel}`;
      top.appendChild(label);

      const flagsWrap = document.createElement('div');
      flagsWrap.className = 'day-flags';

      [
        { key: 'lunch', name: '給' },
        { key: 'clean', name: '清' },
        { key: 'club', name: '部' }
      ].forEach(({ key, name }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `flag-toggle ${row[key] === '×' ? 'is-cross' : ''}`;
        btn.innerHTML = `${name}<span class="flag-val">${row[key]}</span>`;
        btn.addEventListener('click', () => {
          const curIdx = FLAG_CYCLE.indexOf(row[key]);
          row[key] = FLAG_CYCLE[(curIdx + 1) % FLAG_CYCLE.length];
          btn.classList.toggle('is-cross', row[key] === '×');
          btn.querySelector('.flag-val').textContent = row[key];
          saveState();
          renderPreview();
        });
        flagsWrap.appendChild(btn);
      });
      top.appendChild(flagsWrap);
      card.appendChild(top);

      // 1-6限入力
      const pGrid = document.createElement('div');
      pGrid.className = 'periods-grid';
      for (let p = 0; p < 6; p++) {
        const wrap = document.createElement('div');
        wrap.className = 'period-input-wrap';
        const num = document.createElement('span');
        num.textContent = `${p + 1}限`;
        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 6;
        input.value = row.periods[p] || '';
        input.addEventListener('input', (e) => {
          row.periods[p] = e.target.value;
          saveState();
          renderPreview();
        });
        wrap.appendChild(num);
        wrap.appendChild(input);
        pGrid.appendChild(wrap);
      }
      card.appendChild(pGrid);

      // 備考入力
      const noteInput = document.createElement('input');
      noteInput.type = 'text';
      noteInput.className = 'day-note-input';
      noteInput.placeholder = '備考（例：帰学終了予定 16:15）';
      noteInput.value = row.note || '';
      noteInput.addEventListener('input', (e) => {
        row.note = e.target.value;
        saveState();
        renderPreview();
      });
      card.appendChild(noteInput);

      container.appendChild(card);
    });
  }

  // ---------- Photo Management ----------
  function resizeImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 960;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width >= height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handlePhotoFiles(fileList) {
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;

    const remaining = 4 - state.photos.length;
    if (remaining <= 0) {
      showToast('写真は最大4枚まで追加できます。', true);
      return;
    }

    const toAdd = files.slice(0, remaining);
    for (const file of toAdd) {
      try {
        const dataUrl = await resizeImageFile(file);
        state.photos.push({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          dataUrl,
          caption: ''
        });
      } catch (err) {
        console.error(err);
        showToast('画像の読み込みに失敗しました。', true);
      }
    }

    saveState();
    renderPhotoEditorList();
    renderPreview();
    showToast(`${toAdd.length}枚の写真を追加しました`);
  }

  function renderPhotoEditorList() {
    const list = els.photoList;
    list.innerHTML = '';
    if (state.photos.length === 0) return;

    state.photos.forEach((photo, idx) => {
      const item = document.createElement('div');
      item.className = 'photo-item';

      const img = document.createElement('img');
      img.className = 'photo-thumb';
      img.src = photo.dataUrl;
      item.appendChild(img);

      const controls = document.createElement('div');
      controls.className = 'photo-item-controls';

      const capInput = document.createElement('input');
      capInput.type = 'text';
      capInput.placeholder = `写真${idx + 1}のキャプション（任意）`;
      capInput.value = photo.caption || '';
      capInput.addEventListener('input', (e) => {
        photo.caption = e.target.value;
        saveState();
        renderPreview();
      });
      controls.appendChild(capInput);

      const btns = document.createElement('div');
      btns.className = 'photo-item-btns';

      if (idx > 0) {
        const upBtn = document.createElement('button');
        upBtn.type = 'button';
        upBtn.className = 'btn btn-sm btn-ghost';
        upBtn.textContent = '↑';
        upBtn.title = '前へ移動';
        upBtn.addEventListener('click', () => {
          [state.photos[idx - 1], state.photos[idx]] = [state.photos[idx], state.photos[idx - 1]];
          saveState();
          renderPhotoEditorList();
          renderPreview();
        });
        btns.appendChild(upBtn);
      }

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-sm btn-ghost';
      delBtn.style.color = '#dc2626';
      delBtn.textContent = '削除';
      delBtn.addEventListener('click', () => {
        state.photos.splice(idx, 1);
        saveState();
        renderPhotoEditorList();
        renderPreview();
      });
      btns.appendChild(delBtn);

      controls.appendChild(btns);
      item.appendChild(controls);
      list.appendChild(item);
    });
  }

  // ---------- AI Text Generation ----------
  function buildAiPrompt(forManualCopy = false) {
    const articleMemo = els.aiArticleMemo.value.trim();
    const parentsMemo = els.aiParentsMemo.value.trim();
    const toneMap = {
      warm: '温かく親しみやすく、生徒の頑張りが保護者にも伝わる丁寧な文体',
      energetic: '元気で前向き、中学生の生徒たちを温かく励ます文体',
      formal: '落ち着いた丁寧語（です・ます調）で保護者に安心感を与える文体'
    };
    const lengthMap = {
      short: '250〜350文字程度',
      medium: '400〜550文字程度',
      long: '600〜750文字程度'
    };

    const toneDesc = toneMap[els.aiTone.value] || toneMap.warm;
    const lenDesc = lengthMap[els.aiLength.value] || lengthMap.medium;

    const baseContext = `あなたは中学校（${state.className}）の担任教師です。
学級通信「${state.logoText}」第${state.issueNumber}号の原稿を、以下のメモをもとに作成してください。

【文体の指定】
${toneDesc}

【記事本文の文字数めやす】
${lenDesc}（読みやすく2〜3段落に分けてください）

【記事のメモ】
${articleMemo || '（指定なし：今月の学校生活への励ましと季節のあいさつを作成）'}

【保護者の皆様へ（右側の枠）のメモ】
${parentsMemo || '（指定なし：日頃の感謝と体調管理・持ち物確認の短いお知らせを120〜180文字程度で作成）'}`;

    if (forManualCopy) {
      return `${baseContext}

【出力形式】※必ずこの見出しの通りに出力してください（余計な前置きは不要です）
【タイトル】
（15〜22文字程度のキャッチーなタイトル）

【記事】
（記事本文）

【保護者の皆様へ】
（保護者向けメッセージ・120〜220文字程度）`;
    }

    return `${baseContext}

必ず次のJSON形式のみで回答してください（Markdownのコードブロック不要）：
{
  "title": "15〜22文字程度のタイトル",
  "article": "記事本文（段落は改行\\n\\nで区切る）",
  "parentsNote": "保護者向けお知らせ本文（120〜220文字程度）"
}`;
  }

  function setAiStatus(msg, type = '') {
    els.aiStatus.textContent = msg;
    els.aiStatus.className = `status-msg ${type}`;
  }

  async function callGeminiApi(apiKey, prompt) {
    const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
    let lastError = null;

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.75,
              responseMimeType: 'application/json'
            }
          })
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          const errMsg = errJson?.error?.message || `HTTP ${res.status}`;
          throw new Error(`${model}: ${errMsg}`);
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('AIから空の応答が返されました。');
        return text;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('Gemini APIの呼び出しに失敗しました。');
  }

  function parseAiOutput(rawText) {
    const trimmed = (rawText || '').trim();
    if (!trimmed) return null;

    // 1. JSONとしてパースを試行
    try {
      const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const obj = JSON.parse(jsonMatch[0]);
        if (obj.title || obj.article || obj.parentsNote) {
          return {
            title: (obj.title || '').trim(),
            article: (obj.article || '').trim(),
            parentsNote: (obj.parentsNote || '').trim()
          };
        }
      }
    } catch (_) {}

    // 2. 見出し形式（【タイトル】【記事】【保護者の皆様へ】）としてパース
    const titleMatch = trimmed.match(/【タイトル】\s*([\s\S]*?)(?=【記事】|【保護者の皆様へ】|$)/);
    const articleMatch = trimmed.match(/【記事】\s*([\s\S]*?)(?=【保護者の皆様へ】|$)/);
    const parentsMatch = trimmed.match(/【保護者の皆様へ】\s*([\s\S]*?)$/);

    if (titleMatch || articleMatch || parentsMatch) {
      return {
        title: titleMatch ? titleMatch[1].trim() : '',
        article: articleMatch ? articleMatch[1].trim() : '',
        parentsNote: parentsMatch ? parentsMatch[1].trim() : ''
      };
    }

    // 3. どの形式にも当てはまらない場合は全体を記事として扱う
    return { title: '', article: trimmed, parentsNote: '' };
  }

  function applyParsedAiResult(parsed) {
    if (!parsed) return false;
    if (parsed.title) state.articleTitle = parsed.title;
    if (parsed.article) state.articleBody = parsed.article;
    if (parsed.parentsNote) state.parentsNote = parsed.parentsNote;
    saveState();
    syncInputsFromState();
    renderPreview();
    return true;
  }

  // ---------- History & Backup ----------
  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  function saveHistory(list) {
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(list));
  }

  function renderHistoryModal() {
    const list = loadHistory();
    els.historyList.innerHTML = '';
    if (list.length === 0) {
      els.historyList.innerHTML = '<p class="help-text">保存された号はまだありません。「現在の号を履歴に保存」を押すとここに記録されます。</p>';
      return;
    }

    list.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'history-row';

      const info = document.createElement('div');
      info.className = 'history-row-info';
      info.innerHTML = `<strong>第${item.issueNumber}号「${escapeHtml(item.articleTitle || '無題')}」</strong>
        <span>${formatJapaneseEraDate(item.issueDate)}（保存: ${item.savedAt || ''}）</span>`;
      row.appendChild(info);

      const btns = document.createElement('div');
      btns.className = 'history-row-btns';

      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'btn btn-sm btn-primary';
      loadBtn.textContent = '読み込む';
      loadBtn.addEventListener('click', () => {
        if (!confirm(`第${item.issueNumber}号を読み込みますか？（現在の編集内容は上書きされます）`)) return;
        state = clone(item.data);
        saveState();
        syncInputsFromState();
        renderPreview();
        els.historyModal.classList.add('hidden');
        showToast(`第${item.issueNumber}号を読み込みました`);
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-sm btn-ghost';
      delBtn.style.color = '#dc2626';
      delBtn.textContent = '削除';
      delBtn.addEventListener('click', () => {
        list.splice(idx, 1);
        saveHistory(list);
        renderHistoryModal();
      });

      btns.appendChild(loadBtn);
      btns.appendChild(delBtn);
      row.appendChild(btns);
      els.historyList.appendChild(row);
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  // ---------- Zoom Control ----------
  function updateZoom() {
    const sheetW = 1122;
    const sheetH = 794;
    let scale = manualZoom;
    if (zoomMode === 'fit') {
      const vpW = els.previewViewport.clientWidth - 40;
      const vpH = els.previewViewport.clientHeight - 40;
      scale = Math.min(vpW / sheetW, vpH / sheetH, 1.15);
      scale = Math.max(0.35, scale);
      els.zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    } else {
      els.zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    }
    els.sheetWrapper.style.transform = `scale(${scale})`;
    // 縮小時に余分なスクロール余白が出ないように高さ調整
    els.sheetWrapper.style.height = `${sheetH * scale}px`;
    els.sheetWrapper.style.width = `${sheetW * scale}px`;
  }

  // ---------- Event Bindings ----------
  function bindEvents() {
    // Tabs
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    document.getElementById('btnJumpToAi1').addEventListener('click', () => switchTab('ai'));
    document.getElementById('btnJumpToAi2').addEventListener('click', () => switchTab('ai'));

    // Basic fields
    const simpleBindings = [
      ['issueNumber', 'issueNumber'],
      ['articleTitle', 'articleTitle'],
      ['articleBody', 'articleBody'],
      ['articleFontSize', 'articleFontSize'],
      ['parentsNote', 'parentsNote'],
      ['parentsFontSize', 'parentsFontSize'],
      ['logoText', 'logoText'],
      ['schoolName', 'schoolName'],
      ['className', 'className'],
      ['publisherName', 'publisherName'],
      ['photoCornerTitle', 'photoCornerTitle'],
      ['apronGroups', 'apronGroups']
    ];

    simpleBindings.forEach(([elKey, stateKey]) => {
      els[elKey].addEventListener('input', (e) => {
        state[stateKey] = elKey === 'issueNumber' ? (parseInt(e.target.value, 10) || 1) : e.target.value;
        saveState();
        renderPreview();
      });
    });

    // Issue Date -> auto update next week Monday
    els.issueDate.addEventListener('change', (e) => {
      state.issueDate = e.target.value;
      const d = parseDateISO(state.issueDate);
      if (d) {
        state.scheduleStartDate = formatDateISO(getNextMonday(d));
        els.scheduleStartDate.value = state.scheduleStartDate;
        renderScheduleEditor();
      }
      saveState();
      renderPreview();
    });

    els.scheduleStartDate.addEventListener('change', (e) => {
      state.scheduleStartDate = e.target.value;
      saveState();
      renderScheduleEditor();
      renderPreview();
    });

    document.getElementById('btnAutoCalcDates').addEventListener('click', () => {
      const d = parseDateISO(state.issueDate);
      if (!d) return;
      state.scheduleStartDate = formatDateISO(getNextMonday(d));
      els.scheduleStartDate.value = state.scheduleStartDate;
      saveState();
      renderScheduleEditor();
      renderPreview();
      showToast('発行日の翌週（月〜金）に日付を合わせました');
    });

    // Quick Apron Chips
    document.querySelectorAll('.chip[data-apron]').forEach((chip) => {
      chip.addEventListener('click', () => {
        state.apronGroups = chip.dataset.apron;
        els.apronGroups.value = state.apronGroups;
        saveState();
        renderPreview();
      });
    });

    // Schedule Preset buttons
    document.getElementById('btnResetSchedule').addEventListener('click', () => {
      if (!confirm('今の時間割を基本時間割に戻しますか？')) return;
      state.schedule = getSavedDefaultSchedule();
      saveState();
      renderScheduleEditor();
      renderPreview();
      showToast('基本時間割に戻しました');
    });

    document.getElementById('btnSaveDefaultSchedule').addEventListener('click', () => {
      localStorage.setItem(STORAGE_KEY_DEFAULT_SCHEDULE, JSON.stringify(state.schedule));
      showToast('現在の時間割を「基本時間割」として保存しました');
    });

    // Photo Dropzone
    els.photoDropzone.addEventListener('click', () => els.photoInput.click());
    els.photoInput.addEventListener('change', (e) => {
      handlePhotoFiles(e.target.files);
      e.target.value = '';
    });
    els.photoDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      els.photoDropzone.classList.add('dragover');
    });
    els.photoDropzone.addEventListener('dragleave', () => {
      els.photoDropzone.classList.remove('dragover');
    });
    els.photoDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      els.photoDropzone.classList.remove('dragover');
      handlePhotoFiles(e.dataTransfer.files);
    });
    document.getElementById('btnClearPhotos').addEventListener('click', () => {
      if (state.photos.length === 0) return;
      if (!confirm('フォトコーナーの写真をすべて削除しますか？')) return;
      state.photos = [];
      saveState();
      renderPhotoEditorList();
      renderPreview();
    });

    // AI API Key persistence
    els.geminiApiKey.value = localStorage.getItem(STORAGE_KEY_API) || '';
    els.geminiApiKey.addEventListener('input', (e) => {
      localStorage.setItem(STORAGE_KEY_API, e.target.value.trim());
    });
    document.getElementById('btnToggleKey').addEventListener('click', (e) => {
      const isPass = els.geminiApiKey.type === 'password';
      els.geminiApiKey.type = isPass ? 'text' : 'password';
      e.target.textContent = isPass ? '隠す' : '表示';
    });

    // AI Direct Generation
    document.getElementById('btnGenerateAi').addEventListener('click', async () => {
      const apiKey = els.geminiApiKey.value.trim();
      if (!apiKey) {
        setAiStatus('Gemini APIキーを入力してください（キーがない場合は下の「方法2」が使えます）', 'error');
        return;
      }
      const btn = document.getElementById('btnGenerateAi');
      btn.disabled = true;
      setAiStatus('✨ AIが文章を作成しています…', 'loading');
      try {
        const prompt = buildAiPrompt(false);
        const text = await callGeminiApi(apiKey, prompt);
        const parsed = parseAiOutput(text);
        if (applyParsedAiResult(parsed)) {
          setAiStatus('✅ 文章を生成してお便りに反映しました！', 'success');
          showToast('AI文章を反映しました');
        } else {
          setAiStatus('生成結果の読み取りに失敗しました。もう一度お試しください。', 'error');
        }
      } catch (err) {
        console.error(err);
        setAiStatus(`エラー: ${err.message}`, 'error');
      } finally {
        btn.disabled = false;
      }
    });

    // AI Prompt Copy (No API key needed)
    document.getElementById('btnCopyPrompt').addEventListener('click', async () => {
      const prompt = buildAiPrompt(true);
      try {
        await navigator.clipboard.writeText(prompt);
        showToast('AI用プロンプトをコピーしました！ChatGPTやGeminiに貼り付けてください');
      } catch (_) {
        const ta = document.createElement('textarea');
        ta.value = prompt;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('AI用プロンプトをコピーしました！');
      }
    });

    document.getElementById('btnApplyPastedAi').addEventListener('click', () => {
      const text = els.aiPasteResult.value.trim();
      if (!text) {
        showToast('AIの返答を貼り付けてください', true);
        return;
      }
      const parsed = parseAiOutput(text);
      if (applyParsedAiResult(parsed)) {
        showToast('お便りに反映しました！プレビューを確認してください');
        switchTab('basic');
      }
    });

    // Header Actions
    document.getElementById('btnNextIssue').addEventListener('click', () => {
      if (!confirm('現在の内容を履歴に自動保存したあと、号数を+1・発行日を1週間進めて新しい号を作成しますか？')) return;
      saveCurrentToHistoryInternal();
      state.issueNumber = (parseInt(state.issueNumber, 10) || 0) + 1;
      const curDate = parseDateISO(state.issueDate) || getNearestFriday();
      curDate.setDate(curDate.getDate() + 7);
      state.issueDate = formatDateISO(curDate);
      state.scheduleStartDate = formatDateISO(getNextMonday(curDate));
      state.articleTitle = '';
      state.articleBody = '';
      state.parentsNote = '';
      state.photos = [];
      state.schedule = getSavedDefaultSchedule();
      // エプロン班を自動交互切替（1・2・3 ⇄ 4・5・6）
      if (state.apronGroups === '1・2・3') state.apronGroups = '4・5・6';
      else if (state.apronGroups === '4・5・6') state.apronGroups = '1・2・3';

      saveState();
      syncInputsFromState();
      renderPreview();
      showToast(`第${state.issueNumber}号の準備ができました！（前の号は履歴に保存済み）`);
    });

    document.getElementById('btnSample').addEventListener('click', () => {
      if ((state.articleBody || state.articleTitle) && !confirm('現在のタイトル・記事・保護者向けメッセージを記入例で上書きしますか？')) return;
      state.articleTitle = '合唱コンクールに向けて、心をひとつに！';
      state.articleBody =
        '今週から、いよいよ合唱コンクールに向けたパート練習が本格的にスタートしました。放課後の教室からは、各パートリーダーを中心に「もう一回ここを合わせよう！」「強弱をはっきりさせよう」と前向きな声が聞こえてきます。\n\n' +
        '最初は少し恥ずかしそうにしていた生徒たちも、日を追うごとに表情が真剣になり、クラス全体でひとつの曲を作り上げようとする一体感が生まれてきました。3年生として迎える最後の合唱コンクール、自分たちらしい最高のハーモニーを響かせてくれることを楽しみにしています。\n\n' +
        '季節の変わり目で朝晩の寒暖差が大きくなっています。本番に向けて喉のケアや手洗い・うがい、十分な睡眠を心がけて過ごしましょう。';
      state.parentsNote =
        'いつも学級活動への温かいご理解とご協力をありがとうございます。\n\n' +
        '① 進路希望調査（第2回）の提出期限は来週火曜日となっております。ご家庭でご確認のうえ、お子様を通じてご提出ください。\n' +
        '② 来週から放課後の合唱練習が始まるため、帰学終了予定時刻が普段より少し遅くなる日があります。下の予定表をご確認いただけますと幸いです。';
      saveState();
      syncInputsFromState();
      renderPreview();
      showToast('記入例を読み込みました！');
    });

    // History Modal
    document.getElementById('btnHistory').addEventListener('click', () => {
      renderHistoryModal();
      els.historyModal.classList.remove('hidden');
    });
    document.getElementById('btnCloseHistory').addEventListener('click', () => {
      els.historyModal.classList.add('hidden');
    });
    els.historyModal.addEventListener('click', (e) => {
      if (e.target === els.historyModal) els.historyModal.classList.add('hidden');
    });

    document.getElementById('btnSaveCurrentToHistory').addEventListener('click', () => {
      saveCurrentToHistoryInternal();
      renderHistoryModal();
      showToast(`第${state.issueNumber}号を履歴に保存しました`);
    });

    document.getElementById('btnExportJson').addEventListener('click', () => {
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        currentState: state,
        defaultSchedule: getSavedDefaultSchedule(),
        history: loadHistory()
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      triggerDownload(blob, `HOME学級通信バックアップ_${state.issueDate || 'backup'}.json`);
      showToast('バックアップファイルを保存しました');
    });

    document.getElementById('importJsonInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          if (parsed.currentState) {
            state = parsed.currentState;
            saveState();
          }
          if (parsed.defaultSchedule) {
            localStorage.setItem(STORAGE_KEY_DEFAULT_SCHEDULE, JSON.stringify(parsed.defaultSchedule));
          }
          if (Array.isArray(parsed.history)) {
            saveHistory(parsed.history);
          }
          syncInputsFromState();
          renderPreview();
          renderHistoryModal();
          showToast('バックアップを復元しました！');
        } catch (_) {
          showToast('バックアップファイルの形式が正しくありません', true);
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    // Zoom
    document.getElementById('btnZoomIn').addEventListener('click', () => {
      zoomMode = 'manual';
      manualZoom = Math.min(1.4, manualZoom + 0.1);
      updateZoom();
    });
    document.getElementById('btnZoomOut').addEventListener('click', () => {
      zoomMode = 'manual';
      manualZoom = Math.max(0.4, manualZoom - 0.1);
      updateZoom();
    });
    document.getElementById('btnZoomFit').addEventListener('click', () => {
      zoomMode = 'fit';
      updateZoom();
    });
    window.addEventListener('resize', () => {
      if (zoomMode === 'fit') updateZoom();
    });

    // Export Buttons
    document.getElementById('btnExportDocx').addEventListener('click', async () => {
      try {
        showToast('Wordファイルを作成中…');
        const exportPayload = buildExportPayload();
        const blob = await window.HomeDocxBuilder.buildDocxBlob(exportPayload);
        const safeNum = state.issueNumber || '0';
        triggerDownload(blob, `HOME_学級通信_第${safeNum}号.docx`);
        showToast('Word (.docx) ファイルをダウンロードしました！');
      } catch (err) {
        console.error(err);
        showToast(`Word書き出しに失敗しました: ${err.message}`, true);
      }
    });

    document.getElementById('btnExportPng').addEventListener('click', async () => {
      try {
        showToast('LINE共有用の高画質画像を作成中…');
        const exportPayload = buildExportPayload();
        const blob = await window.HomePngExporter.buildPngBlob(exportPayload);
        const safeNum = state.issueNumber || '0';
        triggerDownload(blob, `HOME_学級通信_第${safeNum}号.png`);
        showToast('画像 (PNG) をダウンロードしました！LINEでそのまま送れます');
      } catch (err) {
        console.error(err);
        showToast(`画像書き出しに失敗しました: ${err.message}`, true);
      }
    });

    document.getElementById('btnPrintPdf').addEventListener('click', () => {
      window.print();
    });
  }

  function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-panel').forEach((p) => {
      p.classList.toggle('active', p.id === `tab-${tabName}`);
    });
  }

  function saveCurrentToHistoryInternal() {
    const list = loadHistory();
    const now = new Date();
    const savedAt = `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const entry = {
      issueNumber: state.issueNumber,
      issueDate: state.issueDate,
      articleTitle: state.articleTitle,
      savedAt,
      data: clone(state)
    };
    const existingIdx = list.findIndex((x) => x.issueNumber === state.issueNumber && x.issueDate === state.issueDate);
    if (existingIdx >= 0) list[existingIdx] = entry;
    else list.unshift(entry);
    saveHistory(list.slice(0, 30));
  }

  function buildExportPayload() {
    const weekDates = getWeekDates(state.scheduleStartDate);
    return {
      ...clone(state),
      issueDateText: formatJapaneseEraDate(state.issueDate),
      scheduleBannerText: computeScheduleBannerText(),
      weekDates,
      monthSpans: getMonthSpans(weekDates),
      houseSvgElement: document.getElementById('houseSvg')
    };
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // ---------- Init ----------
  function init() {
    syncInputsFromState();
    renderPreview();
    bindEvents();
    requestAnimationFrame(updateZoom);
  }

  document.addEventListener('DOMContentLoaded', init);
})();

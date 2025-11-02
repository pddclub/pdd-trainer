import { fetchTicketQuestions } from '../services/supabase.js';
import { loadTrainerState, saveTrainerState, clearTrainerData } from '../storage/session.js';

function showConfigError(documentObj, message) {
  const msg =
    message ||
    'Не удалось инициализировать тренажёр: отсутствуют параметры подключения.';
  const render = () => {
    const container = documentObj.createElement('div');
    container.setAttribute('role', 'alert');
    container.style.background = '#fff3cd';
    container.style.color = '#856404';
    container.style.padding = '16px';
    container.style.margin = '16px';
    container.style.border = '1px solid #ffeeba';
    container.style.borderRadius = '8px';
    container.style.fontFamily =
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    container.innerHTML =
      `<strong>Требуется конфигурация.</strong><br>${msg}<br>` +
      'Перед загрузкой скрипта задайте <code>window.PDD_CONFIG</code> с ключами <code>SUPA</code> и <code>ANON</code>.';
    const target = documentObj.body || documentObj.documentElement;
    if (target) {
      if (typeof target.prepend === 'function') {
        target.prepend(container);
      } else {
        target.insertBefore(container, target.firstChild || null);
      }
    }
  };

  if (documentObj.readyState === 'loading') {
    documentObj.addEventListener('DOMContentLoaded', render, { once: true });
  } else {
    render();
  }
  console.error(`PDD Trainer: ${msg}`);
}

export function parseHash(hash) {
  const h = (hash || '').replace(/^#/, '').trim();
  let m = h.match(/^t(\d+)-(\d+)$/i);
  if (m) return { topic: Number(m[1]), ticket: Number(m[2]) };
  m = h.match(/^t-(\d+)$/i);
  if (m) return { topic: 1, ticket: Number(m[1]) };
  if (/^\d+$/.test(h)) return { topic: 1, ticket: Number(h) };
  return { topic: 1, ticket: 1 };
}

function ensureNamespacedHash(windowObj, topic, ticket) {
  const target = `#t${topic}-${ticket}`;
  if (windowObj.location.hash !== target) {
    try {
      windowObj.history.replaceState(null, '', target);
    } catch (err) {
      windowObj.location.hash = target;
    }
  }
}

const IDS = {
  imgContainer: 'question-img',
  question: 'question',
  answers: ['answer-1', 'answer-2', 'answer-3', 'answer-4', 'answer-5'],
  navPrefix: 'nav-q',
  nextBtn: 'train-answer-btn-next',
  reloadBtn: 'train-answer-btn-reload'
};

const CLASS_ANS_NON = 'train-answer-btn-nonactive';
const CLASS_ANS_OK = 'train-answer-btn-ok';
const CLASS_ANS_NO = 'train-answer-btn-no';

const NAV = {
  active: ['train-progress-btn-active', 'Train-progress-btn-active'],
  ok: ['train-progress-btn-ok', 'Train-progress-btn-ok'],
  no: ['train-progress-btn-no', 'Train-progress-btn-no'],
  non: ['train-progress-btn-nonactive', 'Train-progress-btn-nonactive']
};

const qs = (documentObj, id) => documentObj.getElementById(id);

function stripProgressClasses(el) {
  if (!el) return;
  const all = [...NAV.active, ...NAV.ok, ...NAV.no, ...NAV.non];
  for (const c of all) {
    el.classList.remove(c);
    if (el.firstElementChild) el.firstElementChild.classList.remove(c);
  }
}

function addProgressClass(el, kind) {
  if (!el) return;
  for (const c of NAV[kind] || []) {
    el.classList.add(c);
    if (el.firstElementChild) el.firstElementChild.classList.add(c);
  }
}

function discoverNavs(documentObj) {
  const nodes = Array.from(documentObj.querySelectorAll('[id^="nav-q"]'));
  const map = {};
  nodes.forEach((node) => {
    const m = node.id.match(/^nav-q(\d+)$/i);
    if (m) {
      const idx = Number(m[1]) - 1;
      if (!Number.isNaN(idx)) map[idx] = node;
    }
  });
  return map;
}

function initNavClasses(navMap) {
  Object.values(navMap).forEach((el) => {
    stripProgressClasses(el);
    addProgressClass(el, 'non');
  });
}

function setNavActive(navMap, index) {
  Object.entries(navMap).forEach(([k, el]) => {
    const idx = Number(k);
    if (idx === index) {
      stripProgressClasses(el);
      addProgressClass(el, 'active');
    } else {
      const hasAny = [...NAV.ok, ...NAV.no].some(
        (c) =>
          el.classList.contains(c) ||
          (el.firstElementChild && el.firstElementChild.classList.contains(c))
      );
      if (!hasAny) {
        stripProgressClasses(el);
        addProgressClass(el, 'non');
      }
    }
  });
}

function markNavResult(navMap, index, correct) {
  const el = navMap[index];
  if (!el) return;
  stripProgressClasses(el);
  addProgressClass(el, correct ? 'ok' : 'no');
}

function stripAllAnswerClasses(btn) {
  if (!btn) return;
  for (const c of [CLASS_ANS_NON, CLASS_ANS_OK, CLASS_ANS_NO]) {
    btn.classList.remove(c);
    if (btn.firstElementChild) btn.firstElementChild.classList.remove(c);
  }
}

function setAnswerNonactive(btn) {
  stripAllAnswerClasses(btn);
  btn.classList.add(CLASS_ANS_NON);
  if (btn.firstElementChild) btn.firstElementChild.classList.add(CLASS_ANS_NON);
}

function setAnswerOk(btn) {
  stripAllAnswerClasses(btn);
  btn.classList.add(CLASS_ANS_OK);
  if (btn.firstElementChild) btn.firstElementChild.classList.add(CLASS_ANS_OK);
}

function setAnswerNo(btn) {
  stripAllAnswerClasses(btn);
  btn.classList.add(CLASS_ANS_NO);
  if (btn.firstElementChild) btn.firstElementChild.classList.add(CLASS_ANS_NO);
}

function setHeaderText(el, text) {
  if (!el) return;
  let hasTextNode = false;
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      node.textContent = text;
      hasTextNode = true;
    }
  }
  if (!hasTextNode) el.textContent = text;
}

function updateResultDisplay(documentObj, stateAnswers, totalQuestions) {
  try {
    const okEl = documentObj.getElementById('train-results-ok');
    const noEl = documentObj.getElementById('train-results-no');
    const block232 = documentObj.getElementById('div-block-232');
    const block231 = documentObj.getElementById('div-block-231');

    if (block232) block232.style.display = 'flex';
    if (block231) block231.style.display = 'flex';
    if (okEl) okEl.style.display = 'none';
    if (noEl) noEl.style.display = 'none';

    if (!stateAnswers || typeof totalQuestions !== 'number') return;

    const correctCount = Object.values(stateAnswers).filter((v) => v === true).length;
    const wrongCount = totalQuestions - correctCount;

    if (block232) block232.style.display = 'none';
    if (block231) block231.style.display = 'none';

    if (wrongCount >= 2) {
      if (noEl) noEl.style.display = 'flex';
    } else if (okEl) okEl.style.display = 'flex';
  } catch (err) {
    console.error('updateResultDisplay error:', err);
  }
}

function preloadNextImage(questions, idx) {
  const next = questions[idx + 1];
  if (next && next.image_url) {
    const img = new Image();
    img.src = next.image_url;
  }
}

async function renderQuestionForIndex({
  questions,
  index,
  questionEl,
  imgContainerEl,
  answerEls,
  state,
  navMap,
  nextBtn,
  documentObj,
  windowObj
}) {
  const qobj = questions[index];
  if (!qobj) return;

  if (windowObj) {
    windowObj.__pdd_lockedSelection = false;
  }
  for (let i = 0; i < answerEls.length; i += 1) {
    const b = answerEls[i];
    if (!b) continue;
    b.style.pointerEvents = '';
    b.removeAttribute('aria-disabled');
    b.disabled = false;
  }
  if (nextBtn) {
    nextBtn.style.display = '';
    nextBtn.disabled = true;
  }

  if (state.finished) {
    if (questionEl) questionEl.textContent = 'Тест завершён.';
    for (const b of answerEls) if (b) {
      b.style.display = 'none';
      b.disabled = true;
    }
    if (imgContainerEl) {
      if (imgContainerEl.tagName && imgContainerEl.tagName.toLowerCase() === 'img') {
        imgContainerEl.removeAttribute('src');
      } else {
        const existing = imgContainerEl.querySelector('[data-pdd-img]');
        if (existing) existing.remove();
      }
    }
    if (nextBtn) nextBtn.style.display = 'none';
    setNavActive(navMap, state.currentIdx >= questions.length ? questions.length - 1 : state.currentIdx);
    updateResultDisplay(documentObj, state.answers, questions.length);
    return;
  }

  if (questionEl) setHeaderText(questionEl, qobj.question || '');

  if (imgContainerEl) {
    if (imgContainerEl.tagName && imgContainerEl.tagName.toLowerCase() === 'img') {
      if (qobj.image_url) {
        imgContainerEl.onerror = () => {
          imgContainerEl.removeAttribute('src');
        };
        imgContainerEl.src = qobj.image_url;
      } else {
        imgContainerEl.removeAttribute('src');
      }
    } else {
      const existing = imgContainerEl.querySelector('[data-pdd-img]');
      if (existing) existing.remove();
      if (qobj.image_url) {
        const img = documentObj.createElement('img');
        img.src = qobj.image_url;
        img.alt = 'Вопрос';
        img.style.maxWidth = '100%';
        img.dataset.pddImg = '1';
        img.onerror = () => {
          img.remove();
        };
        imgContainerEl.appendChild(img);
      }
    }
  }

  const answers = (qobj.answers || []).slice(0, 5);
  for (let j = 0; j < answerEls.length; j += 1) {
    const btn = answerEls[j];
    if (!btn) continue;
    const ans = answers[j];
    if (ans !== undefined && ans !== null) {
      const text = typeof ans === 'object' && 'text' in ans ? String(ans.text) : String(ans);
      btn.textContent = text;
      btn.style.display = '';
      btn.disabled = false;
      setAnswerNonactive(btn);
      const num = typeof ans === 'object' && ans.num != null ? Number(ans.num) : j + 1;
      btn.dataset.pddNum = String(num);
    } else {
      btn.style.display = 'none';
      btn.dataset.pddNum = '';
    }
  }

  setNavActive(navMap, index);
  preloadNextImage(questions, index);
}

export function bootstrapTrainer({ window: windowObj = window, document: documentObj = document } = {}) {
  const config = windowObj.PDD_CONFIG || null;
  const SUPA = config && config.SUPA;
  const ANON = config && config.ANON;

  if (!SUPA || !ANON) {
    showConfigError(
      documentObj,
      'Проверьте, что параметры <code>SUPA</code> и <code>ANON</code> переданы в глобальный объект конфигурации.'
    );
    return;
  }

  const { topic: TOPIC, ticket: TICKET } = parseHash(windowObj.location.hash);
  ensureNamespacedHash(windowObj, TOPIC, TICKET);

  const CACHE_KEY = `pdd_topic${TOPIC}_ticket${TICKET}_v1`;
  const STATE_KEY = `pdd_topic${TOPIC}_ticket${TICKET}_state_v1`;

  async function init() {
    const questionEl = qs(documentObj, IDS.question);
    const imgContainerEl = qs(documentObj, IDS.imgContainer);
    const answerEls = IDS.answers.map((id) => qs(documentObj, id));
    const nextBtn = qs(documentObj, IDS.nextBtn);

    const navMap = discoverNavs(documentObj);
    initNavClasses(navMap);

    try {
      const okEl = documentObj.getElementById('train-results-ok');
      const noEl = documentObj.getElementById('train-results-no');
      const block232 = documentObj.getElementById('div-block-232');
      const block231 = documentObj.getElementById('div-block-231');
      if (block232) block232.style.display = 'flex';
      if (block231) block231.style.display = 'flex';
      if (okEl) okEl.style.display = 'none';
      if (noEl) noEl.style.display = 'none';
    } catch (err) {
      // ignore
    }

    let questions = [];
    try {
      questions = await fetchTicketQuestions({
        supabaseUrl: SUPA,
        anonKey: ANON,
        topicNumber: TOPIC,
        ticketNumber: TICKET,
        cacheKey: CACHE_KEY,
        storage: windowObj.sessionStorage
      });
    } catch (err) {
      console.error('Failed to load questions', err);
      if (questionEl) questionEl.textContent = 'Не удалось загрузить вопросы. Перезагрузите страницу.';
      return;
    }

    if (!questions.length) {
      if (questionEl) questionEl.textContent = 'Вопросы не найдены';
      return;
    }

    const state = loadTrainerState(STATE_KEY, questions.length, {
      storage: windowObj.sessionStorage
    });
    if (typeof state.currentIdx !== 'number') state.currentIdx = 0;
    if (state.currentIdx < 0 || state.currentIdx >= questions.length) state.currentIdx = 0;

    if (state.answers) {
      Object.keys(state.answers).forEach((k) => {
        const idx = Number(k);
        const val = !!state.answers[k];
        if (!Number.isNaN(idx)) markNavResult(navMap, idx, val);
      });
    }

    if (state.finished) {
      if (questionEl) questionEl.textContent = 'Тест завершён.';
      for (const b of answerEls) if (b) {
        b.style.display = 'none';
        b.disabled = true;
      }
      setNavActive(navMap, Math.min(state.currentIdx, questions.length - 1));
      if (nextBtn) nextBtn.style.display = 'none';
      updateResultDisplay(documentObj, state.answers, questions.length);
      return;
    }

    await renderQuestionForIndex({
      questions,
      index: state.currentIdx,
      questionEl,
      imgContainerEl,
      answerEls,
      state,
      navMap,
      nextBtn,
      documentObj,
      windowObj
    });

    let pendingAnswer = null;
    let lockedSelection = false;
    windowObj.__pdd_lockedSelection = lockedSelection;

    function onAnswerClick(e) {
      if (state.finished || lockedSelection) return;
      const btn = e.currentTarget;
      const chosenNum = btn.dataset.pddNum ? Number(btn.dataset.pddNum) : null;
      const cur = state.currentIdx;
      const currentQ = questions[cur];
      const correctNum = currentQ && currentQ.correct_answer !== undefined ? Number(currentQ.correct_answer) : null;
      const correct = chosenNum !== null && correctNum !== null ? chosenNum === correctNum : null;

      for (let i = 0; i < answerEls.length; i += 1) {
        const b = answerEls[i];
        if (!b) continue;
        setAnswerNonactive(b);
      }

      for (let i = 0; i < answerEls.length; i += 1) {
        const b = answerEls[i];
        if (!b) continue;
        const num = b.dataset.pddNum ? Number(b.dataset.pddNum) : i + 1;
        if (num === correctNum) {
          setAnswerOk(b);
          break;
        }
      }

      if (correct === false) setAnswerNo(btn);

      pendingAnswer = { chosenNum, correct: !!correct };
      if (nextBtn) nextBtn.disabled = false;

      lockedSelection = true;
      windowObj.__pdd_lockedSelection = lockedSelection;
      for (let i = 0; i < answerEls.length; i += 1) {
        const b2 = answerEls[i];
        if (!b2) continue;
        b2.style.pointerEvents = 'none';
        b2.setAttribute('aria-disabled', 'true');
      }
    }

    function confirmAndNext() {
      if (state.finished || !pendingAnswer) return;

      const cur = state.currentIdx;
      state.answers = state.answers || {};
      state.answers[cur] = !!pendingAnswer.correct;

      state.qTimes = state.qTimes || {};
      state.qTimes[cur] = state.qTimes[cur] || {
        startedAt: state.qTimes[cur]?.startedAt || Date.now(),
        answeredAt: Date.now()
      };

      saveTrainerState(STATE_KEY, state, { storage: windowObj.sessionStorage });
      markNavResult(navMap, cur, !!pendingAnswer.correct);
      pendingAnswer = null;
      if (nextBtn) nextBtn.disabled = true;

      lockedSelection = false;
      windowObj.__pdd_lockedSelection = lockedSelection;
      for (let i = 0; i < answerEls.length; i += 1) {
        const b2 = answerEls[i];
        if (!b2) continue;
        b2.style.pointerEvents = '';
        b2.removeAttribute('aria-disabled');
      }

      state.currentIdx += 1;
      if (state.currentIdx >= questions.length) {
        setNavActive(navMap, Math.min(state.currentIdx - 1, questions.length - 1));
        try {
          const lastIdx = Math.min(state.currentIdx - 1, questions.length - 1);
          markNavResult(navMap, lastIdx, !!state.answers[lastIdx]);
        } catch (err) {
          // ignore
        }
        state.finished = true;
        saveTrainerState(STATE_KEY, state, { storage: windowObj.sessionStorage });
        if (qs(documentObj, IDS.question)) qs(documentObj, IDS.question).textContent = 'Тест завершён.';
        for (const b of answerEls) if (b) {
          b.style.display = 'none';
          b.disabled = true;
        }
        if (nextBtn) nextBtn.style.display = 'none';
        updateResultDisplay(documentObj, state.answers, questions.length);
        return;
      }

      saveTrainerState(STATE_KEY, state, { storage: windowObj.sessionStorage });
      renderQuestionForIndex({
        questions,
        index: state.currentIdx,
        questionEl: qs(documentObj, IDS.question),
        imgContainerEl: qs(documentObj, IDS.imgContainer),
        answerEls,
        state,
        navMap,
        nextBtn,
        documentObj,
        windowObj
      });
    }

    for (const b of answerEls) {
      if (!b) continue;
      setAnswerNonactive(b);
      b.addEventListener('click', onAnswerClick);
    }

    if (nextBtn) {
      nextBtn.disabled = true;
      nextBtn.style.display = '';
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        confirmAndNext();
      });
    }

    function onKeyDown(e) {
      if (state.finished) return;
      const numKey = Number(e.key);
      if (!Number.isNaN(numKey) && numKey >= 1 && numKey <= 5) {
        const idx = numKey - 1;
        const btn = answerEls[idx];
        if (btn && btn.style.display !== 'none' && !btn.disabled && !lockedSelection) {
          btn.click();
          e.preventDefault();
          return;
        }
      }
      if (e.key === 'Enter' && pendingAnswer) {
        e.preventDefault();
        confirmAndNext();
      }
    }

    windowObj.addEventListener('keydown', onKeyDown);

    (function attachBannerHandlers() {
      function handleBannerNextClick(e) {
        const btn = e.target.closest && e.target.closest(`#${IDS.nextBtn}`);
        if (!btn) return;
        if (!state.finished) return;
        if (btn.dataset.pddNavigating === '1') return;

        e.preventDefault();
        e.stopPropagation();

        btn.dataset.pddNavigating = '1';
        const prevText = btn.textContent || '';
        btn.disabled = true;
        btn.textContent = 'Загрузка...';

        try {
          clearTrainerData([CACHE_KEY, STATE_KEY], { storage: windowObj.sessionStorage });

          const nextTicketNumber = Number.isFinite(Number(TICKET)) ? Number(TICKET) + 1 : 1;
          const nextHash = `#t${TOPIC}-${nextTicketNumber}`;
          const nextUrl = new URL(windowObj.location.href);
          nextUrl.hash = nextHash;
          windowObj.location.assign(nextUrl.toString());
        } catch (err) {
          console.error('Ошибка перехода к следующему билету:', err);
          btn.disabled = false;
          setHeaderText(btn, prevText || 'Следующий билет');
          windowObj.alert('Не получилось перейти к следующему билету. Проверьте консоль.');
        } finally {
          delete btn.dataset.pddNavigating;
        }
      }

      function handleBannerReloadClick(e) {
        const btn = e.target.closest && e.target.closest(`#${IDS.reloadBtn}`);
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();

        clearTrainerData([CACHE_KEY, STATE_KEY], { storage: windowObj.sessionStorage });

        ensureNamespacedHash(windowObj, TOPIC, TICKET);
        windowObj.location.reload();
      }

      documentObj.addEventListener('click', handleBannerNextClick);
      documentObj.addEventListener('click', handleBannerReloadClick);

      windowObj.__pdd_banner_handlers = windowObj.__pdd_banner_handlers || {};
      windowObj.__pdd_banner_handlers.next = handleBannerNextClick;
      windowObj.__pdd_banner_handlers.reload = handleBannerReloadClick;

      const bannerNextBtn = documentObj.getElementById(IDS.nextBtn);
      if (bannerNextBtn) {
        const currentText = bannerNextBtn.textContent || '';
        if (/сохран/i.test(currentText)) {
          setHeaderText(bannerNextBtn, 'Следующий билет');
        }
      }
    })();

    windowObj.addEventListener('beforeunload', () => {
      try {
        windowObj.removeEventListener('keydown', onKeyDown);
        if (nextBtn) nextBtn.removeEventListener('click', confirmAndNext);
        for (const b of answerEls) if (b) b.removeEventListener('click', onAnswerClick);
        if (windowObj.__pdd_banner_handlers?.next)
          documentObj.removeEventListener('click', windowObj.__pdd_banner_handlers.next);
        if (windowObj.__pdd_banner_handlers?.reload)
          documentObj.removeEventListener('click', windowObj.__pdd_banner_handlers.reload);
      } catch (err) {
        // ignore
      }
    });
  }

  if (documentObj.readyState === 'complete') {
    init();
  } else {
    windowObj.addEventListener('load', init);
  }

  windowObj.addEventListener('hashchange', () => {
    const h = (windowObj.location.hash || '').trim();
    if (/^#t\d+-\d+$/i.test(h)) {
      windowObj.location.reload();
    }
  });
}

export default bootstrapTrainer;

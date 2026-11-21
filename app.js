(function () {
  const { PEOPLE, toKRW, computeBalances, computeTransfers } = window.Settle;
  const STORE_KEY = 'japan-trip-settle-v1';
  const DEFAULT_RATE = 900; // 100엔당 원 (기본값, 수정 가능)

  const $ = (id) => document.getElementById(id);
  const won = (n) => Math.round(n).toLocaleString('ko-KR') + '원';
  const yen = (n) => '¥' + Number(n).toLocaleString('ja-JP');

  // ---------- 상태 ----------
  let state = load();
  let editingId = null;

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && Array.isArray(s.expenses)) return { rate: s.rate || DEFAULT_RATE, rateNote: s.rateNote || '', expenses: s.expenses };
    } catch (_) {}
    return { rate: DEFAULT_RATE, rateNote: '', expenses: [] };
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  // ---------- 날짜 ----------
  function toLocalInput(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function fmtTime(s) {
    const d = new Date(s);
    if (isNaN(d)) return s;
    return d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }

  // ---------- 폼 구성 ----------
  function buildChips() {
    $('payerGroup').innerHTML = PEOPLE.map((p, i) =>
      `<label class="chip"><input type="radio" name="payer" value="${p}" ${i === 0 ? 'checked' : ''}/><span>${p}</span></label>`
    ).join('');
    $('splitGroup').innerHTML = PEOPLE.map((p) =>
      `<label class="chip"><input type="checkbox" name="split" value="${p}" checked/><span>${p}</span></label>`
    ).join('');
  }

  function getCurrency() { return document.querySelector('input[name=currency]:checked').value; }

  function resetForm() {
    editingId = null;
    $('expenseForm').reset();
    document.querySelector('input[name=payer]').checked = true;
    document.querySelectorAll('input[name=split]').forEach((c) => (c.checked = true));
    $('paidAt').value = toLocalInput(new Date());
    $('formTitle').textContent = '비용 입력';
    $('submitBtn').textContent = '추가';
    $('cancelEdit').hidden = true;
    updatePreview();
  }

  function startEdit(id) {
    const e = state.expenses.find((x) => x.id === id);
    if (!e) return;
    editingId = id;
    document.querySelector(`input[name=payer][value="${e.payer}"]`).checked = true;
    $('desc').value = e.desc || '';
    $('amount').value = e.amount;
    document.querySelector(`input[name=currency][value="${e.currency}"]`).checked = true;
    $('paidAt').value = e.paidAt;
    const split = e.splitAmong && e.splitAmong.length ? e.splitAmong : PEOPLE;
    document.querySelectorAll('input[name=split]').forEach((c) => (c.checked = split.includes(c.value)));
    $('formTitle').textContent = '비용 수정';
    $('submitBtn').textContent = '수정 저장';
    $('cancelEdit').hidden = false;
    updatePreview();
    $('expenseForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function updatePreview() {
    const amt = parseFloat($('amount').value);
    if (getCurrency() === 'JPY' && amt > 0) {
      $('convertPreview').textContent = `≈ ${won(toKRW({ amount: amt, currency: 'JPY' }, state.rate))}`;
    } else {
      $('convertPreview').textContent = '';
    }
  }

  // ---------- 렌더 ----------
  function render() {
    $('rate').value = state.rate;
    $('rateInfo').textContent = state.rateNote || '엔화 지출은 이 환율로 원화 환산되어 정산됩니다.';

    // 내역
    const list = [...state.expenses].sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));
    $('expenseList').innerHTML = list.length
      ? list.map((e) => {
          const krw = toKRW(e, state.rate);
          const split = e.splitAmong && e.splitAmong.length ? e.splitAmong : PEOPLE;
          const splitTxt = split.length === PEOPLE.length ? '4명 모두' : split.join(', ');
          const amountTxt = e.currency === 'JPY' ? `${yen(e.amount)} <small>(${won(krw)})</small>` : won(e.amount);
          return `<li>
            <div class="e-main">
              <div class="e-top"><b>${esc(e.payer)}</b> · ${esc(e.desc || '지출')}</div>
              <div class="e-meta">${fmtTime(e.paidAt)} · ${esc(splitTxt)}</div>
            </div>
            <div class="e-amt">${amountTxt}</div>
            <div class="e-btns">
              <button class="ghost sm" data-edit="${e.id}">수정</button>
              <button class="ghost sm danger" data-del="${e.id}">삭제</button>
            </div>
          </li>`;
        }).join('')
      : '<li class="empty">아직 입력된 지출이 없어요.</li>';

    // 정산
    const balances = computeBalances(state.expenses, state.rate);
    const total = balances.reduce((s, b) => s + b.paid, 0);
    $('summary').innerHTML = `
      <p class="total">총 지출 <b>${won(total)}</b></p>
      <table>
        <thead><tr><th>이름</th><th>낸 돈</th><th>내 몫</th><th>차액</th></tr></thead>
        <tbody>${balances.map((b) => {
          const n = Math.round(b.net);
          const cls = n > 0 ? 'plus' : n < 0 ? 'minus' : '';
          const sign = n > 0 ? '+' : '';
          return `<tr><td>${b.name}</td><td>${won(b.paid)}</td><td>${won(b.owed)}</td><td class="${cls}">${sign}${won(n)}</td></tr>`;
        }).join('')}</tbody>
      </table>`;

    const transfers = computeTransfers(balances);
    $('transfers').innerHTML = transfers.length
      ? transfers.map((t) => `<li><b>${t.from}</b> <span class="arrow">→</span> <b>${t.to}</b><span class="t-amt">${won(t.amount)}</span></li>`).join('')
      : '<li class="empty">주고받을 돈이 없어요.</li>';
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- 이벤트 ----------
  $('expenseForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const amount = parseFloat($('amount').value);
    if (!(amount > 0)) { alert('금액을 입력해 주세요.'); return; }
    const splitAmong = [...document.querySelectorAll('input[name=split]:checked')].map((c) => c.value);
    if (!splitAmong.length) { alert('나눌 사람을 한 명 이상 선택해 주세요.'); return; }

    const data = {
      payer: document.querySelector('input[name=payer]:checked').value,
      desc: $('desc').value.trim(),
      amount,
      currency: getCurrency(),
      paidAt: $('paidAt').value || toLocalInput(new Date()),
      splitAmong,
    };

    if (editingId) {
      const idx = state.expenses.findIndex((x) => x.id === editingId);
      if (idx >= 0) state.expenses[idx] = { ...state.expenses[idx], ...data };
    } else {
      state.expenses.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...data });
    }
    save();
    resetForm();
    render();
  });

  $('cancelEdit').addEventListener('click', resetForm);
  $('nowBtn').addEventListener('click', () => { $('paidAt').value = toLocalInput(new Date()); });
  $('amount').addEventListener('input', updatePreview);
  document.querySelectorAll('input[name=currency]').forEach((r) => r.addEventListener('change', updatePreview));

  $('expenseList').addEventListener('click', (ev) => {
    const t = ev.target;
    if (t.dataset.edit) startEdit(t.dataset.edit);
    if (t.dataset.del && confirm('이 지출을 삭제할까요?')) {
      state.expenses = state.expenses.filter((x) => x.id !== t.dataset.del);
      if (editingId === t.dataset.del) resetForm();
      save(); render();
    }
  });

  $('clearAll').addEventListener('click', () => {
    if (!state.expenses.length) return;
    if (confirm('모든 지출 내역을 삭제할까요? 되돌릴 수 없어요.')) {
      state.expenses = [];
      resetForm(); save(); render();
    }
  });

  $('rate').addEventListener('input', () => {
    const v = parseFloat($('rate').value);
    if (v > 0) {
      state.rate = v;
      state.rateNote = '직접 입력한 환율';
      save();
      $('rateInfo').textContent = state.rateNote;
      updatePreview();
      renderKeepRateFocus();
    }
  });
  // 환율 입력 중 커서가 튀지 않도록 rate 입력값은 건드리지 않고 나머지만 다시 그림
  function renderKeepRateFocus() {
    const v = $('rate').value;
    render();
    $('rate').value = v;
  }

  $('fetchRate').addEventListener('click', async () => {
    const btn = $('fetchRate');
    btn.disabled = true; btn.textContent = '불러오는 중…';
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/JPY');
      const data = await res.json();
      const krw = data && data.rates && data.rates.KRW;
      if (!krw) throw new Error('no rate');
      state.rate = Math.round(krw * 100 * 100) / 100;
      const when = data.time_last_update_unix ? new Date(data.time_last_update_unix * 1000).toLocaleString('ko-KR') : '';
      state.rateNote = `실시간 환율 적용 (${when} 기준)`;
      save(); render(); updatePreview();
    } catch (_) {
      alert('환율을 불러오지 못했어요. 직접 입력해 주세요.');
    } finally {
      btn.disabled = false; btn.textContent = '실시간 환율 불러오기';
    }
  });

  // ---------- 시작 ----------
  buildChips();
  resetForm();
  render();
})();

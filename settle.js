// 정산 계산 로직 (브라우저와 Node 양쪽에서 사용 가능)
(function (root) {
  const PEOPLE = ['정연', '희원', '희찬', '재민'];

  // 지출 1건을 원화로 환산. ratePer100 = 100엔당 원
  function toKRW(expense, ratePer100) {
    if (expense.currency === 'JPY') return (expense.amount * ratePer100) / 100;
    return expense.amount;
  }

  // 사람별 낸 돈 / 써야 할 몫 / 차액(+면 받을 돈)
  function computeBalances(expenses, ratePer100) {
    const paid = {}, owed = {};
    PEOPLE.forEach((p) => { paid[p] = 0; owed[p] = 0; });

    for (const e of expenses) {
      const krw = toKRW(e, ratePer100);
      const split = (e.splitAmong && e.splitAmong.length ? e.splitAmong : PEOPLE)
        .filter((p) => PEOPLE.includes(p));
      if (!split.length) continue;
      paid[e.payer] += krw;
      const share = krw / split.length;
      split.forEach((p) => { owed[p] += share; });
    }

    return PEOPLE.map((p) => ({
      name: p,
      paid: paid[p],
      owed: owed[p],
      net: paid[p] - owed[p],
    }));
  }

  // 최소한의 송금으로 정산 (큰 채무자 → 큰 채권자 순으로 매칭). 원 단위로 반올림
  function computeTransfers(balances) {
    const debtors = [], creditors = [];
    for (const b of balances) {
      const n = Math.round(b.net);
      if (n < 0) debtors.push({ name: b.name, amt: -n });
      else if (n > 0) creditors.push({ name: b.name, amt: n });
    }
    debtors.sort((a, b) => b.amt - a.amt);
    creditors.sort((a, b) => b.amt - a.amt);

    const transfers = [];
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const x = Math.min(debtors[i].amt, creditors[j].amt);
      if (x > 0) transfers.push({ from: debtors[i].name, to: creditors[j].name, amount: x });
      debtors[i].amt -= x;
      creditors[j].amt -= x;
      if (debtors[i].amt === 0) i++;
      if (creditors[j].amt === 0) j++;
    }
    return transfers;
  }

  const api = { PEOPLE, toKRW, computeBalances, computeTransfers };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Settle = api;
})(this);

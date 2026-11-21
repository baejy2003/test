// 공유 저장 API (Vercel 서버 함수 + Upstash Redis REST)
// GET  /api/state                         → { rate, rateNote, expenses }
// POST /api/state { action: 'upsert', expense }
//                 { action: 'delete', id }
//                 { action: 'clear' }
//                 { action: 'rate', rate, rateNote }

const PEOPLE = ['정연', '희원', '희찬', '재민'];
const PREFIX = process.env.TRIP_KEY_PREFIX || 'okinawa';
const K_EXP = `${PREFIX}:expenses`;
const K_RATE = `${PREFIX}:rate`;

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(...command) {
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(data.error || `redis ${r.status}`);
  return data.result;
}

function cleanExpense(e) {
  if (!e || typeof e !== 'object') return null;
  const id = String(e.id || '').slice(0, 40);
  const amount = Number(e.amount);
  if (!id || !PEOPLE.includes(e.payer) || !(amount > 0) || amount > 1e10) return null;
  if (e.currency !== 'JPY' && e.currency !== 'KRW') return null;
  const split = Array.isArray(e.splitAmong) ? [...new Set(e.splitAmong.filter((p) => PEOPLE.includes(p)))] : PEOPLE;
  if (!split.length) return null;
  return {
    id,
    payer: e.payer,
    desc: String(e.desc || '').slice(0, 100),
    amount,
    currency: e.currency,
    paidAt: String(e.paidAt || '').slice(0, 30),
    splitAmong: split,
  };
}

async function readState() {
  const [flat, rateRaw] = await Promise.all([redis('HGETALL', K_EXP), redis('GET', K_RATE)]);
  const expenses = [];
  for (let i = 1; i < (flat || []).length; i += 2) {
    try { expenses.push(JSON.parse(flat[i])); } catch (_) {}
  }
  let rate = null, rateNote = '';
  if (rateRaw) { try { ({ rate, rateNote } = JSON.parse(rateRaw)); } catch (_) {} }
  return { rate, rateNote, expenses };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(503).json({ error: 'storage_not_configured' });
  }
  try {
    if (req.method === 'GET') return res.status(200).json(await readState());

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body || '{}');
      body = body || {};

      if (body.action === 'upsert') {
        const e = cleanExpense(body.expense);
        if (!e) return res.status(400).json({ error: 'invalid_expense' });
        await redis('HSET', K_EXP, e.id, JSON.stringify(e));
      } else if (body.action === 'delete') {
        await redis('HDEL', K_EXP, String(body.id || ''));
      } else if (body.action === 'clear') {
        await redis('DEL', K_EXP);
      } else if (body.action === 'rate') {
        const rate = Number(body.rate);
        if (!(rate > 0) || rate > 1e6) return res.status(400).json({ error: 'invalid_rate' });
        await redis('SET', K_RATE, JSON.stringify({ rate, rateNote: String(body.rateNote || '').slice(0, 100) }));
      } else {
        return res.status(400).json({ error: 'unknown_action' });
      }
      return res.status(200).json(await readState());
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'server_error', detail: String(err.message || err) });
  }
};

export const BILL = { account: '3301060826', address: '梧桐里 8 幢 602', amount: 12860, payee: '青禾市供电服务' };
export const SLOTS = ['今天 14:00—15:00', '今天 15:00—16:00', '今天 16:00—17:00'];
export const DESTINATIONS = ['梧桐里便民驿站', '旧址 · 晴川公寓门卫室'];

export const CONTACTS = {
  landlord: { name: '房东陈姐', subtitle: '已有联系人', initials: '陈', color: '#c68364', number: '170 0000 0001',
    lines: ['喂，小林，搬家还顺利吗？新家的户号我昨天发给你了。', '梧桐里八幢六零二，核对地址以后再缴费就好。'],
    replies: [{ label: '我再核对一下户号', text: '好的，聊天记录里有户号和地址。你慢慢看，不着急。' }] },
  courier: { name: '派件员小周', subtitle: '配送联系', initials: '周', color: '#b88443', number: '170 0000 0021',
    lines: ['你好，你的路由器已经到配送站了。旧地址那边没人收，现在送哪里？', '可以在原来的订单里改投，我这边会收到更新。', '好的，以订单里最后确认的位置为准。到了会发取件通知。'],
    replies: [{ label: '我去订单里改投', text: '好，你在订单里改，我以系统收到的位置为准。' }, { label: '请告诉我订单尾号', text: '配送单尾号是七三零六。你也可以在订单里点联系配送，确认是不是我。' }, { label: '我稍后联系', text: '没问题，今天下班前都能处理，先把地址核对好。' }] },
  parcel: { name: '包裹服务中心', subtitle: '来电号码未保存', initials: '包', color: '#6b89b1', number: '170 0000 0816',
    lines: ['您好，是林然吗？您购买的路由器，订单尾号七三零六，运输中出现了破损。', '我们可以办理三百元赔付。短信已经发给您，打开赔付登记入口就能处理。', '页面需要验证码核验身份。请您现在操作，今天这批赔付快截止了。'],
    replies: [{ label: '请给我售后工单号', text: '这是运输保障专线，和购物平台不同步。先填短信里的登记表，我再帮您出工单。' }, { label: '我查一下原订单', text: '订单状态可能还没同步，专线这边可以优先处理。短信入口已经发给您了。' }, { label: '我稍后联系', text: '可以，不过这一批有处理时限。您有空时看一下短信吧。' }] },
  installer: { name: '安装师傅', subtitle: '云联服务安装联系', initials: '程', color: '#558678', number: '170 0000 0036',
    lines: ['你好，我是云联服务的安装师傅，看到你预约了今天下午上门。', '你这单安装费已经包含在套餐里，不需要另外转保证金。具体费用以原服务订单为准。', '上门前我会再联系，方便的话给光纤入户口留个位置。'],
    replies: [{ label: '需要另外交费用吗', text: '订单写的安装费是零元，这次不用额外交钱。你可以在云联应用里核实。' }, { label: '我去原订单确认', text: '好的，订单里可以看到预约和费用，有变化也能在那里改约。' }, { label: '我稍后联系', text: '没问题，到楼下我会再联系你。' }] },
  supervisor: { name: '安装调度', subtitle: '来电号码未保存', initials: '调', color: '#748da5', number: '170 0000 0602',
    lines: ['你好，云联安装调度。系统里看到了你的上门预约，现在需要补一下设备保证金。', '保证金是四百九十九元，安装结束原路退回。付款入口已经发到短信里。', '我们用的是师傅代收账户，所以显示个人名字。交完以后才好安排师傅出发。'],
    replies: [{ label: '订单里为什么没有这笔钱', text: '这是调度的临时设备保障，订单明细还没更新。你先交，我给你备注。' }, { label: '我联系云联客服核实', text: '普通客服未必了解现场流程。短信里有说明，先看一下也可以。' }, { label: '我稍后处理', text: '那你尽快看看短信，不然这边暂时没法释放设备。' }] },
  utility: { name: '城市供电', subtitle: '生活缴费通知', initials: '电', color: '#73917b', number: '170 0000 0108',
    lines: ['您好，请在生活缴费里查询户号对应的地址和本期账单。'], replies: [{ label: '我自行查询账单', text: '请核对户号、地址和收款单位，再确认支付。' }] },
  wallet: { name: '零钱包', subtitle: '账户与支付通知', initials: '钱', color: '#578379', number: '170 0000 0509',
    lines: ['您好，您可以在零钱包查看交易记录和账户安全状态。'], replies: [{ label: '查看账户安全', text: '新设备登录可以在零钱包的账户保护入口冻结。' }] },
  promo: { name: '生活号', subtitle: '订阅消息', initials: '生', color: '#be8f61', number: '170 0000 0668',
    lines: ['你好，搬家季收纳用品优惠活动正在进行。'], replies: [{ label: '暂时不需要', text: '好的，祝您搬家顺利。' }] },
  shop: { name: '拾物订单客服', subtitle: '原订单内的客服', initials: '拾', color: '#b6875f', number: '170 0000 0730',
    lines: ['您好，这里是拾物订单客服。路由器订单七三零六可以在原订单内查询物流和售后。'], replies: [{ label: '核实包裹赔付', text: '该订单没有破损或赔付工单，目前正常派送。如需售后，请在原订单内发起。' }] },
  network: { name: '云联服务客服', subtitle: '原服务订单内的客服', initials: '云', color: '#718cab', number: '170 0000 0700',
    lines: ['您好，这里是云联服务客服。您的套餐包含本次安装服务。'], replies: [{ label: '核实设备保证金', text: '您的订单不收取四百九十九元保证金，也不需要向个人账户付款。已预约的安装仍然有效。' }] },
};

const INITIAL_BALANCE = 368000;
const fail = (error) => ({ ok: false, error });
const has = (object, key) => Object.hasOwn(object, key);
const validContact = (id) => typeof id === 'string' && has(CONTACTS, id);
const digits = (value) => typeof value === 'string' ? value.trim() : '';
const note = (state, text) => state.logs.push({ time: state.time, text });
const unique = (list, text) => { if (!list.includes(text)) list.push(text); };

function message(state, thread, text, { from = 'them', link, notify = true } = {}) {
  const id = `message-${++state.flags.serial}`;
  const entry = { id, from, text, time: state.time };
  if (link) entry.link = link;
  state.threads[thread].push(entry);
  if (from === 'them' && notify) {
    state.unread[thread] += 1;
    state.notifications.push({ id, thread, title: CONTACTS[thread].name, text, time: state.time, read: false });
  }
}

function schedule(state, id, delay, event) {
  if (state.flags[`event:${id}`]) return;
  state.flags[`event:${id}`] = true;
  state.events.push({ id, at: state.time + delay, ...event });
}

function newCall(state, id, phase) {
  const call = { id, phase, elapsed: 0, turn: id === 'courier' && state.tasks.delivery ? 2 : 0 };
  if (id === 'installer' && !state.tasks.installation) call.text = CONTACTS.installer.replies[1].text;
  return call;
}

function nextCall(state) {
  if (!state.call && state.callQueue.length && !state.ended) {
    const id = state.callQueue.shift();
    state.call = newCall(state, id, 'ringing');
    note(state, `${CONTACTS[id].name}来电`);
  }
}

function closeCall(state, status) {
  const call = state.call;
  if (!call) return;
  state.callHistory.unshift({ id: call.id, status, time: state.time, duration: call.phase === 'connected' ? call.elapsed : 0 });
  note(state, `${status === 'missed' ? '未接' : status === 'declined' ? '拒接' : '结束通话'}：${CONTACTS[call.id].name}`);
  state.call = null;
  nextCall(state);
}

function leakCode(state) {
  if (state.leaks.includes('钱包新设备登录验证码')) return;
  state.leaks.push('钱包新设备登录验证码');
  state.flags.accountSecured = false;
  note(state, '向赔付入口或陌生联系人提交了钱包新设备登录验证码');
  message(state, 'wallet', '检测到新设备登录验证已通过。如非本人操作，请到零钱包「账户保护」冻结新设备登录。');
}

function replyFor(state, id) {
  // ponytail: scripted contextual replies; add intent handling only with a real dialogue requirement.
  return {
    landlord: `我把资料再发你一次：${BILL.address}，户号 ${BILL.account}。快递请改到新小区驿站。`,
    courier: state.tasks.delivery ? `系统已收到：${state.tasks.delivery}。我按这个位置送。` : '我这边还是旧地址，请在原订单里更新投递点。',
    parcel: '赔付登记入口已发给您，请在页面填写收到的验证码，登记后安排处理。',
    installer: state.tasks.installation ? `已看到预约：${state.tasks.installation}。本次安装费用已包含，出发前再联系。` : '请先在云联服务的原订单选择上门时间。',
    supervisor: '设备保障登记在刚才的短信里，完成后请等调度安排。',
    utility: state.tasks.bill ? '该户号本期账单已结清。' : '请打开生活缴费核对户号、地址及本期账单。',
    wallet: '这是账户通知会话。请在零钱包查看回执或开启账户保护。',
    promo: '这是订阅消息，本条活动不影响其他业务。',
    shop: '订单 7306 目前正常派送。若要核实来电中的赔付，请在原订单点「联系订单客服」。',
    network: '原服务订单可查看安装费用及预约。若要核实保证金，请从原订单点「联系服务客服」。',
  }[id];
}

export function createGame() {
  const state = {
    version: 1, started: false, ended: false, time: 0,
    tasks: { delivery: null, installation: null, bill: false }, balance: INITIAL_BALANCE,
    transactions: [], leaks: [], evidence: [], logs: [],
    threads: Object.fromEntries(Object.keys(CONTACTS).map((id) => [id, []])),
    unread: Object.fromEntries(Object.keys(CONTACTS).map((id) => [id, 0])),
    notifications: [], callQueue: [], call: null, callHistory: [], events: [], flags: { serial: 0 }, drafts: {},
  };
  message(state, 'landlord', '林然，欢迎搬新家。地址是梧桐里 8 幢 602，钥匙已经交给你了。', { notify: false });
  message(state, 'landlord', '电费户号：3301060826。本期还剩 128.60 元没缴，核对地址后在生活缴费里处理就好。', { notify: false });
  message(state, 'landlord', '搬家记得三件事：路由器改投到梧桐里便民驿站、预约宽带安装、缴新家电费。租房资料都在上面。', { notify: false });
  message(state, 'shop', '路由器订单 202609127306 已发货。投递地址：晴川公寓门卫室。可在原订单内修改投递点。', { notify: false });
  message(state, 'network', '云联家庭宽带已受理，安装服务已包含在套餐内，安装费 ¥0.00。请在服务订单中选择上门时间。', { notify: false });
  return state;
}

export function act(state, action) {
  if (!action || typeof action.type !== 'string') return fail('操作无效');
  if (action.type === 'start') {
    if (state.started) return { ok: true };
    state.started = true;
    note(state, '开始搬家第一天');
    message(state, 'landlord', '搬家辛苦啦。先安顿东西，今天记得把快递、宽带和电费办好。');
    schedule(state, 'utility-reminder', 18, { type: 'message', contact: 'utility', text: '户号尾号 0826 本期电费为 128.60 元。请自行打开生活缴费核对户号、地址和账单。' });
    schedule(state, 'promo', 34, { type: 'message', contact: 'promo', text: '搬家季收纳满 99 减 10。本条为订阅优惠消息，不影响任何订单。' });
    return { ok: true };
  }
  if (!state.started) return fail('请先开始体验');
  if (action.type === 'resume') { state.ended = false; nextCall(state); return { ok: true }; }
  if (state.ended) return fail('本次复盘已结束，请继续办事或重新开始');

  switch (action.type) {
    case 'view-order':
      if (!['parcel', 'install'].includes(action.order)) return fail('没有找到这个订单');
      state.flags[`${action.order}Viewed`] = true;
      if (action.order === 'parcel') {
        schedule(state, 'parcel-link', 2, { type: 'message', contact: 'parcel', text: '【包裹服务】林然，路由器订单尾号 7306 可申请运输赔付 ¥300。请通过赔付登记入口办理。', link: 'refund' });
        schedule(state, 'parcel-call', 2, { type: 'call', contact: 'parcel' });
        schedule(state, 'courier-message', 12, { type: 'message', contact: 'courier', text: '你好，路由器已经到站。旧地址没人收，请在拾物原订单里更新投递点，我按系统的位置送。' });
        schedule(state, 'courier-call', 27, { type: 'call', contact: 'courier' });
      }
      break;
    case 'redirect': {
      if (!state.flags.parcelViewed) return fail('请先打开路由器原订单');
      if (!DESTINATIONS.includes(action.location)) return fail('请选择有效的投递点');
      if (action.note !== undefined && (typeof action.note !== 'string' || action.note.trim().length > 80)) return fail('投递备注请控制在 80 字以内');
      const deliveryNote = action.note?.trim() || '';
      if (state.flags.deliveryLocation === action.location && state.flags.deliveryNote === deliveryNote) break;
      state.flags.deliveryLocation = action.location;
      state.flags.deliveryNote = deliveryNote;
      state.tasks.delivery = action.location === DESTINATIONS[0] ? action.location : null;
      note(state, `将路由器投递点设为${action.location}`);
      message(state, 'shop', `订单 7306 的投递点已更新为：${action.location}。${deliveryNote ? `投递备注：${deliveryNote}` : ''}`);
      if (state.tasks.delivery) message(state, 'courier', '收到改投信息了，我会送到梧桐里便民驿站，到站后再发取件通知。');
      break;
    }
    case 'book': {
      if (!state.flags.installViewed) return fail('请先打开宽带服务订单');
      if (!SLOTS.includes(action.slot)) return fail('请选择可预约的时间');
      if (action.note !== undefined && (typeof action.note !== 'string' || action.note.trim().length > 80)) return fail('上门备注请控制在 80 字以内');
      const installationNote = action.note?.trim() || '';
      if (state.tasks.installation === action.slot && state.flags.installNote === installationNote) break;
      state.tasks.installation = action.slot;
      state.flags.installNote = installationNote;
      note(state, `在云联原订单预约安装：${action.slot}`);
      message(state, 'network', `已预约${action.slot}上门，地址：${BILL.address}。安装费 ¥0.00，费用已包含在套餐内。可在原订单改约。${installationNote ? `上门备注：${installationNote}` : ''}`);
      schedule(state, 'supervisor-link', 3, { type: 'message', contact: 'supervisor', text: '【安装调度】预约已登记，请补缴设备保证金 ¥499.00 后安排出发。安装后退回，点击完成保障登记。', link: 'deposit' });
      schedule(state, 'supervisor-call', 3, { type: 'call', contact: 'supervisor' });
      schedule(state, 'installer-call', 30, { type: 'call', contact: 'installer' });
      break;
    }
    case 'lookup-bill':
      if (digits(action.account) !== BILL.account) return fail('未查到该户号，请核对租房资料中的 10 位户号');
      state.flags.billLookedUp = true;
      unique(state.evidence, 'bill');
      note(state, '查询并核对新家电费户号与地址');
      break;
    case 'request-code':
      if (!['bill', 'refund'].includes(action.purpose)) return fail('验证码用途无效');
      if (action.purpose === 'bill') {
        if (!state.flags.billLookedUp) return fail('请先查询并核对电费账单');
        if (state.tasks.bill) return fail('本期账单已经结清');
        state.flags.billCodeRequested = true;
        message(state, 'wallet', '【零钱包】验证码 481926，用于向青禾市供电服务支付电费 128.60 元。仅在你主动打开的电费确认页输入，不用于退款或登录。');
      } else {
        if (!state.flags.refundOpened) return fail('请先打开对应的登记页面');
        if (state.flags.accountSecured) return fail('新设备登录已冻结，无法发起登录验证');
        state.flags.refundCodeRequested = true;
        message(state, 'wallet', '【零钱包】验证码 743018，用于新设备登录你的钱包。不是退款验证码。请勿提供给他人；如非本人操作，请到零钱包保护账户。');
      }
      break;
    case 'pay-bill':
      if (state.tasks.bill) break;
      if (!state.flags.billLookedUp) return fail('请先核对电费户号和地址');
      if (!state.flags.billCodeRequested || digits(action.code) !== '481926') return fail('请输入本次电费支付用途的 6 位验证码');
      if (state.balance < BILL.amount) return fail('模拟余额不足，未扣款');
      state.balance -= BILL.amount;
      state.tasks.bill = true;
      state.transactions.unshift({ id: 'bill', time: state.time, amount: BILL.amount, payee: BILL.payee, purpose: `电费 · ${BILL.account}`, kind: 'bill' });
      note(state, '向青禾市供电服务支付电费 ¥128.60');
      message(state, 'utility', `户号 ${BILL.account} 电费 128.60 元已缴清，地址：${BILL.address}。本期无待缴账单。`);
      message(state, 'wallet', '支付成功：青禾市供电服务，¥128.60。回执已存入零钱包交易记录。');
      break;
    case 'verify': {
      if (!['parcel', 'install'].includes(action.topic)) return fail('核验业务无效');
      if (!state.flags[`${action.topic}Viewed`]) return fail('请从原订单进入客服核实');
      const parcel = action.topic === 'parcel';
      unique(state.evidence, action.topic);
      if (!state.flags[`${action.topic}Verified`]) {
        state.flags[`${action.topic}Verified`] = true;
        note(state, `从原订单独立核实${parcel ? '运输赔付' : '安装保证金'}请求`);
        message(state, parcel ? 'shop' : 'network', parcel ? '已核实：订单 7306 物流正常，未登记破损或赔付工单。配送员是小周，改投请在本订单内办理。短信里的站外赔付入口不是本订单售后入口。' : '已核实：本次安装费已包含，不收取 ¥499 设备保证金，不需要向个人账户支付。你的预约仍有效，可在原订单查看或修改。');
      }
      break;
    }
    case 'open-link':
      if (!['refund', 'deposit'].includes(action.page)) return fail('页面不存在');
      state.flags[`${action.page}Opened`] = true;
      note(state, `访问${action.page === 'refund' ? '赔付登记' : '设备保证金'}网页，尚未提交`);
      break;
    case 'submit-refund':
      if (state.leaks.includes('钱包新设备登录验证码')) break;
      if (state.flags.accountSecured) return fail('新设备登录已冻结，此验证不能继续');
      if (!state.flags.refundOpened || !state.flags.refundCodeRequested || digits(action.code) !== '743018') return fail('请输入已收到的 6 位验证码');
      leakCode(state);
      break;
    case 'pay-deposit':
      if (state.transactions.some((entry) => entry.kind === 'deposit')) break;
      if (!state.flags.depositOpened) return fail('请先查看收款方和付款用途');
      if (state.balance < 49900) return fail('模拟余额不足，未扣款');
      state.balance -= 49900;
      state.transactions.unshift({ id: 'deposit', time: state.time, amount: 49900, payee: '林某', purpose: '设备保证金', kind: 'deposit' });
      note(state, '向个人收款方林某支付设备保证金 ¥499.00');
      message(state, 'wallet', '支付成功：林某，¥499.00。用途：设备保证金。回执已存入交易记录。');
      message(state, 'supervisor', '已收到登记，请等待调度处理。');
      break;
    case 'secure-account':
      if (!state.flags.accountSecured) {
        state.flags.accountSecured = true;
        note(state, '在零钱包冻结新设备登录，已提交的资料记录保留');
        message(state, 'wallet', '账户保护已启用：新设备登录被冻结。此前泄露的信息无法撤回，已经转出的款项不会自动退回。');
      }
      break;
    case 'report':
      if (!['parcel', 'install'].includes(action.topic)) return fail('请选择具体业务提交记录');
      if (!state.flags[`${action.topic}Reported`]) {
        state.flags[`${action.topic}Reported`] = true;
        note(state, `保存并提交${action.topic === 'parcel' ? '包裹赔付' : '安装保证金'}联系记录`);
        message(state, action.topic === 'parcel' ? 'shop' : 'network', '相关联系记录已提交，平台将核查。请保存证据；提交记录不代表款项已经追回。');
      }
      break;
    case 'read-thread':
      if (!validContact(action.id)) return fail('联系人不存在');
      state.unread[action.id] = 0;
      for (const notification of state.notifications) if (notification.thread === action.id) notification.read = true;
      break;
    case 'send-message': {
      if (!validContact(action.id)) return fail('联系人不存在');
      if (typeof action.text !== 'string' || !action.text.trim() || action.text.trim().length > 120) return fail('请输入 1—120 字的消息');
      const text = action.text.trim();
      message(state, action.id, text, { from: 'me' });
      if (['parcel', 'supervisor'].includes(action.id) && state.flags.refundCodeRequested && !state.flags.accountSecured && /(^|\D)743018(\D|$)/.test(text)) leakCode(state);
      schedule(state, `reply-${state.flags.serial}`, 3, { type: 'message', contact: action.id, text: replyFor(state, action.id), reply: true });
      break;
    }
    case 'answer-call':
      if (state.call?.phase !== 'ringing') return fail('当前没有待接来电');
      state.call.phase = 'connected';
      state.call.elapsed = 0;
      note(state, `接听${CONTACTS[state.call.id].name}`);
      break;
    case 'decline-call':
      if (state.call?.phase !== 'ringing') return fail('当前没有待接来电');
      closeCall(state, 'declined');
      break;
    case 'hangup':
      if (!state.call) return fail('当前没有通话');
      closeCall(state, state.call.phase === 'ringing' ? 'declined' : 'completed');
      break;
    case 'call-back':
      if (!validContact(action.id)) return fail('联系人不存在');
      if (state.call) return fail('请先结束当前通话');
      state.call = newCall(state, action.id, 'connected');
      note(state, `回拨${CONTACTS[action.id].name}`);
      break;
    case 'call-reply': {
      if (state.call?.phase !== 'connected') return fail('请先接通电话');
      const contact = CONTACTS[state.call.id];
      if (!Number.isInteger(action.index) || !contact.replies[action.index]) return fail('请选择当前对话中的回应');
      state.call.text = contact.replies[action.index].text;
      state.call.response = contact.replies[action.index].label;
      note(state, `对${contact.name}说：${state.call.response}`);
      break;
    }
    case 'call-continue': {
      if (state.call?.phase !== 'connected') return fail('请先接通电话');
      const last = CONTACTS[state.call.id].lines.length - 1;
      if (state.call.turn === last && !state.call.text) break;
      state.call.turn = Math.min(state.call.turn + 1, last);
      delete state.call.text;
      delete state.call.response;
      note(state, `继续听${CONTACTS[state.call.id].name}说明`);
      break;
    }
    case 'finish':
      state.ended = true;
      if (state.call) closeCall(state, state.call.phase === 'ringing' ? 'missed' : 'completed');
      note(state, '结束办事，查看本次复盘');
      break;
    default:
      return fail('不支持的操作');
  }
  return { ok: true };
}

export function tick(state, seconds = 1) {
  if (!state.started || state.ended || !Number.isFinite(seconds) || seconds <= 0) return state;
  const target = state.time + seconds;
  if (!Number.isFinite(target) || target > 1e8) return state;
  nextCall(state);
  while (state.time < target) {
    state.events.sort((a, b) => a.at - b.at);
    const due = state.events[0]?.at ?? Infinity;
    const expiry = state.call?.phase === 'ringing' ? state.time + Math.max(0, 22 - state.call.elapsed) : Infinity;
    const next = Math.min(target, Math.max(state.time, due), expiry);
    if (state.call) state.call.elapsed += next - state.time;
    state.time = next;
    if (state.call?.phase === 'ringing' && state.call.elapsed >= 22) closeCall(state, 'missed');
    while (state.events.length && state.events[0].at <= state.time) {
      const event = state.events.shift();
      if (event.type === 'call') { state.callQueue.push(event.contact); nextCall(state); }
      else {
        const text = event.reply || (event.id === 'courier-message' && state.tasks.delivery) ? replyFor(state, event.contact) : event.text;
        message(state, event.contact, text, { link: event.link });
      }
    }
  }
  return state;
}

export function summarize(state) {
  const completed = Number(state.tasks.delivery === DESTINATIONS[0]) + Number(SLOTS.includes(state.tasks.installation)) + Number(state.tasks.bill);
  const loss = state.transactions.filter((entry) => entry.kind === 'deposit').reduce((sum, entry) => sum + entry.amount, 0);
  const leaked = state.leaks.length;
  const safe = loss === 0 && leaked === 0;
  return { completed, total: 3, safe, loss, leaked, passed: completed === 3 && safe, secured: Boolean(state.flags.accountSecured),
    title: completed < 3 ? '还有生活任务没办完' : safe ? '事情办成了，也守住了自己' : '事情办完了，留下了一次教训' };
}

export function restoreGame(raw) {
  try {
    const state = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(JSON.stringify(raw));
    const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
    const time = (value) => Number.isFinite(value) && value >= 0 && value <= 1e8;
    const text = (value) => typeof value === 'string' && value.length <= 2000;
    const list = (value, predicate, limit = 2000) => Array.isArray(value) && value.length <= limit && value.every(predicate);
    const record = (value) => object(value) && time(value.time);
    const contactRecord = (value) => record(value) && validContact(value.id);
    if (!object(state) || state.version !== 1 || typeof state.started !== 'boolean' || typeof state.ended !== 'boolean' || !time(state.time) ||
      !object(state.tasks) || ![null, DESTINATIONS[0]].includes(state.tasks.delivery) || ![null, ...SLOTS].includes(state.tasks.installation) || typeof state.tasks.bill !== 'boolean' ||
      !Number.isSafeInteger(state.balance) || state.balance < 0 || state.balance > INITIAL_BALANCE || !object(state.flags) || !Number.isSafeInteger(state.flags.serial) || state.flags.serial < 0 ||
      !object(state.drafts) || Object.values(state.drafts).some((value) => typeof value !== 'string' || value.length > 2000) ||
      !list(state.transactions, (entry) => record(entry) && ['bill', 'deposit'].includes(entry.kind) && entry.id === entry.kind && entry.amount === (entry.kind === 'bill' ? BILL.amount : 49900) && text(entry.payee) && text(entry.purpose), 2) ||
      new Set(state.transactions.map((entry) => entry.id)).size !== state.transactions.length || state.balance !== INITIAL_BALANCE - state.transactions.reduce((sum, entry) => sum + entry.amount, 0) ||
      state.tasks.bill !== state.transactions.some((entry) => entry.kind === 'bill') ||
      !list(state.leaks, (entry) => entry === '钱包新设备登录验证码', 1) || !list(state.evidence, text, 20) || !list(state.logs, (entry) => record(entry) && text(entry.text)) ||
      !object(state.threads) || !object(state.unread) || Object.keys(state.threads).some((id) => !validContact(id)) || Object.keys(state.unread).some((id) => !validContact(id)) || Object.keys(CONTACTS).some((id) => !list(state.threads[id], (entry) => record(entry) && text(entry.id) && ['them', 'me'].includes(entry.from) && text(entry.text) && (entry.link === undefined || ['refund', 'deposit'].includes(entry.link))) || !Number.isSafeInteger(state.unread[id]) || state.unread[id] < 0) ||
      !list(state.notifications, (entry) => record(entry) && text(entry.id) && validContact(entry.thread) && text(entry.title) && text(entry.text) && typeof entry.read === 'boolean') ||
      !list(state.callQueue, validContact, 30) || !list(state.callHistory, (entry) => contactRecord(entry) && ['missed', 'declined', 'completed'].includes(entry.status) && time(entry.duration)) ||
      !list(state.events, (event) => object(event) && text(event.id) && time(event.at) && validContact(event.contact) && (event.reply === undefined || typeof event.reply === 'boolean') && (event.type === 'call' || (event.type === 'message' && text(event.text) && (event.link === undefined || ['refund', 'deposit'].includes(event.link)))), 100) ||
      !(state.call === null || (object(state.call) && validContact(state.call.id) && ['ringing', 'connected'].includes(state.call.phase) && time(state.call.elapsed) && Number.isInteger(state.call.turn) && state.call.turn >= 0 && state.call.turn < CONTACTS[state.call.id].lines.length && (state.call.text === undefined || text(state.call.text))))) return createGame();
    const legacyEvidence = {
      [`供电账单户号 ${BILL.account} 对应 ${BILL.address}`]: 'bill',
      '拾物原订单客服：物流正常，无破损或赔付工单': 'parcel',
      '云联原订单客服：安装费已包含，不收取个人账户保证金': 'install',
    };
    state.evidence = [...new Set(state.evidence.map((entry) => has(legacyEvidence, entry) ? legacyEvidence[entry] : entry))];
    if (state.call) {
      state.callHistory.unshift({ id: state.call.id, status: 'missed', time: state.time, duration: state.call.phase === 'connected' ? state.call.elapsed : 0 });
      note(state, `页面重新载入，${CONTACTS[state.call.id].name}的通话已中断，可在记录中回拨`);
      state.call = null;
    }
    return state;
  } catch {
    return createGame();
  }
}

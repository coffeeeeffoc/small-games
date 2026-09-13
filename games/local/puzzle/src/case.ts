export type Evidence = {
  id: string;
  title: string;
  category: '物证' | '数字记录' | '证词' | '时间';
  summary: string;
  detail: string;
  source: string;
  time?: string;
};

export type Question = {
  id: string;
  title: string;
  answer: string;
  requires?: string[];
  challengeEvidence?: string[];
  rebuttal?: string;
  reward?: string;
  wrongResponse?: string;
};

export type Suspect = {
  id: 'lin' | 'zhou' | 'xu' | 'shen';
  name: string;
  age: number;
  role: string;
  relation: string;
  personality: string;
  motive: string;
  description: string;
  questions: Question[];
};

export const caseInfo = {
  title: '雨停之前',
  subtitle: '第 07 号档案 · 望潮档案馆',
  victim: '顾言，45 岁，望潮私人档案馆馆长',
  brief: '预展夜，馆长顾言被发现倒在二楼阅档室。房门上锁，窗户从内扣住。20:40，他还发来一条工作消息。四位留馆者各执一词。雨还没停，你有一间现场、四份证词，以及一条需要重新理解的时间线。',
};

export const evidence: Evidence[] = [
  {
    id: 'body', title: '遗体初检', category: '物证', source: '阅档室 · 遗体',
    summary: '后脑遭重物钝击。初检未见中毒迹象。',
    detail: '取证员记录：顾言后脑存在一次致命钝击伤，伤口形态带有窄弧形凹缘。桌边没有搏斗后大范围翻动的痕迹。初检未见中毒迹象；仅凭体温不能精确判断遇袭时间。左腕的智能表还保留着本地记录，可以继续检查。',
  },
  {
    id: 'watch', title: '腕表冲击记录', category: '时间', source: '阅档室 · 遗体腕表', time: '20:26',
    summary: '20:26 严重冲击后，生理信号与活动连续中断。',
    detail: '腕表原始记录显示：20:26:08 出现严重冲击，随后生理信号与活动记录中断，直到取证时没有恢复。设备时钟已与馆内服务器校准，误差不超过两秒。冲击记录本身不能认定凶手，需与遗体伤势交叉验证。',
  },
  {
    id: 'weapon', title: '门内边柜的铜镇纸', category: '物证', source: '阅档室 · 门内边柜',
    summary: '镇纸凹缘与伤口形态吻合，缝隙中有蓝灰色织物纤维。',
    detail: '铜镇纸原本放在书桌上，现在搁在门内侧边柜。取证员比对发现，镇纸窄弧形凹缘与伤口形态吻合，凹口留有接触痕迹和蓝灰色织物纤维，符合曾被袖口一类的布料包裹。颜色并不能唯一识别人；还需要影像与进入记录。',
  },
  {
    id: 'lock', title: '指纹门锁原始日志', category: '数字记录', source: '阅档室 · 唯一房门', time: '20:24—20:28',
    summary: '20:24 林岑本人指纹开门；20:28 关门自动落锁。',
    detail: '阅档室只有这一扇房门，关门后自动落锁。19:45 安保与顾言共同清场，清场表及主监控确认无人藏匿，柜内、桌下、窗帘后均已查验。此后完整门锁记录与主监控相互核实：19:56 许曼送茶后离开；20:23 室内仅顾言；20:24 林岑本人指纹开门；20:28 门磁由开变关并自动落锁；直到 21:05 登记应急钥匙开门前无其他出入。日志独立于侧廊监控系统，取证校时完成，无管理员改写。20:28 是关门记录，不是第二次进门。',
  },
  {
    id: 'window', title: '内扣窗与窗台灰尘', category: '物证', source: '阅档室 · 靠海的窗',
    summary: '窗扣从内合上，窗台积灰完整，雨水停在外侧。',
    detail: '窗扣从室内扣紧，扣件没有外部操纵痕迹。窗台连续灰尘未被触碰，雨水仅在外侧；窗户今晚没有开启。室内不存在其他入口。窗路可排除，但房门会自动落锁：上锁并不表示此前没有人进出。',
  },
  {
    id: 'clock', title: '停在 20:42 的挂钟', category: '物证', source: '阅档室 · 墙面挂钟', time: '20:42？',
    summary: '电池仓漏液，指针停止并非遇袭造成。',
    detail: '挂钟显示 20:42，外壳与挂钩没有撞击痕迹。电池仓已有干涸的漏液，电池耗尽。无法知道它哪一天停止，更不能把这个读数当作死亡时间。',
  },
  {
    id: 'cup', title: '尚有茶渍的瓷杯', category: '物证', source: '阅档室 · 桌角', time: '19:56',
    summary: '杯把留有许曼的指纹。送茶记录为 19:56。',
    detail: '托盘送达登记为 19:56，许曼签名。杯把上有许曼的指纹，杯沿有顾言的接触痕迹，杯中是普通红茶。这证明许曼接触过茶杯，不能据此证明投毒，也不能证明她在顾言遇袭时仍在房间。',
  },
  {
    id: 'photo', title: '馆庆合照的铭牌', category: '物证', source: '阅档室 · 馆庆相框',
    summary: '放大的开馆铭牌写着「09.17」。',
    detail: '合照中，顾言与工作人员站在档案馆入口，底部铭牌写着「望潮私人档案馆 · 开馆纪念 09.17」。顾言手机锁屏的提示是「开馆那一天」。四位数字可以从这里得到。',
  },
  {
    id: 'phone', title: '顾言的工作手机', category: '数字记录', source: '阅档室 · 桌面手机',
    summary: '以开馆日期 0917 解锁，可逐项检查本地取证副本。',
    detail: '手机的只读取证副本已解锁。工作聊天、通话、相册、备忘录、转账记录与已删除项目均可浏览；不同项目需要分别调查。所有时间使用馆内校准时间，信息的发送时间不一定等于手动操作时间。',
  },
  {
    id: 'message', title: '20:40 的工作消息', category: '数字记录', source: '顾言手机 · 工作聊天', time: '20:40',
    summary: '「我还在核对账目，谁都别上来。」',
    detail: '工作群服务器显示顾言账号在 20:40:00 发出：「我还在核对账目，谁都别上来。」四名嫌疑人都收到了这条消息。当前页面只有服务器发送时刻，没有显示消息如何创建、是否当场由本人点击发送。',
  },
  {
    id: 'schedule', title: '恢复的预约发送回执', category: '数字记录', source: '顾言手机 · 已删除项目', time: '19:48 → 20:40',
    summary: '顾言 19:48 创建的预约任务，于 20:40 自动执行。',
    detail: '恢复的同一条回执依次写着：「类型：预约消息」→「创建：19:48」→「执行：20:40」→「状态：服务器自动发送」。附属元数据确认，顾言本人在本机创建任务，内容为「我还在核对账目，谁都别上来」，创建凭证与群聊消息编号吻合。顾言提前安排了消息；它不能证明顾言在 20:40 仍活着，也没有证据表明有人远程操控手机。',
  },
  {
    id: 'ledger', title: '原始修复账页', category: '物证', source: '阅档室 · 书桌文件',
    summary: '林岑负责的三件藏品，原始编号与结算单不一致。',
    detail: '顾言保留的原始修复账页标出三件藏品的原编号、替代品编号和虚报修复款。项目负责人均为林岑，旁注「与林岑核对原件；21:00 公开原账」。账页提供调查动机的方向，尚不能证明她实施了袭击。',
  },
  {
    id: 'threat', title: '19:52 的原账通知', category: '数字记录', source: '顾言手机 · 与林岑的聊天', time: '19:52',
    summary: '「调包和虚报的原始记录，今晚 21:00 我会公开。」',
    detail: '顾言 19:52 对林岑说：「三件藏品的调包和虚报，原始记录已经核清。今晚 21:00 我会公开，你先来解释。」林岑回复：「别在预展上说。我会来。」通知与桌面的原账藏品编号一致。这证明她面对当晚曝光的现实压力，仍须与机会和现场证据结合。',
  },
  {
    id: 'camera-lin', title: '20:27 的转角画面', category: '数字记录', source: '一楼控制台 · 主楼梯监控', time: '20:27',
    summary: '林岑出现在阅档室外的转角，袖口包着铜镇纸。',
    detail: '主楼梯镜头覆盖阅档室门外走廊转角。20:27 的清晰近景拍到林岑的面孔；她用蓝灰袖口包着带窄弧凹缘的铜镇纸，向楼下张望。阅档室门仍敞开。连续镜头随后记录她返回门边；20:28 她将镇纸放回门内边柜，关门后走向修复室。画面时钟已校准。',
  },
  {
    id: 'camera-zhou', title: '20:32 的直播台画面', category: '数字记录', source: '一楼控制台 · 主监控', time: '20:32',
    summary: '周屿仍在馆内，一楼直播台右侧操作录像设备。',
    detail: '20:32，主监控拍到周屿在一楼直播台右侧，手边连接着便携存储盘。面孔清楚、时间已校准。他并未像证词所说在 20:10 离馆。但单帧画面只说明这一刻的位置，不能排除他在其他时刻行动。',
  },
  {
    id: 'livestream', title: '未剪辑的直播缓存', category: '数字记录', source: '一楼控制台 · 完整直播缓存', time: '20:21—20:33',
    summary: '周屿、许曼、沈砚在 20:21—20:33 持续同框。',
    detail: '现场直播的连续原始缓存经过逐帧核验：20:21—20:33，右侧周屿操作录像，中央许曼主持，左侧沈砚维持秩序。三人持续同框，与观众即时问答，声画同步，无剪辑、离镜或自动播片替代。楼梯需离开画面才能到达。缓存与门锁、腕表校时一致。这段区间可以与实际遇袭时间比较。',
  },
  {
    id: 'transfer', title: '备用金转账记录', category: '数字记录', source: '顾言手机 · 转账记录',
    summary: '许曼转出备用金 28,000 元，备注「月底前归还」。',
    detail: '顾言的共享财务通知显示：许曼将 28,000 元备用金转到医疗缴费账户，私人备注「父亲手术，月底前归还」。顾言随后提出取消分红并重新查账。这与许曼「没动过备用金」的说法不符，但转账本身不能证明她杀人。',
  },
  {
    id: 'maintenance', title: '摄像头维护日志', category: '数字记录', source: '一楼控制台 · 系统维护', time: '19:58',
    summary: '19:58，沈砚手动停用了侧廊摄像头。',
    detail: '签名维护日志：「19:58，操作员沈砚，手动停用侧廊摄像头」。该设备此前没有故障告警。主楼梯摄像头和直播录像持续正常，指纹门锁使用独立服务器。沈砚有监控权限，但不能改写门锁的原始出入记录。',
  },
  {
    id: 'note-zhou', title: '周屿的补充口供', category: '证词', source: '周屿 · 质疑离馆时间后',
    summary: '承认留下拷回自己的底片；要求核查完整直播。',
    detail: '「我没走。我想把自己的底片拷回来，怕你们说我偷资料。20:18 起我在直播台管录像，存储盘就是我的。请看完整直播，我一直在右边。」这是对谎言的解释，口供本身不构成不在场证明，仍需独立的连续影像。',
  },
  {
    id: 'note-xu', title: '许曼的补充口供', category: '证词', source: '许曼 · 质疑备用金后',
    summary: '承认挪用备用金替父亲缴医疗费。',
    detail: '「备用金是我转的。我父亲急着手术，我想月底前补回去，怕顾言停掉我的分红。这件事我撒谎了。但茶是 19:56 送的，直播开始后我一直在主持。」财务秘密解释了她的回避，不能替代关于凶案时间的独立取证。',
  },
  {
    id: 'note-shen', title: '沈砚的补充口供', category: '证词', source: '沈砚 · 质疑摄像头故障后',
    summary: '承认手动关了侧廊摄像头，门锁记录独立保存。',
    detail: '「侧廊是我关的。之前失窃那次，我当班时离过岗，怕顾言追着查旧录像。我关的是侧廊，主楼梯一直开着。门锁归独立服务器，我动不了。20:20 后我在直播台左边，你们可以查原片。」不能仅凭这段口供排除他的嫌疑。',
  },
  {
    id: 'note-lin', title: '林岑的改口记录', category: '证词', source: '林岑 · 质疑修复室证词后',
    summary: '承认离开修复室并到过门外转角，仍否认袭击。',
    detail: '林岑停顿后说：「好，我去过转角。我拿着镇纸，是想把它挪开，后来放回了门内边柜。我之前不说，是不想卷进去。你不能因为我在那里就说我杀了人。」她的全程在修复室证词已经被推翻，但她没有认罪；必须继续建立时间、动机、进入条件与物证的完整联系。',
  },
];

export const suspects: Suspect[] = [
  {
    id: 'lin', name: '林岑', age: 32, role: '藏品修复师', relation: '顾言的学生，也是修复项目负责人',
    personality: '克制，习惯纠正别人的细节', motive: '顾言要公开修复项目的原始账目，她的职业声誉可能受损。',
    description: '她把蓝灰色外套的袖口向里折了一次，目光始终停在桌面。',
    questions: [
      { id: 'lin-relation', title: '你和顾言是什么关系？', answer: '他是我的老师。馆里的修复项目大多由我负责。最近他不再信任我的判断，我们在账目上有争执。', rebuttal: '这份材料不能推翻我们的师生关系。有工作矛盾，也不等于我杀了他。', wrongResponse: '关系和争执我已经承认了，你出示的材料没有否定这句话。' },
      { id: 'lin-where', title: '20:20 到 20:40，你在哪里？', answer: '我一直独自在修复室整理材料。20:20 到 20:40，我没有离开过修复室。', challengeEvidence: ['camera-lin', 'lock'], reward: 'note-lin', rebuttal: '……好，我去过阅档室外的转角。镇纸是我拿的，后来放回门内边柜。我怕被牵连才没说。但出现在那里，不代表我杀了他。', wrongResponse: '这份证据不能核实我在那段时间的位置。你需要证明我离开过修复室，而不是仅仅怀疑我的动机。' },
      { id: 'lin-message', title: '你怎么看 20:40 的工作消息？', answer: '我收到了那条消息，所以当时以为老师还活着。消息从他的账号发出，这一点总是真的吧。', rebuttal: '我说的是当时的理解，以及消息来自他的账号。记录若有其他含义，你需要自己核实。', wrongResponse: '收到消息是真的；它是否证明当时还活着，应当看消息本身的记录。' },
      { id: 'lin-ledger', title: '为什么他要在 21:00 公开原账？', requires: ['threat'], answer: '他认为修复账目有问题。我求他别在预展上公开，是想再核对一次。你手里的聊天只能说明我们有分歧。', rebuttal: '通知证明我有压力。我承认这一点，但动机不是现场证据。', wrongResponse: '账目的问题需要查，我没有说过收到通知这件事是假的。' },
    ],
  },
  {
    id: 'zhou', name: '周屿', age: 28, role: '独立摄影师', relation: '顾言的前合作者，作品署名被撤下',
    personality: '语气轻佻，对署名和报酬格外敏感', motive: '顾言拖欠稿酬，并把他的摄影作品署成了馆方所有。',
    description: '相机背带缠在掌心。他说得很快，听见「监控」时却停了一拍。',
    questions: [
      { id: 'zhou-relation', title: '你为什么和顾言闹翻？', answer: '他欠着我的稿费，又把我的名字从展板上抹了。是，我跟他吵过。自己的作品被拿走，换你能忍？', rebuttal: '报酬和署名的矛盾我没有隐瞒。吵架不能直接变成杀人证据。', wrongResponse: '这份证据没有反驳欠款和署名的事实，也不能证明争吵就是袭击。' },
      { id: 'zhou-where', title: '20:10 以后，你在哪里？', answer: '20:10 我就离馆了，之后没有回来。顾言后来发生什么，我不知道。', challengeEvidence: ['camera-zhou', 'livestream'], reward: 'note-zhou', rebuttal: '行，我没走。我在拷自己的底片，怕被说成偷资料。20:18 起我一直在一楼直播台管录像。去看完整直播，我在画面右边。', wrongResponse: '你这份材料没有把我放在 20:10 之后的馆内。它和我有没有离馆不是一回事。' },
      { id: 'zhou-message', title: '你收到最后那条工作消息了吗？', answer: '收到了，20:40 整。我还以为他又要熬夜折腾那些账本。群里所有人都能看到时间。', rebuttal: '我说的是接收时间。发送动作是谁、什么时候安排的，我并没有看见。', wrongResponse: '收到消息和看见本人是两件事；我没有说过 20:40 亲眼见到他。' },
      { id: 'zhou-files', title: '录像设备旁的存储盘里有什么？', requires: ['camera-zhou'], answer: '是我的拍摄底片。版权本来就是我的，我只想留一份原文件。直播也存在控制台，原片连续没剪，你可以自己看。', rebuttal: '拷文件这件事我承认。要核实我那段时间的位置，请查看连续影像。', wrongResponse: '材料没有否定存储盘里的文件来源。不能把资料纠纷当成杀人的证明。' },
    ],
  },
  {
    id: 'xu', name: '许曼', age: 36, role: '档案馆运营主管', relation: '顾言的合伙人，负责账务与活动运营',
    personality: '回答严谨，遇到财务话题会避开目光', motive: '顾言提出取消她的分红，并重新清查备用金。',
    description: '她的主持胸牌还没摘下来，指尖反复抚平上面的折痕。',
    questions: [
      { id: 'xu-relation', title: '你和顾言最近有矛盾吗？', answer: '他要重做分红方案，也不再让我独立签支出。我不认同他的处理方式，但预展还是得办下去。', rebuttal: '分红争执是真实的，我没有回避这件事。它不能确定谁在阅档室动手。', wrongResponse: '这没有推翻我说的合作矛盾，也没有证明我实施袭击。' },
      { id: 'xu-money', title: '那晚送茶、主持和账款的情况呢？', answer: '19:56 我送过茶，20:20 后就在一楼准备主持。我没有动过备用金，那杯茶也只是我端上去的。', challengeEvidence: ['transfer'], reward: 'note-xu', rebuttal: '……钱是我转的。父亲急着手术，我打算月底前补回来，怕他停掉分红才否认。送茶是 19:56，后来我在一楼主持，请核对直播。', wrongResponse: '接触茶杯只能说明我端过茶，动机也不能证明转账。要质疑备用金，请拿出实际的资金记录。' },
      { id: 'xu-message', title: '为什么直到 21:05 才开门？', answer: '20:40 他让大家别上楼，我就等了一会儿。过了约定时间他一直不回应，我才请沈主管拿应急钥匙开门。', rebuttal: '等待和开门都可以核实。我当时相信消息，并不代表我看见他在发送。', wrongResponse: '这份证据没有推翻我等候消息、请安保开门的经过。' },
      { id: 'xu-transfer', title: '医疗账户的转账，准备如何归还？', requires: ['transfer'], answer: '我准备用月底的分红补回去。顾言一说要取消分红，我就慌了。这笔款我会交代清楚。', rebuttal: '我现在解释的是款项用途。它与遇袭时的现场位置仍需分别核实。', wrongResponse: '你可以查收款方和账目，但这份材料不能让资金记录替代现场证据。' },
    ],
  },
  {
    id: 'shen', name: '沈砚', age: 43, role: '安保主管', relation: '顾言共事多年的老同事',
    personality: '回答慢，反复斟酌责任与权限', motive: '顾言将追究此前藏品失窃时的安保失职。',
    description: '钥匙串被他握得没有一点声响。谈起设备，他先看了一眼控制台。',
    questions: [
      { id: 'shen-relation', title: '顾言为什么要找你谈安保责任？', answer: '之前失窃过一件小藏品，他认为巡检没做到位。我是主管，该承担的会承担。', rebuttal: '失窃与责任追究确有其事。我没有说自己和他毫无矛盾。', wrongResponse: '这份材料没有否定责任追究的事实。失职和袭击仍是不同的指控。' },
      { id: 'shen-camera', title: '20:20 后你在哪里？监控为什么缺一段？', answer: '我在一楼直播台守着，没再上二楼。侧廊摄像头早就坏了，不是我关的。', challengeEvidence: ['maintenance'], reward: 'note-shen', rebuttal: '侧廊是我关的。我怕顾言追查之前失窃时我离岗的事。主楼梯、直播都没停，门锁也是独立服务器，我改不了。我的位置你可以去看直播。', wrongResponse: '有机会接触设备不等于实际关闭设备。你这份证据没有说明侧廊为什么停用，也没有推翻我在一楼的位置。' },
      { id: 'shen-message', title: '你怎么看上锁的房门和 20:40 的消息？', answer: '那条消息我也收到了。阅档室的门只要关上就自动落锁，21:05 是我用登记应急钥匙打开的。上锁并不稀奇。', rebuttal: '门锁的工作方式可以现场验证，钥匙使用也有登记。消息来源需要另外取证。', wrongResponse: '这份材料没有否定自动落锁或登记开门。上锁本身不是无法进入的证明。' },
      { id: 'shen-maintenance', title: '侧廊停用会影响门锁和其他影像吗？', requires: ['maintenance'], answer: '不会。侧廊、主楼梯、直播是不同通道，门锁用独立服务器。主楼梯和直播的原片都在，你们也已经拿到校准时间。', rebuttal: '系统通道与权限有原始记录，不能只听我的；去核对它们即可。', wrongResponse: '这份材料没有证明其他通道或门锁被修改。请核对各自的原始记录。' },
    ],
  },
];

export const deductions: { id: string; title: string; inputs: [string, string]; detail: string }[] = [
  { id: 'scheduled-message', title: '发送时间不等于存活时间', inputs: ['message', 'schedule'], detail: '20:40 的群消息由顾言在 19:48 预约。它按计划自动发送，因此不能证明顾言在 20:40 仍然活着。' },
  { id: 'death-time', title: '致命袭击发生在 20:26', inputs: ['body', 'watch'], detail: '一次致命钝击与 20:26 的严重冲击、生理信号和活动持续中断相互吻合。实际作案窗口早于最后那条群消息。' },
  { id: 'lin-access', title: '林岑在关键窗口进入现场', inputs: ['lock', 'camera-lin'], detail: '20:24 本人指纹开门与 20:27 清晰面部画面相互印证。林岑曾进入唯一房门，并在门外转角拿着与现场一致的铜镇纸。20:28 她回到门边放回镇纸、关门落锁。' },
  { id: 'motive', title: '21:00 曝光原账的压力', inputs: ['ledger', 'threat'], detail: '原账与 19:52 聊天对应同一批调包和虚报记录。林岑知道顾言当晚 21:00 将公开证据，面临失去职业声誉与被追责的直接压力。' },
  { id: 'exclusion', title: '三名非凶手在关键时间不在场', inputs: ['livestream', 'watch'], detail: '腕表确定的 20:26 落在未经剪辑的 20:21—20:33 直播区间。周屿、许曼、沈砚持续同框且参与现场互动，无法在同一时刻到达二楼行凶。撒谎的秘密不等于杀人。' },
];

export const timeline: { id: string; time: string; title: string; detail: string; requires: string[] }[] = [
  { id: 'scheduled', time: '19:48', title: '顾言预约晚间消息', detail: '顾言本人创建 20:40 自动发送的任务。', requires: ['schedule'] },
  { id: 'warning', time: '19:52', title: '原账曝光通知发给林岑', detail: '顾言表示将在 21:00 公开调包与虚报的原始记录。', requires: ['threat'] },
  { id: 'tea', time: '19:56', title: '许曼送茶后离开', detail: '托盘登记和茶杯接触痕迹吻合。', requires: ['cup'] },
  { id: 'disabled', time: '19:58', title: '侧廊摄像头被手动停用', detail: '操作员为沈砚，主监控、直播与门锁不受影响。', requires: ['maintenance'] },
  { id: 'copy', time: '20:18', title: '周屿自述开始拷回底片', detail: '补充口供需由独立影像核实，不能单靠承认秘密排除嫌疑。', requires: ['note-zhou'] },
  { id: 'live-start', time: '20:21', title: '三人在一楼持续同框', detail: '周屿、许曼、沈砚自此到 20:33 全程可见。', requires: ['livestream'] },
  { id: 'entry', time: '20:24', title: '林岑指纹开启阅档室', detail: '20:23 室内只有顾言，门锁记录独立保存。', requires: ['lock'] },
  { id: 'impact', time: '20:26', title: '致命钝击与腕表冲击吻合', detail: '严重冲击后生理信号和活动连续中断。', requires: ['body', 'watch'] },
  { id: 'corner', time: '20:27', title: '林岑携镇纸出现在转角', detail: '房门仍敞开，她用袖口包着镇纸，随后返回门边。', requires: ['camera-lin'] },
  { id: 'closed', time: '20:28', title: '阅档室房门自动落锁', detail: '门磁由开变关。不是第二次进入记录。', requires: ['lock'] },
  { id: 'zhou-shot', time: '20:32', title: '周屿仍在一楼直播台', detail: '单帧画面反驳 20:10 已离馆的说法。', requires: ['camera-zhou'] },
  { id: 'live-end', time: '20:33', title: '连续直播区间结束', detail: '此前十二分钟三人没有离镜，现场声画连续。', requires: ['livestream'] },
  { id: 'last-message', time: '20:40', title: '顾言账号发出工作消息', detail: '这是服务器发送时间，需进一步核实创建方式。', requires: ['message'] },
  { id: 'stopped-clock', time: '20:42？', title: '停钟读数不具备定时价值', detail: '电池耗尽，不能确定哪一天停走。', requires: ['clock'] },
  { id: 'discovery', time: '21:05', title: '应急钥匙开门，发现遗体', detail: '许曼请求开门，沈砚使用登记钥匙后报警。', requires: [] },
];

export const finalQuestions: { id: string; label: string; options: { value: string; label: string }[]; correct: string }[] = [
  { id: 'culprit', label: '谁实施了致命袭击？', correct: 'lin', options: suspects.map(({ id, name, role }) => ({ value: id, label: `${name} · ${role}` })) },
  { id: 'time', label: '致命袭击发生在什么时候？', correct: '20:26', options: [{ value: '19:56', label: '19:56 · 许曼送茶时' }, { value: '20:26', label: '20:26 · 腕表记录冲击时' }, { value: '20:40', label: '20:40 · 工作消息发送时' }, { value: '20:42', label: '20:42 · 墙上挂钟停止时' }] },
  { id: 'method', label: '凶手使用了什么方式？', correct: 'paperweight', options: [{ value: 'poison', label: '在茶水中下毒，延迟发作' }, { value: 'paperweight', label: '在室内用铜镇纸实施钝击' }, { value: 'remote', label: '远程装置定时发动袭击' }, { value: 'window', label: '从窗外突袭后沿外墙逃走' }] },
  { id: 'motive', label: '直接推动袭击的动机是什么？', correct: 'ledger', options: [{ value: 'copyright', label: '夺回摄影署名和拖欠稿酬' }, { value: 'funds', label: '掩盖挪用医疗备用金' }, { value: 'ledger', label: '阻止当晚公开藏品调包与虚报原账' }, { value: 'security', label: '逃避此前失窃的安保责任' }] },
  { id: 'lie', label: '哪份证据直接推翻凶手的行踪证词？', correct: 'camera-lin', options: [{ value: 'camera-lin', label: '20:27 · 清晰转角监控' }, { value: 'weapon', label: '铜镇纸上的蓝灰色纤维' }, { value: 'message', label: '20:40 · 顾言账号的工作消息' }, { value: 'ledger', label: '桌面的原始修复账页' }] },
  { id: 'access', label: '哪份证据证明凶手具备进入条件？', correct: 'lock', options: [{ value: 'window', label: '从内扣上的窗户' }, { value: 'maintenance', label: '侧廊摄像头维护日志' }, { value: 'lock', label: '20:24 · 本人指纹门锁原始日志' }, { value: 'cup', label: '许曼留在茶杯上的指纹' }] },
];

export type SceneItem = { id: string; label: string; x: number; y: number; kind?: 'photo' | 'phone' | 'camera' | 'ordinary'; text?: string };

export const sceneItems: Record<string, SceneItem[]> = {
  room: [
    { id: 'body', label: '遗体与腕表', x: 48, y: 82 },
    { id: 'phone', label: '死者手机', x: 43, y: 55, kind: 'phone' },
    { id: 'photo', label: '馆庆合照', x: 62, y: 55, kind: 'photo' },
    { id: 'ledger', label: '修复原账', x: 52, y: 38 },
    { id: 'weapon', label: '铜镇纸', x: 93, y: 49 },
    { id: 'lock', label: '指纹门锁', x: 83, y: 27 },
    { id: 'window', label: '内扣窗', x: 20, y: 25 },
    { id: 'clock', label: '停摆的钟', x: 56, y: 12 },
    { id: 'cup', label: '冷掉的茶', x: 37, y: 38 },
    { id: 'books', label: '旧书与雨伞', x: 9, y: 64, kind: 'ordinary', text: '几本受潮的地方志，一把滴水的旧伞。书页没有夹层，伞下的水迹来自尚未停歇的雨。不是所有细节都会成为证据。' },
  ],
  console: [
    { id: 'camera', label: '主楼梯监控', x: 35, y: 34, kind: 'camera' },
    { id: 'livestream', label: '直播原始缓存', x: 73, y: 38 },
    { id: 'maintenance', label: '设备维护日志', x: 50, y: 75 },
    { id: 'snack', label: '值班台', x: 17, y: 77, kind: 'ordinary', text: '一碗没有吃完的面，三张预展工作证。桌边便签写着“主摄像与门锁独立供电，请勿关闭”。侧廊黑屏，不代表所有记录都消失了。' },
  ],
};

export const briefing = {
  location: '望潮档案馆 · 二楼阅档室',
  date: '2026.09.17',
  time: '21:17',
  text: '21:05，馆长顾言被发现死在反锁的阅档室。25分钟前，他还在工作群里发来消息。四个人留在馆内，每个人都说自己无辜。雨还没有停，你有一整夜找出那句话背后的真相。',
};

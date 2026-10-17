// The same built-in portraits render in H5 and native Canvas without remote images.
export const avatars = [
  { id: 'cat', name: '小猫', color: '#e9b169', background: '#fae4bb' },
  { id: 'fox', name: '狐狸', color: '#e88f56', background: '#f7dcc8' },
  { id: 'panda', name: '熊猫', color: '#f7f6ec', background: '#dbe9d3' },
  { id: 'rabbit', name: '兔子', color: '#fff4ed', background: '#f5d8de' },
  { id: 'bear', name: '小熊', color: '#b68663', background: '#eadbc8' },
  { id: 'owl', name: '猫头鹰', color: '#a393be', background: '#e7def0' },
  { id: 'koala', name: '考拉', color: '#a8bdc4', background: '#d9eaf0' },
  { id: 'tiger', name: '老虎', color: '#eda84e', background: '#ffebc7' },
];

export function drawAvatar(ctx, id, x, y, size) {
  const avatar = avatars.find((item) => item.id === id) || avatars[0];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 64, size / 64);
  const circle = (cx, cy, radius, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  };
  const triangle = (x1, y1, x2, y2, x3, y3, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.closePath();
    ctx.fill();
  };
  const dark = '#3c4444';
  circle(32, 32, 32, avatar.background);
  if (['cat', 'fox', 'owl'].includes(avatar.id)) {
    triangle(12, 31, 13, 10, 30, 22, avatar.color);
    triangle(34, 22, 51, 10, 52, 31, avatar.color);
    triangle(16, 25, 16, 16, 25, 23, '#f6c3b0');
    triangle(39, 23, 48, 16, 48, 25, '#f6c3b0');
  } else if (avatar.id === 'rabbit') {
    for (const cx of [24, 40]) {
      circle(cx, 15, 7, avatar.color);
      circle(cx, 22, 7, avatar.color);
      circle(cx, 15, 3, '#ebb0bd');
      circle(cx, 21, 3, '#ebb0bd');
    }
  } else {
    for (const cx of [15, 49]) {
      circle(cx, 23, avatar.id === 'koala' ? 11 : 9, avatar.id === 'panda' ? dark : avatar.color);
      if (avatar.id !== 'panda') circle(cx, 23, 5, '#e8c3b3');
    }
  }
  circle(32, 37, 22, avatar.color);
  if (avatar.id === 'fox') {
    triangle(12, 29, 31, 49, 17, 51, '#fff3df');
    triangle(52, 29, 33, 49, 47, 51, '#fff3df');
  }
  if (avatar.id === 'panda' || avatar.id === 'owl')
    for (const cx of [23, 41]) circle(cx, 34, 8, avatar.id === 'panda' ? dark : '#fff5df');
  if (avatar.id === 'tiger') {
    triangle(28, 17, 36, 17, 32, 29, '#805637');
    triangle(10, 34, 20, 37, 11, 40, '#805637');
    triangle(54, 34, 44, 37, 53, 40, '#805637');
  }
  for (const cx of [23, 41]) {
    circle(cx, 35, 3, avatar.id === 'panda' ? '#fff8e9' : dark);
    circle(cx + 0.7, 34, 0.8, '#ffffff');
  }
  circle(32, 44, avatar.id === 'koala' ? 5 : 3, dark);
  circle(17, 43, 3, '#eaa598');
  circle(47, 43, 3, '#eaa598');
  ctx.restore();
}

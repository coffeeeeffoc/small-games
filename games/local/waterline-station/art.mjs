/** Original procedural harbor illustration; baked once, rendered as a Cocos Sprite. */
export function harborTexture(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * 1.5);
  canvas.height = Math.round(height * 1.5);
  const c = canvas.getContext('2d');
  c.scale(1.5, 1.5);
  const g = c.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, '#061d2a');
  g.addColorStop(0.55, '#103d4b');
  g.addColorStop(1, '#031623');
  c.fillStyle = g;
  c.fillRect(0, 0, width, height);
  const halo = c.createRadialGradient(
    width * 0.5,
    height * 0.4,
    0,
    width * 0.5,
    height * 0.4,
    width * 0.75,
  );
  halo.addColorStop(0, '#2e7d8033');
  halo.addColorStop(1, '#12334400');
  c.fillStyle = halo;
  c.fillRect(0, 0, width, height);
  let seed = 75;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let layer = 0; layer < 3; layer++) {
    const base = height * (0.57 + layer * 0.07);
    c.fillStyle = ['#1a4a56', '#103743', '#092b39'][layer];
    for (let x = -20; x < width + 30; ) {
      const w = 18 + rnd() * 45,
        h = 35 + rnd() * 100;
      c.fillRect(x, base - h, w, h + height);
      c.beginPath();
      c.moveTo(x - 5, base - h);
      c.lineTo(x + w * 0.5, base - h - 15 - rnd() * 20);
      c.lineTo(x + w + 5, base - h);
      c.fill();
      if (layer === 2) {
        c.fillStyle = '#f5c88633';
        for (let yy = base - h + 15; yy < base - 8; yy += 18)
          for (let xx = x + 6; xx < x + w - 5; xx += 12) if (rnd() > 0.38) c.fillRect(xx, yy, 3, 6);
        c.fillStyle = '#092b39';
      }
      x += w + 8;
    }
  }
  c.fillStyle = '#062332';
  c.fillRect(0, height * 0.72, width, height * 0.28);
  for (let i = 0; i < 100; i++) {
    const x = rnd() * width,
      y = height * (0.72 + rnd() * 0.28);
    c.strokeStyle = i % 5 === 0 ? '#dfb47b32' : '#6ad7cf18';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + 5 + rnd() * 36, y);
    c.stroke();
  }
  c.strokeStyle = '#57b9b921';
  c.lineWidth = 0.7;
  for (let j = 0; j < 9; j++) {
    c.beginPath();
    for (let i = 0; i <= 40; i++) {
      const x = (i * width) / 40,
        y = height * 0.12 + Math.sin(i * 0.25 + j * 0.12) * 17 + j * 5;
      c.lineTo(x, y);
    }
    c.stroke();
  }
  for (let i = 0; i < 30; i++) {
    c.fillStyle = '#9ddfd850';
    c.beginPath();
    c.arc(rnd() * width, rnd() * height * 0.5, 0.5 + rnd() * 0.6, 0, Math.PI * 2);
    c.fill();
  }
  // Brass dock rail and lamps frame the station without obscuring its controls.
  c.strokeStyle = '#b38d5860';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(0, height * 0.7);
  c.lineTo(width, height * 0.7);
  c.stroke();
  for (const x of [12, width - 12]) {
    const y = height * 0.7;
    c.fillStyle = '#b58e57';
    c.fillRect(x - 1, y - 49, 2, 49);
    c.fillStyle = '#f5dba6';
    c.fillRect(x - 4, y - 53, 8, 10);
    c.strokeStyle = '#b58e57';
    c.strokeRect(x - 5, y - 55, 10, 14);
  }
  return canvas;
}

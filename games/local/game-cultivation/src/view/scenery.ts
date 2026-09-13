import type { Trial } from '../domain/trial.js';
import { relicSites, relicNames } from '../domain/world.js';
import { ellipse, glow, ink, label, line, polygon, ring } from './paint.js';

import { bamboo, mountain, path } from './nature.js';
import { drawSceneProps } from './scene-props.js';
export function drawScenery(c: CanvasRenderingContext2D, s: Trial, t: number) {
  if (s.scene === 'forest') {
    c.fillStyle = '#537666';
    c.fillRect(0, 0, 760, 1080);
    for (let i = 0; i < 110; i++) {
      const x = (i * 137) % 760,
        y = (i * 197) % 1080;
      ellipse(c, x, y, 20 + (i % 20), 9, '#b2c99412');
    }
    const creek = [
      [0, 610],
      [160, 680],
      [300, 710],
      [510, 840],
      [760, 830],
    ];
    line(c, creek, '#324f4b', 76);
    line(c, creek, '#7bafa0', 59);
    line(c, creek, '#a9d0b535', 39);
    for (let i = 0; i < 32; i++) {
      const x = i * 25,
        y = 650 + x * 0.25 + Math.sin(x * 0.013) * 29;
      line(
        c,
        [
          [x, y + Math.sin(t + i) * 3],
          [x + 17, y - 2],
        ],
        '#d5e8c875',
        1,
      );
    }
    path(c, [
      [80, 990],
      [170, 890],
      [240, 770],
      [290, 700],
      [445, 660],
      [440, 560],
      [590, 440],
      [550, 290],
      [380, 135],
    ]);
    path(c, [
      [240, 770],
      [180, 640],
      [135, 510],
      [95, 295],
    ]);
    for (let i = 0; i < 8; i++) {
      polygon(
        c,
        [
          [259, 704 + i * 10],
          [310, 718 + i * 10],
          [307, 725 + i * 10],
          [256, 711 + i * 10],
        ],
        '#bfa777',
      );
    }
    for (let i = 0; i < 47; i++) {
      const x = (i * 193 + 37) % 760,
        y = (i * 271 + 70) % 1080;
      if (x < 60 || x > 695 || (x > 260 && x < 350 && y < 500) || (x > 590 && y > 710))
        bamboo(c, x, y, 0.75 + (i % 4) * 0.13, t);
    }
    label(c, '残 阵', 600, 335, 23, '#dfd9b4');
    label(c, s.fox === 'caged' ? '灵狐被困' : '封印已破', 95, 245, 15, '#e4c38d');
    for (const site of relicSites)
      if (!s.collected.includes(site.relic)) {
        const open = site.guardians.every((id) => !s.enemies.some((e) => e.id === id && e.hp > 0));
        ring(c, site.x, site.y, 48, open ? '#dbc67e' : '#39524f', 2);
        if (open) {
          glow(c, site.x, site.y, 46, '#efd79766');
          polygon(
            c,
            [
              [site.x, site.y - 15],
              [site.x + 10, site.y],
              [site.x, site.y + 15],
              [site.x - 10, site.y],
            ],
            ink.gold,
          );
          label(c, relicNames[site.relic], site.x, site.y - 26, 14);
        }
      }
  } else {
    const sky = c.createLinearGradient(0, 0, 0, 560);
    sky.addColorStop(0, s.phase === 'won' ? '#eadba5' : s.scene === 'cave' ? '#acc1ae' : '#283b49');
    sky.addColorStop(1, s.scene === 'cave' || s.phase === 'won' ? '#698f80' : '#778e86');
    c.fillStyle = sky;
    c.fillRect(0, 0, 480, 560);
    for (let i = 0; i < 6; i++)
      mountain(c, i * 110 - 30, 170 + (i % 2) * 40, 100, i % 2 ? '#526f6f' : '#78948a');
    for (let i = 0; i < 6; i++)
      ellipse(c, 80 + i * 110 + Math.sin(t * 0.1 + i) * 10, 260 + i * 43, 160, 20, '#d7e5cf13');
    const floor = s.scene === 'cave' ? '#a1ad8c' : '#76897e';
    polygon(
      c,
      [
        [35, 190],
        [100, 80],
        [350, 78],
        [453, 197],
        [466, 470],
        [355, 556],
        [116, 558],
        [20, 475],
      ],
      '#344e49',
    );
    polygon(
      c,
      [
        [35, 172],
        [100, 62],
        [350, 60],
        [453, 179],
        [466, 452],
        [355, 538],
        [116, 540],
        [20, 457],
      ],
      floor,
    );
    for (let i = 0; i < 24; i++) {
      const x = 55 + ((i * 89) % 360),
        y = 200 + ((i * 43) % 290);
      line(
        c,
        [
          [x, y],
          [x + 14, y + 6],
          [x + 30, y + 2],
        ],
        '#485e4f36',
      );
    }
    if (s.scene === 'cave') {
      c.fillStyle = '#4a6960';
      c.fillRect(115, 115, 250, 70);
      c.fillStyle = '#263e38';
      c.fillRect(150, 120, 180, 62);
      polygon(
        c,
        [
          [93, 126],
          [141, 100],
          [240, 48],
          [337, 100],
          [390, 126],
          [326, 117],
          [240, 78],
          [155, 117],
        ],
        '#234a40',
      );
      line(
        c,
        [
          [95, 124],
          [143, 104],
          [240, 54],
          [337, 104],
          [388, 124],
        ],
        '#d4c18d',
        3,
      );
      for (const x of [130, 350]) {
        line(
          c,
          [
            [x, 118],
            [x, 192],
          ],
          '#77563c',
          8,
        );
        ellipse(c, x, 149, 9, 13, '#dec184');
      }
      path(c, [
        [240, 183],
        [245, 260],
        [240, 430],
        [295, 517],
      ]);
      ellipse(c, 180, 370, 49, 23, '#647c66');
      ellipse(c, 180, 370, 37, 17, '#c3b98c');
      ring(c, 180, 364, 28, '#eee0b733', 2);
      bamboo(c, 50, 310, 1.2, t);
      bamboo(c, 415, 390, 1.05, t);
      bamboo(c, 390, 490, 0.9, t);
      label(c, '听 风 小 筑', 240, 34, 21, '#23443a');
    } else {
      for (const r of [75, 130, 192]) ring(c, 240, 290, r, '#d0c49b77', r === 192 ? 3 : 1);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        line(
          c,
          [
            [240 + Math.cos(a) * 130, 290 + Math.sin(a) * 130],
            [240 + Math.cos(a) * 185, 290 + Math.sin(a) * 185],
          ],
          '#dac99555',
          2,
        );
      }
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        label(
          c,
          ['乾', '坤', '离', '坎'][i % 4],
          240 + Math.cos(a) * 155,
          298 + Math.sin(a) * 155,
          17,
          '#d4c7a5',
        );
      }
      label(c, '云 顶 渡 劫 台', 240, 40, 23, '#e9debd');
    }
  }
  drawSceneProps(c, s, t);
}

import { walk, jump, fold, unfold, type Action } from '../route-kit';

export const chapterRoutes: Action[][] = [
  [fold(),walk(450),unfold,fold('B'),walk(470),jump(525),walk(520),jump(460),walk(420),jump(480),walk(500),unfold,fold('C'),walk(445),jump(395),walk(310),jump(360),walk(400)],
  [fold(),walk(650),unfold,walk(590),walk(500),walk(430),fold('B'),walk(414)],
  [fold(),walk(480),unfold,fold('C'),walk(575),jump(535),walk(525),jump(470),walk(440),jump(505),walk(540),unfold,fold('B','left-to-right'),walk(720),jump(780),walk(800)],
  [fold(),walk(384),unfold,walk(140),fold(),walk(124),walk(200)],
  [walk(620),walk(750),walk(760),walk(745),jump(685),walk(590),jump(535),walk(480),fold('B'),jump(420),walk(394),walk(438),jump(500),walk(600),unfold,fold('C'),walk(555),jump(500),walk(470),walk(555),walk(580),unfold,walk(450),walk(530)],
  [walk(400),fold(),walk(384),unfold,walk(750),fold('B','left-to-right'),walk(784),unfold,walk(560)],
  [fold(),walk(520),jump(460),walk(414),walk(455),jump(400),walk(350),jump(405),walk(500),unfold,walk(565),jump(625),walk(885),jump(970),walk(1000),fold('A','left-to-right'),walk(930)],
  [fold(),walk(270),walk(550),unfold,fold('B'),walk(600),jump(555),walk(480),jump(550),walk(650)],
  [fold(),walk(320),jump(265),walk(250),unfold,fold('C'),walk(270),jump(335),walk(380),jump(435),walk(480),walk(730)],
  [fold(),walk(400),jump(350),walk(350),unfold,fold('C'),walk(355),jump(425),walk(474),walk(600),unfold,walk(690),walk(820)],
  [fold('B'),walk(350),walk(325),walk(534),walk(360),jump(430),unfold,walk(490)],
  [walk(265),walk(180),fold('B'),walk(245),jump(305),walk(370),jump(430),walk(435),jump(495),walk(550),jump(605),walk(580),jump(520)],
  [walk(400),fold(),walk(384),walk(365),jump(425),walk(405),jump(335),walk(220),walk(160),walk(225),jump(285),walk(415),unfold,walk(560)],
  [fold('B'),walk(440),jump(375),walk(365),jump(425),walk(465)],
  [walk(400),fold(),walk(384),unfold,walk(700),jump(775),fold('B','left-to-right'),walk(784),walk(760)],
  [fold('C'),walk(405),jump(360),walk(345),jump(415),walk(475),walk(525),walk(480)],
  [fold('B'),walk(615),jump(570),walk(465),jump(530),walk(604),walk(470),walk(420),jump(365),walk(320),jump(385),walk(390),unfold,walk(465)],
  [fold('B','left-to-right'),walk(705),jump(775),walk(830),walk(950),unfold,walk(1005),jump(1065),walk(1070),jump(1000),walk(850)],
  [fold('B'),walk(185),walk(284),walk(390),jump(340),walk(270),unfold,jump(325),fold('B'),walk(314)],
  [fold('B','left-to-right'),walk(785),jump(850),walk(864),walk(785),walk(650),unfold,fold('C'),walk(655),jump(610),walk(500),jump(565),walk(590),unfold,walk(650)],
  [fold('B'),walk(460),walk(444),walk(585),jump(645),unfold,fold('C','left-to-right'),walk(710),jump(770),walk(785),jump(850),walk(880)],
  [walk(395),jump(480),walk(625),walk(550),fold('B','left-to-right'),walk(675),jump(730),walk(760),jump(710),walk(650),jump(700),walk(865),jump(925),walk(940)],
  [fold(),jump(410),walk(444),walk(345),walk(125),jump(185),walk(200)],
  [fold(),walk(185),jump(125),walk(40),jump(100),walk(140),walk(235),walk(460),walk(440),walk(470),unfold,fold('B'),jump(420),walk(425),jump(485),walk(510),jump(570),walk(615),jump(680),walk(700)],
  [fold(),walk(485),jump(420),walk(364),walk(420),jump(490),walk(550),unfold,walk(660),walk(750),fold('B','left-to-right'),walk(940),jump(880),walk(775)],
];

export const chapterAlternates: {level:number;name:string;actions:Action[]}[] = [
  { level:62, name:'A 回左岸，在固定门台展开撤墙', actions:[walk(265),walk(180),fold(),walk(225),jump(165),jump(225),jump(285),walk(265),jump(325),walk(355),jump(425),walk(440),unfold,walk(510)] },
  { level:64, name:'C 先取物，回右站展开换 B 登门', actions:[fold('C'),walk(550),walk(585),jump(650),walk(645),jump(580),walk(574),walk(650),walk(680),unfold,walk(650),fold('B'),walk(560),walk(535),jump(480),walk(440),jump(375),walk(365),jump(425),walk(465)] },
  { level:68, name:'B 走完右岸外阶，在门室内展开', actions:[fold('B','left-to-right'),walk(705),jump(775),walk(830),walk(950),walk(1005),jump(1065),walk(1070),jump(1000),walk(960),unfold,walk(850)] },
  { level:69, name:'C 单折沿右侧长回升环路入门', actions:[fold('C'),walk(755),walk(675),walk(565),walk(490),walk(565),jump(625),walk(665),jump(725),walk(775),jump(715),walk(550),walk(520)] },
];

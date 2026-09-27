import { walk, jump, fold, unfold, type Action } from '../route-kit';

export const chapterRoutes: Action[][] = [
  [fold(),walk(300),jump(370),walk(410),jump(485),walk(530),unfold,fold('B','left-to-right'),walk(710),jump(785),walk(775),jump(710),walk(695)],
  [fold('B'),walk(280),walk(405),jump(475),walk(610),walk(650),walk(610),walk(480),walk(450),walk(130)],
  [fold('B'),walk(505),jump(460),walk(430),walk(475),jump(520),unfold,fold(),walk(500),jump(445),jump(375)],
  [fold(),walk(300),walk(325),jump(395),walk(500),unfold,walk(520),jump(570),walk(615)],
  [walk(165),jump(230),jump(300),walk(355),jump(425),walk(470),fold('B'),jump(535),walk(552),walk(465),unfold,walk(410)],
  [fold(),walk(500),jump(450),walk(330),unfold,fold('B'),walk(330),jump(400),walk(485),jump(550)],
  [fold('B'),jump(455),walk(395),walk(480),jump(530),unfold,fold(),walk(450),walk(530),walk(140)],
  [fold(),walk(360),walk(295),jump(240),walk(160),jump(100),walk(55),walk(105),jump(180),walk(250),jump(315),walk(375),jump(445),walk(550),unfold,fold('B','left-to-right'),walk(650),jump(720),jump(655),walk(620),jump(690),walk(715),jump(770),walk(795),walk(710),walk(630),walk(550)],
  [walk(140),walk(480),fold(),walk(565),jump(500),walk(445),jump(385),walk(265),jump(330),walk(395),walk(415),jump(480),walk(530)],
  [fold('C'),walk(565),jump(625),walk(600),jump(555),walk(530),jump(485),walk(465),walk(500),jump(550),unfold,fold(),walk(510),walk(440),walk(310),walk(360),walk(20)],
  [fold(),walk(390),walk(405),jump(345),walk(310),jump(230),walk(180)],
  [fold(),walk(520),unfold,walk(900),jump(960),fold('B','left-to-right'),jump(895),walk(850),walk(805),jump(740)],
  [fold(),walk(520),unfold,walk(905),jump(960),fold('B','left-to-right'),jump(890),walk(865),walk(700),walk(640),unfold,jump(705),walk(790)],
  [fold('C'),walk(505),walk(375)],
  [fold(),walk(520),unfold,walk(905),jump(960),fold('B','left-to-right'),jump(890),walk(865),walk(810),jump(750),walk(675),unfold,fold('C'),walk(650),jump(610),jump(545),jump(650),unfold,walk(575)],
  [fold('B'),jump(455),walk(345),jump(235),walk(110)],
  [fold('B'),jump(485),walk(435),walk(490),jump(550),unfold,fold(),walk(590),walk(530),walk(180),jump(125),walk(110),jump(55)],
  [fold(),jump(405),walk(325),jump(270),walk(210),walk(140),walk(60),walk(520),unfold,fold('B'),walk(425),jump(345),walk(315),jump(390),walk(445),jump(510),unfold,fold('C'),walk(550),jump(495),walk(460)],
  [fold(),walk(200),walk(480),unfold,fold('B'),jump(540),walk(525),jump(590),walk(665),jump(615),walk(575),jump(520),walk(475)],
  [fold(),walk(560),unfold,walk(650),walk(620),jump(560),walk(525),jump(480),walk(510),jump(565),fold('B'),walk(535),jump(475),walk(455),jump(390),walk(355)],
  [fold(),walk(250),walk(520),unfold,fold('C'),walk(545),jump(610),walk(580),jump(520),walk(480),walk(535),jump(585),walk(550),jump(490),walk(475)],
  [fold(),walk(480),unfold,fold('B'),jump(550),walk(520),jump(475),walk(410),walk(445),jump(505),unfold,fold(),walk(470),jump(425),walk(380),walk(355),jump(295)],
  [fold(),walk(530),jump(600),walk(620),unfold,walk(540),walk(520),walk(460),walk(435)],
  [fold(),walk(400),jump(475),walk(520),unfold,walk(710),fold('B','left-to-right'),walk(730),jump(800),walk(865),walk(780),jump(720),walk(680),unfold,fold('C'),walk(630),jump(565),walk(535),walk(570),jump(635),walk(655)],
  [fold('C'),jump(510),walk(530),walk(430),walk(400),walk(250),jump(190),walk(180),jump(125),walk(60),jump(120),walk(180),walk(250),walk(420),jump(520),walk(665),walk(520),unfold,fold(),walk(200)],
];

export const chapterAlternates: {level:number;name:string;actions:Action[]}[] = [
  { level:30, name:'右岸提前展开后重接桥，返回左岸收尾', actions:[...chapterRoutes[4].slice(0,9),walk(640),walk(740),unfold,fold('B'),walk(465),unfold,walk(410)] },
  { level:39, name:'B取钥匙后发现门被罩，展开换C保留钥匙', actions:[fold('B'),walk(405),unfold,fold('C'),walk(375)] },
  { level:44, name:'保留A登到高站T再换B，与H换折等价', actions:[fold(),walk(200),walk(480),jump(550),walk(525),jump(475),walk(490),jump(550),unfold,fold('B'),walk(575),jump(520),walk(475)] },
  { level:45, name:'低处提前B后原地展开，走完平展回升再B', actions:[...chapterRoutes[19].slice(0,4),fold('B'),unfold,...chapterRoutes[19].slice(4)] },
  { level:50, name:'C取顶钥匙，B从高阳台越墙收左钥匙再下楼入室', actions:[fold('C'),jump(510),walk(530),walk(610),unfold,walk(730),walk(770),fold('B','left-to-right'),jump(850),walk(925),walk(910),jump(865),walk(815),walk(730),walk(530),walk(820),walk(780)] },
];

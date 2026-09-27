import { walk, jump, fold, unfold, type Action } from '../route-kit';

export const chapterRoutes: Action[][] = [
  [fold(),walk(440)],
  [fold(),walk(230),jump(325),walk(440)],
  [fold(),walk(405),walk(105)],
  [fold('B'),walk(530)],
  [walk(210),fold(),jump(290),walk(410),walk(210),walk(105)],
  [fold(),walk(450),unfold,jump(510),walk(535)],
  [fold(),walk(445),walk(170),unfold,walk(100)],
  [fold(),walk(365),jump(435),walk(475),unfold,walk(550)],
  [fold(),walk(550),walk(235),jump(160),walk(150),walk(265)],
  [fold(),walk(460),unfold,walk(515),jump(565),walk(580),jump(655),walk(685),walk(565),walk(460),fold(),walk(105)],
  [fold(),walk(515),unfold,fold('B'),jump(455),walk(441),jump(375),walk(395),jump(465),walk(495)],
  [fold('B'),walk(265),jump(395),walk(380),jump(290),walk(280),walk(390),walk(560)],
  [fold(),walk(510),unfold,fold('B'),jump(435),walk(402),jump(330),walk(310),jump(375),unfold,walk(445)],
  [fold(),walk(480),unfold,jump(540),fold('B'),jump(465),walk(380),walk(475),jump(540),unfold,fold(),jump(470),walk(330)],
  [fold('B'),walk(460),jump(520),walk(500),jump(430),unfold,fold(),walk(345),walk(445),jump(510),walk(535)],
  [fold(),jump(210),walk(250),walk(550),unfold,walk(910),jump(955),fold('B','left-to-right'),jump(875),walk(820),jump(775),walk(750)],
  [fold(),walk(550),unfold,fold('B','left-to-right'),walk(640),jump(560),walk(585),jump(650),walk(695),jump(755),walk(770)],
  [fold(),jump(210),walk(250),walk(550),unfold,walk(910),jump(955),fold('B','left-to-right'),jump(875),jump(795),unfold,walk(715)],
  [fold(),jump(210),walk(250),walk(550),unfold,walk(910),jump(955),fold('B','left-to-right'),jump(875),walk(810),jump(750),walk(705),jump(630),unfold,walk(550),fold(),walk(470),jump(420),walk(440),jump(520),walk(545)],
  [fold(),walk(550),unfold,walk(950),jump(1000),walk(1120),fold('A','left-to-right'),jump(1040),walk(940),jump(865),walk(825)],
  [fold(),walk(480),unfold,fold('B'),jump(540),jump(465),walk(500),jump(565),unfold,fold('C'),jump(485),jump(565),walk(605)],
  [walk(200),jump(265),walk(420),jump(510),walk(470),walk(555),walk(470),jump(545),fold('B'),jump(465),walk(500),jump(565),unfold,fold('C'),jump(485),walk(440),jump(345),walk(275)],
  [fold(),jump(210),walk(250),walk(550),unfold,walk(910),jump(955),fold('B','left-to-right'),jump(875),walk(820),jump(775),walk(720),jump(630),unfold,fold('C'),walk(580),jump(510),jump(610)],
  [fold('C'),walk(565),jump(485),jump(620),unfold,fold('B'),walk(500),walk(380),walk(490),walk(610),walk(555),walk(480),jump(540),jump(465),walk(325),jump(200),walk(105)],
  [fold(),walk(480),unfold,fold('B'),jump(540),jump(465),walk(380),walk(500),jump(565),unfold,fold('C'),jump(485),jump(620),unfold,fold('B'),walk(500),walk(325),jump(200),walk(105)],
];

export const chapterAlternates: {level:number;name:string;actions:Action[]}[] = [
  {level:22,name:'先借低桥再登高：三折替代解',actions:[
    fold(),walk(555),walk(470),unfold,jump(545),fold('B'),jump(465),walk(500),jump(565),unfold,fold('C'),jump(485),walk(440),jump(345),walk(275),
  ]},
  {level:22,name:'漏低钥匙先到左门台，再回岛补取',actions:[
    walk(200),jump(265),walk(420),jump(545),fold('B'),jump(465),walk(500),jump(565),unfold,fold('C'),jump(485),walk(440),jump(345),walk(275),unfold,fold('B'),walk(280),jump(350),walk(490),walk(610),walk(555),walk(470),unfold,jump(410),walk(275),
  ]},
  {level:24,name:'收齐后用第一座桥返家：三折替代解',actions:[
    fold('C'),walk(565),jump(485),jump(620),unfold,fold('B'),walk(500),walk(380),walk(490),walk(610),walk(555),walk(480),unfold,fold(),walk(105),
  ]},
  {level:24,name:'漏云钥匙落到低岛，再沿固定阶回升',actions:[
    walk(500),walk(480),jump(540),fold('B'),jump(465),walk(500),jump(565),unfold,fold('C'),jump(485),jump(620),unfold,fold('B'),walk(500),walk(380),walk(490),walk(610),walk(555),walk(480),jump(540),jump(465),walk(325),jump(200),walk(105),
  ]},
  {level:25,name:'用第一座桥返家，再展开撤门罩',actions:[
    fold(),walk(480),unfold,fold('B'),jump(540),jump(465),walk(380),walk(500),jump(565),unfold,fold('C'),jump(485),jump(620),unfold,walk(550),fold(),walk(470),walk(170),unfold,walk(105),
  ]},
  {level:25,name:'漏云钥匙提前返家，再架桥回升补取',actions:[
    fold(),walk(480),unfold,fold('B'),jump(540),jump(465),walk(380),walk(500),jump(565),unfold,fold('B'),walk(500),walk(325),jump(200),walk(170),unfold,fold(),walk(480),unfold,jump(540),fold('B'),jump(465),walk(500),jump(565),unfold,fold('C'),jump(485),jump(620),unfold,fold('B'),walk(500),walk(325),jump(200),walk(105),
  ]},
];

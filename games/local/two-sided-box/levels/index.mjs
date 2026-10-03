/** Stable order and IDs for saves, chapter navigation and independent editing. */
import level01 from './01.mjs';
import level02 from './02.mjs';
import level03 from './03.mjs';
import level04 from './04.mjs';
import level05 from './05.mjs';
import level06 from './06.mjs';
import level07 from './07.mjs';
import level08 from './08.mjs';
import level09 from './09.mjs';
import level10 from './10.mjs';
import level11 from './11.mjs';
import level12 from './12.mjs';
import level13 from './13.mjs';
import level14 from './14.mjs';
import level15 from './15.mjs';
import level16 from './16.mjs';
import level17 from './17.mjs';
import level18 from './18.mjs';
import level19 from './19.mjs';
import level20 from './20.mjs';
import level21 from './21.mjs';
import level22 from './22.mjs';
import level23 from './23.mjs';
import level24 from './24.mjs';
import level25 from './25.mjs';
import level26 from './26.mjs';
import level27 from './27.mjs';
import level28 from './28.mjs';
import level29 from './29.mjs';
import level30 from './30.mjs';
import level31 from './31.mjs';
import level32 from './32.mjs';
import level33 from './33.mjs';
import level34 from './34.mjs';
import level35 from './35.mjs';
import level36 from './36.mjs';
import level37 from './37.mjs';
import level38 from './38.mjs';
import level39 from './39.mjs';
import level40 from './40.mjs';
import level41 from './41.mjs';
import level42 from './42.mjs';
import level43 from './43.mjs';
import level44 from './44.mjs';
import level45 from './45.mjs';
import level46 from './46.mjs';
import level47 from './47.mjs';
import level48 from './48.mjs';
import level49 from './49.mjs';
import level50 from './50.mjs';

export const LEVELS = [
  level01,
  level02,
  level03,
  level04,
  level05,
  level06,
  level07,
  level08,
  level09,
  level10,
  level11,
  level12,
  level13,
  level14,
  level15,
  level16,
  level17,
  level18,
  level19,
  level20,
  level21,
  level22,
  level23,
  level24,
  level25,
  level26,
  level27,
  level28,
  level29,
  level30,
  level31,
  level32,
  level33,
  level34,
  level35,
  level36,
  level37,
  level38,
  level39,
  level40,
  level41,
  level42,
  level43,
  level44,
  level45,
  level46,
  level47,
  level48,
  level49,
  level50,
];

export const CHAPTERS = Array.from({ length: 5 }, (_, index) => ({
  number: index + 1,
  title: LEVELS[index * 10].chapter.title,
  levels: LEVELS.slice(index * 10, index * 10 + 10),
}));
export default LEVELS;

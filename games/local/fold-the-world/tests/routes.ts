import { chapterRoutes as chapter0, chapterAlternates as alternate0 } from './chapters/01-25';
import { chapterRoutes as chapter1, chapterAlternates as alternate1 } from './chapters/26-50';
import { chapterRoutes as chapter2, chapterAlternates as alternate2 } from './chapters/51-75';
import { chapterRoutes as chapter3, chapterAlternates as alternate3 } from './chapters/76-100';
export { runAction, runRoute, type Action } from './route-kit';
export const routes = [...chapter0,...chapter1,...chapter2,...chapter3];
export const alternates = [...alternate0,...alternate1,...alternate2,...alternate3];

const baseCommit = 'baaae8d717559610df529aff43a0cb2a31961393';
const source = 'games/local/night-overwatch';
// Reviewed Armory-v2 rollback/replacement at 0f95d5ab. Git rename similarity is
// not semantic identity: bind its exact status, source and destination entries.
// Keep the source and destination in normal Night regression selection.
const reviews = Object.freeze(
  Object.fromEntries(
    Object.entries({
      'games/local/night-overwatch/assets/resources/ui/base-desk.jpg': {
        status: 'D',
        before:
          '100644 blob 8856bc893997c085daff5a0afdb750b0213ea804\tgames/local/night-overwatch/assets/resources/ui/base-desk.jpg\n',
      },
      'games/local/night-overwatch/assets/resources/ui/daily-desk.jpg': {
        status: 'D',
        before:
          '100644 blob d0bbace4480a31e5f5b0b2ca8d5fa34108126082\tgames/local/night-overwatch/assets/resources/ui/daily-desk.jpg\n',
      },
      'games/local/night-overwatch/assets/resources/ui/loadout-desk.jpg': {
        status: 'D',
        before:
          '100644 blob cb80bcf31f277105703418cab1cd8ce29f684cc4\tgames/local/night-overwatch/assets/resources/ui/loadout-desk.jpg\n',
      },
      'games/local/night-overwatch/assets/resources/ui/shop-desk.jpg': {
        status: 'D',
        before:
          '100644 blob c5ef41dd2bac3873762a5900de2ff4e43276dab1\tgames/local/night-overwatch/assets/resources/ui/shop-desk.jpg\n',
      },
      'games/local/night-overwatch/assets/scripts/ArmoryView.ts': {
        status: 'D',
        before:
          '100644 blob 1d737d9031b369310bd7d84ac86d6562d1294fa4\tgames/local/night-overwatch/assets/scripts/ArmoryView.ts\n',
      },
      'games/local/night-overwatch/assets/scripts/core/Armory.ts': {
        status: 'D',
        before:
          '100644 blob 74aa08549ed58ebc6092d9a417a8e4f09979eab6\tgames/local/night-overwatch/assets/scripts/core/Armory.ts\n',
      },
      'games/local/night-overwatch/tests/armory-browser.mjs': {
        status: 'D',
        before:
          '100644 blob 9be46be1824d1e9203c71de9d0d69481a0c86bae\tgames/local/night-overwatch/tests/armory-browser.mjs\n',
      },
      'games/local/night-overwatch/tests/armory.test.ts': {
        status: 'D',
        before:
          '100644 blob 4392e04f2cceb923dd74fe9b939c1af9e7d18382\tgames/local/night-overwatch/tests/armory.test.ts\n',
      },
      'games/local/night-overwatch/publishing/manifest-2026-10-31-armory-v1.json': {
        status: 'D',
        before:
          '100644 blob 5bd428dec4f83a743ea9447514965b5d90e3f312\tgames/local/night-overwatch/publishing/manifest-2026-10-31-armory-v1.json\n',
      },
      'games/local/night-overwatch/publishing/gameplay/screenshots/2026-10-31-armory/combat-01-aim.jpg':
        {
          status: 'D',
          before:
            '100644 blob ff9272ad92f9fd54abb699f28027cda323aa543d\tgames/local/night-overwatch/publishing/gameplay/screenshots/2026-10-31-armory/combat-01-aim.jpg\n',
        },
      'games/local/night-overwatch/publishing/gameplay/screenshots/2026-10-31-armory/combat-02-he-shot.jpg':
        {
          status: 'D',
          before:
            '100644 blob 4552f9134c6df96570ff0c03000fe73f9caba353\tgames/local/night-overwatch/publishing/gameplay/screenshots/2026-10-31-armory/combat-02-he-shot.jpg\n',
        },
      'games/local/night-overwatch/publishing/gameplay/screenshots/2026-10-31-armory/combat-03-engage.jpg':
        {
          status: 'D',
          before:
            '100644 blob 1dd7c9ef4104d679baf283725b28fc55b5209eba\tgames/local/night-overwatch/publishing/gameplay/screenshots/2026-10-31-armory/combat-03-engage.jpg\n',
        },
      'games/local/night-overwatch/publishing/gameplay/screenshots/2026-10-31-armory-v2/combat-01-aim.jpg':
        {
          status: 'D',
          before:
            '100644 blob 47ef89568746bd2ec9d97cf208236ba2641dec45\tgames/local/night-overwatch/publishing/gameplay/screenshots/2026-10-31-armory-v2/combat-01-aim.jpg\n',
        },
      'games/local/night-overwatch/publishing/gameplay/screenshots/2026-10-31-armory-v2/combat-02-he-shot.jpg':
        {
          status: 'D',
          before:
            '100644 blob b0cb56b717eee844522d5231458b351d928f1232\tgames/local/night-overwatch/publishing/gameplay/screenshots/2026-10-31-armory-v2/combat-02-he-shot.jpg\n',
        },
      'games/local/night-overwatch/publishing/gameplay/screenshots/2026-10-31-armory-v2/combat-03-engage.jpg':
        {
          status: 'D',
          before:
            '100644 blob 3447d118b9f335ec26892331baf6d2756e3dd159\tgames/local/night-overwatch/publishing/gameplay/screenshots/2026-10-31-armory-v2/combat-03-engage.jpg\n',
        },
      'games/local/night-overwatch/publishing/gameplay/videos/armory-2026-10-31.mp4': {
        status: 'D',
        before:
          '100644 blob 52ba80fdc5cd47898bf15c4a0094a8bcff745dbe\tgames/local/night-overwatch/publishing/gameplay/videos/armory-2026-10-31.mp4\n',
      },
      'games/local/night-overwatch/publishing/gameplay/videos/armory-v2-2026-10-31.mp4': {
        status: 'D',
        before:
          '100644 blob 88f83d27005a854891d625f838641b83a16a8e4a\tgames/local/night-overwatch/publishing/gameplay/videos/armory-v2-2026-10-31.mp4\n',
      },
      'games/local/night-overwatch/publishing/promo/videos/armory-2026-10-31.mp4': {
        status: 'D',
        before:
          '100644 blob a7b42c873afd4ef6b79512b749fad720497912b4\tgames/local/night-overwatch/publishing/promo/videos/armory-2026-10-31.mp4\n',
      },
      'games/local/night-overwatch/publishing/promo/videos/armory-v2-2026-10-31.mp4': {
        status: 'D',
        before:
          '100644 blob ba56b39f6da4670fa289d29ce029d2a1780bda44\tgames/local/night-overwatch/publishing/promo/videos/armory-v2-2026-10-31.mp4\n',
      },
      'games/local/night-overwatch/assets/resources/ui/base-desk.jpg.meta': {
        status: 'R069',
        before:
          '100644 blob bcca4479c4cb5a66c992ecdb48c81fb060618ce7\tgames/local/night-overwatch/assets/resources/ui/base-desk.jpg.meta\n',
        to: 'games/local/night-overwatch/assets/resources/ui/progression/01-home.png.meta',
        after:
          '100644 blob 9c5fe1ec28821df4ce07a56d9a10ea051e6f391a\tgames/local/night-overwatch/assets/resources/ui/progression/01-home.png.meta\n',
      },
      'games/local/night-overwatch/assets/resources/ui/daily-desk.jpg.meta': {
        status: 'R069',
        before:
          '100644 blob 123616ea11f32bc197f81bbb7a9bb99f1d2c0cac\tgames/local/night-overwatch/assets/resources/ui/daily-desk.jpg.meta\n',
        to: 'games/local/night-overwatch/assets/resources/ui/progression/02-loadout.png.meta',
        after:
          '100644 blob fa0dfe3fa300d2fdf3ab9e4137c178a7b430638d\tgames/local/night-overwatch/assets/resources/ui/progression/02-loadout.png.meta\n',
      },
      'games/local/night-overwatch/assets/resources/ui/shop-desk.jpg.meta': {
        status: 'R069',
        before:
          '100644 blob 63670a03a048254290b354eea75062b68c2c73a6\tgames/local/night-overwatch/assets/resources/ui/shop-desk.jpg.meta\n',
        to: 'games/local/night-overwatch/assets/resources/ui/progression/04-shop.png.meta',
        after:
          '100644 blob 81f62ba9ca3adc0a285f4a855b591b7666011dd9\tgames/local/night-overwatch/assets/resources/ui/progression/04-shop.png.meta\n',
      },
      'games/local/night-overwatch/assets/resources/ui/loadout-desk.jpg.meta': {
        status: 'R069',
        before:
          '100644 blob e293cbab5455d9446657c91c97c01f142e4c0b35\tgames/local/night-overwatch/assets/resources/ui/loadout-desk.jpg.meta\n',
        to: 'games/local/night-overwatch/assets/resources/ui/progression/05-supply.png.meta',
        after:
          '100644 blob c8997e6ae75b1ad843e7af33073d548f9117f14f\tgames/local/night-overwatch/assets/resources/ui/progression/05-supply.png.meta\n',
      },
      'games/local/night-overwatch/assets/scripts/ArmoryView.ts.meta': {
        status: 'R070',
        before:
          '100644 blob 97a8c76a3ec780781a4df365d48da13e1619918d\tgames/local/night-overwatch/assets/scripts/ArmoryView.ts.meta\n',
        to: 'games/local/night-overwatch/assets/scripts/ProgressionArt.ts.meta',
        after:
          '100644 blob d805aa61208bf025d19d399a37bba12ab577a021\tgames/local/night-overwatch/assets/scripts/ProgressionArt.ts.meta\n',
        alternate: {
          to: 'games/local/night-overwatch/assets/scripts/DeveloperTools.ts.meta',
          after:
            '100644 blob a0c9e09c09a6a1f0f9500a9b78d554a3c1cf2efc\tgames/local/night-overwatch/assets/scripts/DeveloperTools.ts.meta\n',
        },
      },
      'games/local/night-overwatch/assets/scripts/core/Armory.ts.meta': {
        status: 'R070',
        before:
          '100644 blob 687baa40e77a9fa0830a915b04b448b44a375fa8\tgames/local/night-overwatch/assets/scripts/core/Armory.ts.meta\n',
        to: 'games/local/night-overwatch/assets/scripts/ProgressionView.ts.meta',
        after:
          '100644 blob d4c719d6f404121c2868ab0f7a70d240dd5ffb1d\tgames/local/night-overwatch/assets/scripts/ProgressionView.ts.meta\n',
        alternate: {
          to: 'games/local/night-overwatch/assets/scripts/ProgressionArt.ts.meta',
          after:
            '100644 blob d805aa61208bf025d19d399a37bba12ab577a021\tgames/local/night-overwatch/assets/scripts/ProgressionArt.ts.meta\n',
        },
      },
      'games/local/night-overwatch/publishing/manifest-2026-10-30-rankings.json': {
        status: 'R100',
        before:
          '100644 blob 45322a6d8170137a7161267b5d9fd450aafd429c\tgames/local/night-overwatch/publishing/manifest-2026-10-30-rankings.json\n',
        to: 'games/local/night-overwatch/publishing/manifest-2026-10-30-taptap-login.json',
        after:
          '100644 blob 45322a6d8170137a7161267b5d9fd450aafd429c\tgames/local/night-overwatch/publishing/manifest-2026-10-30-taptap-login.json\n',
      },
    }).map(([file, review]) => [file, Object.freeze(review)]),
  ),
);

export function nightRetirementHeadQueryPaths() {
  return [
    ...new Set([
      ...Object.keys(reviews),
      ...Object.values(reviews).flatMap((review) =>
        review.to ? [review.to, ...(review.alternate ? [review.alternate.to] : [])] : [],
      ),
    ]),
  ];
}

/** No caller-provided scope or copied review array can substitute for tree evidence. */
export function isReviewedNightRetirement({
  change,
  baseCommit: base,
  standaloneGames,
  gameSources,
  readBaseEntry,
  readHeadEntry,
  headHasPath,
}) {
  if (!Array.isArray(change?.paths)) return false;
  const [from, to] = change.paths,
    original = Object.hasOwn(reviews, from) ? reviews[from] : undefined,
    // DeveloperTools changes Git's similarity pairing; both exact pairs were reviewed.
    review =
      original?.alternate && original.alternate.to === to
        ? { ...original, ...original.alternate }
        : original;
  if (
    base !== baseCommit ||
    !review ||
    change.status !== review.status ||
    change.paths.length !== (review.to ? 2 : 1) ||
    to !== review.to
  )
    return false;
  try {
    const identities = standaloneGames.filter(
      (game) => game.id === 'night-overwatch' || game.source === source,
    );
    if (
      identities.length !== 1 ||
      identities[0].id !== 'night-overwatch' ||
      identities[0].source !== source ||
      gameSources.filter((value) => value === source).length !== 1
    )
      return false;
    if (
      readBaseEntry(from) !== review.before ||
      headHasPath(from) !== false ||
      readHeadEntry(from) !== ''
    )
      return false;
    if (
      review.to &&
      (readBaseEntry(to) !== '' || headHasPath(to) !== true || readHeadEntry(to) !== review.after)
    )
      return false;
    return true;
  } catch {
    return false;
  }
}

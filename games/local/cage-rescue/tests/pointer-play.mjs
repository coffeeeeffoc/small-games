// Observe the public snapshot and steer only through pointer input. No state edits.
export async function steerWithPointer(
  page,
  context,
  { lose = false, miss = false, touch = true, topPage = page } = {},
) {
  const bounds = await page.locator('#scene').boundingBox();
  let contact;
  if (touch) {
    contact = await context.newCDPSession(topPage);
    await contact.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ id: 1, x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height * 0.85 }],
    });
  } else {
    await topPage.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.85);
    await topPage.mouse.down();
  }
  await page.evaluate(
    ({ lose, miss, touch }) => {
      const pointerId = window.__cageRescue.snapshot().activePointer;
      const canvas = document.querySelector('#scene');
      const reflectX = (x) => {
        const left = 23,
          span = 344;
        const position = (((x - left) % (span * 2)) + span * 2) % (span * 2);
        return left + (position > span ? span * 2 - position : position);
      };
      function steer() {
        const current = window.__cageRescue.snapshot(),
          state = current.game;
        if ([4, 5].includes(state.rescued)) {
          window.__fullRescueMilestones ??= [];
          if (!window.__fullRescueMilestones.some((item) => item.rescued === state.rescued))
            window.__fullRescueMilestones.push({
              rescued: state.rescued,
              phase: state.phase,
              screen: current.screen,
              completed: Object.keys(current.progress.completed).length,
              counter: document.querySelector('#rescue-count').textContent,
            });
        }
        if (current.screen !== 'play') return;
        if (state.phase === 'ready') document.querySelector('#launch').click();
        const ball = state.ball;
        const eta =
          ball.vy > 0 ? Math.max(0, (state.paddle.y - ball.r - ball.y) / ball.vy) : Infinity;
        const landing = Number.isFinite(eta) ? reflectX(ball.x + ball.vx * eta) : ball.x;
        const cage = state.cages
          .filter((item) => item.hp > 0)
          .sort((a, b) => Math.abs(a.x + a.w / 2 - landing) - Math.abs(b.x + b.w / 2 - landing))[0];
        const angle = cage
          ? Math.atan2(cage.x + cage.w / 2 - landing, state.paddle.y - cage.y - cage.h / 2)
          : Math.sin(state.time) * 0.6;
        let target = landing - ((angle / (Math.PI * 0.365)) * state.paddle.w) / 2;
        const person = state.people
          .filter((item) => item.status === 'falling' && item.y + item.r < state.paddle.y)
          .sort((a, b) => b.y - a.y)[0];
        if (person && !miss) {
          const personEta = (state.paddle.y - person.r - person.y) / state.level.personSpeed;
          const travel = Math.abs(person.x - state.paddle.x) / 1100;
          if (personEta < 0.65 + travel && (eta > 0.48 || personEta < eta)) target = person.x;
        }
        if (lose) target = landing < 195 ? 350 : 40;
        const rect = canvas.getBoundingClientRect();
        canvas.dispatchEvent(
          new PointerEvent('pointermove', {
            pointerId,
            pointerType: touch ? 'touch' : 'mouse',
            isPrimary: true,
            bubbles: true,
            clientX: rect.left + (target / 390) * rect.width,
            clientY: rect.top + rect.height * 0.85,
          }),
        );
        requestAnimationFrame(steer);
      }
      requestAnimationFrame(steer);
    },
    { lose, miss, touch },
  );
  return async () => {
    // Cancel the original contact: synthetic steering did not update its CDP coordinates.
    if (contact) {
      await contact.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      await contact.detach();
    } else await topPage.mouse.up();
  };
}

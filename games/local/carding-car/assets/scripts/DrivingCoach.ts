import type { KartInput } from './KartConfig.ts';
import type { KartState } from './KartPhysics.ts';

/** Watches real driving outcomes; teaching never changes the race or its controls. */
export class DrivingCoach {
  step = 0;
  enabled = true;
  private steeringTime = 0;
  private previousTier = 0;
  private previousNitro = 0;

  observe(kart: KartState, input: KartInput, dt: number, racing: boolean) {
    if (this.enabled && this.step === 3 && kart.tier === 0) {
      this.step =
        racing &&
        this.previousTier > 0 &&
        !input.drift &&
        !input.brake &&
        kart.collision <= 0 &&
        kart.boost > 0
          ? 4
          : 2;
    } else if (this.enabled && racing) {
      if (this.step === 0 && input.throttle > 0 && kart.speed >= 9) this.step = 1;
      else if (this.step === 1) {
        this.steeringTime =
          kart.speed >= 5 && Math.abs(input.steer) > 0.25 ? this.steeringTime + dt : 0;
        if (this.steeringTime >= 0.35) this.step = 2;
      } else if (this.step === 2 && kart.tier > 0) this.step = 3;
      else if (this.step === 4 && input.nitro && kart.nitroCooldown > this.previousNitro)
        this.step = 5;
    }
    this.previousTier = racing ? kart.tier : 0;
    this.previousNitro = kart.nitroCooldown;
  }

  hint(keyboard: boolean) {
    return [
      keyboard ? '1/5 起步：按住 W / ↑，加速到 32 km/h' : '1/5 起步：赛车自动加速，两手就位',
      keyboard
        ? '2/5 转向：按 A D / ← →，沿道路进入弯道'
        : '2/5 转向：左手滑动转向盘，沿道路进入弯道',
      keyboard
        ? '3/5 漂移：过弯时按住空格，蓄出蓝色火花'
        : '3/5 漂移：转向时按住右下漂移，蓄出蓝色火花',
      keyboard ? '4/5 出弯：松开空格，释放漂移加速' : '4/5 出弯：松开漂移，释放加速',
      keyboard
        ? '5/5 氮气：直道按 Shift 冲刺，6 秒后可再用'
        : '5/5 氮气：直道点击氮气冲刺，6 秒后可再用',
      '驾驶入门完成！沿赛道跑完 3 圈，挑战本机纪录',
    ][this.step];
  }
}

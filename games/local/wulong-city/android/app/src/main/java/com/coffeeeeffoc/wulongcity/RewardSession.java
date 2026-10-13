package com.coffeeeeffoc.wulongcity;

/** One native SDK attempt, independent of Activity and callback ordering. */
final class RewardSession {
    final String id;
    boolean shown, closed, verified, rejected, cancelled, settled;
    RewardSession(String id) { this.id = id; }
    void verify(boolean valid) { if (!settled && !verified && !rejected) { verified = valid; rejected = !valid; } }
    String outcome(boolean graceExpired) {
        if (settled || !closed) return null;
        if (cancelled || rejected) { settled = true; return "dismissed"; }
        if (verified) { settled = true; return "completed"; }
        if (graceExpired) { settled = true; return "dismissed"; }
        return null;
    }
}

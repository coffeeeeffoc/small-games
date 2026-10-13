package com.coffeeeeffoc.wulongcity;

import org.junit.Test;
import static org.junit.Assert.*;

public class RewardSessionTest {
    @Test public void verifiedThenClosedGrantsExactlyOnce() {
        RewardSession request = new RewardSession("1");
        request.verify(true);
        assertNull(request.outcome(false));
        request.closed = true;
        assertEquals("completed", request.outcome(false));
        assertNull(request.outcome(true));
    }
    @Test public void closedBeforeVerifiedCanStillGrant() {
        RewardSession request = new RewardSession("1");
        request.closed = true;
        assertNull(request.outcome(false));
        request.verify(true);
        assertEquals("completed", request.outcome(false));
    }
    @Test public void closeAndVideoCompletionAloneDoNotGrant() {
        RewardSession request = new RewardSession("1");
        request.closed = true;
        assertEquals("dismissed", request.outcome(true));
        request.verify(true);
        assertNull(request.outcome(false));
    }
    @Test public void skippedOrRejectedCannotGrant() {
        for (boolean rejected : new boolean[]{false, true}) {
            RewardSession request = new RewardSession("1");
            request.closed = true;
            request.cancelled = !rejected;
            request.verify(!rejected);
            assertEquals("dismissed", request.outcome(false));
        }
    }
    @Test public void duplicateVerificationDoesNotReverseDecision() {
        RewardSession request = new RewardSession("1");
        request.verify(false); request.verify(true); request.closed = true;
        assertEquals("dismissed", request.outcome(false));
    }
}

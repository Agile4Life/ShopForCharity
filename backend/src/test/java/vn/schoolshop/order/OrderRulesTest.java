package vn.schoolshop.order;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;
import vn.schoolshop.common.ApiException;

class OrderRulesTest {
  @Test
  void acceptanceRequiresSuccessfulContact() {
    assertThrows(
        ApiException.class,
        () -> OrderRules.transition("PENDING_CONTACT", "ACCEPTED", "UNPAID", true, false));
    assertDoesNotThrow(
        () -> OrderRules.transition("PENDING_CONTACT", "ACCEPTED", "UNPAID", true, true));
  }

  @Test
  void completionRequiresReadyAndPaid() {
    for (String status : new String[] {"PENDING_CONTACT", "ACCEPTED", "PREPARING"})
      assertThrows(
          ApiException.class, () -> OrderRules.transition(status, "COMPLETED", "PAID", true, true));
    for (String payment : new String[] {"UNPAID", "REPORTED", "REFUND_PENDING", "REFUNDED"})
      assertThrows(
          ApiException.class,
          () -> OrderRules.transition("READY", "COMPLETED", payment, true, true));
    assertDoesNotThrow(() -> OrderRules.transition("READY", "COMPLETED", "PAID", true, true));
  }

  @Test
  void customerCanOnlyCancelPendingUnpaid() {
    assertDoesNotThrow(
        () -> OrderRules.transition("PENDING_CONTACT", "CANCELLED", "UNPAID", false, false));
    assertThrows(
        ApiException.class,
        () -> OrderRules.transition("ACCEPTED", "CANCELLED", "UNPAID", false, true));
    assertThrows(
        ApiException.class,
        () -> OrderRules.transition("PENDING_CONTACT", "CANCELLED", "REPORTED", false, false));
  }

  @Test
  void terminalOrdersCannotReleaseStockAgain() {
    for (String status : new String[] {"COMPLETED", "CANCELLED", "REJECTED", "EXPIRED"}) {
      assertThrows(
          ApiException.class,
          () -> OrderRules.transition(status, "CANCELLED", "UNPAID", true, true));
      assertThrows(
          ApiException.class,
          () -> OrderRules.transition(status, "ACCEPTED", "UNPAID", true, true));
    }
  }

  @Test
  void reportedOrReceivedMoneyNeverAutomaticallyExpires() {
    for (String payment : new String[] {"REPORTED", "PAID", "REFUND_PENDING"})
      assertThrows(
          ApiException.class,
          () -> OrderRules.transition("PENDING_CONTACT", "EXPIRED", payment, false, false));
    assertDoesNotThrow(
        () -> OrderRules.transition("PENDING_CONTACT", "EXPIRED", "UNPAID", false, false));
  }
}

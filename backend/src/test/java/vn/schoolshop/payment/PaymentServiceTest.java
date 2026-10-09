package vn.schoolshop.payment;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import vn.schoolshop.audit.AuditService;
import vn.schoolshop.common.*;
import vn.schoolshop.identity.*;
import vn.schoolshop.infrastructure.*;
import vn.schoolshop.order.*;
import vn.schoolshop.shop.*;

class PaymentServiceTest {
  DomainRepository db;
  Order order;
  PaymentService service;
  Actor seller = new Actor(UUID.randomUUID(), "SELLER", "seller", null);
  Actor owner = new Actor(null, "GUEST", "owner", null);

  @BeforeEach
  void setup() {
    db = mock(DomainRepository.class);
    var access = mock(OrderAccess.class);
    var orders = mock(OrderService.class);
    var idem = mock(IdempotencyService.class);
    order = new Order();
    order.total = new BigDecimal("10000");
    order.receivedAmount = BigDecimal.ZERO;
    order.paymentMethod = "BANK_TRANSFER";
    order.paymentStatus = "UNPAID";
    order.status = "ACCEPTED";
    when(access.owned(eq(order.id), any(), anyBoolean())).thenReturn(order);
    when(orders.view(any(), anyBoolean()))
        .thenAnswer(
            i ->
                Views.map(
                    "paymentStatus", order.paymentStatus, "receivedAmount", order.receivedAmount));
    when(idem.run(any(), anyString(), anyString(), any(), any()))
        .thenAnswer(
            i -> {
              Supplier<Map<String, Object>> op = i.getArgument(4);
              return op.get();
            });
    var shopRepository = mock(ShopRepository.class);
    when(shopRepository.lock(any())).thenReturn(Optional.of(new Shop()));
    service =
        new PaymentService(
            db,
            new ShopAccess(UUID.randomUUID(), shopRepository),
            mock(ProfileService.class),
            access,
            orders,
            idem,
            mock(AuditService.class),
            Clock.systemUTC(),
            mock(StoragePort.class));
  }

  PaymentService.Input input(String amount, String reference) {
    return new PaymentService.Input(
        0L, amount == null ? null : new BigDecimal(amount), reference, null, null, null);
  }

  void action(String name, boolean sellerAction, PaymentService.Input input) {
    service.action(
        sellerAction ? seller : owner,
        order.id,
        sellerAction,
        name,
        UUID.randomUUID().toString(),
        input);
  }

  @Test
  void buyerReportDoesNotConfirmPaymentOrIncreaseReceivedAmount() {
    action("payment-report", false, input(null, null));
    assertEquals("REPORTED", order.paymentStatus);
    assertEquals(BigDecimal.ZERO, order.receivedAmount);
  }

  @Test
  void buyerCannotReportBeforeAcceptance() {
    order.status = "PENDING_CONTACT";
    assertThrows(ApiException.class, () -> action("payment-report", false, input(null, null)));
    assertEquals("UNPAID", order.paymentStatus);
  }

  @Test
  void partialReceiptsOnlyBecomePaidWhenActualTotalMatches() {
    action("confirm-payment", true, input("4000", "first"));
    assertEquals("REPORTED", order.paymentStatus);
    action("confirm-payment", true, input("6000", "second"));
    assertEquals("PAID", order.paymentStatus);
    assertEquals(new BigDecimal("10000"), order.receivedAmount);
    assertThrows(
        ApiException.class, () -> action("confirm-payment", true, input("10000", "third")));
  }

  @Test
  void overpaymentNeedsReviewAndCannotBeDismissed() {
    action("confirm-payment", true, input("12000", "extra"));
    assertEquals("REPORTED", order.paymentStatus);
    var dismiss = new PaymentService.Input(0L, null, null, null, "Không nhận được", null);
    assertThrows(ApiException.class, () -> action("dismiss-payment-report", true, dismiss));
  }

  @Test
  void lateTransferRequiresRefundWithoutReopeningOrder() {
    order.status = "EXPIRED";
    action("confirm-payment", true, input("10000", "late"));
    assertEquals("EXPIRED", order.status);
    assertEquals("REFUND_PENDING", order.paymentStatus);
    assertThrows(ApiException.class, () -> action("confirm-refund", true, input("9000", "refund")));
    action("confirm-refund", true, input("10000", "refund"));
    assertEquals("REFUNDED", order.paymentStatus);
  }
}

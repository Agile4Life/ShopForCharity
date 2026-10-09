package vn.schoolshop.inventory;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import vn.schoolshop.audit.AuditService;
import vn.schoolshop.catalog.*;
import vn.schoolshop.common.*;
import vn.schoolshop.identity.*;
import vn.schoolshop.infrastructure.IdempotencyService;
import vn.schoolshop.shop.ShopAccess;

class InventoryServiceTest {
  final DomainRepository db = mock(DomainRepository.class);
  final AuditService audit = mock(AuditService.class);
  final InventoryService service = new InventoryService(db, mock(ShopAccess.class), mock(ProfileService.class),
      audit, mock(IdempotencyService.class), mock(CatalogService.class));
  final UUID orderId = UUID.randomUUID();
  final Actor actor = Actor.system();
  Inventory inventory;

  @BeforeEach
  void setup() {
    inventory = new Inventory();
    inventory.stockOnHand = 10;
    inventory.stockReserved = 2;
    when(db.lock(Inventory.class, inventory.id)).thenReturn(inventory);
  }

  @Test
  void reserveCreatesHeldReservationAndMovementWithoutConsumingStock() {
    service.reserve(orderId, Map.of(inventory.id, 3), actor);
    assertEquals(10, inventory.stockOnHand);
    assertEquals(5, inventory.stockReserved);
    var saved = ArgumentCaptor.forClass(Object.class);
    verify(db, times(2)).add(saved.capture());
    var reservation = (Reservation) saved.getAllValues().stream().filter(Reservation.class::isInstance).findFirst().orElseThrow();
    assertEquals(orderId, reservation.orderId);
    assertEquals(inventory.id, reservation.productId);
    assertEquals(3, reservation.quantity);
    assertEquals("HELD", reservation.state);
    var movement = (Movement) saved.getAllValues().stream().filter(Movement.class::isInstance).findFirst().orElseThrow();
    assertEquals(0, movement.deltaOnHand);
    assertEquals(3, movement.deltaReserved);
  }

  @Test
  void insufficientAvailableStockHasNoWritesForRejectedLine() {
    var error = assertThrows(ApiException.class, () -> service.reserve(orderId, Map.of(inventory.id, 9), actor));
    assertEquals("INSUFFICIENT_STOCK", error.code);
    assertEquals(2, inventory.stockReserved);
    verify(db, never()).add(any());
    verifyNoInteractions(audit);
  }

  @ParameterizedTest
  @ValueSource(booleans = {false, true})
  void terminalSettlementReleasesOrConsumesHeldStockOnlyOnce(boolean consume) {
    var reservation = new Reservation();
    reservation.orderId = orderId;
    reservation.productId = inventory.id;
    reservation.quantity = 2;
    reservation.state = "HELD";
    when(db.list(eq(Reservation.class), anyString(), anyMap())).thenAnswer(invocation ->
        new ArrayList<>("HELD".equals(reservation.state) ? List.of(reservation) : List.of()));
    service.settle(orderId, consume, actor);
    service.settle(orderId, consume, actor);
    assertEquals(0, inventory.stockReserved);
    assertEquals(consume ? 8 : 10, inventory.stockOnHand);
    assertEquals(consume ? "CONSUMED" : "RELEASED", reservation.state);
    verify(db, times(1)).lock(Inventory.class, inventory.id);
    verify(db, times(1)).add(any(Movement.class));
  }

  @Test
  void multipleProductsLockInUuidOrder() {
    UUID first = new UUID(0, 1), second = new UUID(0, 2);
    Inventory a = new Inventory(), b = new Inventory();
    a.id = first; b.id = second; a.stockOnHand = b.stockOnHand = 5;
    when(db.lock(Inventory.class, first)).thenReturn(a);
    when(db.lock(Inventory.class, second)).thenReturn(b);
    var demand = new LinkedHashMap<UUID, Integer>();
    demand.put(second, 1); demand.put(first, 1);
    service.reserve(orderId, demand, actor);
    var ordered = inOrder(db);
    ordered.verify(db).lock(Inventory.class, first);
    ordered.verify(db).lock(Inventory.class, second);
  }
}

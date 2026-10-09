package vn.schoolshop;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.*;
import vn.schoolshop.catalog.*;
import vn.schoolshop.common.*;
import vn.schoolshop.identity.*;
import vn.schoolshop.infrastructure.*;
import vn.schoolshop.inventory.*;
import vn.schoolshop.order.*;
import vn.schoolshop.payment.*;
import vn.schoolshop.shop.*;

/** Always disposable PostgreSQL; never uses the owner's Supabase or production DB. */
@Testcontainers
@SpringBootTest(
    properties = {
      "spring.flyway.enabled=true",
      "app.issuer=https://auth.example",
      "app.jwks=https://auth.example/jwks",
      "app.audience=authenticated",
      "app.supabase-url=https://storage.example",
      "app.cookie-secure=false",
      "app.encryption-key=AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=",
      "app.signing-key=AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI=",
      "app.expiry-interval-ms=3600000"
    })
@AutoConfigureMockMvc
class BackendPostgresIT {
  @Container
  static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16.4-alpine");

  @DynamicPropertySource
  static void database(DynamicPropertyRegistry r) {
    r.add("spring.datasource.url", postgres::getJdbcUrl);
    r.add("spring.datasource.username", postgres::getUsername);
    r.add("spring.datasource.password", postgres::getPassword);
    r.add("spring.flyway.url", postgres::getJdbcUrl);
    r.add("spring.flyway.user", postgres::getUsername);
    r.add("spring.flyway.password", postgres::getPassword);
  }

  @Autowired JdbcTemplate sql;
  @Autowired CatalogService catalog;
  @Autowired ShopService shops;
  @Autowired CheckoutService checkout;
  @Autowired OrderService orders;
  @Autowired PaymentService payments;
  @Autowired InventoryService inventory;
  @Autowired GuestAccessService guests;
  @Autowired MockMvc mvc;
  @MockitoBean StoragePort storage;
  UUID shop = UUID.fromString("00000000-0000-0000-0000-000000000001"),
      category = UUID.fromString("00000000-0000-0000-0000-000000000011");
  UUID image, pickup;
  Actor seller;

  @BeforeEach
  void seed() {
    // No production credentials: container JDBC URL and credentials are supplied above.
    sql.execute(
        "TRUNCATE shop.profiles,shop.assets,shop.products,shop.product_inventory,shop.combos,shop.combo_items,shop.pickup_points,shop.payment_settings_versions,shop.orders,shop.order_items,shop.order_item_components,shop.stock_reservations,shop.inventory_movements,shop.order_contact_attempts,shop.order_status_history,shop.payment_events,shop.notifications,shop.audit_logs,shop.idempotency_keys CASCADE");
    sql.update(
        "UPDATE shop.shops SET accepting_orders=true,payment_settings_version_id=null,version=0");
    UUID profile = UUID.randomUUID();
    sql.update(
        "INSERT INTO shop.profiles(id,auth_user_id,role,active,created_at,updated_at) VALUES (?,?,'SELLER',true,now(),now())",
        profile,
        UUID.randomUUID());
    seller = new Actor(profile, "SELLER", "seller:" + profile, null);
    image = asset("PRODUCT_IMAGE");
    pickup =
        UUID.fromString(
            ((Map<?, ?>)
                    shops.savePoint(
                        seller,
                        null,
                        new ShopService.PointInput("Cổng trường", "Gặp ở cổng", true, null)))
                .get("id")
                .toString());
    when(storage.publicUrl(anyString(), anyString()))
        .thenAnswer(i -> "https://storage.example/" + i.getArgument(1));
    when(storage.signed(anyString(), anyString(), anyInt()))
        .thenReturn("https://storage.example/signed");
  }

  UUID asset(String type) {
    UUID id = UUID.randomUUID();
    sql.update(
        "INSERT INTO shop.assets(id,shop_id,bucket,object_path,type,mime,size,created_at,updated_at) VALUES (?,?,'test',?,?,'image/png',100,now(),now())",
        id,
        shop,
        id + ".png",
        type);
    return id;
  }

  UUID product(int stock) {
    var p =
        (Map<?, ?>)
            catalog.saveProduct(
                seller,
                null,
                new CatalogDtos.ProductInput(
                    "Bánh thử",
                    null,
                    category,
                    "Test",
                    new BigDecimal("10000"),
                    image,
                    null,
                    null,
                    null,
                    stock,
                    null));
    UUID id = UUID.fromString(p.get("id").toString());
    catalog.status(seller, false, id, "ACTIVE", 0);
    return id;
  }

  Actor guest() {
    return new Actor(null, "GUEST", "guest:" + UUID.randomUUID(), null);
  }

  List<CheckoutDtos.CartLine> cart(UUID id, int quantity) {
    return List.of(new CheckoutDtos.CartLine("PRODUCT", id, quantity));
  }

  CheckoutDtos.CreateInput request(List<CheckoutDtos.CartLine> cart, String method) {
    var q = checkout.quote(new CheckoutDtos.QuoteInput(cart, method));
    return new CheckoutDtos.CreateInput(
        q.get("quoteToken").toString(),
        cart,
        new CheckoutDtos.Buyer("Nguyễn Văn A", "0901234567", "student@example.com", null),
        pickup,
        null,
        method,
        null);
  }

  Map<String, Object> create(UUID product, String method, Actor actor) {
    return checkout.create(actor, UUID.randomUUID().toString(), request(cart(product, 1), method));
  }

  long version(UUID id) {
    return sql.queryForObject("select version from shop.orders where id=?", Long.class, id);
  }

  long stock(UUID id, String column) {
    return sql.queryForObject(
        "select " + column + " from shop.product_inventory where id=?", Long.class, id);
  }

  CheckoutDtos.ActionInput action(UUID id, String reason) {
    return new CheckoutDtos.ActionInput(version(id), reason, null, null);
  }

  PaymentService.Input pay(UUID id, BigDecimal amount, String ref) {
    return new PaymentService.Input(version(id), amount, ref, null, null, Instant.now());
  }

  @Test
  void healthAndPublicCatalogUseRealDatabase() throws Exception {
    product(4);
    mvc.perform(get("/api/v1/products"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content[0].availableStock").value(4))
        .andExpect(jsonPath("$.totalPages").value(1))
        .andExpect(jsonPath("$.content[0].stockReserved").doesNotExist());
    mvc.perform(get("/api/v1/seller/orders")).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/v1/products").header("Authorization", "Bearer fake"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void concurrentLastItemHasExactlyOneWinner() throws Exception {
    UUID p = product(1);
    var req = request(cart(p, 1), "CASH");
    var pool = Executors.newFixedThreadPool(2);
    var start = new CountDownLatch(1);
    var tasks = new ArrayList<Future<String>>();
    try {
      for (int i = 0; i < 2; i++)
        tasks.add(
            pool.submit(
                () -> {
                  start.await();
                  try {
                    checkout.create(guest(), UUID.randomUUID().toString(), req);
                    return "SUCCESS";
                  } catch (ApiException e) {
                    return e.code;
                  }
                }));
      start.countDown();
      var result = new ArrayList<String>();
      for (var f : tasks) result.add(f.get(15, TimeUnit.SECONDS));
      assertEquals(1, Collections.frequency(result, "SUCCESS"));
      assertEquals(1, Collections.frequency(result, "INSUFFICIENT_STOCK"));
      assertEquals(1, stock(p, "stock_reserved"));
      assertEquals(1, sql.queryForObject("select count(*) from shop.orders", Long.class));
    } finally {
      pool.shutdownNow();
    }
  }

  @Test
  void retryPreservesGuestCredentialAndDoesNotReserveTwice() {
    UUID p = product(3);
    var actor = guest();
    String key = UUID.randomUUID().toString();
    var req = request(cart(p, 1), "CASH");
    var a = checkout.create(actor, key, req);
    var b = checkout.create(actor, key, req);
    assertEquals(a.get("guestAccessToken"), b.get("guestAccessToken"));
    assertEquals(a.get("orderId").toString(), b.get("orderId").toString());
    assertEquals(1, stock(p, "stock_reserved"));
    assertEquals(
        UUID.fromString(a.get("orderId").toString()),
        guests.verify(
            new CheckoutDtos.AccessInput(
                a.get("orderCode").toString(), a.get("guestAccessToken").toString())));
    var bad =
        new CheckoutDtos.CreateInput(
            req.quoteToken(),
            req.items(),
            new CheckoutDtos.Buyer("Nguyễn Văn B", "0901234567", "student@example.com", null),
            pickup,
            null,
            "CASH",
            null);
    assertEquals(
        "IDEMPOTENCY_MISMATCH",
        assertThrows(ApiException.class, () -> checkout.create(actor, key, bad)).code);
  }

  @Test
  void stalePriceQuoteRequiresExplicitConfirmation() {
    UUID p = product(3);
    var req = request(cart(p, 1), "CASH");
    sql.update("update shop.products set price=12000,version=version+1 where id=?", p);
    var error =
        assertThrows(
            ApiException.class, () -> checkout.create(guest(), UUID.randomUUID().toString(), req));
    assertEquals("CHECKOUT_CHANGED", error.code);
    assertEquals(0, stock(p, "stock_reserved"));
    assertEquals(0, sql.queryForObject("select count(*) from shop.orders", Long.class));
  }

  @Test
  void cancelRetryAndExpiryNeverReleaseTwice() {
    UUID p = product(4);
    var a = create(p, "CASH", guest());
    UUID id = UUID.fromString(a.get("orderId").toString());
    var owner = new Actor(null, "GUEST", "guest:order:" + id, id);
    String key = UUID.randomUUID().toString();
    var input = action(id, "Không nhận nữa");
    orders.action(owner, id, false, "cancel", key, input);
    orders.action(owner, id, false, "cancel", key, input);
    assertEquals(0, stock(p, "stock_reserved"));
    assertEquals(4, stock(p, "stock_on_hand"));
    var b = create(p, "CASH", guest());
    UUID second = UUID.fromString(b.get("orderId").toString());
    sql.update(
        "update shop.orders set reservation_expires_at=now()-interval '1 minute' where id=?",
        second);
    orders.expire();
    orders.expire();
    assertEquals(
        "EXPIRED",
        sql.queryForObject("select status from shop.orders where id=?", String.class, second));
    assertEquals(0, stock(p, "stock_reserved"));
  }

  @Test
  void acceptanceCompletionAndPaymentConditionsAreEnforced() {
    UUID p = product(2);
    UUID id = UUID.fromString(create(p, "CASH", guest()).get("orderId").toString());
    var accept =
        new CheckoutDtos.ActionInput(version(id), null, pickup, Instant.now().plusSeconds(3600));
    assertThrows(
        ApiException.class,
        () -> orders.action(seller, id, true, "accept", UUID.randomUUID().toString(), accept));
    orders.contact(
        seller,
        id,
        UUID.randomUUID().toString(),
        new CheckoutDtos.ContactInput(version(id), "PHONE", "SUCCESS", null));
    orders.action(
        seller,
        id,
        true,
        "accept",
        UUID.randomUUID().toString(),
        new CheckoutDtos.ActionInput(version(id), null, pickup, Instant.now().plusSeconds(3600)));
    orders.action(seller, id, true, "prepare", UUID.randomUUID().toString(), action(id, null));
    orders.action(seller, id, true, "ready", UUID.randomUUID().toString(), action(id, null));
    assertThrows(
        ApiException.class,
        () ->
            orders.action(
                seller, id, true, "complete", UUID.randomUUID().toString(), action(id, null)));
    payments.action(
        seller,
        id,
        true,
        "confirm-payment",
        UUID.randomUUID().toString(),
        pay(id, new BigDecimal("10000"), null));
    orders.action(seller, id, true, "complete", UUID.randomUUID().toString(), action(id, null));
    assertEquals(1, stock(p, "stock_on_hand"));
    assertEquals(0, stock(p, "stock_reserved"));
    assertEquals(
        "CONSUMED",
        sql.queryForObject(
            "select state from shop.stock_reservations where order_id=?", String.class, id));
  }

  @Test
  void earlyPaymentSuppressesExpiryAndCancellationRequiresRefund() {
    UUID p = product(2);
    UUID id = UUID.fromString(create(p, "CASH", guest()).get("orderId").toString());
    String key = UUID.randomUUID().toString();
    var receipt = pay(id, new BigDecimal("10000"), "receipt-1");
    payments.action(seller, id, true, "confirm-payment", key, receipt);
    payments.action(seller, id, true, "confirm-payment", key, receipt);
    sql.update(
        "update shop.orders set reservation_expires_at=now()-interval '1 day' where id=?", id);
    orders.expire();
    assertEquals(
        "PENDING_CONTACT",
        sql.queryForObject("select status from shop.orders where id=?", String.class, id));
    orders.action(seller, id, true, "cancel", UUID.randomUUID().toString(), action(id, "Hủy"));
    assertEquals(
        "REFUND_PENDING",
        sql.queryForObject("select payment_status from shop.orders where id=?", String.class, id));
    payments.action(
        seller,
        id,
        true,
        "confirm-refund",
        UUID.randomUUID().toString(),
        pay(id, new BigDecimal("10000"), "refund-1"));
    assertEquals(
        "REFUNDED",
        sql.queryForObject("select payment_status from shop.orders where id=?", String.class, id));
    assertEquals(2, stock(p, "stock_on_hand"));
  }

  @Test
  void bankReferenceCannotBeUsedForTwoOrders() {
    UUID p = product(3);
    UUID a = UUID.fromString(create(p, "CASH", guest()).get("orderId").toString()),
        b = UUID.fromString(create(p, "CASH", guest()).get("orderId").toString());
    payments.action(
        seller,
        a,
        true,
        "confirm-payment",
        UUID.randomUUID().toString(),
        pay(a, new BigDecimal("10000"), "shared-receipt"));
    assertEquals(
        "BANK_REFERENCE_DUPLICATE",
        assertThrows(
                ApiException.class,
                () ->
                    payments.action(
                        seller,
                        b,
                        true,
                        "confirm-payment",
                        UUID.randomUUID().toString(),
                        pay(b, new BigDecimal("10000"), "shared-receipt")))
            .code);
    assertEquals(
        "UNPAID",
        sql.queryForObject("select payment_status from shop.orders where id=?", String.class, b));
  }

  @Test
  void auditFailureRollsBackOrderAndReservations() {
    UUID p = product(2);
    sql.execute(
        "CREATE FUNCTION shop.test_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$");
    sql.execute(
        "CREATE TRIGGER test_fail BEFORE INSERT ON shop.audit_logs FOR EACH ROW EXECUTE FUNCTION shop.test_fail_audit()");
    try {
      assertThrows(RuntimeException.class, () -> create(p, "CASH", guest()));
      assertEquals(0, stock(p, "stock_reserved"));
      assertEquals(0, sql.queryForObject("select count(*) from shop.orders", Long.class));
    } finally {
      sql.execute("DROP TRIGGER test_fail ON shop.audit_logs");
      sql.execute("DROP FUNCTION shop.test_fail_audit()");
    }
  }
}

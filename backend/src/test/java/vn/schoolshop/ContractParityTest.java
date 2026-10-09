package vn.schoolshop;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.*;
import java.lang.reflect.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.*;

class ContractParityTest {
  @Test
  void everyControllerOperationHasAnOpenApiContract() throws Exception {
    JsonNode contract =
        new ObjectMapper().readTree(Files.readString(Path.of("../docs/openapi.yaml")));
    for (Class<?> controller :
        List.of(
            vn.schoolshop.catalog.CatalogController.class,
                vn.schoolshop.identity.IdentityController.class,
            vn.schoolshop.shop.ShopController.class, vn.schoolshop.order.CheckoutController.class,
            vn.schoolshop.order.OrderController.class,
                vn.schoolshop.inventory.InventoryController.class,
            vn.schoolshop.infrastructure.AssetController.class,
                vn.schoolshop.audit.SellerReadController.class)) {
      String prefix =
          controller.getAnnotation(RequestMapping.class).value()[0].replace("/api/v1", "");
      for (Method m : controller.getDeclaredMethods()) {
        String verb;
        String[] routes;
        if (m.isAnnotationPresent(GetMapping.class)) {
          verb = "get";
          routes = m.getAnnotation(GetMapping.class).value();
        } else if (m.isAnnotationPresent(PostMapping.class)) {
          verb = "post";
          routes = m.getAnnotation(PostMapping.class).value();
        } else if (m.isAnnotationPresent(PatchMapping.class)) {
          verb = "patch";
          routes = m.getAnnotation(PatchMapping.class).value();
        } else continue;
        if (routes.length == 0) routes = new String[] {""};
        for (String route : routes)
          for (String expanded : expand(prefix + route))
            assertTrue(contract.path("paths").path(expanded).has(verb), verb + " " + expanded);
      }
    }
  }

  List<String> expand(String path) {
    var matcher = java.util.regex.Pattern.compile("\\{([a-zA-Z]+):([^}]+)}").matcher(path);
    if (!matcher.find()) return List.of(path);
    var out = new ArrayList<String>();
    for (String choice : matcher.group(2).split("\\|"))
      out.addAll(
          expand(path.substring(0, matcher.start()) + choice + path.substring(matcher.end())));
    return out;
  }
}

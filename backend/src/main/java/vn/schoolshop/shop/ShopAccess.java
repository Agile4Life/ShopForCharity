package vn.schoolshop.shop;

import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import vn.schoolshop.common.ApiException;

@Service
public class ShopAccess {
  public final UUID id;
  private final ShopRepository repository;

  public ShopAccess(@Value("${app.shop-id}") UUID id, ShopRepository repository) {
    this.id = id;
    this.repository = repository;
  }

  public Shop get() {
    return repository.findById(id).orElseThrow(ApiException::missing);
  }

  public Shop lock() {
    return repository.lock(id).orElseThrow(ApiException::missing);
  }

  public void same(UUID shopId) {
    if (!id.equals(shopId)) throw ApiException.missing();
  }
}

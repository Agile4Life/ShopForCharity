package vn.schoolshop.catalog;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.*;

public final class CatalogDtos {
  private CatalogDtos() {}

  public record ProductInput(
      @Size(min = 2, max = 100) String name,
      @Pattern(regexp = "[a-z0-9]+(?:-[a-z0-9]+)*") @Size(max = 120) String slug,
      UUID categoryId,
      @Size(max = 5000) String description,
      @DecimalMin("1") @DecimalMax("99999999999999") @Digits(integer = 14, fraction = 0)
          BigDecimal price,
      UUID imageAssetId,
      @Size(max = 2000) String ingredients,
      @Size(max = 2000) String allergens,
      @com.fasterxml.jackson.annotation.JsonAlias("preservationInstructions") @Size(max = 2000)
          String storageInstructions,
      @com.fasterxml.jackson.annotation.JsonAlias("stockOnHand") @Min(0) Integer initialStock,
      @PositiveOrZero Long expectedVersion) {}

  public record Component(@NotNull UUID productId, @Min(1) @Max(1000) int quantity) {}

  public record ComboInput(
      @Size(min = 2, max = 100) String name,
      @Pattern(regexp = "[a-z0-9]+(?:-[a-z0-9]+)*") @Size(max = 120) String slug,
      @Size(max = 5000) String description,
      @DecimalMin("1") @DecimalMax("99999999999999") @Digits(integer = 14, fraction = 0)
          BigDecimal price,
      UUID imageAssetId,
      @Size(min = 2, max = 30) List<@Valid Component> items,
      @PositiveOrZero Long expectedVersion) {}

  public record VersionInput(@NotNull @PositiveOrZero Long expectedVersion) {}

  public record StockInput(
      @Min(0) Integer stockOnHand,
      Integer deltaOnHand,
      @NotBlank @Size(max = 500) String reason,
      @NotNull @PositiveOrZero Long expectedVersion) {}
}

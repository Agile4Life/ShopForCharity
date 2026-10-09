package vn.schoolshop.catalog;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.*;
public final class CatalogDtos {
    private CatalogDtos(){}
    public record ProductInput(@NotBlank @Size(max=100) String name,@NotBlank @Pattern(regexp="[a-z0-9]+(?:-[a-z0-9]+)*") @Size(max=120) String slug,@NotNull UUID categoryId,@Size(max=5000) String description,@NotNull @DecimalMin("1") @DecimalMax("99999999999999") @Digits(integer=14,fraction=0) BigDecimal price,UUID imageAssetId,@Size(max=2000) String ingredients,@Size(max=2000) String storageInstructions,@Min(0) int initialStock,@PositiveOrZero long expectedVersion){}
    public record Component(@NotNull UUID productId,@Min(1) @Max(1000) int quantity){}
    public record ComboInput(@NotBlank @Size(max=100) String name,@NotBlank @Pattern(regexp="[a-z0-9]+(?:-[a-z0-9]+)*") @Size(max=120) String slug,@Size(max=5000) String description,@NotNull @DecimalMin("1") @DecimalMax("99999999999999") @Digits(integer=14,fraction=0) BigDecimal price,UUID imageAssetId,@NotNull @Size(min=2,max=30) List<@Valid Component> items,@PositiveOrZero long expectedVersion){}
    public record VersionInput(@PositiveOrZero long expectedVersion){}
    public record StockInput(@Min(0) int stockOnHand,@NotBlank @Size(max=500) String reason,@PositiveOrZero long expectedVersion){}
}

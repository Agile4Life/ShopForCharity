package vn.schoolshop.order;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.*;

public final class CheckoutDtos {
  private CheckoutDtos() {}

  public record CartLine(
      @NotBlank @Pattern(regexp = "PRODUCT|COMBO") String kind,
      @NotNull UUID catalogId,
      @Min(1) @Max(20) int quantity) {}

  public record QuoteInput(
      @NotNull @Size(min = 1, max = 30) List<@Valid CartLine> items,
      @Pattern(regexp = "CASH|BANK_TRANSFER") String paymentMethod) {}

  public record Buyer(
      @NotBlank @Size(min = 2, max = 100) String fullName,
      @NotBlank @Size(max = 30) String phone,
      @NotBlank @Email @Size(max = 254) String email,
      @Size(max = 50) String className) {}

  public record CreateInput(
      @NotBlank @Size(max = 2048) String quoteToken,
      @NotNull @Size(min = 1, max = 30) List<@Valid CartLine> items,
      @NotNull @Valid Buyer buyer,
      @NotNull UUID pickupPointId,
      @Future Instant requestedPickupAt,
      @NotBlank @Pattern(regexp = "CASH|BANK_TRANSFER") String paymentMethod,
      @Size(max = 500) String note) {}

  public record AccessInput(
      @NotBlank @Size(max = 50) String orderCode, @NotBlank @Size(max = 200) String guestToken) {}

  public record ActionInput(
      @NotNull @PositiveOrZero Long expectedVersion,
      @Size(max = 500) String reason,
      UUID confirmedPickupPointId,
      @Future Instant confirmedPickupAt) {}

  public record ContactInput(
      @NotNull @PositiveOrZero Long expectedVersion,
      @NotBlank @Pattern(regexp = "PHONE|EMAIL|IN_PERSON") String channel,
      @NotBlank @Pattern(regexp = "SUCCESS|NO_RESPONSE|FAILED") String outcome,
      @Size(max = 500) String note) {}
}

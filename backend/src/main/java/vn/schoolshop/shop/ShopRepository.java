package vn.schoolshop.shop;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import jakarta.persistence.LockModeType;
import java.util.*;
public interface ShopRepository extends JpaRepository<Shop,UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select s from Shop s where s.id=:id")
    Optional<Shop> lock(UUID id);
}
